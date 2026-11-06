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
  THYMIO_SENSOR_VALUES_EVENT_ID,
  THYMIO_OTHER_SENSOR_VALUES_EVENT_ID,
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
    expect(connectedEvents.details).toEqual([true]);
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

  it.each(['manual', 'automatic'] as const)('resets streaming and listeners before %s reconnection finishes', async (mode) => {
    vi.useFakeTimers();
    const { thymio, characteristics, server, device } = await connectUploadRobot();
    await thymio.startAllSensorStreaming();
    const connectedEvents = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const sensorEvents = collectDocumentEventDetails(THYMIO_SENSOR_VALUES_EVENT_ID);
    const packet = new Uint8Array(39);
    packet[0] = 0x01;
    const probe = createDeferred();
    const order: string[] = [];
    let probing = false;
    const writeInfo = characteristics.deviceInfo.onWriteWithResponse;
    characteristics.deviceInfo.onWriteWithResponse = async (data, characteristic) => {
      if (data.byteLength > 1) {
        order.push('probe');
        probing = true;
        await probe.promise;
      } else {
        await writeInfo?.(data, characteristic);
      }
    };
    characteristics.sensorStream.onWriteWithResponse = data => { order.push(`stream:${data[1]}`); };
    const startNotifications = characteristics.sensorStream.startNotifications.bind(characteristics.sensorStream);
    vi.spyOn(characteristics.sensorStream, 'startNotifications').mockImplementation(() => {
      order.push('subscribe');
      return startNotifications();
    });

    if (mode === 'manual') {
      await thymio.disconnect();
    } else {
      server.disconnect();
      device.dispatchEvent(new Event('gattserverdisconnected'));
    }
    order.length = 0;
    // Old characteristic objects can still deliver buffered notifications.
    characteristics.sensorStream.emitValue(packet);
    expect(sensorEvents.details).toEqual([]);

    const reconnection = mode === 'manual' ? thymio.requestAndConnect() : undefined;
    try {
      if (mode === 'automatic') await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(probing).toBe(true));
      expect(order).toEqual(['stream:0', 'probe']);
      expect(connectedEvents.details).toEqual([false]);
      characteristics.sensorStream.emitValue(packet);
      expect(sensorEvents.details).toEqual([]);
    } finally {
      probe.resolve();
      await reconnection;
      await vi.waitFor(() => expect(connectedEvents.details).toContain(true));
    }

    expect(order).toEqual(['stream:0', 'probe', 'subscribe']);
    expect(connectedEvents.details).toEqual([false, true]);
    characteristics.sensorStream.emitValue(packet);
    expect(sensorEvents.details).toHaveLength(1);
    await thymio.disconnect();
  });

  it('releases notification subscriptions before explicitly disconnecting GATT', async () => {
    const { thymio, characteristics, server } = await connectUploadRobot();
    const notifications = [characteristics.sensorStream, characteristics.python, characteristics.stdOut,
      characteristics.audio, characteristics.file, characteristics.deviceInfo];
    const disconnect = server.disconnect.bind(server);
    vi.spyOn(server, 'disconnect').mockImplementation(() => {
      expect(notifications.every(characteristic => !characteristic.notificationsStarted)).toBe(true);
      disconnect();
    });

    await thymio.disconnect();

    expect(server.connected).toBe(false);
    for (const characteristic of notifications) expect(characteristic.stopNotificationsCount).toBe(1);
  });

  it('reconnects with working reads and streaming even if an old native memory write never finishes', async () => {
    vi.useFakeTimers();
    const { thymio, characteristics } = await connectUploadRobot();
    const oldWrite = createDeferred();
    const writeInfo = characteristics.deviceInfo.onWriteWithResponse;
    characteristics.deviceInfo.onWriteWithResponse = () => oldWrite.promise;
    const oldRead = thymio.getMemoryInfo();
    const rejectedRead = expect(oldRead).rejects.toThrow('Bluetooth disconnected');
    await flushMicrotasks();
    const oldStream = thymio.startAllSensorStreaming();
    const rejectedStream = expect(oldStream).rejects.toThrow('cancelled');
    const disconnect = thymio.disconnect();
    await vi.advanceTimersByTimeAsync(1000);
    await disconnect;
    await Promise.all([rejectedRead, rejectedStream]);

    characteristics.deviceInfo.onWriteWithResponse = (data, characteristic) => {
      if (data[0] === 2 && data.length === 1) characteristic.emitValue(jsonInfoPacket(2, { ram_bytes_free: 123, flash_bytes_free: 456 }));
      else return writeInfo?.(data, characteristic);
    };
    await thymio.requestAndConnect();
    await expect(thymio.getFirmwareInfo()).resolves.toMatchObject({ esp32_ver: 'v1.10.2' });
    await expect(thymio.getMemoryInfo()).resolves.toMatchObject({ ram_bytes_free: 123 });
    await thymio.startAllSensorStreaming();
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([[1, 0], [1, 3]]);
    oldWrite.resolve();
    await thymio.disconnect();
  });

  it('cancels a sleeping automatic reconnect when the user connects manually', async () => {
    vi.useFakeTimers();
    const { thymio, device, server } = await connectUploadRobot();
    const events = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const connect = vi.spyOn(server, 'connect');
    server.disconnect();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    await thymio.requestAndConnect();
    await vi.advanceTimersByTimeAsync(3000);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(events.details).toEqual([false, true]);
    await thymio.disconnect();
  });

  it('restores request replies and both sensor streams when native subscriptions still target old objects', async () => {
    vi.useFakeTimers();
    const { thymio, device, server, characteristics: old } = await connectUploadRobot();
    const fresh = createMainCharacteristics();
    const receivers = new Map(Object.entries(old));
    for (const [name, characteristic] of Object.entries(fresh)) {
      Object.assign(characteristic, { service: { device } });
      const start = characteristic.startNotifications.bind(characteristic);
      vi.spyOn(characteristic, 'startNotifications').mockImplementation(async () => {
        // Native "already active" success leaves the previous receiver intact.
        if (!receivers.has(name)) receivers.set(name, characteristic);
        return start();
      });
      const stop = characteristic.stopNotifications.bind(characteristic);
      vi.spyOn(characteristic, 'stopNotifications').mockImplementation(async () => {
        receivers.delete(name);
        return stop();
      });
      vi.spyOn(old[name as keyof typeof old], 'stopNotifications').mockRejectedValue(new Error('Old characteristic is invalid'));
    }
    fresh.deviceInfo.onWriteWithResponse = data => {
      if (data.length !== 1) return;
      receivers.get('deviceInfo')?.emitValue(jsonInfoPacket(data[0]!, data[0] === 1
        ? { esp32_ver: 'v1.10.3', stm32_ver: '0' }
        : { ram_bytes_free: 123, flash_bytes_free: 456 }));
    };
    fresh.sensorStream.onWriteWithResponse = data => {
      if (data[1] !== 3) return;
      const main = new Uint8Array(39);
      const secondary = new Uint8Array(31);
      main[0] = 1;
      secondary[0] = 2;
      receivers.get('sensorStream')?.emitValue(main);
      receivers.get('sensorStream')?.emitValue(secondary);
    };
    const service = new FakeBluetoothService(new Map([
      [COMMAND_CHARACTERISTIC_UUID, fresh.command],
      [SENSOR_STREAM_CHARACTERISTIC_UUID, fresh.sensorStream],
      [DEVICE_INFO_CHARACTERISTIC_UUID, fresh.deviceInfo],
      [PYTHON_CHARACTERISTIC_UUID, fresh.python],
      [STD_OUT_CHARACTERISTIC_UUID, fresh.stdOut],
      [AUDIO_CHARACTERISTIC_UUID, fresh.audio],
      [FILE_CHARACTERISTIC_UUID, fresh.file],
    ]));
    vi.spyOn(server, 'getPrimaryService').mockResolvedValue(service as unknown as BluetoothRemoteGATTService);
    const connected = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    const main = collectDocumentEventDetails(THYMIO_SENSOR_VALUES_EVENT_ID);
    const secondary = collectDocumentEventDetails(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID);

    server.disconnect();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(connected.details).toEqual([false, true]);
    await expect(thymio.getFirmwareInfo()).resolves.toMatchObject({ esp32_ver: 'v1.10.3' });
    await expect(thymio.getMemoryInfo()).resolves.toMatchObject({ ram_bytes_free: 123 });
    await thymio.startAllSensorStreaming();
    expect(main.details).toHaveLength(1);
    expect(secondary.details).toHaveLength(1);
    for (const name of ['python', 'stdOut', 'audio', 'file']) {
      expect(receivers.get(name)).toBe(fresh[name as keyof typeof fresh]);
    }
    expect(navigator.bluetooth.requestDevice).toHaveBeenCalledTimes(1);
    await thymio.disconnect();
  });

  it('keeps a silent reconnection unavailable and retries until a firmware reply arrives', async () => {
    vi.useFakeTimers();
    const { thymio, device, server, characteristics } = await connectUploadRobot();
    const writeInfo = characteristics.deviceInfo.onWriteWithResponse;
    characteristics.deviceInfo.onWriteWithResponse = undefined;
    const events = collectDocumentEventDetails<boolean>(THYMIO_CONNECTED_EVENT_ID);
    server.disconnect();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(server.connected).toBe(true);
    expect(thymio.isConnected()).toBe(false);
    expect(events.details).toEqual([false]);
    // Let the missing-reply timeout expire. No ready event may escape.
    await vi.advanceTimersByTimeAsync(3000);
    expect(events.details).toEqual([false]);
    characteristics.deviceInfo.onWriteWithResponse = writeInfo;
    await vi.advanceTimersByTimeAsync(3000);
    expect(thymio.isConnected()).toBe(true);
    expect(events.details).toEqual([false, true]);
    await thymio.disconnect();
  });

  it('disconnects even if notification cleanup hangs, without cleaning up a later connection', async () => {
    vi.useFakeTimers();
    const { thymio, characteristics, server } = await connectUploadRobot();
    const unsubscribe = createDeferred<BluetoothRemoteGATTCharacteristic>();
    vi.spyOn(characteristics.sensorStream, 'stopNotifications').mockReturnValue(unsubscribe.promise);
    const disconnect = thymio.disconnect();
    await flushMicrotasks();
    expect(server.connected).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    await disconnect;
    expect(server.connected).toBe(false);

    // The old pending native call finishes after a subsequent link is established.
    server.connected = true;
    unsubscribe.resolve(characteristics.sensorStream.asBluetoothCharacteristic());
    await flushMicrotasks();
    expect(characteristics.python.stopNotificationsCount).toBe(0);
    expect(server.connected).toBe(true);
  });
});

describe('file uploads with sensor streaming', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it.each([
    ['stopSensorStreaming', 0],
    ['startMainSensorStreaming', 1],
    ['startSecondarySensorStreaming', 2],
    ['startAllSensorStreaming', 3],
  ] as const)('uploads multiple packets without changing the mode set by %s', async (change, mode) => {
    const { thymio, characteristics } = await connectUploadRobot();
    const writes: string[] = [];
    characteristics.sensorStream.onWriteWithResponse = (data) => { writes.push(`stream:${data[1]}`); };
    characteristics.file.onWriteWithResponse = () => { writes.push('file'); };
    await thymio[change]();

    const settled = vi.fn();
    const upload = thymio.uploadFile(new File([new Uint8Array(1100)], 'demo.bin')).then(settled);
    await vi.waitFor(() => expect(characteristics.file.writesWithResponse).toHaveLength(3));
    expect(writes).toEqual([`stream:${mode}`, 'file', 'file', 'file']);
    expect(settled).not.toHaveBeenCalled();

    characteristics.file.emitValue([0x01, 0x00]);
    await upload;
    expect(settled).toHaveBeenCalledOnce();
    expect(writes).toEqual([`stream:${mode}`, 'file', 'file', 'file']);
    expect(characteristics.sensorStream.stopNotificationsCount).toBe(0);
  });

  it('allows sensor streaming changes while awaiting the upload acknowledgement', async () => {
    const { thymio, characteristics } = await connectUploadRobot();
    const upload = thymio.uploadFile(new File(['abc'], 'demo.txt'));
    await vi.waitFor(() => expect(characteristics.file.writesWithResponse).toHaveLength(1));

    await thymio.startMainSensorStreaming();
    await thymio.startSecondarySensorStreaming();
    await thymio.startAllSensorStreaming();
    await thymio.stopSensorStreaming();
    expect(characteristics.sensorStream.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x01], [0x01, 0x02], [0x01, 0x03], [0x01, 0x00],
    ]);

    characteristics.file.emitValue([0x01, 0x00]);
    await upload;
    expect(characteristics.sensorStream.writesWithResponse).toHaveLength(4);
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
  const { queueBluetoothCall } = await import('../src/bluetooth-queue');
  await queueBluetoothCall(() => {});
  // Upload tests observe streaming commands after connection setup.
  robot.characteristics.sensorStream.writesWithResponse.length = 0;
  return { thymio, ...robot };
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
  new DataView(packet.buffer).setUint16(1, data.byteLength);
  packet.set(data, 3);
  return packet;
}
