import { describe, it, expect, vi } from 'vitest';
import { createMCU } from '../../src/engine/mcu.js';
import { createBoard } from '../../src/engine/board.js';
import { createScheduler } from '../../src/engine/scheduler.js';

function makeSimple(source) {
  const mcu = createMCU({ id: 'mcu0', source });
  const board = createBoard();
  board.registerMCU(mcu);
  const scheduler = createScheduler({ mcus: [mcu], board });
  return { mcu, board, scheduler };
}

describe('Scheduler', () => {
  it('increments cycle counter each tick', () => {
    const { scheduler } = makeSimple('slp 1');
    expect(scheduler.cycle).toBe(0);
    scheduler.tick();
    expect(scheduler.cycle).toBe(1);
    scheduler.tick();
    expect(scheduler.cycle).toBe(2);
  });

  it('run(n) advances exactly n cycles', () => {
    const { scheduler } = makeSimple('slp 1');
    scheduler.run(10);
    expect(scheduler.cycle).toBe(10);
  });

  it('calls onTick after every tick', () => {
    const onTick = vi.fn();
    const mcu = createMCU({ id: 'mcu0', source: 'add 1' });
    const board = createBoard();
    const scheduler = createScheduler({ mcus: [mcu], board, onTick });
    scheduler.run(3);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick).toHaveBeenLastCalledWith(3, [mcu]);
  });

  it('reset restores MCU to initial state', () => {
    const { mcu, scheduler } = makeSimple('add 1');
    scheduler.run(5);
    expect(mcu.registers.acc).toBe(5);
    scheduler.reset();
    expect(mcu.registers.acc).toBe(0);
    expect(mcu.pc).toBe(0);
    expect(scheduler.cycle).toBe(0);
  });

  it('steps all MCUs each tick', () => {
    const board = createBoard();
    const mcu0 = createMCU({ id: 'mcu0', source: 'add 1' });
    const mcu1 = createMCU({ id: 'mcu1', source: 'add 2' });
    board.registerMCU(mcu0);
    board.registerMCU(mcu1);
    const scheduler = createScheduler({ mcus: [mcu0, mcu1], board });
    scheduler.run(3);
    expect(mcu0.registers.acc).toBe(3);
    expect(mcu1.registers.acc).toBe(6);
  });
});
