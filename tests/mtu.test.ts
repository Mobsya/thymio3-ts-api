import { describe, expect, it } from 'vitest';
import { getMTU, negotiateMTU } from '../src/mtu';
import { FakeBluetoothCharacteristic } from './helpers/fake-bluetooth';

describe('MTU negotiation', () => {
  it('uses the largest candidate accepted by the BLE stack', async () => {
    const characteristic = new FakeBluetoothCharacteristic({
      writeWithoutResponse: true,
      maxWriteWithoutResponseBytes: 185,
    });

    await expect(negotiateMTU(characteristic.asBluetoothCharacteristic())).resolves.toBe(185);

    expect(characteristic.writeWithoutResponseAttempts.map((packet) => packet.byteLength))
      .toEqual([510, 247, 185]);
    expect(getMTU()).toBe(185);
  });

  it('falls back to the minimum BLE write size if all probes fail', async () => {
    const characteristic = new FakeBluetoothCharacteristic({
      writeWithoutResponse: true,
      rejectWriteWithoutResponse: true,
    });

    await expect(negotiateMTU(characteristic.asBluetoothCharacteristic())).resolves.toBe(20);

    expect(characteristic.writeWithoutResponseAttempts.map((packet) => packet.byteLength))
      .toEqual([510, 247, 185, 122, 23]);
    expect(getMTU()).toBe(20);
  });
});
