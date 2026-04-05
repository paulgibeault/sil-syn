/**
 * Level 01 — Power On
 *
 * Objective: Output a constant signal of 100 to the "light" pin.
 * New concept: mov, Simple Pins.
 *
 * The player needs one MCU with a single instruction:
 *   mov 100 p0
 *
 * Expected waveform: light = 100 for all 10 cycles.
 */

export const level01 = {
  id: '01',
  name: 'Power On',
  description: 'Send a constant signal of 100 to the light.',
  testCycles: 10,
  tolerance: 0,

  // No sensor inputs needed for this level
  sources: {},

  // Output: "light" pin must be 100 every cycle
  expected: {
    light: (_cycle) => 100,
  },

  // Hint shown in the code editor
  hint: 'Try: mov 100 p0',

  // The MCU the player programs (p0 is wired to the light pin)
  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
    // p0 is connected to "light" by the level wiring below
  },

  // Wiring: maps MCU output pins to board sink pins
  // { from: { mcuId, pin }, to: boardPinId }
  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' },
  ],

  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

};
