/**
 * Level solution tests — levels 05-08
 *
 * Verifies that reference solutions pass the verifier and wrong solutions fail.
 * Also covers level definition structure for the full set (01-08).
 */

import { describe, it, expect } from 'vitest';
import { createMCU } from '../src/engine/mcu.js';
import { runLevel } from '../src/engine/verifier.js';

import { level05 } from '../src/levels/level05.js';
import { level06 } from '../src/levels/level06.js';
import { level07 } from '../src/levels/level07.js';
import { level08 } from '../src/levels/level08.js';

// ---------------------------------------------------------------------------
// Helper: build + run a single-MCU level with the given program
// ---------------------------------------------------------------------------

function solveLevel(level, program, extraOpts = {}) {
  const mcu = createMCU({
    id: level.playerMCU?.id ?? 'mcu0',
    source: program,
    simplePins: level.playerMCU?.simplePins ?? ['p0'],
    ...extraOpts,
  });

  const { scheduler, verifier } = runLevel({ level, mcus: [mcu] });
  scheduler.run(level.testCycles);

  return verifier;
}

// ---------------------------------------------------------------------------
// Level 05 — Packet Sorter
// Even values → p0 (even pin); odd values → p1 (odd pin); 0 on the other.
// ---------------------------------------------------------------------------

describe('Level 05 — Packet Sorter', () => {
  const solution = [
    'mov sensor acc',
    'mov acc dat',
    'loop:',
    'sub 2',
    'tgt acc 0',
    '+ jmp loop',
    'teq acc 0',
    '+ mov dat p0',
    '+ mov 0 p1',
    '- mov 0 p0',
    '- mov dat p1',
  ].join('\n');

  it('reference solution passes', () => {
    const v = solveLevel(level05, solution);
    expect(v.passed).toBe(true);
  });

  it('sending all values to even pin fails (misses odd routing)', () => {
    const v = solveLevel(level05, [
      'mov sensor p0',
      'mov 0 p1',
    ].join('\n'));
    expect(v.passed).toBe(false);
  });

  it('even cycles produce correct even-pin output', () => {
    const v = solveLevel(level05, solution);
    const SENSOR = [2, 7, 4, 3, 8, 1, 6, 5, 10, 9];
    const evenRecords = v.records.filter(r => r.pin === 'even');
    for (const r of evenRecords) {
      const val = SENSOR[(r.cycle - 1) % SENSOR.length];
      expect(r.expected).toBe(val % 2 === 0 ? val : 0);
      expect(r.pass).toBe(true);
    }
  });

  it('odd cycles produce correct odd-pin output', () => {
    const v = solveLevel(level05, solution);
    const SENSOR = [2, 7, 4, 3, 8, 1, 6, 5, 10, 9];
    const oddRecords = v.records.filter(r => r.pin === 'odd');
    for (const r of oddRecords) {
      const val = SENSOR[(r.cycle - 1) % SENSOR.length];
      expect(r.expected).toBe(val % 2 !== 0 ? val : 0);
      expect(r.pass).toBe(true);
    }
  });

  it('all 10 cycles are tested', () => {
    const v = solveLevel(level05, solution);
    const cycles = new Set(v.records.map(r => r.cycle));
    expect(cycles.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Level 06 — Signal Clamp
// Clamp values to [20, 80].
// ---------------------------------------------------------------------------

describe('Level 06 — Signal Clamp', () => {
  const solution = [
    'mov sensor acc',
    'tgt acc 80',
    '+ mov 80 acc',
    'tgt acc 20',
    '- mov 20 acc',
    'mov acc p0',
  ].join('\n');

  it('reference solution passes', () => {
    const v = solveLevel(level06, solution);
    expect(v.passed).toBe(true);
  });

  it('pass-through without clamping fails', () => {
    const v = solveLevel(level06, 'mov sensor p0');
    expect(v.passed).toBe(false);
  });

  it('values below 20 are clamped to 20', () => {
    const v = solveLevel(level06, solution);
    const SENSOR = [10, 50, 90, 20, 80, 5, 45, 100, 30, 75];
    const below = v.records.filter(r => {
      const raw = SENSOR[(r.cycle - 1) % SENSOR.length];
      return raw < 20;
    });
    expect(below.length).toBeGreaterThan(0);
    expect(below.every(r => r.expected === 20 && r.pass)).toBe(true);
  });

  it('values above 80 are clamped to 80', () => {
    const v = solveLevel(level06, solution);
    const SENSOR = [10, 50, 90, 20, 80, 5, 45, 100, 30, 75];
    const above = v.records.filter(r => {
      const raw = SENSOR[(r.cycle - 1) % SENSOR.length];
      return raw > 80;
    });
    expect(above.length).toBeGreaterThan(0);
    expect(above.every(r => r.expected === 80 && r.pass)).toBe(true);
  });

  it('values already in range pass through unchanged', () => {
    const v = solveLevel(level06, solution);
    const SENSOR = [10, 50, 90, 20, 80, 5, 45, 100, 30, 75];
    const inRange = v.records.filter(r => {
      const raw = SENSOR[(r.cycle - 1) % SENSOR.length];
      return raw >= 20 && raw <= 80;
    });
    expect(inRange.length).toBeGreaterThan(0);
    expect(inRange.every(r => r.expected === SENSOR[(r.cycle - 1) % SENSOR.length] && r.pass)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Level 07 — Sequence Detector
// Output 100 when current reading matches previous; else 0.
// ---------------------------------------------------------------------------

describe('Level 07 — Sequence Detector', () => {
  const solution = [
    'mov sensor acc',
    'teq acc dat',
    '+ mov 100 p0',
    '- mov 0 p0',
    'mov acc dat',
  ].join('\n');

  it('reference solution passes', () => {
    const v = solveLevel(level07, solution);
    expect(v.passed).toBe(true);
  });

  it('always-100 fails (mismatch on cycle 1)', () => {
    const v = solveLevel(level07, 'mov 100 p0');
    expect(v.passed).toBe(false);
  });

  it('always-0 fails (misses matching pairs)', () => {
    const v = solveLevel(level07, 'mov 0 p0');
    expect(v.passed).toBe(false);
  });

  it('cycle 1 always outputs 0 (dat starts at 0, sensor is 5)', () => {
    const v = solveLevel(level07, solution);
    const cycle1 = v.records.filter(r => r.cycle === 1 && r.pin === 'output');
    expect(cycle1.every(r => r.expected === 0 && r.pass)).toBe(true);
  });

  it('cycle 2 outputs 100 (5 matches 5)', () => {
    const v = solveLevel(level07, solution);
    const cycle2 = v.records.filter(r => r.cycle === 2 && r.pin === 'output');
    expect(cycle2.every(r => r.expected === 100 && r.pass)).toBe(true);
  });

  it('matching pairs (cycles 2,4,5,7,10) all produce 100', () => {
    const v = solveLevel(level07, solution);
    const matchCycles = [2, 4, 5, 7, 10];
    const matchRecords = v.records.filter(r => matchCycles.includes(r.cycle) && r.pin === 'output');
    expect(matchRecords.length).toBe(matchCycles.length);
    expect(matchRecords.every(r => r.expected === 100 && r.pass)).toBe(true);
  });

  it('non-matching cycles (1,3,6,8,9) produce 0', () => {
    const v = solveLevel(level07, solution);
    const noMatchCycles = [1, 3, 6, 8, 9];
    const noMatchRecords = v.records.filter(r => noMatchCycles.includes(r.cycle) && r.pin === 'output');
    expect(noMatchRecords.length).toBe(noMatchCycles.length);
    expect(noMatchRecords.every(r => r.expected === 0 && r.pass)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Level 08 — Pulse Counter
// Running count of readings > 50, output each cycle.
// ---------------------------------------------------------------------------

describe('Level 08 — Pulse Counter', () => {
  const solution = [
    'mov sensor acc',
    'tgt acc 50',
    '+ mov dat acc',
    '+ add 1',
    '+ mov acc dat',
    '+ mov acc p0',
    '- mov dat p0',
  ].join('\n');

  it('reference solution passes', () => {
    const v = solveLevel(level08, solution);
    expect(v.passed).toBe(true);
  });

  it('always-zero fails (never counts)', () => {
    const v = solveLevel(level08, 'mov 0 p0');
    expect(v.passed).toBe(false);
  });

  it('pass-through fails (outputs raw sensor, not count)', () => {
    const v = solveLevel(level08, 'mov sensor p0');
    expect(v.passed).toBe(false);
  });

  it('output at cycle 1 is 1 (60 > 50)', () => {
    const v = solveLevel(level08, solution);
    const c1 = v.records.filter(r => r.cycle === 1 && r.pin === 'output');
    expect(c1.every(r => r.expected === 1 && r.pass)).toBe(true);
  });

  it('output at cycle 2 is still 1 (30 is not > 50)', () => {
    const v = solveLevel(level08, solution);
    const c2 = v.records.filter(r => r.cycle === 2 && r.pin === 'output');
    expect(c2.every(r => r.expected === 1 && r.pass)).toBe(true);
  });

  it('output at cycle 10 is 5 (final running count)', () => {
    const v = solveLevel(level08, solution);
    const c10 = v.records.filter(r => r.cycle === 10 && r.pin === 'output');
    expect(c10.every(r => r.expected === 5 && r.pass)).toBe(true);
  });

  it('count never decreases across cycles', () => {
    const v = solveLevel(level08, solution);
    const outputs = v.records
      .filter(r => r.pin === 'output')
      .sort((a, b) => a.cycle - b.cycle)
      .map(r => r.expected);
    for (let i = 1; i < outputs.length; i++) {
      expect(outputs[i]).toBeGreaterThanOrEqual(outputs[i - 1]);
    }
  });

  it('all 10 cycles recorded', () => {
    const v = solveLevel(level08, solution);
    const cycles = new Set(v.records.map(r => r.cycle));
    expect(cycles.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Level definition structure — levels 05-08
// ---------------------------------------------------------------------------

describe('Level definitions (05-08) — structure', () => {
  const levels = [level05, level06, level07, level08];

  it('every level has required fields', () => {
    for (const level of levels) {
      expect(level.id, `level ${level.id} missing id`).toBeTruthy();
      expect(level.name, `level ${level.id} missing name`).toBeTruthy();
      expect(level.description, `level ${level.id} missing description`).toBeTruthy();
      expect(level.testCycles, `level ${level.id} missing testCycles`).toBeGreaterThan(0);
      expect(level.expected, `level ${level.id} missing expected`).toBeTruthy();
    }
  });

  it('level ids are unique within this set', () => {
    const ids = levels.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('expected functions return numbers', () => {
    for (const level of levels) {
      for (const [pin, fn] of Object.entries(level.expected)) {
        const val = fn(1);
        expect(typeof val, `level ${level.id}.expected.${pin}(1) should be number`).toBe('number');
      }
    }
  });

  it('source functions (if present) return numbers', () => {
    for (const level of levels) {
      if (!level.sources) continue;
      for (const [pin, fn] of Object.entries(level.sources)) {
        const val = fn(1);
        expect(typeof val, `level ${level.id}.sources.${pin}(1) should be number`).toBe('number');
      }
    }
  });

  it('testCycles is a positive integer', () => {
    for (const level of levels) {
      expect(Number.isInteger(level.testCycles)).toBe(true);
      expect(level.testCycles).toBeGreaterThan(0);
    }
  });

  it('tolerance is non-negative when present', () => {
    for (const level of levels) {
      if (level.tolerance !== undefined) {
        expect(level.tolerance).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('each level has a hint string', () => {
    for (const level of levels) {
      expect(typeof level.hint).toBe('string');
      expect(level.hint.length).toBeGreaterThan(0);
    }
  });

  it('playerMCU is defined with an id', () => {
    for (const level of levels) {
      expect(level.playerMCU).toBeTruthy();
      expect(level.playerMCU.id).toBeTruthy();
    }
  });
});
