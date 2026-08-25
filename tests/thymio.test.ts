import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CHARACTERISTIC_UUID,
  COMMAND_CHARACTERISTIC_UUID,
  DEVICE_INFO_CHARACTERISTIC_UUID,
  FILE_CHARACTERISTIC_UUID,
  MAIN_SERVICE_UUID,
  OTA_SERVICE_UUID,
  PYTHON_CHARACTERISTIC_UUID,
  SENSOR_STREAM_CHARACTERISTIC_UUID,
  STD_OUT_CHARACTERISTIC_UUID,
  THYMIO_CONNECTED_EVENT_ID,
} from '../src/constants';
import {
  FakeBluetoothCharacteristic,
  FakeBluetoothDevice,
  FakeBluetoothServer,
  FakeBluetoothService,
  collectDocumentEventDetails,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

describe('top-level Thymio connection API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('requests a Thymio device, connects characteristics, and dispatches connection events', async () => {
    const characteristics = createMainCharacteristics();
    const server = new FakeBluetoothServer(new Map([
      [
        MAIN_SERVICE_UUID,
        new FakeBluetoothService(new Map([
          [COMMAND_CHARACTERISTIC_UUID, characteristics.command],
          [SENSOR_STREAM_CHARACTERISTIC_UUID, characteristics.sensorStream],
          [PYTHON_CHARACTERISTIC_UUID, characteristics.python],
          [STD_OUT_CHARACTERISTIC_UUID, characteristics.stdOut],
          [AUDIO_CHARACTERISTIC_UUID, characteristics.audio],
          [FILE_CHARACTERISTIC_UUID, characteristics.file],
          [DEVICE_INFO_CHARACTERISTIC_UUID, characteristics.deviceInfo],
        ])),
      ],
    ]), false);
    const device = new FakeBluetoothDevice('THYMIO-test', server);
    const requestDevice = vi.fn().mockResolvedValue(device.asBluetoothDevice());
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
    const connectedEvents = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const thymio = await import('../src/thymio');

    await thymio.requestAndConnect();
    await flushMicrotasks();

    expect(requestDevice).toHaveBeenCalledWith({
      filters: [
        { services: [MAIN_SERVICE_UUID, OTA_SERVICE_UUID] },
      ],
    });
    expect(thymio.isConnected()).toBe(true);
    expect(thymio.getDeviceName()).toBe('THYMIO-test');
    expect(connectedEvents.details).toEqual([true, true]);
    expect(characteristics.sensorStream.startNotificationsCount).toBe(1);
    expect(characteristics.python.startNotificationsCount).toBe(1);
    expect(characteristics.stdOut.startNotificationsCount).toBe(1);
    expect(characteristics.audio.startNotificationsCount).toBe(1);
    expect(characteristics.file.startNotificationsCount).toBe(1);
    expect(characteristics.deviceInfo.startNotificationsCount).toBe(1);
    expect(characteristics.deviceInfo.writesWithoutResponse[0]!.byteLength).toBe(510);

    await thymio.disconnect();

    expect(thymio.isConnected()).toBe(false);
    expect(connectedEvents.details.at(-1)).toBe(false);
  });

  it('dispatches a failed connection event when the selected device name is not Thymio', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const requestDevice = vi.fn().mockResolvedValue(
      new FakeBluetoothDevice('OTHER-device').asBluetoothDevice()
    );
    vi.stubGlobal('navigator', { bluetooth: { requestDevice } });
    const connectedEvents = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const thymio = await import('../src/thymio');

    await thymio.requestAndConnect();

    expect(connectedEvents.details).toEqual([false]);
    expect(thymio.isConnected()).toBe(false);
  });
});

function createMainCharacteristics(): {
  command: FakeBluetoothCharacteristic,
  sensorStream: FakeBluetoothCharacteristic,
  python: FakeBluetoothCharacteristic,
  stdOut: FakeBluetoothCharacteristic,
  audio: FakeBluetoothCharacteristic,
  file: FakeBluetoothCharacteristic,
  deviceInfo: FakeBluetoothCharacteristic
} {
  return {
    command: new FakeBluetoothCharacteristic(),
    sensorStream: new FakeBluetoothCharacteristic(),
    python: new FakeBluetoothCharacteristic(),
    stdOut: new FakeBluetoothCharacteristic(),
    audio: new FakeBluetoothCharacteristic(),
    file: new FakeBluetoothCharacteristic(),
    deviceInfo: new FakeBluetoothCharacteristic({
      writeWithoutResponse: true,
      maxWriteWithoutResponseBytes: 510,
    }),
  };
}
