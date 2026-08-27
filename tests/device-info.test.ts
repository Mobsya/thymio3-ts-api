import { describe, expect, it } from 'vitest';
import { getFirmwareInfo, getMemoryInfo } from '../src/device-info';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

describe('device info characteristic', () => {
  it('requests and parses firmware info JSON indications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const firmwareInfo = { esp32_ver: 'v1.8.1', stm32_ver: 'v2.0.0' };

    const request = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[0x01]]);
    characteristic.emitValue(jsonInfoPacket(0x01, firmwareInfo));

    await expect(request).resolves.toEqual(firmwareInfo);
  });

  it('ignores trailing bytes after firmware info JSON indications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const firmwareInfo = { esp32_ver: 'v1.8.1', stm32_ver: 'v2.0.0' };

    const request = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    characteristic.emitValue(jsonInfoPacket(0x01, firmwareInfo, [0x00, 0xff, 0x7b]));

    await expect(request).resolves.toEqual(firmwareInfo);
  });

  it('requests and parses memory info JSON indications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const memoryInfo = { flash_bytes_free: 1_500_000, ram_bytes_free: 200_000 };

    const request = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[0x02]]);
    characteristic.emitValue(jsonInfoPacket(0x02, memoryInfo));

    await expect(request).resolves.toEqual(memoryInfo);
  });

  it('ignores trailing bytes after memory info JSON indications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const memoryInfo = { flash_bytes_free: 1_500_000, ram_bytes_free: 200_000 };

    const request = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    characteristic.emitValue(jsonInfoPacket(0x02, memoryInfo, [0x00, 0xff, 0x7b]));

    await expect(request).resolves.toEqual(memoryInfo);
  });
});

function jsonInfoPacket(id: number, value: unknown, trailingBytes: number[] = []): Uint8Array {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const packet = new Uint8Array(3 + data.byteLength + trailingBytes.length);
  const view = new DataView(packet.buffer);

  view.setUint8(0, id);
  view.setUint16(1, data.byteLength, true);
  packet.set(data, 3);
  packet.set(trailingBytes, 3 + data.byteLength);

  return packet;
}
