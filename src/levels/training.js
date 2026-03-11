/**
 * Training levels — teach through constrained puzzles.
 *
 * Design principles:
 *   - Each level teaches exactly ONE new concept
 *   - Pre-filled programs with blanks: player fills the gap
 *   - Restricted picker: only show relevant instructions
 *   - Wrong answers produce visible waveform feedback (try-fail-adjust)
 *   - No text walls — short prompts and visual learning
 */

// ---------------------------------------------------------------------------
// T1: First Signal — learn what "mov" does
// Only instruction available: mov. Only argument: 100 and p0.
// Player fills one empty slot in an otherwise blank program.
// ---------------------------------------------------------------------------

export const trainingT1 = {
  id: 'T1',
  name: 'First Signal',
  description: 'The light needs power. Send it a signal.',
  testCycles: 5,
  tolerance: 0,

  sources: {},
  expected: { light: () => 100 },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' }],
  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  allowedOps: ['mov'],
  allowedArgs: ['100', 'p0'],
  maxSlots: 3,

  prefill: [null],

  guide: [
    {
      text: 'See the <strong>LIGHT</strong> above? It shows <strong>"needs 100"</strong>. Your MCU is wired to it through pin <strong>p0</strong>.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: '<strong>mov</strong> sends a value somewhere. Tap here to build the instruction that sends <strong>100</strong> to <strong>p0</strong>.',
      target: '.slot-row:first-child .slot-op',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// T2: Echo — learn reading from sensor pins
// Pre-filled: mov [???] p0 — player picks "sensor" as the source.
// ---------------------------------------------------------------------------

export const trainingT2 = {
  id: 'T2',
  name: 'Echo',
  description: 'Copy the sensor signal to the output.',
  testCycles: 5,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [30, 60, 90, 60, 30][(cycle - 1) % 5],
  },
  expected: {
    output: (cycle) => [30, 60, 90, 60, 30][(cycle - 1) % 5],
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  allowedOps: ['mov'],
  allowedArgs: ['sensor', 'p0', 'acc'],
  maxSlots: 3,

  // Pre-fill with mov ??? p0 — arg 0 is blank
  prefill: [
    { op: 'mov', args: [null, 'p0'], locked: [false, true] },
  ],

  guide: [
    {
      text: 'The <strong>SENSOR</strong> sends changing values. Make the output match.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'The instruction is set to <strong>mov</strong>. Tap the blank to choose <em>where</em> to read from.',
      target: '.slot-row:first-child .slot-arg',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// T3: Boost — learn acc register and add
// Pre-filled: mov sensor acc / [???] / mov acc p0
// Player discovers "add" to double the value.
// ---------------------------------------------------------------------------

export const trainingT3 = {
  id: 'T3',
  name: 'Boost',
  description: 'Double the sensor value.',
  testCycles: 5,
  tolerance: 0,

  sources: {
    sensor: (cycle) => [10, 20, 30, 40, 50][(cycle - 1) % 5],
  },
  expected: {
    output: (cycle) => [10, 20, 30, 40, 50][(cycle - 1) % 5] * 2,
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'output' }],
  circuit: {
    inputs: [{ id: 'sensor', name: 'SENSOR', pin: 'sensor' }],
    outputs: [{ id: 'output', name: 'OUTPUT', pin: 'p0' }],
  },

  allowedOps: ['mov', 'add'],
  allowedArgs: ['sensor', 'p0', 'acc'],
  maxSlots: 5,

  prefill: [
    { op: 'mov', args: ['sensor', 'acc'], locked: [true, true], opLocked: true },
    null,  // Player must figure out "add acc"
    { op: 'mov', args: ['acc', 'p0'], locked: [true, true], opLocked: true },
  ],

  guide: [
    {
      text: 'The output needs to be <strong>double</strong> the sensor. The value is loaded into <strong>acc</strong> and then sent to the output.',
      target: '#circuit',
      position: 'below',
    },
    {
      text: 'Something needs to happen in the middle. Tap to add an instruction that increases <strong>acc</strong>.',
      target: '.slot-row:nth-child(2) .slot-op',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// T4: Rhythm — learn slp and jmp
// Pre-filled: loop: / mov 100 p0 / slp [?] / mov 0 p0 / slp [?] / jmp loop
// Player discovers that slp controls timing.
// ---------------------------------------------------------------------------

export const trainingT4 = {
  id: 'T4',
  name: 'Rhythm',
  description: 'Blink: on 3 cycles, off 3 cycles.',
  testCycles: 12,
  tolerance: 0,

  sources: {},
  expected: {
    light: (cycle) => (Math.floor((cycle - 1) / 3) % 2 === 0) ? 100 : 0,
  },

  playerMCU: { id: 'mcu0', simplePins: ['p0'] },
  wiring: [{ from: { mcuId: 'mcu0', pin: 'p0' }, to: 'light' }],
  circuit: {
    inputs: [],
    outputs: [{ id: 'light', name: 'LIGHT', pin: 'p0' }],
  },

  allowedOps: ['mov', 'slp', 'jmp'],
  allowedArgs: ['0', '100', 'p0', 'loop'],
  maxSlots: 7,

  prefill: [
    { label: 'loop', op: 'mov', args: ['100', 'p0'], locked: [true, true], opLocked: true },
    { op: 'slp', args: [null], locked: [false], opLocked: true },  // Player picks the number
    { op: 'mov', args: ['0', 'p0'], locked: [true, true], opLocked: true },
    { op: 'slp', args: [null], locked: [false], opLocked: true },  // Player picks the number
    { op: 'jmp', args: ['loop'], locked: [true], opLocked: true },
  ],

  guide: [
    {
      text: 'The pattern is built. <strong>slp</strong> pauses the MCU. Choose how long to pause so the light stays on for 3 cycles.',
      target: '.slot-row:nth-child(2) .slot-arg',
      position: 'below',
    },
  ],
};

// ---------------------------------------------------------------------------
// T5: Filter — learn tgt and conditional +/-
// Pre-filled: mov sensor acc / tgt [?] / + mov acc p0 / - mov 0 p0
// Player discovers tgt and sees how +/- conditional lines work.
// ---------------------------------------------------------------------------

export const trainingT5 = {
  id: 'T5',
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
