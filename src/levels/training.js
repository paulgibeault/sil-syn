/**
 * Training levels — teach through constrained puzzles.
 * Boot lessons (B1-B6) are the interactive onboarding sequence.
 * Training levels bridge the gap between boot and open puzzles.
 *
 * Design principles:
 *   - Each level teaches exactly ONE new concept
 *   - Pre-filled programs with blanks: player fills the gap
 *   - Restricted picker: only show relevant instructions
 *   - Wrong answers produce visible waveform feedback (try-fail-adjust)
 *   - No text walls — short prompts and visual learning
 */

// ---------------------------------------------------------------------------
// T1: Filter — learn tgt and conditional +/-
// Pre-filled: mov sensor acc / tgt [?] / + mov acc p0 / - mov 0 p0
// Player discovers tgt and sees how +/- conditional lines work.
// ---------------------------------------------------------------------------

export const trainingT1 = {
  id: 'T1',
  name: 'Filter',
  description: 'Only output values above 50.',
  testCycles: 6,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [20, 80, 40, 90, 10, 70][(cycle - 1) % 6],
  },
  expected: {
    output: (cycle) => {
      const v = [20, 80, 40, 90, 10, 70][(cycle - 1) % 6];
      return v > 50 ? v : 0;
    },
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 8,
    gridRows: 3,
    components: [
      { type: 'sensor', id: 'sensor', col: 0, row: 1, outputPins: ['sensor'], inputPins: [], locked: true },
      { type: 'mcu', id: 'mcu0', col: 3, row: 0, outputPins: ['p0'], inputPins: ['sensor'], locked: true },
      { type: 'output', id: 'output', col: 6, row: 1, outputPins: [], inputPins: ['output'], locked: true },
    ],
    wires: [
      { from: 'sensor', fromPin: 'sensor', to: 'mcu0', toPin: 'sensor', locked: true },
      { from: 'mcu0', fromPin: 'p0', to: 'output', toPin: 'output', locked: true },
    ],
  },

  allowedOps: ['mov', 'tgt'],
  allowedArgs: ['sensor', 'p0', 'acc', '0', '50'],
  maxSlots: 6,

  prefill: [
    { op: 'mov', args: ['sensor', 'acc'], locked: [true, true], opLocked: true },
    null,  // Player adds: tgt 50
    { op: 'mov', args: ['acc', 'p0'], locked: [true, true], opLocked: true, cond: true },   // + mov acc p0
    { op: 'mov', args: ['0', 'p0'], locked: [true, true], opLocked: true, cond: false },     // - mov 0 p0
  ],

  guide: [
    {
      text: 'Some values should pass, others should be blocked. The <strong>+</strong> and <strong>-</strong> lines already handle the branching.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Add a <strong>test</strong> instruction. It will check if <strong>acc</strong> passes the threshold.',
      target: '.slot-row:nth-child(2) .slot-op',
      position: 'below',
    },
  ],
};

// ===========================================================================
// BOOT SEQUENCE — B1 through B6
// Onboarding micro-lessons. One concept each. Flavor-first.
// These appear in the level map as B1–B6 and auto-complete on boot.
// ===========================================================================

// ---------------------------------------------------------------------------
// B1: "POWER ON. Send the signal."  — learn mov to write a pin
// ---------------------------------------------------------------------------

export const bootB1 = {
  id: 'B1',
  name: 'Power On',
  description: 'POWER ON. Send the signal.',
  hint: 'The chip is dark. One command is all it takes.',
  testCycles: 3,
  tolerance: 0,

  sources: {},
  expected: { light: () => 100 },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' }],
  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 6,
    gridRows: 3,
    components: [
      { type: 'mcu', id: 'mcu0', col: 1, row: 0, outputPins: ['p0'], inputPins: [], locked: true },
      { type: 'light', id: 'light', col: 4, row: 1, outputPins: [], inputPins: ['light'], locked: true },
    ],
    wires: [
      { from: 'mcu0', fromPin: 'p0', to: 'light', toPin: 'light', locked: true },
    ],
  },

  allowedOps: ['mov'],
  allowedArgs: ['100', 'p0'],
  maxSlots: 3,

  prefill: [
    { op: 'mov', args: [null, null], locked: [false, false], opLocked: true },
  ],

  guide: [
    {
      text: 'The <strong>LIGHT</strong> needs 100 to shine. Your MCU is wired to it on pin <strong>p0</strong>.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Tap the <strong>MCU</strong> → choose <strong>mov</strong> → pick <strong>100</strong> → pick <strong>p0</strong>. Then hit Run.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// B2: "The sensor is live. Listen." — read from external pin into acc
// ---------------------------------------------------------------------------

export const bootB2 = {
  id: 'B2',
  name: 'Listen',
  description: 'The sensor is live. Listen.',
  hint: 'Copy what the sensor says, word for word.',
  testCycles: 5,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [0, 50, 100, 50, 0][(cycle - 1) % 5],
  },
  expected: {
    output: (cycle) => [0, 50, 100, 50, 0][(cycle - 1) % 5],
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 8,
    gridRows: 3,
    components: [
      { type: 'sensor', id: 'sensor', col: 0, row: 1, outputPins: ['sensor'], inputPins: [], locked: true },
      { type: 'mcu', id: 'mcu0', col: 3, row: 0, outputPins: ['p0'], inputPins: ['sensor'], locked: true },
      { type: 'output', id: 'output', col: 6, row: 1, outputPins: [], inputPins: ['output'], locked: true },
    ],
    wires: [
      { from: 'sensor', fromPin: 'sensor', to: 'mcu0', toPin: 'sensor', locked: true },
      { from: 'mcu0', fromPin: 'p0', to: 'output', toPin: 'output', locked: true },
    ],
  },

  allowedOps: ['mov'],
  allowedArgs: ['sensor', 'p0', 'acc'],
  maxSlots: 3,

  prefill: [
    { op: 'mov', args: [null, 'p0'], locked: [false, true] },
  ],

  guide: [
    {
      text: 'The <strong>SENSOR</strong> is sending values. The MCU can read them — you just need to tell it <em>where</em> to read from.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Open the MCU. The instruction already says <strong>mov _ p0</strong>. Tap the blank and pick <strong>sensor</strong>.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// B3: "Signal too weak. Amplify." — use add to boost acc
// ---------------------------------------------------------------------------

export const bootB3 = {
  id: 'B3',
  name: 'Amplify',
  description: 'Signal too weak. Amplify.',
  hint: 'The value is in acc. It needs to reach 100.',
  testCycles: 4,
  tolerance: 0,

  sources: {
    sensor: () => 50,
  },
  expected: {
    output: () => 100,
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 8,
    gridRows: 3,
    components: [
      { type: 'sensor', id: 'sensor', col: 0, row: 1, outputPins: ['sensor'], inputPins: [], locked: true },
      { type: 'mcu', id: 'mcu0', col: 3, row: 0, outputPins: ['p0'], inputPins: ['sensor'], locked: true },
      { type: 'output', id: 'output', col: 6, row: 1, outputPins: [], inputPins: ['output'], locked: true },
    ],
    wires: [
      { from: 'sensor', fromPin: 'sensor', to: 'mcu0', toPin: 'sensor', locked: true },
      { from: 'mcu0', fromPin: 'p0', to: 'output', toPin: 'output', locked: true },
    ],
  },

  allowedOps: ['mov', 'add'],
  allowedArgs: ['sensor', 'p0', 'acc', '50'],
  maxSlots: 5,

  prefill: [
    { op: 'mov', args: ['sensor', 'acc'], locked: [true, true], opLocked: true },
    { op: 'add', args: [null], locked: [false], opLocked: true }, // player fills 50
    { op: 'mov', args: ['acc', 'p0'], locked: [true, true], opLocked: true },
  ],

  guide: [
    {
      text: 'The sensor sends <strong>50</strong>. The output needs <strong>100</strong>. The value is already in <strong>acc</strong>.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Open the MCU. <strong>add</strong> is already set. Tap the blank — pick how much to add.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// B4: "The line goes cold. Rest." — learn slp + jmp for timing
// ---------------------------------------------------------------------------

export const bootB4 = {
  id: 'B4',
  name: 'Rhythm',
  description: 'The line goes cold. Rest.',
  hint: 'On 2 cycles, off 2 cycles. Forever.',
  testCycles: 8,
  tolerance: 0,

  sources: {},
  expected: {
    light: (cycle) => (Math.floor((cycle - 1) / 2) % 2 === 0) ? 100 : 0,
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' }],
  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 6,
    gridRows: 3,
    components: [
      { type: 'mcu', id: 'mcu0', col: 1, row: 0, outputPins: ['p0'], inputPins: [], locked: true },
      { type: 'light', id: 'light', col: 4, row: 1, outputPins: [], inputPins: ['light'], locked: true },
    ],
    wires: [
      { from: 'mcu0', fromPin: 'p0', to: 'light', toPin: 'light', locked: true },
    ],
  },

  allowedOps: ['mov', 'slp', 'jmp'],
  allowedArgs: ['0', '100', 'p0', '2', 'loop'],
  maxSlots: 7,

  prefill: [
    { label: 'loop', op: 'mov', args: ['100', 'p0'], locked: [true, true], opLocked: true },
    { op: 'slp', args: [null], locked: [false], opLocked: true }, // player picks 2
    { op: 'mov', args: ['0', 'p0'], locked: [true, true], opLocked: true },
    { op: 'slp', args: [null], locked: [false], opLocked: true }, // player picks 2
    { op: 'jmp', args: ['loop'], locked: [true], opLocked: true },
  ],

  guide: [
    {
      text: 'The light blinks: on 2 cycles, off 2 cycles. <strong>slp</strong> pauses the MCU.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Fill in both <strong>slp</strong> blanks. The pattern stays on 2, off 2. Pick <strong>2</strong>.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// B5: "Two paths. One signal." — conditional routing with teq
// ---------------------------------------------------------------------------

export const bootB5 = {
  id: 'B5',
  name: 'Branch',
  description: 'Two paths. One signal.',
  hint: 'Test if acc equals 0. Route accordingly.',
  testCycles: 6,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [0, 100, 0, 100, 0, 100][(cycle - 1) % 6],
  },
  expected: {
    output: (cycle) => [100, 0, 100, 0, 100, 0][(cycle - 1) % 6],
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 8,
    gridRows: 3,
    components: [
      { type: 'sensor', id: 'sensor', col: 0, row: 1, outputPins: ['sensor'], inputPins: [], locked: true },
      { type: 'mcu', id: 'mcu0', col: 3, row: 0, outputPins: ['p0'], inputPins: ['sensor'], locked: true },
      { type: 'output', id: 'output', col: 6, row: 1, outputPins: [], inputPins: ['output'], locked: true },
    ],
    wires: [
      { from: 'sensor', fromPin: 'sensor', to: 'mcu0', toPin: 'sensor', locked: true },
      { from: 'mcu0', fromPin: 'p0', to: 'output', toPin: 'output', locked: true },
    ],
  },

  allowedOps: ['mov', 'teq'],
  allowedArgs: ['sensor', 'p0', 'acc', '0', '100'],
  maxSlots: 6,

  prefill: [
    { op: 'mov', args: ['sensor', 'acc'], locked: [true, true], opLocked: true },
    { op: 'teq', args: ['acc', null], locked: [true, false], opLocked: true }, // player picks 0
    { op: 'mov', args: ['100', 'p0'], locked: [true, true], opLocked: true, cond: true },  // + when equal
    { op: 'mov', args: ['0', 'p0'], locked: [true, true], opLocked: true, cond: false },   // - when not equal
  ],

  guide: [
    {
      text: 'The sensor is either 0 or 100. When it\'s 0, output 100. When it\'s 100, output 0.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'The <strong>teq</strong> instruction tests for equality. Fill the blank with the value to test against.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// B6: "Loop or die." — label + jmp to make it run forever
// ---------------------------------------------------------------------------

export const bootB6 = {
  id: 'B6',
  name: 'Loop',
  description: 'Loop or die.',
  hint: 'Without a loop, the MCU goes silent after one pass.',
  testCycles: 6,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [20, 40, 60, 80, 60, 40][(cycle - 1) % 6],
  },
  expected: {
    output: (cycle) => [20, 40, 60, 80, 60, 40][(cycle - 1) % 6],
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  boardConfig: {
    gridCols: 8,
    gridRows: 3,
    components: [
      { type: 'sensor', id: 'sensor', col: 0, row: 1, outputPins: ['sensor'], inputPins: [], locked: true },
      { type: 'mcu', id: 'mcu0', col: 3, row: 0, outputPins: ['p0'], inputPins: ['sensor'], locked: true },
      { type: 'output', id: 'output', col: 6, row: 1, outputPins: [], inputPins: ['output'], locked: true },
    ],
    wires: [
      { from: 'sensor', fromPin: 'sensor', to: 'mcu0', toPin: 'sensor', locked: true },
      { from: 'mcu0', fromPin: 'p0', to: 'output', toPin: 'output', locked: true },
    ],
  },

  allowedOps: ['mov', 'jmp'],
  allowedArgs: ['sensor', 'p0', 'loop'],
  maxSlots: 5,

  prefill: [
    { label: 'loop', op: 'mov', args: ['sensor', 'p0'], locked: [true, true], opLocked: true },
    { op: 'jmp', args: [null], locked: [false], opLocked: true }, // player picks 'loop'
  ],

  guide: [
    {
      text: 'The program runs once and stops. The output goes dark after cycle 1.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Add a <strong>jmp</strong> back to <strong>loop</strong> so it repeats every cycle.',
      target: '.cb-comp',
      position: 'below',
    },
  ],
};
