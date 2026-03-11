/**
 * XBus resolver — runs before each tick to complete any pending handshakes.
 *
 * XBus is a synchronous rendezvous protocol:
 *   - Sender blocks until a receiver is ready on the same wire
 *   - Receiver blocks until a sender is ready on the same wire
 *   - Both unblock in the same tick, after which they execute normally
 *
 * A "wire" is identified by { senderMcuId, senderPin, receiverMcuId, receiverPin }.
 * The board holds the wiring map.
 */

import { MCUState, completeXBusTransfer } from './mcu.js';

/**
 * Resolve all pending XBus handshakes across all MCUs.
 *
 * @param {object[]} mcus  - All MCU instances
 * @param {object[]} wires - XBus wire definitions: [{ from: { mcuId, pin }, to: { mcuId, pin } }]
 * @param {object}   board - Board interface (passed through to completeXBusTransfer)
 */
export function resolveXBus(mcus, wires, board) {
  const mcuById = Object.fromEntries(mcus.map(m => [m.id, m]));

  for (const wire of wires) {
    const sender   = mcuById[wire.from.mcuId];
    const receiver = mcuById[wire.to.mcuId];
    if (!sender || !receiver) continue;

    const senderReady =
      sender.state === MCUState.XBUS_SENDING &&
      sender.pendingXBus?.pin === wire.from.pin;

    const receiverReady =
      receiver.state === MCUState.XBUS_RECEIVING &&
      receiver.pendingXBus?.pin === wire.to.pin;

    if (senderReady && receiverReady) {
      const value = sender.pendingXBus.value;
      completeXBusTransfer(sender, board, value);
      completeXBusTransfer(receiver, board, value);
    }
  }
}
