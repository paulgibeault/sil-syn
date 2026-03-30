import { describe, it, expect, vi } from 'vitest';
import { createBoard } from '../../src/engine/board.js';

// ---------------------------------------------------------------------------
// createBoard — basic construction
// ---------------------------------------------------------------------------

describe('createBoard — defaults', () => {
  it('creates a board with no initial pins', () => {
    const board = createBoard();
    expect(board.readSimplePin('p0')).toBe(0);
    expect(board.readSimplePin('sensor')).toBe(0);
  });

  it('accepts external pins at creation time', () => {
    const board = createBoard({ externalPins: { sensor: 42, p1: 7 } });
    expect(board.readSimplePin('sensor')).toBe(42);
    expect(board.readSimplePin('p1')).toBe(7);
  });

  it('pin snapshot reflects initial values', () => {
    const board = createBoard({ externalPins: { a: 1, b: 2 } });
    expect(board.pinSnapshot).toEqual({ a: 1, b: 2 });
  });
});

// ---------------------------------------------------------------------------
// writeSimplePin
// ---------------------------------------------------------------------------

describe('writeSimplePin', () => {
  it('updates the value read back from readSimplePin', () => {
    const board = createBoard();
    board.writeSimplePin('output', 99);
    expect(board.readSimplePin('output')).toBe(99);
  });

  it('overwrites a previous value', () => {
    const board = createBoard({ externalPins: { led: 0 } });
    board.writeSimplePin('led', 1);
    expect(board.readSimplePin('led')).toBe(1);
    board.writeSimplePin('led', 0);
    expect(board.readSimplePin('led')).toBe(0);
  });

  it('calls onPinWrite callback with pinId and value', () => {
    const onPinWrite = vi.fn();
    const board = createBoard({ onPinWrite });
    board.writeSimplePin('out', 5);
    expect(onPinWrite).toHaveBeenCalledWith('out', 5);
  });

  it('calls onPinWrite each time the pin is written', () => {
    const onPinWrite = vi.fn();
    const board = createBoard({ onPinWrite });
    board.writeSimplePin('out', 1);
    board.writeSimplePin('out', 2);
    board.writeSimplePin('out', 3);
    expect(onPinWrite).toHaveBeenCalledTimes(3);
  });

  it('updates pinSnapshot after write', () => {
    const board = createBoard();
    board.writeSimplePin('result', 100);
    expect(board.pinSnapshot.result).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// setSourcePin
// ---------------------------------------------------------------------------

describe('setSourcePin', () => {
  it('updates the value of a source pin', () => {
    const board = createBoard({ externalPins: { sensor: 0 } });
    board.setSourcePin('sensor', 15);
    expect(board.readSimplePin('sensor')).toBe(15);
  });

  it('can introduce new source pins not set at construction', () => {
    const board = createBoard();
    board.setSourcePin('newSensor', 7);
    expect(board.readSimplePin('newSensor')).toBe(7);
  });

  it('does not call onPinWrite', () => {
    const onPinWrite = vi.fn();
    const board = createBoard({ onPinWrite });
    board.setSourcePin('sensor', 10);
    expect(onPinWrite).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// registerMCU / MCU-owned pins
// ---------------------------------------------------------------------------

describe('registerMCU', () => {
  it('MCU-owned pins are readable via readSimplePin', () => {
    const board = createBoard();
    const fakeMCU = {
      simplePins: { p0: 5, p1: 3 },
    };
    board.registerMCU(fakeMCU);
    expect(board.readSimplePin('p0')).toBe(5);
    expect(board.readSimplePin('p1')).toBe(3);
  });

  it('MCU-owned pin takes precedence over external pin of same id', () => {
    const board = createBoard({ externalPins: { p0: 99 } });
    const fakeMCU = { simplePins: { p0: 7 } };
    board.registerMCU(fakeMCU);
    // MCU-owned p0 wins
    expect(board.readSimplePin('p0')).toBe(7);
  });

  it('multiple MCUs can register without conflict', () => {
    const board = createBoard();
    const mcu1 = { simplePins: { p0: 1 } };
    const mcu2 = { simplePins: { p1: 2 } };
    board.registerMCU(mcu1);
    board.registerMCU(mcu2);
    expect(board.readSimplePin('p0')).toBe(1);
    expect(board.readSimplePin('p1')).toBe(2);
  });

  it('reflects live MCU pin state (not a snapshot)', () => {
    const board = createBoard();
    const fakeMCU = { simplePins: { p0: 0 } };
    board.registerMCU(fakeMCU);
    fakeMCU.simplePins.p0 = 42; // mutate directly
    expect(board.readSimplePin('p0')).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// onSimplePinWrite
// ---------------------------------------------------------------------------

describe('onSimplePinWrite', () => {
  it('calls onPinWrite callback with pinId and value', () => {
    const onPinWrite = vi.fn();
    const board = createBoard({ onPinWrite });
    board.onSimplePinWrite('mcu-a', 'p0', 10);
    expect(onPinWrite).toHaveBeenCalledWith('p0', 10);
  });

  it('does not throw if onPinWrite is not provided', () => {
    const board = createBoard();
    expect(() => board.onSimplePinWrite('mcu-a', 'p0', 5)).not.toThrow();
  });

  it('can be called multiple times', () => {
    const writes = [];
    const board = createBoard({ onPinWrite: (id, v) => writes.push({ id, v }) });
    board.onSimplePinWrite('mcu1', 'p0', 1);
    board.onSimplePinWrite('mcu1', 'p0', 2);
    board.onSimplePinWrite('mcu2', 'p1', 5);
    expect(writes).toEqual([
      { id: 'p0', v: 1 },
      { id: 'p0', v: 2 },
      { id: 'p1', v: 5 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// pinSnapshot isolation
// ---------------------------------------------------------------------------

describe('pinSnapshot', () => {
  it('returns a shallow copy — mutations do not affect the board', () => {
    const board = createBoard({ externalPins: { x: 1 } });
    const snap = board.pinSnapshot;
    snap.x = 999;
    expect(board.readSimplePin('x')).toBe(1);
  });

  it('reflects all external writes so far', () => {
    const board = createBoard({ externalPins: { a: 1 } });
    board.writeSimplePin('b', 2);
    board.setSourcePin('c', 3);
    const snap = board.pinSnapshot;
    expect(snap.a).toBe(1);
    expect(snap.b).toBe(2);
    expect(snap.c).toBe(3);
  });
});
