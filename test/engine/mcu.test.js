import { describe, it, expect, beforeEach } from 'vitest';
import { createMCU, parseProgram, stepMCU, MCUState } from '../../src/engine/mcu.js';
import { createBoard } from '../../src/engine/board.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBoard(pins = {}) {
  return createBoard({ externalPins: pins });
}

function makeMCU(source, opts = {}) {
  const mcu = createMCU({ id: 'mcu0', source, ...opts });
  return mcu;
}

function runTicks(mcu, board, n) {
  for (let i = 0; i < n; i++) stepMCU(mcu, board);
}

// ---------------------------------------------------------------------------
// parseProgram
// ---------------------------------------------------------------------------

describe('parseProgram', () => {
  it('parses a simple mov instruction', () => {
    const prog = parseProgram('mov p0 acc');
    expect(prog).toEqual([{ type: 'MOV', args: ['p0', 'acc'] }]);
  });

  it('strips comments', () => {
    const prog = parseProgram('add 10 # increment acc');
    expect(prog).toEqual([{ type: 'ADD', args: ['10'] }]);
  });

  it('parses labels', () => {
    const prog = parseProgram('loop:\njmp loop');
    expect(prog[0]).toEqual({ type: 'LABEL', name: 'loop' });
    expect(prog[1]).toEqual({ type: 'JMP', args: ['loop'] });
  });

  it('ignores blank lines', () => {
    const prog = parseProgram('\n\nmov acc dat\n\n');
    expect(prog).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// mov — register to register
// ---------------------------------------------------------------------------

describe('MOV instruction', () => {
  it('moves a literal into acc', () => {
    const mcu = makeMCU('mov 42 acc');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.acc).toBe(42);
  });

  it('moves acc into dat', () => {
    const mcu = makeMCU('mov 7 acc\nmov acc dat');
    const board = makeBoard();
    stepMCU(mcu, board); // mov 7 acc
    stepMCU(mcu, board); // mov acc dat
    expect(mcu.registers.dat).toBe(7);
  });

  it('reads from an external source pin', () => {
    const mcu = makeMCU('mov sensor acc');
    const board = makeBoard({ sensor: 55 });
    stepMCU(mcu, board);
    expect(mcu.registers.acc).toBe(55);
  });

  it('writes to an owned simple pin', () => {
    const mcu = makeMCU('mov 99 p0', { simplePins: ['p0'] });
    const board = makeBoard();
    board.registerMCU(mcu);
    stepMCU(mcu, board);
    expect(mcu.simplePins.p0).toBe(99);
  });

  it('clamps values to [-999, 999]', () => {
    const mcu = makeMCU('mov 9999 acc');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.acc).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// add / sub / mul
// ---------------------------------------------------------------------------

describe('Arithmetic', () => {
  it('add increases acc', () => {
    const mcu = makeMCU('mov 10 acc\nadd 5');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.registers.acc).toBe(15);
  });

  it('sub decreases acc', () => {
    const mcu = makeMCU('mov 10 acc\nsub 3');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.registers.acc).toBe(7);
  });

  it('mul multiplies acc', () => {
    const mcu = makeMCU('mov 6 acc\nmul 7');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.registers.acc).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// slp — sleep timer
// ---------------------------------------------------------------------------

describe('SLP instruction', () => {
  it('enters SLEEPING state', () => {
    const mcu = makeMCU('slp 3');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.state).toBe(MCUState.SLEEPING);
    expect(mcu.sleepTimer).toBe(2); // first tick decrements once
  });

  it('wakes after N ticks', () => {
    const mcu = makeMCU('slp 2\nmov 1 acc');
    const board = makeBoard();
    stepMCU(mcu, board); // slp 2 → sleeping, timer=1
    stepMCU(mcu, board); // timer=0 → wakes, state=READY
    expect(mcu.state).toBe(MCUState.READY);
    stepMCU(mcu, board); // mov 1 acc
    expect(mcu.registers.acc).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// teq / tgt — test instructions
// ---------------------------------------------------------------------------

describe('TEQ / TGT', () => {
  it('teq sets condFlag true on equality', () => {
    const mcu = makeMCU('mov 5 acc\nteq acc 5');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.condFlag).toBe(true);
  });

  it('teq sets condFlag false on inequality', () => {
    const mcu = makeMCU('mov 5 acc\nteq acc 6');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.condFlag).toBe(false);
  });

  it('tgt sets condFlag true when a > b', () => {
    const mcu = makeMCU('mov 10 acc\ntgt acc 5');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.condFlag).toBe(true);
  });

  it('tgt sets condFlag false when a <= b', () => {
    const mcu = makeMCU('mov 3 acc\ntgt acc 5');
    const board = makeBoard();
    runTicks(mcu, board, 2);
    expect(mcu.condFlag).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// jmp / djt / djf — jumps
// ---------------------------------------------------------------------------

describe('JMP / DJT / DJF', () => {
  it('jmp loops a program', () => {
    const mcu = makeMCU('loop:\nadd 1\njmp loop');
    const board = makeBoard();
    runTicks(mcu, board, 6); // 3 full iterations
    expect(mcu.registers.acc).toBe(3);
  });

  it('djt jumps when condFlag is true', () => {
    const mcu = makeMCU('mov 5 acc\nteq acc 5\ndjt done\nmov 0 acc\ndone:\n');
    const board = makeBoard();
    runTicks(mcu, board, 5);
    expect(mcu.registers.acc).toBe(5); // mov 0 acc was skipped
  });

  it('djf jumps when condFlag is false', () => {
    const mcu = makeMCU('mov 3 acc\nteq acc 5\ndjf done\nmov 0 acc\ndone:\n');
    const board = makeBoard();
    runTicks(mcu, board, 5);
    expect(mcu.registers.acc).toBe(3); // mov 0 acc was skipped
  });
});

// ---------------------------------------------------------------------------
// XBus — blocking state transitions (handshake tested in xbus.test.js)
// ---------------------------------------------------------------------------

describe('XBus state transitions', () => {
  it('enters XBUS_SENDING when mov targets an xbus pin', () => {
    const mcu = makeMCU('mov 42 x0', { xbusPins: ['x0'] });
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.state).toBe(MCUState.XBUS_SENDING);
    expect(mcu.pendingXBus).toEqual({ pin: 'x0', value: 42 });
  });

  it('enters XBUS_RECEIVING when mov reads from an xbus pin', () => {
    const mcu = makeMCU('mov x0 acc', { xbusPins: ['x0'] });
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.state).toBe(MCUState.XBUS_RECEIVING);
    expect(mcu.pendingXBus).toMatchObject({ pin: 'x0', dest: 'acc' });
  });
});
