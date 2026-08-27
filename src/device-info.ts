import { queueBluetoothCall } from "./bluetooth-queue";

export type FirmwareInfo = {
  esp32_ver: string,
  stm32_ver: string
};

export type MemoryInfo = {
  flash_bytes_free: number,
  ram_bytes_free: number
}

function parseJsonPayload<T>(value: DataView): T {
  const payloadOffset = 3;

  if (value.byteLength < payloadOffset) {
    throw new Error("Device info response is missing payload length");
  }

  const messageLength = value.getUint16(1, true);

  if (messageLength > value.byteLength - payloadOffset) {
    throw new Error("Device info response payload is shorter than declared length");
  }

  const data = new Uint8Array(value.buffer, value.byteOffset + payloadOffset, messageLength);

  const decoder = new TextDecoder();
  const jsonString = decoder.decode(data);
  return JSON.parse(jsonString) as T;
}

export async function getFirmwareInfo(
  deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<FirmwareInfo> {
  return new Promise<FirmwareInfo>(async (resolve, reject) => {
    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;

      if (!value) return;

      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      const id = view.getUint8(0);

      if (id !== 0x01) return;

      deviceInfoCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

      try {
        const firmwareInfo = parseJsonPayload<FirmwareInfo>(value);
        resolve(firmwareInfo);
      } catch (err) {
        reject(err);
      }
    };

    deviceInfoCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      const id = 0x01;
      const payload = new Uint8Array([id]);
      await queueBluetoothCall(() => deviceInfoCharacteristic.writeValueWithResponse(payload));
    } catch(err) {
      deviceInfoCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}

export async function getMemoryInfo(
  deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<MemoryInfo> {
  return new Promise<MemoryInfo>(async (resolve, reject) => {
    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;

      if (!value) return;

      const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
      const id = view.getUint8(0);

      if (id !== 0x02) return;

      deviceInfoCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

      try {
        const memoryInfo = parseJsonPayload<MemoryInfo>(value);
        resolve(memoryInfo);
      } catch (err) {
        reject(err);
      }
    };

    deviceInfoCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      const id = 0x02;
      const payload = new Uint8Array([id]);
      await queueBluetoothCall(() => deviceInfoCharacteristic.writeValueWithResponse(payload));
    } catch(err) {
      deviceInfoCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}
