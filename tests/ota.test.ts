import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OTA_COMMAND_CHARACTERISTIC_UUID,
  OTA_FIRMWARE_CHARACTERISTIC_UUID,
  OTA_SERVICE_UUID,
  THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID,
} from '../src/constants';
import { crc16_ccitt } from '../src/utils';
import {
  FakeBluetoothCharacteristic,
  FakeBluetoothServer,
  FakeBluetoothService,
  bytesOf,
  collectDocumentEventDetails,
} from './helpers/fake-bluetooth';

const CMD_FLASH = 0x0001;
const CMD_STOP = 0x0002;
const CMD_ACK = 0x0003;

describe('OTA firmware upload', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('writes current start, firmware sector, and stop packets through the OTA service', async () => {
    const { uploadFirmware } = await import('../src/ota');
    const progressEvents = collectDocumentEventDetails(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID);
    const commandCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (data, characteristic) => {
        const command = data[0]! | (data[1]! << 8);
        if (command === CMD_FLASH || command === CMD_STOP) {
          characteristic.emitValue(commandAckPacket(command));
        }
      },
    });
    const firmwareCharacteristic = new FakeBluetoothCharacteristic({
      writeWithoutResponse: true,
      onWriteWithoutResponse: (data, characteristic) => {
        if (data.byteLength !== 510) {
          characteristic.emitValue(firmwareAckPacket(0, 0));
        }
      },
    });
    const server = new FakeBluetoothServer(new Map([
      [
        OTA_SERVICE_UUID,
        new FakeBluetoothService(new Map([
          [OTA_COMMAND_CHARACTERISTIC_UUID, commandCharacteristic],
          [OTA_FIRMWARE_CHARACTERISTIC_UUID, firmwareCharacteristic],
        ])),
      ],
    ]));

    await uploadFirmware(server.asBluetoothServer(), new Uint8Array([1, 2, 3, 4, 5]));

    expect(commandCharacteristic.startNotificationsCount).toBe(1);
    expect(firmwareCharacteristic.startNotificationsCount).toBe(1);
    expect(commandCharacteristic.writesWithResponse.map(bytesOf)).toEqual([
      [
        0x01, 0x00,
        0x05, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0xc7, 0xd8,
      ],
      [
        0x02, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x43, 0xf0,
      ],
    ]);
    expect(firmwareCharacteristic.writesWithoutResponse[0]!.byteLength).toBe(510);
    expect(bytesOf(firmwareCharacteristic.writesWithoutResponse[1]!)).toEqual([
      0x00, 0x00, 0xff,
      0x01, 0x02, 0x03, 0x04, 0x05,
      0x08, 0x82,
    ]);
    expect(progressEvents.details).toEqual([
      { uploadedPackets: 1, totalPackets: 1, percentage: 100 },
    ]);
    expect(server.connected).toBe(false);
  });

  it('uses write-with-response compat mode when write-without-response is unavailable', async () => {
    const { uploadFirmware } = await import('../src/ota');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const commandCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (data, characteristic) => {
        const command = data[0]! | (data[1]! << 8);
        if (command === CMD_FLASH || command === CMD_STOP) {
          characteristic.emitValue(commandAckPacket(command));
        }
      },
    });
    const firmwareCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (_data, characteristic) => {
        characteristic.emitValue(firmwareAckPacket(0, 0));
      },
    });
    const server = new FakeBluetoothServer(new Map([
      [
        OTA_SERVICE_UUID,
        new FakeBluetoothService(new Map([
          [OTA_COMMAND_CHARACTERISTIC_UUID, commandCharacteristic],
          [OTA_FIRMWARE_CHARACTERISTIC_UUID, firmwareCharacteristic],
        ])),
      ],
    ]));

    await uploadFirmware(server.asBluetoothServer(), new Uint8Array([1, 2, 3]));

    expect(firmwareCharacteristic.writesWithoutResponse).toEqual([]);
    expect(firmwareCharacteristic.writesWithResponse.map(bytesOf)).toEqual([
      [0x00, 0x00, 0xff, 0x01, 0x02, 0x03, 0x31, 0x61],
    ]);
  });

  it('rejects stop requests before the OTA command characteristic is connected', async () => {
    const { stopFirmwareUpload } = await import('../src/ota');

    await expect(stopFirmwareUpload()).rejects.toThrow('OTA command characteristic is not connected');
  });
});

function commandAckPacket(acknowledgedCommand: number, response = 0): Uint8Array {
  const packet = new Uint8Array(20);
  packet[0] = CMD_ACK & 0xff;
  packet[1] = (CMD_ACK >> 8) & 0xff;
  packet[2] = acknowledgedCommand & 0xff;
  packet[3] = (acknowledgedCommand >> 8) & 0xff;
  packet[4] = response & 0xff;
  packet[5] = (response >> 8) & 0xff;

  const crc = crc16_ccitt(packet.slice(0, 18));
  packet[18] = crc & 0xff;
  packet[19] = (crc >> 8) & 0xff;

  return packet;
}

function firmwareAckPacket(sector: number, response: number): Uint8Array {
  const packet = new Uint8Array(4);
  const view = new DataView(packet.buffer);
  view.setUint16(0, sector, true);
  view.setUint16(2, response, true);

  return packet;
}
