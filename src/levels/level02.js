/**
 * Level 02 — Blink
 *
 * Objective: Toggle the light between 100 and 0 every 5 cycles.
 * New concepts: slp, jmp, Labels.
 *
 * Expected waveform:
 *   cycles  1-5  → 100
 *   cycles  6-10 → 0
 *   cycles 11-15 → 100
 *   ...
 *
 * One solution:
 *   mov 100 p0
 *   slp 4
 *   mov 0 p0
 *   slp 4
 *   jmp 0      ← or use a label
 */

export const level02 = {
  id: '02',
  name: 'Blink',
  description: 'Toggle the light on for 5 cycles, off for 5 cycles, and repeat.',
  testCycles: 20,
  tolerance: 0,

  sources: {},

  expected: {
    // 5 on, 5 off, repeating. Cycle is 1-indexed.
    light: (cycle) => (Math.floor((cycle - 1) / 5) % 2 === 0) ? 100 : 0,
  },

  hint: 'Use slp to wait, and jmp to loop back.',

  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },

  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' },
  ],
};
