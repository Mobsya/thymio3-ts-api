import { describe, expect, it, vi } from 'vitest';
import { cancelDeviceInfoRequests, getFirmwareInfo, getMemoryInfo } from '../src/device-info';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  flushMicrotasks,
  createDeferred,
} from './helpers/fake-bluetooth';

describe('device info characteristic', () => {
  it('waits for the write and reply before starting the next request', async () => {
    const write = createDeferred();
    const characteristic = new FakeBluetoothCharacteristic({ onWriteWithResponse: () => write.promise });
    const first = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    const second = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    characteristic.emitValue(jsonInfoPacket(1, { esp32_ver: '1.10.3' }));
    await flushMicrotasks();
    expect(characteristic.writesWithResponse).toHaveLength(1);
    write.resolve();
    await first;
    await flushMicrotasks();
    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[1], [2]]);
    characteristic.emitValue(jsonInfoPacket(2, { ram_bytes_free: 123 }));
    await expect(second).resolves.toEqual({ ram_bytes_free: 123 });
  });

  it('does not overlap commands while the firmware is still preparing a reply', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const first = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    const second = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();
    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[1]]);
    characteristic.emitValue(jsonInfoPacket(1, { esp32_ver: '1.10.3' }));
    await first;
    await flushMicrotasks();
    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[1], [2]]);
    characteristic.emitValue(jsonInfoPacket(2, { ram_bytes_free: 123 }));
    await expect(second).resolves.toEqual({ ram_bytes_free: 123 });
  });

  it('keeps the queue locked until a native write completes even if its reply is malformed', async () => {
    const write = createDeferred();
    const characteristic = new FakeBluetoothCharacteristic({ onWriteWithResponse: () => write.promise });
    const first = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    const rejected = expect(first).rejects.toThrow('Incomplete');
    const second = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();
    characteristic.emitValue([1, 0, 5, 123]);
    await flushMicrotasks();
    expect(characteristic.writesWithResponse).toHaveLength(1);
    write.resolve();
    await rejected;
    await flushMicrotasks();
    characteristic.emitValue(jsonInfoPacket(2, { ram_bytes_free: 123 }));
    await expect(second).resolves.toEqual({ ram_bytes_free: 123 });
  });

  it.each(['timeout', 'disconnect'] as const)('cleans up an unanswered request on %s and permits later reads', async (reason) => {
    vi.useFakeTimers();
    const characteristic = new FakeBluetoothCharacteristic();
    const remove = vi.spyOn(characteristic, 'removeEventListener');
    const request = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    const rejected = expect(request).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'disconnected');
    await flushMicrotasks();
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(3000);
    else cancelDeviceInfoRequests(characteristic.asBluetoothCharacteristic());
    await rejected;
    expect(remove).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function));
    const next = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();
    characteristic.emitValue(jsonInfoPacket(1, { esp32_ver: '1.10.3' }));
    await expect(next).resolves.toEqual({ esp32_ver: '1.10.3' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('parses the declared JSON length inside a DataView with an offset', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const request = getMemoryInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();
    const packet = jsonInfoPacket(2, { ram_bytes_free: 123 });
    const buffer = new Uint8Array(packet.length + 10).fill(255);
    buffer.set(packet, 5);
    characteristic.value = new DataView(buffer.buffer, 5, packet.length + 2);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    await expect(request).resolves.toEqual({ ram_bytes_free: 123 });
  });

  it.each([[1], [1, 0, 5, 123], [1, 0, 1, 255]].map(packet => [packet]))('rejects malformed replies without an uncaught parser error (%j)', async (packet) => {
    const characteristic = new FakeBluetoothCharacteristic();
    const request = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    const rejected = expect(request).rejects.toThrow();
    await flushMicrotasks();
    characteristic.emitValue(packet);
    await rejected;
  });

  it('requests and parses firmware info JSON indications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const firmwareInfo = { esp32_ver: 'v1.8.1', stm32_ver: 'v2.0.0' };

    const request = getFirmwareInfo(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[0x01]]);
    characteristic.emitValue(jsonInfoPacket(0x01, firmwareInfo));

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
});

function jsonInfoPacket(id: number, value: unknown): Uint8Array {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const packet = new Uint8Array(3 + data.byteLength);
  const view = new DataView(packet.buffer);

  view.setUint8(0, id);
  view.setUint16(1, data.byteLength);
  packet.set(data, 3);

  return packet;
}
