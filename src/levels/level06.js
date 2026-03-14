/**
 * Level 06 — Signal Clamp
 *
 * Objective: Clamp sensor values to the range [20, 80].
 *            Below 20 → output 20. Above 80 → output 80. Otherwise pass through.
 * Combines: tgt, conditional execution, multiple tests in sequence.
 *
 * Sensor produces: 10, 50, 90, 20, 80, 5, 45, 100, 30, 75 (cycling).
 * Expected output: 20, 50, 80, 20, 80, 20, 45,  80, 30, 75.
 *
 * One solution:
 *   mov sensor acc
 *   tgt acc 80
 *   + mov 80 acc       ← clamp high
 *   tgt acc 20         ← acc > 20?
 *   - mov 20 acc       ← no: clamp low
 *   mov acc p0
 */

const SENSOR_VALUES = [10, 50, 90, 20, 80, 5, 45, 100, 30, 75];

export const level06 = {
  id: '06',
  name: 'Signal Clamp',
  description: 'Clamp sensor values to the range 20–80.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    output: (cycle) => {
      const v = SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length];
      return Math.min(80, Math.max(20, v));
    },
  },

  hint: 'You can run multiple tests in a row. Each one updates the condition flag — use that to your advantage.',

  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },

  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' },
  ],

  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },
};
