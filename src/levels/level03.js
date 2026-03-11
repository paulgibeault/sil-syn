/**
 * Level 03 — Amplifier
 *
 * Objective: Read from sensor pin, multiply by 2, output to amplified pin.
 * New concepts: add, acc register.
 *
 * Sensor produces values: 0, 10, 20, 30, 40 (cycling).
 * Output must be: 0, 20, 40, 60, 80.
 *
 * One solution:
 *   mov sensor acc
 *   add acc      ← acc = acc + acc = acc * 2
 *   mov acc p0
 */

const SENSOR_VALUES = [0, 10, 20, 30, 40];

export const level03 = {
  id: '03',
  name: 'Amplifier',
  description: 'Read the sensor value and output double the value.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    amplified: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length] * 2,
  },

  hint: 'Read sensor into acc, then add acc to itself, then write to p0.',

  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },

  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'amplified' },
  ],

  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'amplified', name: 'AMP OUT', pin: 'p0' }],
  },
};
