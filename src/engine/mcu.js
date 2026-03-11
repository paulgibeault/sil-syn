/**
 * MCU — Microcontroller unit.
 *
 * Each MCU runs a small assembly program. Execution is driven externally
 * by the scheduler, which calls step() once per simulation tick.
 *
 * MCU states:
 *   READY          — will execute the next instruction this tick
 *   SLEEPING       — counting down a slp timer, skips execution
 *   XBUS_SENDING   — blocked on a mov to an XBus pin, waiting for receiver
 *   XBUS_RECEIVING — blocked on a mov from an XBus pin, waiting for sender
 */

export const MCUState = Object.freeze({
  READY: 'READY',
  SLEEPING: 'SLEEPING',
  XBUS_SENDING: 'XBUS_SENDING',
  XBUS_RECEIVING: 'XBUS_RECEIVING',
});

/**
 * Parse a raw program string into an array of instruction objects.
 *
 * Each line is either:
 *   - A label:   "loop:"          → { type: 'LABEL', name: 'loop' }
 *   - A comment: "# ..."          → skipped
 *   - An opcode: "mov p0 acc"     → { type: 'MOV', args: ['p0', 'acc'] }
 *
 * @param {string} source
 * @returns {{ type: string, args: string[], label?: string }[]}
 */
export function parseProgram(source) {
  const instructions = [];
  for (const raw of source.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    if (line.endsWith(':')) {
      instructions.push({ type: 'LABEL', name: line.slice(0, -1).toLowerCase() });
      continue;
    }
    const [op, ...args] = line.split(/\s+/);
    instructions.push({ type: op.toUpperCase(), args });
  }
  return instructions;
}

/**
 * Create a new MCU instance.
 *
 * @param {object} opts
 * @param {string}   opts.id         - Unique identifier
 * @param {string}   opts.source     - Assembly source code
 * @param {string[]} opts.simplePins - Pin names for simple (analog) I/O, e.g. ['p0','p1']
 * @param {string[]} opts.xbusPins   - Pin names for XBus I/O, e.g. ['x0','x1']
 * @returns {MCU}
 */
export function createMCU({ id, source = '', simplePins = [], xbusPins = [] }) {
  return {
    id,
    source,
    program: parseProgram(source),
    registers: { acc: 0, dat: 0 },
    pc: 0,
    state: MCUState.READY,
    sleepTimer: 0,
    // Condition flag: true = '+' (passed), false = '-' (failed), null = unset
    condFlag: null,
    // Pending XBus operation when blocked: { pin, value (for send) }
    pendingXBus: null,
    // Pin values this MCU owns (written by this MCU, read by others)
    simplePins: Object.fromEntries(simplePins.map(p => [p, 0])),
    xbusPins: Object.fromEntries(xbusPins.map(p => [p, null])),
  };
}

// ---------------------------------------------------------------------------
// Operand resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a source operand to a numeric value.
 * Sources: numeric literal | 'acc' | 'dat' | simple pin name
 */
function readValue(mcu, board, operand) {
  if (operand === 'acc') return mcu.registers.acc;
  if (operand === 'dat') return mcu.registers.dat;
  const num = Number(operand);
  if (!isNaN(num)) return num;
  // Check local simple pins
  if (operand in mcu.simplePins) return mcu.simplePins[operand];
  // Check board for external simple pins
  return board.readSimplePin(operand);
}

/**
 * Write a value to a destination operand.
 * Destinations: 'acc' | 'dat' | simple pin name
 * Returns false if the destination is an XBus pin (requires blocking).
 */
function writeValue(mcu, board, dest, value) {
  if (dest === 'acc') { mcu.registers.acc = clamp(value); return true; }
  if (dest === 'dat') { mcu.registers.dat = clamp(value); return true; }
  if (dest in mcu.simplePins) { mcu.simplePins[dest] = clamp(value); board.onSimplePinWrite(mcu.id, dest, clamp(value)); return true; }
  if (dest in mcu.xbusPins) return false; // XBus — caller handles
  board.writeSimplePin(dest, clamp(value));
  return true;
}

function clamp(v) { return Math.max(-999, Math.min(999, Math.round(v))); }

// ---------------------------------------------------------------------------
// Instruction lookup table
// ---------------------------------------------------------------------------

const INSTRUCTIONS = {
  MOV(mcu, board, args, labelMap) {
    const [src, dest] = args;
    // XBus receive: source is an XBus pin
    if (src in mcu.xbusPins) {
      mcu.state = MCUState.XBUS_RECEIVING;
      mcu.pendingXBus = { pin: src, dest };
      return; // do NOT advance pc — will retry after handshake
    }
    // XBus send: destination is an XBus pin
    if (dest in mcu.xbusPins) {
      mcu.state = MCUState.XBUS_SENDING;
      mcu.pendingXBus = { pin: dest, value: readValue(mcu, board, src) };
      return; // do NOT advance pc
    }
    const value = readValue(mcu, board, src);
    writeValue(mcu, board, dest, value);
    mcu.pc++;
  },

  ADD(mcu, board, args) {
    mcu.registers.acc = clamp(mcu.registers.acc + readValue(mcu, board, args[0]));
    mcu.pc++;
  },

  SUB(mcu, board, args) {
    mcu.registers.acc = clamp(mcu.registers.acc - readValue(mcu, board, args[0]));
    mcu.pc++;
  },

  MUL(mcu, board, args) {
    mcu.registers.acc = clamp(mcu.registers.acc * readValue(mcu, board, args[0]));
    mcu.pc++;
  },

  TEQ(mcu, board, args) {
    mcu.condFlag = readValue(mcu, board, args[0]) === readValue(mcu, board, args[1]);
    mcu.pc++;
  },

  TGT(mcu, board, args) {
    mcu.condFlag = readValue(mcu, board, args[0]) > readValue(mcu, board, args[1]);
    mcu.pc++;
  },

  SLP(mcu, board, args) {
    const cycles = Math.max(0, Math.round(readValue(mcu, board, args[0])));
    // The tick on which SLP executes counts as the first sleep tick,
    // so we pre-decrement by 1. slp 1 → timer=0 → wakes next tick.
    mcu.sleepTimer = Math.max(0, cycles - 1);
    mcu.state = MCUState.SLEEPING;
    mcu.pc++;
  },

  JMP(mcu, board, args, labelMap) {
    const target = labelMap[args[0].toLowerCase()];
    if (target === undefined) throw new Error(`Unknown label: ${args[0]}`);
    mcu.pc = target;
  },

  // Conditional jump: only jumps if condFlag is true (+)
  DJT(mcu, board, args, labelMap) {
    if (mcu.condFlag === true) {
      const target = labelMap[args[0].toLowerCase()];
      if (target === undefined) throw new Error(`Unknown label: ${args[0]}`);
      mcu.pc = target;
    } else {
      mcu.pc++;
    }
  },

  // Conditional jump: only jumps if condFlag is false (-)
  DJF(mcu, board, args, labelMap) {
    if (mcu.condFlag === false) {
      const target = labelMap[args[0].toLowerCase()];
      if (target === undefined) throw new Error(`Unknown label: ${args[0]}`);
      mcu.pc = target;
    } else {
      mcu.pc++;
    }
  },

  LABEL() {
    // Labels are resolved at parse time; at runtime just skip
    // This should not be called directly — labels are in labelMap
  },
};

/**
 * Build a label → instruction-index map from a parsed program.
 * Labels point to the instruction immediately following them.
 */
export function buildLabelMap(program) {
  const map = {};
  for (let i = 0; i < program.length; i++) {
    if (program[i].type === 'LABEL') {
      map[program[i].name] = i + 1;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Step function — called by scheduler each tick
// ---------------------------------------------------------------------------

/**
 * Advance the MCU by one tick.
 *
 * @param {object} mcu   - MCU instance (mutated in place)
 * @param {object} board - Board interface for reading/writing shared pins
 * @returns {MCUState}   - State after this tick
 */
export function stepMCU(mcu, board) {
  // Sleeping: just count down
  if (mcu.state === MCUState.SLEEPING) {
    if (mcu.sleepTimer > 0) mcu.sleepTimer--;
    if (mcu.sleepTimer === 0) mcu.state = MCUState.READY;
    return mcu.state;
  }

  // Blocked on XBus: wait for scheduler's XBus resolver to unblock us
  if (mcu.state === MCUState.XBUS_SENDING || mcu.state === MCUState.XBUS_RECEIVING) {
    return mcu.state;
  }

  // READY: execute one instruction
  if (mcu.state === MCUState.READY) {
    const labelMap = buildLabelMap(mcu.program);

    // Wrap at end of program (transparent — does not consume a tick)
    if (mcu.pc >= mcu.program.length) mcu.pc = 0;

    // Skip LABEL pseudo-instructions (also transparent)
    while (mcu.pc < mcu.program.length && mcu.program[mcu.pc].type === 'LABEL') {
      mcu.pc++;
      if (mcu.pc >= mcu.program.length) mcu.pc = 0;
    }

    if (mcu.program.length === 0) return mcu.state;

    const instr = mcu.program[mcu.pc];
    const handler = INSTRUCTIONS[instr.type];
    if (!handler) throw new Error(`Unknown instruction: ${instr.type}`);
    handler(mcu, board, instr.args, labelMap);
  }

  return mcu.state;
}

/**
 * Called by the XBus resolver after a successful handshake to unblock an MCU.
 * For receivers: writes the transferred value to the destination operand.
 */
export function completeXBusTransfer(mcu, board, value) {
  if (mcu.state === MCUState.XBUS_RECEIVING) {
    writeValue(mcu, board, mcu.pendingXBus.dest, value);
  }
  mcu.pendingXBus = null;
  mcu.state = MCUState.READY;
  mcu.pc++; // advance past the blocked mov
}
