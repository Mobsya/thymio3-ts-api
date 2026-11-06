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
  bytesOf,
  collectDocumentEventDetails,
  createDeferred,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

const chromiumRequestOptions: RequestDeviceOptions = {
  filters: [{ namePrefix: 'THYMIO' }, { namePrefix: 'T3' }],
  optionalServices: [MAIN_SERVICE_UUID, OTA_SERVICE_UUID],
};

const bluefyRequestOptions: RequestDeviceOptions = {
  filters: [{ services: [MAIN_SERVICE_UUID, OTA_SERVICE_UUID] }],
};

// Representative user agents exercise option selection, not browser BLE implementations.
const discoveryBrowsers = [
  {
    browser: 'Edge on Windows',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    options: chromiumRequestOptions,
  },
  {
    browser: 'Chrome on macOS',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    options: chromiumRequestOptions,
  },
  {
    browser: 'Chromium on Linux',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    options: chromiumRequestOptions,
  },
  {
    browser: 'Chrome on Android',
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    options: chromiumRequestOptions,
  },
  {
    browser: 'Bluefy on iPhone',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Bluefy/3.3.0',
    options: bluefyRequestOptions,
  },
  {
    browser: 'Bluefy on iPad',
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Bluefy/3.3.0',
    options: bluefyRequestOptions,
  },
  {
    browser: 'Bluefy with a desktop user agent and mixed-case browser token',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 bLuEfY/3.3.0',
    options: bluefyRequestOptions,
  },
  {
    browser: 'a browser without a user-agent string',
    userAgent: undefined,
    options: chromiumRequestOptions,
  },
];

describe('top-level Thymio connection API', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it.each(discoveryBrowsers.flatMap(browser =>
    ['THYMIO-test', 'T3-test'].map(deviceName => ({ ...browser, deviceName }))
  ))('connects $deviceName in $browser and initializes characteristics and events', async ({ userAgent, options, deviceName }) => {
    const { characteristics, device } = createRobot(deviceName);
    const requestDevice = vi.fn().mockResolvedValue(device.asBluetoothDevice());
    vi.stubGlobal('navigator', {
      ...(userAgent === undefined ? {} : { userAgent }),
      bluetooth: { requestDevice },
    });
    const connectedEvents = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const thymio = await import('../src/thymio');

    const connection = thymio.requestAndConnect();
    // Open the chooser synchronously within the caller's user gesture.
    expect(requestDevice).toHaveBeenCalledWith(options);
    await connection;
    await flushMicrotasks();

    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(thymio.isConnected()).toBe(true);
    expect(thymio.getDeviceName()).toBe(deviceName);
    expect(connectedEvents.details).toEqual([true, true]);
    expect(characteristics.sensorStream.startNotificationsCount).toBe(1);
    expect(characteristics.python.startNotificationsCount).toBe(1);
    expect(characteristics.stdOut.startNotificationsCount).toBe(1);
    expect(characteristics.audio.startNotificationsCount).toBe(1);
    expect(characteristics.file.startNotificationsCount).toBe(1);
    expect(characteristics.deviceInfo.startNotificationsCount).toBe(1);
    const [probe, firmwareRequest] = characteristics.deviceInfo.writesWithResponse;
    expect(probe!.byteLength).toBe(500);
    expect(probe![0]).toBe(0x02);
    expect(probe!.subarray(1).every((byte) => byte === 0)).toBe(true);
    expect(firmwareRequest).toEqual(new Uint8Array([0x01]));
    expect(characteristics.deviceInfo.writeWithoutResponseAttempts).toEqual([]);

    // A late probe indication must not satisfy the firmware-info request.
    const removeListener = vi.spyOn(characteristics.deviceInfo, 'removeEventListener');
    characteristics.deviceInfo.emitValue(jsonInfoPacket(0x02, {
      flash_bytes_free: 1_500_000,
      ram_bytes_free: 200_000,
    }));
    expect(removeListener).not.toHaveBeenCalled();
    characteristics.deviceInfo.emitValue(jsonInfoPacket(0x01, {
      esp32_ver: 'v1.10.2',
      stm32_ver: 'v2.0.0',
    }));
    await flushMicrotasks();
    expect(removeListener).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function));
    expect(console.warn).not.toHaveBeenCalled();

    await thymio.disconnect();

    expect(thymio.isConnected()).toBe(false);
    expect(connectedEvents.details.at(-1)).toBe(false);
  });

  it.each(discoveryBrowsers)('does not reopen the chooser after cancellation in $browser', async ({ userAgent, options }) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new DOMException('User cancelled the device chooser', 'NotFoundError');
    const requestDevice = vi.fn().mockRejectedValue(error);
    vi.stubGlobal('navigator', {
      ...(userAgent === undefined ? {} : { userAgent }),
      bluetooth: { requestDevice },
    });
    const connectedEvents = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const thymio = await import('../src/thymio');

    await expect(thymio.requestAndConnect()).resolves.toBeUndefined();

    expect(requestDevice).toHaveBeenCalledTimes(1);
    expect(requestDevice).toHaveBeenCalledWith(options);
    expect(connectedEvents.details).toEqual([false]);
    expect(thymio.isConnected()).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Could not connect to the Thymio device', error);
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

describe('temporary file upload sensor streaming workaround', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it.each([
    ['startMainSensorStreaming', 1],
    ['startSecondarySensorStreaming', 2],
    ['startAllSensorStreaming', 3],
  ] as const)('restores %s only after the multi-packet upload is acknowledged', async (start, mode) => {
    const { thymio, characteristics } = await connectUploadRobot();
    const writes: string[] = [];
    characteristics.sensorStream.onWriteWithResponse = (data) => { writes.push(`stream:${data[1]}`); };
    characteristics.file.onWriteWithResponse = () => { writes.push('file'); };
    await thymio[start]();

    const upload = thymio.uploadFile(new File([new Uint8Array(1100)], 'demo.bin'));
    await vi.waitFor(() => expect(characteristics.file.writesWithResponse).toHaveLength(3));
    expect(writes).toEqual([`stream:${mode}`, 'stream:0', 'file', 'file', 'file']);

    characteristics.file.emitValue([0x01, 0x00]);
    await upload;
    expect(writes).toEqual([`stream:${mode}`, 'stream:0', 'file', 'file', 'file', `stream:${mode}`]);
    expect(characteristics.sensorStream.stopNotificationsCount).toBe(0);
  });

  it.each([false, true])('leaves streaming off when it was disabled (explicit stop: %s)', async (explicitStop) => {
    const { thymio, characteristics } = await connectUploadRobot();
    if (explicitStop) {
      await thymio.startAllSensorStreaming();
      await thymio.stopSensorStreaming();
      characteristics.sensorStream.writesWithResponse.length = 0;
    }
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;

    await thymio.uploadFile(new File(['abc'], 'demo.txt'));

    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([[0x01, 0x00]]);
  });

  it('waits for the stop write before sending file data and for restoration before resolving', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const stop = createDeferred();
    const restore = createDeferred();
    characteristics.sensorStream.onWriteWithResponse = (data) => data[1] === 0 ? stop.promise : restore.promise;
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    const settled = vi.fn();
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt')).then(settled);

    await vi.waitFor(() => expect(characteristics.sensorStream.writesWithResponse).toHaveLength(2));
    expect(characteristics.file.writesWithResponse).toHaveLength(0);
    stop.resolve();
    await vi.waitFor(() => expect(characteristics.sensorStream.writesWithResponse).toHaveLength(3));
    expect(characteristics.file.writesWithResponse).toHaveLength(1);
    expect(settled).not.toHaveBeenCalled();
    await expect(thymio.stopSensorStreaming()).rejects.toThrow('file upload is in progress');

    restore.resolve();
    await upload;
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each(['read', 'write', 'ack', 'timeout'] as const)('restores streaming after an upload %s failure', async (failure) => {
    vi.useFakeTimers();
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startSecondarySensorStreaming();
    const file = new File(['abc'], 'demo.txt');
    const error = new Error(`Failed to ${failure}`);
    if (failure === 'read') vi.spyOn(file, 'arrayBuffer').mockRejectedValue(error);
    if (failure === 'write') characteristics.file.onWriteWithResponse = () => { throw error; };
    if (failure === 'ack') {
      characteristics.file.onWriteWithResponse = (_, characteristic) => characteristic.emitValue([0x01, 0x03]);
    }

    const upload = thymio.uploadFile(file);
    const rejected = failure === 'timeout'
      ? expect(upload).rejects.toThrow('No acknowledgement from the robot within 15 seconds')
      : expect(upload).rejects.toBe(failure === 'ack' ? 'File upload: Wrong sequence' : error);
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;

    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x02], [0x01, 0x00], [0x01, 0x02],
    ]);
    await thymio.stopSensorStreaming();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('sends no file data if stopping fails and permits a subsequent upload', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const error = new Error('Stop failed');
    characteristics.sensorStream.onWriteWithResponse = () => { throw error; };
    const file = new File(['abc'], 'demo.txt');
    const read = vi.spyOn(file, 'arrayBuffer');

    await expect(thymio.uploadFile(file)).rejects.toBe(error);
    expect(read).not.toHaveBeenCalled();
    expect(characteristics.file.writesWithResponse).toHaveLength(0);

    characteristics.sensorStream.onWriteWithResponse = undefined;
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    await thymio.uploadFile(file);
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x03], [0x01, 0x00], [0x01, 0x00], [0x01, 0x03],
    ]);
  });

  it.each([0x00, 0x03])('preserves upload result 0x%s when restoring streaming fails', async (ack) => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startMainSensorStreaming();
    const error = new Error('Restore failed');
    characteristics.sensorStream.onWriteWithResponse = (data) => {
      if (data[1] === 1) throw error;
    };
    characteristics.file.onWriteWithResponse = (_, characteristic) => characteristic.emitValue([0x01, ack]);

    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));
    if (ack === 0) await expect(upload).resolves.toBeUndefined();
    else await expect(upload).rejects.toBe('File upload: Wrong sequence');
    expect(console.warn).toHaveBeenCalledWith(
      '[Thymio 3 API] Could not restore sensor streaming after file upload:', error
    );
    await thymio.startSecondarySensorStreaming();
  });

  it('immediately rejects streaming changes and overlapping uploads, then releases the guard', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startMainSensorStreaming();
    const file = new File(['abc'], 'demo.txt');
    const upload = thymio.uploadFile(file);

    for (const change of [thymio.startMainSensorStreaming, thymio.startSecondarySensorStreaming,
      thymio.startAllSensorStreaming, thymio.stopSensorStreaming]) {
      await expect(change()).rejects.toThrow('Cannot change sensor streaming while a file upload is in progress');
    }
    await expect(thymio.uploadFile(file)).rejects.toThrow('Another file upload is already in progress');
    await vi.waitFor(() => expect(characteristics.file.writesWithResponse).toHaveLength(1));
    characteristics.file.emitValue([0x01, 0x00]);
    await upload;
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x01], [0x01, 0x00], [0x01, 0x01],
    ]);

    await thymio.startSecondarySensorStreaming();
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    await thymio.uploadFile(file);
    expect(characteristics.sensorStream.writesWithResponse.at(-1)).toEqual(new Uint8Array([0x01, 0x02]));
  });

  it('drains pending sensor commands in Bluetooth priority order before pausing', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    const firstStart = createDeferred();
    characteristics.sensorStream.onWriteWithResponse = (data) => data[1] === 1 ? firstStart.promise : undefined;
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    const controls = [thymio.startMainSensorStreaming(), thymio.startSecondarySensorStreaming(),
      thymio.stopSensorStreaming(), thymio.startAllSensorStreaming()];
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));
    expect(characteristics.file.writesWithResponse).toHaveLength(0);

    firstStart.resolve();
    await Promise.all([...controls, upload]);

    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x01], [0x01, 0x00], [0x01, 0x02], [0x01, 0x03], [0x01, 0x00], [0x01, 0x03],
    ]);
  });

  it('restores the last successful mode when a pending sensor command fails', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startMainSensorStreaming();
    const failedStart = createDeferred();
    const error = new Error('Start failed');
    characteristics.sensorStream.onWriteWithResponse = (data) => data[1] === 2 ? failedStart.promise : undefined;
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    const rejected = expect(thymio.startSecondarySensorStreaming()).rejects.toBe(error);
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));

    failedStart.reject(error);
    await rejected;
    await upload;
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x01], [0x01, 0x02], [0x01, 0x00], [0x01, 0x01],
    ]);
  });

  it('skips restoration after disconnection and resets streaming state on automatic reconnection', async () => {
    vi.useFakeTimers();
    const { thymio, characteristics, server, device } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));
    const rejected = expect(upload).rejects.toThrow('Bluetooth disconnected');
    await vi.waitFor(() => expect(characteristics.file.writesWithResponse).toHaveLength(1));

    server.disconnect();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    await rejected;
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([[0x01, 0x03], [0x01, 0x00]]);

    await vi.advanceTimersByTimeAsync(3000);
    expect(thymio.isConnected()).toBe(true);
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;
    await thymio.uploadFile(new File(['abc'], 'next.txt'));
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x03], [0x01, 0x00], [0x01, 0x00],
    ]);
  });

  it('does not start file transfer if disconnected while stopping streaming', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const stop = createDeferred();
    characteristics.sensorStream.onWriteWithResponse = () => stop.promise;
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));
    const rejected = expect(upload).rejects.toThrow('Bluetooth disconnected or the connection changed');
    await vi.waitFor(() => expect(characteristics.sensorStream.writesWithResponse).toHaveLength(2));

    await thymio.disconnect();
    stop.resolve();
    await rejected;
    expect(characteristics.file.writesWithResponse).toHaveLength(0);
    expect(characteristics.sensorStream.writesWithResponse).toHaveLength(2);
  });

  it('keeps stale upload cleanup from changing a new connection or releasing its upload guard', async () => {
    const oldRobot = await connectUploadRobot();
    await oldRobot.thymio.startAllSensorStreaming();
    const read = createDeferred<ArrayBuffer>();
    const file = new File(['abc'], 'old.txt');
    const readSpy = vi.spyOn(file, 'arrayBuffer').mockReturnValue(read.promise);
    const error = new Error('Old file read failed');
    const oldUpload = oldRobot.thymio.uploadFile(file);
    const rejected = expect(oldUpload).rejects.toBe(error);
    await vi.waitFor(() => expect(readSpy).toHaveBeenCalledOnce());

    await oldRobot.thymio.disconnect();
    const newRobot = await connectUploadRobot();
    await newRobot.thymio.startSecondarySensorStreaming();
    const newFile = new File(['abc'], 'new.txt');
    const newUpload = newRobot.thymio.uploadFile(newFile);
    await vi.waitFor(() => expect(newRobot.characteristics.file.writesWithResponse).toHaveLength(1));
    read.reject(error);
    await rejected;

    await expect(newRobot.thymio.startAllSensorStreaming()).rejects.toThrow('file upload is in progress');
    await expect(newRobot.thymio.uploadFile(newFile)).rejects.toThrow('Another file upload is already in progress');
    newRobot.characteristics.file.emitValue([0x01, 0x00]);
    await newUpload;
    expect(oldRobot.characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([[0x01, 0x03], [0x01, 0x00]]);
    expect(newRobot.characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x02], [0x01, 0x00], [0x01, 0x02],
    ]);
  });

  it('keeps the tracked mode off after the existing OTA shutdown', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const ota = await import('../src/ota');
    const error = new Error('OTA failed');
    vi.spyOn(ota, 'uploadFirmware').mockRejectedValue(error);
    await expect(thymio.uploadFirmware(new Uint8Array([1]))).rejects.toBe(error);
    characteristics.file.onWriteWithResponse = acknowledgeFileUpload;

    await thymio.uploadFile(new File(['abc'], 'demo.txt'));

    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x03], [0x01, 0x00], [0x01, 0x00],
    ]);
  });
});

function createRobot(deviceName = 'THYMIO-test') {
  const characteristics = createMainCharacteristics();
  const server = new FakeBluetoothServer(new Map([
    [MAIN_SERVICE_UUID, new FakeBluetoothService(new Map([
      [COMMAND_CHARACTERISTIC_UUID, characteristics.command],
      [SENSOR_STREAM_CHARACTERISTIC_UUID, characteristics.sensorStream],
      [PYTHON_CHARACTERISTIC_UUID, characteristics.python],
      [STD_OUT_CHARACTERISTIC_UUID, characteristics.stdOut],
      [AUDIO_CHARACTERISTIC_UUID, characteristics.audio],
      [FILE_CHARACTERISTIC_UUID, characteristics.file],
      [DEVICE_INFO_CHARACTERISTIC_UUID, characteristics.deviceInfo],
    ]))],
  ]), false);
  const device = new FakeBluetoothDevice(deviceName, server);
  for (const characteristic of Object.values(characteristics)) {
    Object.assign(characteristic, { service: { device } });
  }
  return { characteristics, server, device };
}

async function connectUploadRobot() {
  const robot = createRobot();
  robot.characteristics.deviceInfo.onWriteWithResponse = (data, characteristic) => {
    if (data[0] === 0x01) characteristic.emitValue(jsonInfoPacket(0x01, { esp32_ver: 'v1.10.2', stm32_ver: 'v2.0.0' }));
  };
  vi.stubGlobal('navigator', { bluetooth: { requestDevice: vi.fn().mockResolvedValue(robot.device.asBluetoothDevice()) } });
  const thymio = await import('../src/thymio');
  await thymio.requestAndConnect();
  await flushMicrotasks();
  return { thymio, ...robot };
}

function acknowledgeFileUpload(_data: Uint8Array, characteristic: FakeBluetoothCharacteristic): void {
  characteristic.emitValue([0x01, 0x00]);
}

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
      rejectWriteWithoutResponse: true,
    }),
  };
}

function jsonInfoPacket(id: number, value: unknown): Uint8Array {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const packet = new Uint8Array(3 + data.byteLength);
  packet[0] = id;
  new DataView(packet.buffer).setUint16(1, data.byteLength, true);
  packet.set(data, 3);
  return packet;
}
