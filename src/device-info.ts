import { queueBluetoothCall } from "./bluetooth-queue";

export type FirmwareInfo = {
  esp32_ver: string,
  stm32_ver: string
};

export type MemoryInfo = {
  flash_bytes_free: number,
  ram_bytes_free: number
}

const RESPONSE_TIMEOUT_MS = 3000;
const pendingRequests = new WeakMap<BluetoothRemoteGATTCharacteristic, Set<() => void>>();

export function cancelDeviceInfoRequests(characteristic: BluetoothRemoteGATTCharacteristic): void {
  for (const cancel of pendingRequests.get(characteristic) ?? []) cancel();
}

export async function getFirmwareInfo(
  deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<FirmwareInfo> {
  return requestInfo<FirmwareInfo>(deviceInfoCharacteristic, 0x01);
}

export async function getMemoryInfo(
  deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<MemoryInfo> {
  return requestInfo<MemoryInfo>(deviceInfoCharacteristic, 0x02);
}

function requestInfo<T>(characteristic: BluetoothRemoteGATTCharacteristic, id: number): Promise<T> {
  // Serialize the complete request/indication exchange, not only its write.
  // Firmware and memory commands share one pending slot in the firmware; a new
  // command can overwrite it before the earlier response has been produced.
  return queueBluetoothCall(async () => {
    let fail!: (error: unknown) => void;
    const response = new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      let settled = false;
      const device = characteristic.service?.device;
      let pending = pendingRequests.get(characteristic);
      if (!pending) {
        pending = new Set();
        pendingRequests.set(characteristic, pending);
      }
      const cleanup = () => {
        clearTimeout(timer);
        characteristic.removeEventListener('characteristicvaluechanged', onResponse);
        device?.removeEventListener('gattserverdisconnected', onDisconnected);
        pending.delete(onDisconnected);
      };
      fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onDisconnected = () => fail(new Error('Bluetooth disconnected while reading device info'));
      const onResponse = (event: Event) => {
        const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (!value?.byteLength || value.getUint8(0) !== id) return;
        try {
          if (value.byteLength < 3) throw new Error('Invalid device info packet header');
          // Firmware encodes the JSON length high byte first.
          const length = value.getUint16(1);
          if (value.byteLength < 3 + length) throw new Error('Incomplete device info response');
          const data = new Uint8Array(value.buffer, value.byteOffset + 3, length);
          const info = JSON.parse(new TextDecoder().decode(data)) as T;
          settled = true;
          cleanup();
          resolve(info);
        } catch (error) {
          fail(error);
        }
      };
      pending.add(onDisconnected);
      characteristic.addEventListener('characteristicvaluechanged', onResponse);
      device?.addEventListener('gattserverdisconnected', onDisconnected);
      timer = setTimeout(() => fail(new Error('Device info response timed out')), RESPONSE_TIMEOUT_MS);
    });
    const write = Promise.resolve().then(() => {
      const device = characteristic.service?.device;
      if (device?.gatt && !device.gatt.connected) throw new Error('Bluetooth disconnected while reading device info');
      return characteristic.writeValueWithResponse(new Uint8Array([id]));
    }).catch(error => {
      fail(error);
      throw error;
    });
    // Even a malformed/late reply must not release the queue while its native
    // write is still in progress. Disconnect resets the queue if that write hangs.
    const [written, received] = await Promise.allSettled([write, response]);
    if (written.status === 'rejected') throw written.reason;
    if (received.status === 'rejected') throw received.reason;
    return received.value;
  });
}
