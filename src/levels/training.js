/**
 * Training levels — guided missions that teach gameplay through doing.
 *
 * Each training level includes a `guide` array of hint steps that
 * walk the player through solving the puzzle. The guide overlay
 * shows contextual tooltips pointing to relevant UI elements.
 */

// ---------------------------------------------------------------------------
// T1: First Signal — learn mov and running
// ---------------------------------------------------------------------------

export const trainingT1 = {
  id: 'T1',
  name: 'First Signal',
  description: 'Send power to the light to turn it on.',
  testCycles: 5,
  tolerance: 0,

  sources: {},
  expected: {
    light: (_cycle) => 100,
  },

  hint: '',
  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },
  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' },
  ],

  // Circuit board display info
  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  // Guide steps shown in sequence
  guide: [
    {
      target: null,
      text: '<strong>Mission: Turn on the light.</strong><br><br>Your MCU (microcontroller) is wired to a light. Program it to send a signal of <strong>100</strong> to pin <strong>p0</strong>.',
    },
    {
      target: '.slot-row:first-child .slot-op',
      text: 'Tap here to add your first instruction.',
    },
  ],
};

// ---------------------------------------------------------------------------
// T2: Reading Input — learn sensor pins
// ---------------------------------------------------------------------------

export const trainingT2 = {
  id: 'T2',
  name: 'Echo',
  description: 'Read the sensor and copy its value to the output.',
  testCycles: 5,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [30, 60, 90, 60, 30][(cycle - 1) % 5],
  },
  expected: {
    output: (cycle) => [30, 60, 90, 60, 30][(cycle - 1) % 5],
  },

  hint: '',
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

  guide: [
    {
      target: null,
      text: '<strong>Mission: Echo the sensor.</strong><br><br>A sensor is connected to your MCU. Read its value and send it straight to the output pin <strong>p0</strong>.<br><br>Hint: <code>mov sensor p0</code> moves data from the sensor directly to the output.',
    },
  ],
};

// ---------------------------------------------------------------------------
// T3: Math — learn acc register and add
// ---------------------------------------------------------------------------

export const trainingT3 = {
  id: 'T3',
  name: 'Boost',
  description: 'Double the sensor value and output it.',
  testCycles: 5,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [10, 20, 30, 40, 50][(cycle - 1) % 5],
  },
  expected: {
    output: (cycle) => [10, 20, 30, 40, 50][(cycle - 1) % 5] * 2,
  },

  hint: '',
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

  guide: [
    {
      target: null,
      text: '<strong>Mission: Boost the signal.</strong><br><br>The output needs to be <strong>double</strong> the sensor value.<br><br>Use the <strong>acc</strong> register as a workspace:<br>1. Move the sensor value into <code>acc</code><br>2. <code>add acc</code> to double it (acc + acc)<br>3. Move <code>acc</code> to <code>p0</code>',
    },
  ],
};

// ---------------------------------------------------------------------------
// T4: Timing — learn slp and jmp
// ---------------------------------------------------------------------------

export const trainingT4 = {
  id: 'T4',
  name: 'Rhythm',
  description: 'Make the light blink: on for 3 cycles, off for 3 cycles.',
  testCycles: 12,
  tolerance: 0,

  sources: {},
  expected: {
    light: (cycle) => (Math.floor((cycle - 1) / 3) % 2 === 0) ? 100 : 0,
  },

  hint: '',
  playerMCU: {
    id: 'mcu0',
    simplePins: ['p0'],
  },
  wiring: [
    { from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' },
  ],

  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  guide: [
    {
      target: null,
      text: '<strong>Mission: Create a rhythm.</strong><br><br>Blink the light: <strong>on</strong> for 3 cycles, <strong>off</strong> for 3 cycles, repeating.<br><br>New tools:<br>- <code>slp N</code> pauses the MCU for N cycles<br>- <code>jmp label</code> loops back to a label<br><br>Set a <strong>label</strong> at the top, then build the on-off-loop pattern.',
    },
  ],
};
