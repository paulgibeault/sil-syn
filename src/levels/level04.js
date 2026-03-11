/**
 * Level 04 — Gatekeeper
 *
 * Objective: Only pass values > 50 from sensor to output; otherwise output 0.
 * New concepts: tgt, Conditional execution (+/-).
 *
 * Sensor produces values: 20, 60, 40, 80, 10, 90, 50, 70, 30, 100 (cycling).
 * Expected output:         0, 60,  0, 80,  0, 90,  0, 70,  0, 100.
 *
 * One solution:
 *   mov sensor acc
 *   tgt acc 50
 *   + mov acc p0
 *   - mov 0 p0
 */

const SENSOR_VALUES = [20, 60, 40, 80, 10, 90, 50, 70, 30, 100];

export const level04 = {
  id: '04',
  name: 'Gatekeeper',
  description: 'Only pass values greater than 50 to the output; otherwise output 0.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    output: (cycle) => {
      const v = SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length];
      return v > 50 ? v : 0;
    },
  },

  hint: 'Read sensor into acc, use tgt to test, then prefix lines with + or - to conditionally output.',

  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },

  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' },
  ],
};
