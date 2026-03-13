import { describe, it, expect } from 'vitest';
import { createVerifier, runLevel } from '../../src/engine/verifier.js';
import { createMCU } from '../../src/engine/mcu.js';
import { createBoard } from '../../src/engine/board.js';
import { level01 } from '../../src/levels/level01.js';
import { level02 } from '../../src/levels/level02.js';
import { level03 } from '../../src/levels/level03.js';

// ---------------------------------------------------------------------------
// createVerifier unit tests (isolated from scheduler)
// ---------------------------------------------------------------------------

describe('createVerifier', () => {
  function makeVerifierFixture() {
    const board = createBoard({ externalPins: { out: 0 } });
    const level = {
      testCycles: 3,
      tolerance: 0,
      expected: { out: (cycle) => cycle * 10 }, // 10, 20, 30
    };
    const verifier = createVerifier({ level, board });
    return { board, verifier };
  }

  it('is not complete before testCycles records', () => {
    const { verifier } = makeVerifierFixture();
    expect(verifier.complete).toBe(false);
  });

  it('records a passing cycle', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10);
    verifier.record(1);
    expect(verifier.records[0]).toMatchObject({ cycle: 1, pin: 'out', actual: 10, expected: 10, pass: true });
  });

  it('records a failing cycle', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 5); // expected 10
    verifier.record(1);
    expect(verifier.records[0].pass).toBe(false);
  });

  it('is complete after testCycles records', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10); verifier.record(1);
    board.writeSimplePin('out', 20); verifier.record(2);
    board.writeSimplePin('out', 30); verifier.record(3);
    expect(verifier.complete).toBe(true);
  });

  it('passed is true when all cycles match', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10); verifier.record(1);
    board.writeSimplePin('out', 20); verifier.record(2);
    board.writeSimplePin('out', 30); verifier.record(3);
    expect(verifier.passed).toBe(true);
  });

  it('passed is false when any cycle fails', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10); verifier.record(1);
    board.writeSimplePin('out', 99); verifier.record(2); // wrong
    board.writeSimplePin('out', 30); verifier.record(3);
    expect(verifier.passed).toBe(false);
  });

  it('respects tolerance', () => {
    const board = createBoard({ externalPins: { out: 0 } });
    const level = { testCycles: 1, tolerance: 5, expected: { out: () => 50 } };
    const verifier = createVerifier({ level, board });
    board.writeSimplePin('out', 47); // within ±5
    verifier.record(1);
    expect(verifier.records[0].pass).toBe(true);
  });

  it('fails when outside tolerance', () => {
    const board = createBoard({ externalPins: { out: 0 } });
    const level = { testCycles: 1, tolerance: 5, expected: { out: () => 50 } };
    const verifier = createVerifier({ level, board });
    board.writeSimplePin('out', 44); // outside ±5
    verifier.record(1);
    expect(verifier.records[0].pass).toBe(false);
  });

  it('summary groups records by cycle', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10); verifier.record(1);
    board.writeSimplePin('out', 20); verifier.record(2);
    const s = verifier.summary;
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ cycle: 1, pass: true });
    expect(s[1]).toMatchObject({ cycle: 2, pass: true });
  });

  it('reset clears all records', () => {
    const { board, verifier } = makeVerifierFixture();
    board.writeSimplePin('out', 10); verifier.record(1);
    verifier.reset();
    expect(verifier.records).toHaveLength(0);
    expect(verifier.complete).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runLevel integration tests
// ---------------------------------------------------------------------------

describe('Level 01 — Power On', () => {
  it('passes with correct solution: mov 100 p0', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'mov 100 p0', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level01, mcus: [mcu] });
    scheduler.run(level01.testCycles);
    expect(verifier.passed).toBe(true);
  });

  it('fails with wrong value: mov 50 p0', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'mov 50 p0', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level01, mcus: [mcu] });
    scheduler.run(level01.testCycles);
    expect(verifier.passed).toBe(false);
  });

  it('fails when p0 is never written (default 0)', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'add 1', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level01, mcus: [mcu] });
    scheduler.run(level01.testCycles);
    expect(verifier.passed).toBe(false);
  });

  it('produces 10 cycle records', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'mov 100 p0', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level01, mcus: [mcu] });
    scheduler.run(level01.testCycles);
    expect(verifier.summary).toHaveLength(10);
  });
});

describe('Level 02 — Blink', () => {
  // Solution: mov 100 p0, slp 5, mov 0 p0, slp 5, then loop
  // slp 5: current tick has pin set, then 4 more ticks sleeping = 5 total
  const solution = [
    'loop:',
    'mov 100 p0',
    'slp 5',
    'mov 0 p0',
    'slp 5',
    'jmp loop',
  ].join('\n');

  it('passes with correct blink solution', () => {
    const mcu = createMCU({ id: 'mcu0', source: solution, simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level02, mcus: [mcu] });
    scheduler.run(level02.testCycles);
    expect(verifier.passed).toBe(true);
  });

  it('fails when light never blinks (constant 100)', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'mov 100 p0', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level02, mcus: [mcu] });
    scheduler.run(level02.testCycles);
    // Cycles 6-10 should be 0, but they'll be 100
    expect(verifier.passed).toBe(false);
  });
});

describe('Level 03 — Amplifier', () => {
  // Solution: read sensor into acc, double it, write to p0
  const solution = [
    'mov sensor acc',
    'add acc',
    'mov acc p0',
  ].join('\n');

  it('passes with correct amplifier solution', () => {
    const mcu = createMCU({ id: 'mcu0', source: solution, simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level03, mcus: [mcu] });
    scheduler.run(level03.testCycles);
    expect(verifier.passed).toBe(true);
  });

  it('fails when sensor value is passed through unchanged', () => {
    const mcu = createMCU({ id: 'mcu0', source: 'mov sensor p0', simplePins: ['p0'] });
    const { scheduler, verifier } = runLevel({ level: level03, mcus: [mcu] });
    scheduler.run(level03.testCycles);
    expect(verifier.passed).toBe(false);
  });
});
