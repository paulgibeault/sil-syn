import { describe, it, expect } from 'vitest';
import { createMCU, MCUState } from '../../src/engine/mcu.js';
import { createBoard } from '../../src/engine/board.js';
import { createScheduler } from '../../src/engine/scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSetup({ senderSource, receiverSource }) {
  const board = createBoard();

  const sender = createMCU({
    id: 'sender',
    source: senderSource,
    xbusPins: ['x0'],
  });

  const receiver = createMCU({
    id: 'receiver',
    source: receiverSource,
    xbusPins: ['x0'],
  });

  board.registerMCU(sender);
  board.registerMCU(receiver);

  const xbusWires = [{
    from: { mcuId: 'sender', pin: 'x0' },
    to:   { mcuId: 'receiver', pin: 'x0' },
  }];

  const scheduler = createScheduler({
    mcus: [sender, receiver],
    xbusWires,
    board,
  });

  return { sender, receiver, scheduler };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('XBus handshake', () => {
  it('transfers a value when sender and receiver meet in the same tick', () => {
    const { sender, receiver, scheduler } = makeSetup({
      senderSource:   'mov 77 x0',
      receiverSource: 'mov x0 acc',
    });

    // Tick 1: both execute their mov → both block on XBus
    // Tick 2 start: resolveXBus → handshake completes, value transferred
    // Tick 2: single-instruction programs loop and immediately re-block
    scheduler.run(2);

    expect(receiver.registers.acc).toBe(77);
    // Programs loop, so both re-issue XBus after transfer — that's correct
    expect(sender.state).toBe(MCUState.XBUS_SENDING);
    expect(receiver.state).toBe(MCUState.XBUS_RECEIVING);
  });

  it('sender stays blocked until receiver is ready', () => {
    // Receiver sleeps 2 ticks before receiving
    const { sender, receiver, scheduler } = makeSetup({
      senderSource:   'mov 42 x0',
      receiverSource: 'slp 2\nmov x0 acc',
    });

    scheduler.run(1); // sender blocks immediately; receiver starts sleeping
    expect(sender.state).toBe(MCUState.XBUS_SENDING);
    expect(receiver.state).toBe(MCUState.SLEEPING);

    // tick 2: receiver wakes
    // tick 3: receiver issues mov x0 acc → XBUS_RECEIVING
    // tick 4 start: resolveXBus matches both → transfer, both READY
    scheduler.run(3);
    expect(receiver.registers.acc).toBe(42);
  });

  it('transfers multiple values in sequence', () => {
    const received = [];
    const board = createBoard({ onPinWrite: () => {} });

    const sender = createMCU({
      id: 'sender',
      source: 'mov 1 x0\nmov 2 x0\nmov 3 x0',
      xbusPins: ['x0'],
    });

    const receiver = createMCU({
      id: 'receiver',
      source: 'mov x0 acc\nmov x0 acc\nmov x0 acc',
      xbusPins: ['x0'],
    });

    board.registerMCU(sender);
    board.registerMCU(receiver);

    const scheduler = createScheduler({
      mcus: [sender, receiver],
      xbusWires: [{ from: { mcuId: 'sender', pin: 'x0' }, to: { mcuId: 'receiver', pin: 'x0' } }],
      board,
      onTick: () => received.push(receiver.registers.acc),
    });

    scheduler.run(6); // 3 transfers × ~2 ticks each
    expect(received).toContain(1);
    expect(received).toContain(2);
    expect(received).toContain(3);
  });
});

describe('XBus with no matching wire', () => {
  it('stays blocked indefinitely if no wire connects the pins', () => {
    const board = createBoard();
    const sender = createMCU({ id: 'sender', source: 'mov 5 x0', xbusPins: ['x0'] });
    board.registerMCU(sender);

    const scheduler = createScheduler({
      mcus: [sender],
      xbusWires: [], // no wires
      board,
    });

    scheduler.run(5);
    expect(sender.state).toBe(MCUState.XBUS_SENDING); // still blocked
  });
});
