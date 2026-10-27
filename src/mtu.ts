import { DEFAULT_MTU } from "./constants";
import { queueBluetoothCall } from "./bluetooth-queue";

const MINIMUM_BLE_WRITE_SIZE = 20;
// Characteristic-value payload lengths, capped at the firmware's 500-byte buffer.
const WRITE_PAYLOAD_CANDIDATES = [500, 247, 185, 122, 23, MINIMUM_BLE_WRITE_SIZE];
const MEMORY_INFO_COMMAND_ID = 0x02;

let acceptedWritePayloadSize = DEFAULT_MTU;

// Retain the existing API names, but this value is a write payload size, not ATT MTU.
export function getMTU(): number {
  return acceptedWritePayloadSize;
}

export async function negotiateMTU(
  characteristic: BluetoothRemoteGATTCharacteristic
): Promise<number> {
  let lastError: unknown;

  for (const size of WRITE_PAYLOAD_CANDIDATES) {
    try {
      // BT4 protocol p. 14 requires writes with response for Get memory info.
      // Padding is tolerated by the inspected v1.10.2-based firmware handler;
      // the protocol itself only specifies the one-byte command.
      const probePayload = new Uint8Array(size);
      probePayload[0] = MEMORY_INFO_COMMAND_ID;
      // The GATT write completion is sufficient; no memory-info indication is needed.
      await queueBluetoothCall(() => characteristic.writeValueWithResponse(probePayload));
      acceptedWritePayloadSize = size;
      console.log(`[Thymio 3 API] BLE write payload size accepted: ${acceptedWritePayloadSize} bytes`);
      return acceptedWritePayloadSize;
    } catch (error) {
      lastError = error;
      console.debug(
        `[Thymio 3 API] BLE write payload size probe of ${size} bytes using writeValueWithResponse failed:`,
        error
      );
    }
  }

  acceptedWritePayloadSize = MINIMUM_BLE_WRITE_SIZE;
  console.warn(
    `[Thymio 3 API] BLE write payload size probe failed; falling back to ${acceptedWritePayloadSize} bytes`,
    lastError
  );
  return acceptedWritePayloadSize;
}
