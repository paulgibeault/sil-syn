/**
 * Scheduler — drives the simulation tick by tick.
 *
 * Each tick:
 *   1. Resolve XBus handshakes (unblocks waiting MCUs before they execute)
 *   2. Step every MCU once
 *   3. Advance the cycle counter
 *   4. Notify listeners
 */

import { stepMCU, MCUState } from './mcu.js';
import { resolveXBus } from './xbus.js';

/**
 * Create a simulation scheduler.
 *
 * @param {object} opts
 * @param {object[]} opts.mcus       - MCU instances
 * @param {object[]} opts.xbusWires  - XBus wire definitions
 * @param {object}   opts.board      - Board interface
 * @param {function} [opts.onTick]   - Called after every tick with (cycle, mcus)
 * @returns {Scheduler}
 */
export function createScheduler({ mcus, xbusWires = [], board, onTick }) {
  let cycle = 0;

  return {
    get cycle() { return cycle; },
    get mcus() { return mcus; },

    /**
     * Advance the simulation by one tick.
     */
    tick() {
      // Step 1: resolve XBus handshakes before any MCU executes
      resolveXBus(mcus, xbusWires, board);

      // Step 2: step all MCUs
      for (const mcu of mcus) {
        stepMCU(mcu, board);
      }

      // Step 3: advance cycle counter
      cycle++;

      // Step 4: notify
      onTick?.(cycle, mcus);
    },

    /**
     * Run for N ticks synchronously. Useful for testing.
     */
    run(ticks) {
      for (let i = 0; i < ticks; i++) this.tick();
    },

    /**
     * Reset all MCUs and the cycle counter to initial state.
     */
    reset() {
      cycle = 0;
      for (const mcu of mcus) {
        mcu.registers = { acc: 0, dat: 0 };
        mcu.pc = 0;
        mcu.state = MCUState.READY;
        mcu.sleepTimer = 0;
        mcu.condFlag = null;
        mcu.pendingXBus = null;
        for (const pin of Object.keys(mcu.simplePins)) mcu.simplePins[pin] = 0;
        for (const pin of Object.keys(mcu.xbusPins)) mcu.xbusPins[pin] = null;
      }
    },
  };
}
