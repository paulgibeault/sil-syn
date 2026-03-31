/**
 * Level solution tests — verify that the reference solution for each level
 * actually passes the verifier. These act as regression tests: if the engine
 * or a level definition changes in a breaking way, these catch it.
 *
 * Each test:
 *  1. Imports the level definition
 *  2. Creates an MCU programmed with the reference solution
 *  3. Runs the full simulation via runLevel
 *  4. Asserts verifier.passed === true
 */

import { describe, it, expect } from 'vitest';
import { createMCU } from '../src/engine/mcu.js';
import { runLevel } from '../src/engine/verifier.js';

import { level01 } from '../src/levels/level01.js';
import { level02 } from '../src/levels/level02.js';
import { level03 } from '../src/levels/level03.js';
import { level04 } from '../src/levels/level04.js';

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
// Level 01 — Power On
// Constant 100 on the light pin.
// ---------------------------------------------------------------------------

describe('Level 01 — Power On', () => {
  it('reference solution passes: mov 100 p0', () => {
    const v = solveLevel(level01, 'mov 100 p0');
    expect(v.passed).toBe(true);
  });

  it('wrong value (50) fails', () => {
    const v = solveLevel(level01, 'mov 50 p0');
    expect(v.passed).toBe(false);
  });

  it('all cycles are recorded', () => {
    const v = solveLevel(level01, 'mov 100 p0');
    const uniqueCycles = new Set(v.records.map(r => r.cycle));
    expect(uniqueCycles.size).toBe(level01.testCycles);
  });

  it('every cycle passes with the reference solution', () => {
    const v = solveLevel(level01, 'mov 100 p0');
    const failed = v.records.filter(r => !r.pass);
    expect(failed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Level 02 — Blink
// Light = 100 for cycles 1-5, 0 for cycles 6-10, 100 for 11-15, etc.
// ---------------------------------------------------------------------------

describe('Level 02 — Blink', () => {
  it('reference solution passes', () => {
    const v = solveLevel(level02, [
      'start:',
      'mov 100 p0',
      'slp 5',
      'mov 0 p0',
      'slp 5',
      'jmp start',
    ].join('\n'));
    expect(v.passed).toBe(true);
  });

  it('constant 100 fails (never turns off)', () => {
    const v = solveLevel(level02, 'mov 100 p0');
    expect(v.passed).toBe(false);
  });

  it('constant 0 fails (never turns on)', () => {
    const v = solveLevel(level02, 'mov 0 p0');
    expect(v.passed).toBe(false);
  });

  it('first 5 cycles are all 100', () => {
    const v = solveLevel(level02, [
      'start:',
      'mov 100 p0',
      'slp 5',
      'mov 0 p0',
      'slp 5',
      'jmp start',
    ].join('\n'));
    const firstFive = v.records.filter(r => r.cycle <= 5 && r.pin === 'light');
    expect(firstFive.every(r => r.expected === 100)).toBe(true);
    expect(firstFive.every(r => r.pass)).toBe(true);
  });

  it('cycles 6-10 are all 0', () => {
    const v = solveLevel(level02, [
      'start:',
      'mov 100 p0',
      'slp 5',
      'mov 0 p0',
      'slp 5',
      'jmp start',
    ].join('\n'));
    const secondFive = v.records.filter(r => r.cycle >= 6 && r.cycle <= 10 && r.pin === 'light');
    expect(secondFive.every(r => r.expected === 0)).toBe(true);
    expect(secondFive.every(r => r.pass)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Level 03 — Amplifier
// Read sensor, multiply by 2, output to amplified pin.
// ---------------------------------------------------------------------------

describe('Level 03 — Amplifier', () => {
  it('reference solution passes', () => {
    const v = solveLevel(level03, [
      'mov sensor acc',
      'add acc',
      'mov acc p0',
    ].join('\n'));
    expect(v.passed).toBe(true);
  });

  it('passing sensor through unchanged fails (not doubled)', () => {
    const v = solveLevel(level03, 'mov sensor p0');
    expect(v.passed).toBe(false);
  });

  it('verifier summary shows correct expected values (0,20,40,60,80 cycling)', () => {
    const v = solveLevel(level03, [
      'mov sensor acc',
      'add acc',
      'mov acc p0',
    ].join('\n'));
    const ampRecords = v.records.filter(r => r.pin === 'amplified');
    const expectedVals = ampRecords.map(r => r.expected);
    // First 5 cycles: 0,20,40,60,80
    expect(expectedVals.slice(0, 5)).toEqual([0, 20, 40, 60, 80]);
  });
});

// ---------------------------------------------------------------------------
// Level 04 — Gatekeeper
// Pass values > 50 through; output 0 otherwise.
// ---------------------------------------------------------------------------

describe('Level 04 — Gatekeeper', () => {
  it('reference solution passes', () => {
    const v = solveLevel(level04, [
      'mov sensor acc',
      'tgt acc 50',
      '+ mov acc p0',
      '- mov 0 p0',
    ].join('\n'));
    expect(v.passed).toBe(true);
  });

  it('always-pass-through fails (passes values <= 50)', () => {
    const v = solveLevel(level04, 'mov sensor p0');
    expect(v.passed).toBe(false);
  });

  it('always-zero fails (misses values > 50)', () => {
    const v = solveLevel(level04, 'mov 0 p0');
    expect(v.passed).toBe(false);
  });

  it('sensor values of 60, 80, 90, 70, 100 produce non-zero output', () => {
    const v = solveLevel(level04, [
      'mov sensor acc',
      'tgt acc 50',
      '+ mov acc p0',
      '- mov 0 p0',
    ].join('\n'));
    // Filter records where expected > 0 and check they pass
    const shouldPass = v.records.filter(r => r.pin === 'output' && r.expected > 0);
    expect(shouldPass.length).toBeGreaterThan(0);
    expect(shouldPass.every(r => r.pass)).toBe(true);
  });

  it('sensor values of 20, 40, 10, 50, 30 produce zero output', () => {
    const v = solveLevel(level04, [
      'mov sensor acc',
      'tgt acc 50',
      '+ mov acc p0',
      '- mov 0 p0',
    ].join('\n'));
    const shouldBeZero = v.records.filter(r => r.pin === 'output' && r.expected === 0);
    expect(shouldBeZero.length).toBeGreaterThan(0);
    expect(shouldBeZero.every(r => r.pass)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Level definition structure tests
// ---------------------------------------------------------------------------

describe('Level definitions — structure', () => {
  const levels = [level01, level02, level03, level04];

  it('every level has required fields: id, name, description, testCycles, expected', () => {
    for (const level of levels) {
      expect(level.id, `level ${level.id} missing id`).toBeTruthy();
      expect(level.name, `level ${level.id} missing name`).toBeTruthy();
      expect(level.description, `level ${level.id} missing description`).toBeTruthy();
      expect(level.testCycles, `level ${level.id} missing testCycles`).toBeGreaterThan(0);
      expect(level.expected, `level ${level.id} missing expected`).toBeTruthy();
    }
  });

  it('level ids are unique', () => {
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

  it('tolerance is a non-negative number when present', () => {
    for (const level of levels) {
      if (level.tolerance !== undefined) {
        expect(level.tolerance).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
