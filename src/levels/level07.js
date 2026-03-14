/**
 * Level 07 — Sequence Detector
 *
 * Objective: Output 100 when the current sensor reading matches the
 *            previous one; otherwise output 0.
 * Combines: teq, dat register for memory across cycles, conditional execution.
 *
 * Sensor produces: 5, 5, 3, 3, 3, 7, 7, 1, 2, 2 (cycling).
 * Expected output: 0, 100, 0, 100, 100, 0, 100, 0, 0, 100.
 *
 * (Cycle 1: dat starts at 0, sensor is 5 → mismatch → 0.)
 *
 * One solution:
 *   mov sensor acc
 *   teq acc dat       ← does current match previous?
 *   + mov 100 p0
 *   - mov 0 p0
 *   mov acc dat       ← remember for next cycle
 */

const SENSOR_VALUES = [5, 5, 3, 3, 3, 7, 7, 1, 2, 2];

export const level07 = {
  id: '07',
  name: 'Sequence Detector',
  description: 'Output 100 when two consecutive sensor readings match, otherwise 0.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    output: (cycle) => {
      const idx = (cycle - 1) % SENSOR_VALUES.length;
      if (idx === 0) return 0; // first reading has no previous (dat starts at 0)
      return SENSOR_VALUES[idx] === SENSOR_VALUES[idx - 1] ? 100 : 0;
    },
  },

  hint: 'The dat register keeps its value between cycles. Use it to remember what you saw last time.',

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
