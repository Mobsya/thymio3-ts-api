import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queueBluetoothCall } from '../src/bluetooth-queue';
import { getMTU, negotiateMTU } from '../src/mtu';
import { sendPythonScript } from '../src/python';
import {
  FakeBluetoothCharacteristic,
  createDeferred,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

describe('BLE write payload size probing', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each([500, 247, 185, 122, 23, 20])(
    'accepts %i bytes using padded memory-info writes with response',
    async (limit) => {
      const characteristic = createWriteOnlyCharacteristic(limit);
      const candidates = [500, 247, 185, 122, 23, 20];

      expect(characteristic.properties.write).toBe(true);
      expect(characteristic.properties.writeWithoutResponse).toBe(false);
      // No indication is emitted: GATT write completion alone must suffice.
      await expect(negotiateMTU(characteristic.asBluetoothCharacteristic())).resolves.toBe(limit);

      expect(characteristic.writesWithResponse.map((packet) => packet.byteLength))
        .toEqual(candidates.slice(0, candidates.indexOf(limit) + 1));
      for (const packet of characteristic.writesWithResponse) {
        expect(packet[0]).toBe(0x02);
        expect(packet.subarray(1).every((byte) => byte === 0)).toBe(true);
      }
      expect(characteristic.writeWithoutResponseAttempts).toEqual([]);
      expect(getMTU()).toBe(limit);
      expect(console.log).toHaveBeenCalledWith(
        `[Thymio 3 API] BLE write payload size accepted: ${limit} bytes`
      );
      expect(console.warn).not.toHaveBeenCalled();
    }
  );

  it('logs the original errors and replaces a previous larger size when all probes fail', async () => {
    await negotiateMTU(createWriteOnlyCharacteristic(500).asBluetoothCharacteristic());
    expect(getMTU()).toBe(500);

    const failures: { size: number, error: DOMException }[] = [];
    const characteristic = new FakeBluetoothCharacteristic({
      rejectWriteWithoutResponse: true,
      onWriteWithResponse: (packet) => {
        const error = new DOMException(`Rejected ${packet.byteLength} bytes`, 'NetworkError');
        failures.push({ size: packet.byteLength, error });
        throw error;
      },
    });

    await expect(negotiateMTU(characteristic.asBluetoothCharacteristic())).resolves.toBe(20);

    expect(failures.map(({ size }) => size)).toEqual([500, 247, 185, 122, 23, 20]);
    expect(console.debug).toHaveBeenCalledTimes(failures.length);
    failures.forEach(({ size, error }, index) => {
      const [message, loggedError] = vi.mocked(console.debug).mock.calls[index]!;
      expect(message).toContain(`${size} bytes`);
      expect(message).toContain('writeValueWithResponse');
      expect(loggedError).toBe(error);
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
    const [warning, lastError] = vi.mocked(console.warn).mock.calls[0]!;
    expect(warning).toBe('[Thymio 3 API] BLE write payload size probe failed; falling back to 20 bytes');
    expect(lastError).toBe(failures.at(-1)!.error);
    expect(characteristic.writeWithoutResponseAttempts).toEqual([]);
    expect(getMTU()).toBe(20);
  });

  it('waits for queued Bluetooth operations before probing', async () => {
    const releaseWrite = createDeferred();
    const pendingWrite = queueBluetoothCall(() => releaseWrite.promise);
    const characteristic = createWriteOnlyCharacteristic(500);
    const probe = negotiateMTU(characteristic.asBluetoothCharacteristic());

    try {
      await flushMicrotasks();
      expect(characteristic.writesWithResponse).toEqual([]);
    } finally {
      releaseWrite.resolve();
      await pendingWrite;
      await probe;
    }

    expect(characteristic.writesWithResponse).toHaveLength(1);
    expect(getMTU()).toBe(500);
  });

  it.each([185, 20])('uploads a multi-packet Python script using the accepted %i-byte size', async (limit) => {
    await negotiateMTU(createWriteOnlyCharacteristic(limit).asBluetoothCharacteristic());

    const script = `#${'x'.repeat(399)}`;
    const scriptBytes = new TextEncoder().encode(script);
    const receivedBytes: number[] = [];
    let sequence = 0;
    const pythonCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (packet, characteristic) => {
        expect(packet.byteLength).toBeLessThanOrEqual(limit);
        const view = new DataView(packet.buffer);
        expect(view.getUint16(sequence === 0 ? 7 : 0)).toBe(sequence);
        receivedBytes.push(...packet.subarray(sequence === 0 ? 9 : 2));
        sequence++;
        if (receivedBytes.length === scriptBytes.byteLength) {
          characteristic.emitValue([0x01, 0x00]);
        }
      },
    });

    await expect(sendPythonScript(pythonCharacteristic.asBluetoothCharacteristic(), script))
      .resolves.toBeUndefined();

    expect(pythonCharacteristic.writesWithResponse.length).toBeGreaterThan(1);
    expect(pythonCharacteristic.writesWithResponse[0]!.byteLength).toBe(limit);
    expect(receivedBytes).toEqual(Array.from(scriptBytes));
    expect(pythonCharacteristic.writeWithoutResponseAttempts).toEqual([]);
  });
});

function createWriteOnlyCharacteristic(limit: number): FakeBluetoothCharacteristic {
  return new FakeBluetoothCharacteristic({
    rejectWriteWithoutResponse: true,
    onWriteWithResponse: (packet) => {
      if (packet.byteLength > limit) {
        throw new DOMException(`Rejected ${packet.byteLength} bytes`, 'InvalidModificationError');
      }
    },
  });
}
