/**
 * Board — shared state between MCUs.
 *
 * The board owns the "external" simple pins: source sensors and sink outputs
 * that belong to the level itself, not to any individual MCU.
 *
 * MCU-owned pins (declared in createMCU) are stored on the MCU and accessed
 * via the board interface when another MCU needs to read them.
 */

/**
 * Create a board instance for a simulation run.
 *
 * @param {object} opts
 * @param {object}   [opts.externalPins]   - Initial values for level pins: { pinId: value }
 * @param {function} [opts.onPinWrite]     - Called when any pin is written: (pinId, value)
 * @returns {Board}
 */
export function createBoard({ externalPins = {}, onPinWrite } = {}) {
  // All simple pin values, keyed by pin ID string
  const pins = { ...externalPins };
  // Registry of which MCU owns which pin
  const pinOwners = {};

  return {
    /**
     * Register an MCU as the owner of its pins so other MCUs can find them.
     */
    registerMCU(mcu) {
      for (const pin of Object.keys(mcu.simplePins)) {
        pinOwners[pin] = mcu;
      }
    },

    /**
     * Read any simple pin — checks MCU-owned pins first, then external pins.
     */
    readSimplePin(pinId) {
      if (pinOwners[pinId]) return pinOwners[pinId].simplePins[pinId];
      return pins[pinId] ?? 0;
    },

    /**
     * Write an external (level-owned) simple pin.
     */
    writeSimplePin(pinId, value) {
      pins[pinId] = value;
      onPinWrite?.(pinId, value);
    },

    /**
     * Called by an MCU when it writes one of its own pins.
     * Allows the board to track the write for the verifier / rendering.
     */
    onSimplePinWrite(mcuId, pinId, value) {
      onPinWrite?.(pinId, value);
    },

    /**
     * Update an external source pin (e.g. sensor value that changes per cycle).
     */
    setSourcePin(pinId, value) {
      pins[pinId] = value;
    },

    /** Snapshot of all external pin values (for verifier). */
    get pinSnapshot() { return { ...pins }; },
  };
}
