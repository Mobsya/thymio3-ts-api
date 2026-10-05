import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CHARACTERISTIC_UUID,
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_INFO_CHARACTERISTIC_UUID,
  FILE_CHARACTERISTIC_UUID,
  MAIN_SERVICE_UUID,
  OTA_COMMAND_CHARACTERISTIC_UUID,
  OTA_FIRMWARE_CHARACTERISTIC_UUID,
  OTA_SERVICE_UUID,
  PYTHON_CHARACTERISTIC_UUID,
  SENSOR_STREAM_CHARACTERISTIC_UUID,
  STD_OUT_CHARACTERISTIC_UUID,
  THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID,
} from '../src/constants';
import { crc16_ccitt } from '../src/utils';
import publishedRelease from './fixtures/firmware-release.json';
import {
  FakeBluetoothCharacteristic,
  FakeBluetoothDevice,
  FakeBluetoothServer,
  FakeBluetoothService,
  collectDocumentEventDetails,
} from './helpers/fake-bluetooth';

const releasesUrl = 'https://api.github.com/repos/Mobsya/thymio3-firmware-esp32/releases?per_page=100';
const appUrl = 'https://github.com/Mobsya/thymio3-firmware-esp32/releases/download/v1.10.2/ESP32-2026-10-05-872e8c2-1.10.2.bin';

describe('public firmware update pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('checks the device version, downloads the app, and transfers multiple OTA sectors', async () => {
    const { thymio, server, otaCommand, otaFirmware } = await connectRobot();
    const firmware = Uint8Array.from({ length: 4113 }, (_, index) => index % 256);
    const fetchMock = vi.fn(async (url: string) => {
      if (url === releasesUrl) return { ok: true, json: async () => [publishedRelease] };
      expect(url).toBe(appUrl);
      return { ok: true, arrayBuffer: async () => firmware.buffer };
    });
    vi.stubGlobal('fetch', fetchMock);
    const progress = collectDocumentEventDetails<{ percentage: number }>(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID);

    try {
      await expect(thymio.isNewerFirmwareAvailable()).resolves.toBe(true);
      await thymio.updateFirmware();

      expect(fetchMock).toHaveBeenCalledWith(appUrl);
      const commands = otaCommand.writesWithResponse.map((bytes) => new DataView(bytes.buffer));
      expect(commands.map((view) => view.getUint16(0, true))).toEqual([1, 2]);
      expect(commands[0]!.getUint32(2, true)).toBe(firmware.length);

      // The first write probes the MTU; the rest contain the actual image.
      const packets = otaFirmware.writesWithoutResponse.slice(1);
      const reconstructed: number[] = [];
      for (const sectorIndex of [0, 1]) {
        const sectorPackets = packets.filter((bytes) => new DataView(bytes.buffer).getUint16(0, true) === sectorIndex);
        const sector = sectorPackets.flatMap((bytes) =>
          Array.from(bytes.slice(3, bytes[2] === 0xff ? -2 : undefined))
        );
        const lastPacket = sectorPackets.at(-1)!;
        expect(lastPacket[2]).toBe(0xff);
        expect(new DataView(lastPacket.buffer).getUint16(lastPacket.length - 2, true)).toBe(crc16_ccitt(new Uint8Array(sector)));
        reconstructed.push(...sector);
      }
      expect(new Uint8Array(reconstructed)).toEqual(firmware);
      expect(progress.details.map((event) => event.percentage)).toEqual([
        4096 / firmware.length * 100,
        100,
      ]);
      expect(server.connected).toBe(false);
    } finally {
      progress.stop();
    }
  });

  it.each(['metadata', 'download', 'network'] as const)(
    'leaves Bluetooth services usable after a %s failure',
    async (failure) => {
      const { thymio, server, mainCharacteristics, otaCommand } = await connectRobot();
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (failure === 'metadata') return { ok: false };
        if (url === releasesUrl) return { ok: true, json: async () => [publishedRelease] };
        if (failure === 'network') throw new TypeError('Failed to fetch');
        return { ok: false };
      }));

      await expect(thymio.updateFirmware()).rejects.toThrow();

      expect(server.connected).toBe(true);
      expect(otaCommand.writesWithResponse).toEqual([]);
      for (const characteristic of mainCharacteristics.values()) {
        expect(characteristic.stopNotificationsCount).toBe(0);
      }
      await expect(thymio.getFirmwareInfo()).resolves.toEqual({ esp32_ver: 'v1.10.1', stm32_ver: 'v2.0.0' });
      await thymio.disconnect();
    }
  );
});

async function connectRobot() {
  const mainCharacteristics = new Map([
    COMMAND_CHARACTERISTIC_UUID,
    SENSOR_STREAM_CHARACTERISTIC_UUID,
    PYTHON_CHARACTERISTIC_UUID,
    STD_OUT_CHARACTERISTIC_UUID,
    AUDIO_CHARACTERISTIC_UUID,
    FILE_CHARACTERISTIC_UUID,
    DEVICE_INFO_CHARACTERISTIC_UUID,
  ].map((uuid) => [uuid, new FakeBluetoothCharacteristic({ writeWithoutResponse: true })]));
  mainCharacteristics.get(DEVICE_INFO_CHARACTERISTIC_UUID)!.onWriteWithResponse = (data, characteristic) => {
    if (data[0] !== 1 || !characteristic.notificationsStarted) return;
    const info = new TextEncoder().encode(JSON.stringify({ esp32_ver: 'v1.10.1', stm32_ver: 'v2.0.0' }));
    const response = new Uint8Array(3 + info.length);
    response[0] = 1;
    new DataView(response.buffer).setUint16(1, info.length, true);
    response.set(info, 3);
    characteristic.emitValue(response);
  };
  const otaCommand = new FakeBluetoothCharacteristic({
    onWriteWithResponse: (data, characteristic) => {
      const response = new Uint8Array(20);
      const view = new DataView(response.buffer);
      view.setUint16(0, 3, true);
      view.setUint16(2, new DataView(data.buffer).getUint16(0, true), true);
      view.setUint16(18, crc16_ccitt(response.slice(0, 18)), true);
      characteristic.emitValue(response);
    },
  });
  const otaFirmware = new FakeBluetoothCharacteristic({
    writeWithoutResponse: true,
    onWriteWithoutResponse: (data, characteristic) => {
      if (data[2] !== 0xff) return;
      const response = new Uint8Array(4);
      response.set(data.slice(0, 2));
      characteristic.emitValue(response);
    },
  });
  const server = new FakeBluetoothServer(new Map([
    [MAIN_SERVICE_UUID, new FakeBluetoothService(mainCharacteristics)],
    [OTA_SERVICE_UUID, new FakeBluetoothService(new Map([
      [OTA_COMMAND_CHARACTERISTIC_UUID, otaCommand],
      [OTA_FIRMWARE_CHARACTERISTIC_UUID, otaFirmware],
    ]))],
  ]), false);
  const device = new FakeBluetoothDevice('THYMIO-updater-test', server);
  vi.stubGlobal('navigator', {
    bluetooth: { requestDevice: vi.fn().mockResolvedValue(device.asBluetoothDevice()) },
  });
  const thymio = await import('../src/thymio');
  await thymio.requestAndConnect();
  return { thymio, server, mainCharacteristics, otaCommand, otaFirmware };
}
