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
    expect(prog).toEqual([{ type: 'MOV', args: ['p0', 'acc'], cond: null }]);
  });

  it('strips comments', () => {
    const prog = parseProgram('add 10 # increment acc');
    expect(prog).toEqual([{ type: 'ADD', args: ['10'], cond: null }]);
  });

  it('parses labels', () => {
    const prog = parseProgram('loop:\njmp loop');
    expect(prog[0]).toEqual({ type: 'LABEL', name: 'loop' });
    expect(prog[1]).toEqual({ type: 'JMP', args: ['loop'], cond: null });
  });

  it('parses conditional prefixes', () => {
    const prog = parseProgram('+ mov acc p0\n- mov 0 p0');
    expect(prog[0]).toEqual({ type: 'MOV', args: ['acc', 'p0'], cond: true });
    expect(prog[1]).toEqual({ type: 'MOV', args: ['0', 'p0'], cond: false });
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
    stepMCU(mcu, board); // batch: mov 7 acc, mov acc dat
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
    stepMCU(mcu, board); // batch: mov, add
    expect(mcu.registers.acc).toBe(15);
  });

  it('sub decreases acc', () => {
    const mcu = makeMCU('mov 10 acc\nsub 3');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.acc).toBe(7);
  });

  it('mul multiplies acc', () => {
    const mcu = makeMCU('mov 6 acc\nmul 7');
    const board = makeBoard();
    stepMCU(mcu, board);
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
    stepMCU(mcu, board); // batch executes slp 3 → sleeping, timer=3
    expect(mcu.state).toBe(MCUState.SLEEPING);
    expect(mcu.sleepTimer).toBe(3);
  });

  it('wakes after N ticks', () => {
    const mcu = makeMCU('slp 2\nmov 1 acc');
    const board = makeBoard();
    stepMCU(mcu, board); // slp 2 → sleeping, timer=2
    stepMCU(mcu, board); // timer 2→1
    stepMCU(mcu, board); // timer 1→0 → wakes, state=READY
    expect(mcu.state).toBe(MCUState.READY);
    stepMCU(mcu, board); // mov 1 acc (and wraps)
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
    stepMCU(mcu, board); // batch: mov, teq
    expect(mcu.condFlag).toBe(true);
  });

  it('teq sets condFlag false on inequality', () => {
    const mcu = makeMCU('mov 5 acc\nteq acc 6');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.condFlag).toBe(false);
  });

  it('tgt sets condFlag true when a > b', () => {
    const mcu = makeMCU('mov 10 acc\ntgt acc 5');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.condFlag).toBe(true);
  });

  it('tgt sets condFlag false when a <= b', () => {
    const mcu = makeMCU('mov 3 acc\ntgt acc 5');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.condFlag).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// jmp / djt / djf — jumps
// ---------------------------------------------------------------------------

describe('JMP / DJT / DJF', () => {
  it('jmp loops until safety limit', () => {
    // Infinite loop without slp — hits the safety limit per tick
    // program = [LABEL, ADD 1, JMP loop], length=3, maxInstructions=6
    // Each tick: 3 iterations of (add 1, jmp loop) = acc += 3
    const mcu = makeMCU('loop:\nadd 1\njmp loop');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.acc).toBe(3);
  });

  it('jmp loops correctly with slp', () => {
    // Realistic program: add 1, slp 1, jmp loop — one add per tick
    // slp 1: current tick counts, wake next tick and execute immediately
    const mcu = makeMCU('loop:\nadd 1\nslp 1\njmp loop');
    const board = makeBoard();
    runTicks(mcu, board, 4); // tick 1: add+slp, tick 2: wake+jmp+add+slp, tick 3: wake+jmp+add+slp, tick 4: wake+jmp+add+slp
    expect(mcu.registers.acc).toBe(4);
  });

  it('djt jumps when condFlag is true', () => {
    const mcu = makeMCU('mov 5 acc\nteq acc 5\ndjt done\nmov 0 acc\ndone:\n');
    const board = makeBoard();
    stepMCU(mcu, board); // batch: mov, teq, djt (jumps past mov 0)
    expect(mcu.registers.acc).toBe(5); // mov 0 acc was skipped
  });

  it('djf jumps when condFlag is false', () => {
    const mcu = makeMCU('mov 3 acc\nteq acc 5\ndjf done\nmov 0 acc\ndone:\n');
    const board = makeBoard();
    stepMCU(mcu, board); // batch: mov, teq, djf (jumps past mov 0)
    expect(mcu.registers.acc).toBe(3); // mov 0 acc was skipped
  });
});

// ---------------------------------------------------------------------------
// Conditional execution (+/- prefix)
// ---------------------------------------------------------------------------

describe('Conditional prefix execution', () => {
  it('+ prefix runs only when condFlag is true', () => {
    const mcu = makeMCU('mov 10 acc\ntgt acc 5\n+ mov 99 dat');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.dat).toBe(99); // tgt was true, so + line ran
  });

  it('+ prefix is skipped when condFlag is false', () => {
    const mcu = makeMCU('mov 3 acc\ntgt acc 5\n+ mov 99 dat');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.dat).toBe(0); // tgt was false, + line skipped
  });

  it('- prefix runs only when condFlag is false', () => {
    const mcu = makeMCU('mov 3 acc\ntgt acc 5\n- mov 77 dat');
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.registers.dat).toBe(77);
  });

  it('gatekeeper pattern works: pass > 50, else 0', () => {
    const mcu = makeMCU('mov 60 acc\ntgt acc 50\n+ mov acc p0\n- mov 0 p0', { simplePins: ['p0'] });
    const board = makeBoard();
    stepMCU(mcu, board);
    expect(mcu.simplePins.p0).toBe(60);
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
