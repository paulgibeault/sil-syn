/**
 * Level 05 — Packet Sorter
 *
 * Objective: Read sensor values; send even values to "even" output pin,
 *            odd values to "odd" output pin. Output 0 on the other pin.
 * New concept: Modulo logic (using sub in a loop to test even/odd).
 *
 * Sensor produces values: 2, 7, 4, 3, 8, 1, 6, 5, 10, 9 (cycling).
 * Even pin expected:      2, 0, 4, 0, 8, 0, 6, 0, 10, 0.
 * Odd  pin expected:      0, 7, 0, 3, 0, 1, 0, 5,  0, 9.
 *
 * One solution:
 *   mov sensor acc
 *   mov acc dat       ← save original value
 *   loop: sub 2
 *   tgt acc 0
 *   + jmp loop        ← keep subtracting 2 while acc > 0
 *   teq acc 0
 *   + mov dat p0      ← even: send to p0
 *   + mov 0 p1
 *   - mov 0 p0
 *   - mov dat p1      ← odd: send to p1
 */

const SENSOR_VALUES = [2, 7, 4, 3, 8, 1, 6, 5, 10, 9];

export const level05 = {
  id: '05',
  name: 'Packet Sorter',
  description: 'Send even sensor values to the even pin and odd values to the odd pin.',
  testCycles: 10,
  tolerance: 0,

  sources: {
    sensor: (cycle) => SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length],
  },

  expected: {
    even: (cycle) => {
      const v = SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length];
      return v % 2 === 0 ? v : 0;
    },
    odd: (cycle) => {
      const v = SENSOR_VALUES[(cycle - 1) % SENSOR_VALUES.length];
      return v % 2 !== 0 ? v : 0;
    },
  },

  hint: 'Repeatedly subtract 2 from acc to test even/odd. If acc reaches 0 it is even; if it reaches -1 (or below 0) it is odd.',

  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0', 'p1'],
  },

  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'even' },
    { from: { mcuId: 'mcu0', pin: 'p1' }, to: 'odd' },
  ],

  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [
      { id: 'even', name: 'EVEN', pin: 'p0' },
      { id: 'odd', name: 'ODD', pin: 'p1' },
    ],
  },
};
