/**
 * Level 08 — Pulse Counter
 *
 * Objective: Count how many sensor readings exceed 50. Output the
 *            running count each cycle.
 * Combines: tgt, dat as persistent counter, add, conditional logic.
 *
 * Sensor produces: 60, 30, 70, 20, 80, 40, 90, 10, 55, 50 (cycling).
 * Running count:    1,  1,  2,  2,  3,  3,  4,  4,  5,  5.
 *
 * One solution:
 *   mov sensor acc
 *   tgt acc 50
 *   + mov dat acc
 *   + add 1
 *   + mov acc dat     ← save incremented count
 *   + mov acc p0
 *   - mov dat p0      ← output unchanged count
 */

const SENSOR_VALUES = [60, 30, 70, 20, 80, 40, 90, 10, 55, 50];

export const level08 = {
  id: '08',
  name: 'Pulse Counter',
  description: 'Count how many sensor readings exceed 50. Output the running total.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    output: (cycle) => {
      let count = 0;
      for (let i = 0; i < cycle; i++) {
        if (SENSOR_VALUES[i % SENSOR_VALUES.length] > 50) count++;
      }
      return count;
    },
  },

  hint: 'Use dat as a counter that persists across cycles. Only increment it when the condition is met.',

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
