import { DEFAULT_MTU } from "./constants";

const MINIMUM_BLE_WRITE_SIZE = 20;
const MTU_CANDIDATES = [510, 247, 185, 122, 23];
const PROBE_COMMAND_ID = 0x00;

let negotiatedMTU = DEFAULT_MTU;

export function getMTU(): number {
  return negotiatedMTU;
}

export async function negotiateMTU(
  characteristic: BluetoothRemoteGATTCharacteristic
): Promise<number> {
  for (const size of MTU_CANDIDATES) {
    try {
      const probePayload = new Uint8Array(size);
      probePayload[0] = PROBE_COMMAND_ID;
      await characteristic.writeValueWithoutResponse(probePayload);
      negotiatedMTU = size;
      console.log(`[Thymio 3 API] BLE MTU negotiated to ${negotiatedMTU} bytes`);
      return negotiatedMTU;
    } catch {
      // Try the next candidate until the BLE stack accepts the write size.
    }
  }

  negotiatedMTU = MINIMUM_BLE_WRITE_SIZE;
  console.warn(
    `[Thymio 3 API] BLE MTU negotiation failed; falling back to ${negotiatedMTU} bytes`
  );
  return negotiatedMTU;
}
