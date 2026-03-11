/**
 * Verifier — checks simulation output against a level's expected waveform.
 *
 * Each cycle, the verifier records the actual values on output pins and
 * compares them against the level's expected function. The result is a
 * per-cycle pass/fail log and an overall verdict.
 *
 * Level waveform format:
 *   level.expected = { pinId: (cycle) => expectedValue, ... }
 *   level.sources  = { pinId: (cycle) => sourceValue, ... }   (optional)
 *   level.testCycles = N          — how many cycles to run
 *   level.tolerance  = 0          — acceptable delta (default 0, exact match)
 */

import { createBoard } from './board.js';
import { createScheduler } from './scheduler.js';

// ---------------------------------------------------------------------------
// Verifier
// ---------------------------------------------------------------------------

/**
 * Create a verifier attached to a board and level definition.
 *
 * @param {object} opts
 * @param {object} opts.level  - Level definition (see format above)
 * @param {object} opts.board  - Board instance to read output pins from
 */
export function createVerifier({ level, board }) {
  /** @type {{ cycle: number, pin: string, actual: number, expected: number, pass: boolean }[]} */
  const records = [];
  const tolerance = level.tolerance ?? 0;

  return {
    /**
     * Record the current state of all expected output pins for this cycle.
     * Call this once per tick, after MCUs have executed.
     *
     * @param {number} cycle - Current simulation cycle (1-indexed)
     */
    record(cycle) {
      for (const [pinId, expectedFn] of Object.entries(level.expected)) {
        const actual = board.readSimplePin(pinId);
        const expected = expectedFn(cycle);
        const pass = Math.abs(actual - expected) <= tolerance;
        records.push({ cycle, pin: pinId, actual, expected, pass });
      }
    },

    /** All recorded cycle results. */
    get records() { return records; },

    /** True once testCycles worth of data has been recorded. */
    get complete() {
      return records.some(r => r.cycle >= level.testCycles);
    },

    /** True if complete and every cycle passed. */
    get passed() {
      if (!this.complete) return false;
      return records.filter(r => r.cycle <= level.testCycles).every(r => r.pass);
    },

    /**
     * Summary grouped by cycle: { cycle, pass, pins: { pinId: { actual, expected, pass } } }
     * Useful for rendering the oscilloscope strip.
     */
    get summary() {
      const byKey = (r) => r.cycle;
      const cycles = [...new Set(records.map(byKey))].sort((a, b) => a - b);
      return cycles.map(cycle => {
        const cycleRecords = records.filter(r => r.cycle === cycle);
        const pins = Object.fromEntries(
          cycleRecords.map(r => [r.pin, { actual: r.actual, expected: r.expected, pass: r.pass }])
        );
        return { cycle, pass: cycleRecords.every(r => r.pass), pins };
      });
    },

    reset() { records.length = 0; },
  };
}

// ---------------------------------------------------------------------------
// runLevel — wires everything together for a complete level run
// ---------------------------------------------------------------------------

/**
 * Set up a full simulation run for a level.
 *
 * Source pins (sensors) are updated before each tick so MCUs always read
 * the correct value for the current cycle. Output pin values are recorded
 * after each tick.
 *
 * @param {object} opts
 * @param {object}   opts.level      - Level definition
 * @param {object[]} opts.mcus       - Placed MCU instances
 * @param {object[]} [opts.xbusWires] - XBus wire definitions
 * @returns {{ scheduler, verifier, board }}
 */
export function runLevel({ level, mcus, xbusWires = [] }) {
  const board = createBoard();
  const mcuById = Object.fromEntries(mcus.map(m => [m.id, m]));

  for (const mcu of mcus) {
    board.registerMCU(mcu);
  }

  const verifier = createVerifier({ level, board });

  // Copy MCU output pin values to board sink pins according to level wiring.
  // This runs after MCUs execute so the verifier reads the latest values.
  function applyWiring() {
    if (!level.wiring) return;
    for (const wire of level.wiring) {
      const mcu = mcuById[wire.from.mcuId];
      if (!mcu) continue;
      const value = mcu.simplePins[wire.from.pin] ?? 0;
      board.writeSimplePin(wire.to, value);
    }
  }

  // Update board source pins so MCUs read the correct sensor value this cycle.
  function updateSources(cycle) {
    if (!level.sources) return;
    for (const [pinId, sourceFn] of Object.entries(level.sources)) {
      board.setSourcePin(pinId, sourceFn(cycle));
    }
  }

  updateSources(1); // prime cycle 1 before any tick runs

  const scheduler = createScheduler({
    mcus,
    xbusWires,
    board,
    onTick(cycle) {
      applyWiring();           // propagate MCU → sink
      verifier.record(cycle);  // snapshot & compare
      updateSources(cycle + 1); // prime sources for next cycle
    },
  });

  return { scheduler, verifier, board };
}
