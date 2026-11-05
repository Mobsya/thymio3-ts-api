import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestFile, runUploadStressTest, validateSettings, type Report, type Settings } from '../tools/upload-stress-runner';
import { createDeferred, FakeBluetoothCharacteristic } from './helpers/fake-bluetooth';
import { THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, THYMIO_SENSOR_VALUES_EVENT_ID } from '../src/constants';
import { uploadFile } from '../src/files';
import * as sensorStream from '../src/sensor-stream';

const settings: Settings = {
  count: 3, sizes: [20, 500], seed: 17, delayMs: 0, timeoutMs: 1000,
  freeMemory: false, stopOnFailure: true, sensorStreaming: 'off',
};

function emitSensors(kind: 'main' | 'secondary' = 'main') {
  document.dispatchEvent(new CustomEvent(kind === 'main' ? THYMIO_SENSOR_VALUES_EVENT_ID : THYMIO_OTHER_SENSOR_VALUES_EVENT_ID));
}

function fakeRobot() {
  return {
    isConnected: vi.fn(() => true),
    getAPIVersion: () => 'test-api',
    getDeviceName: () => 'THYMIO test',
    getFirmwareInfo: vi.fn(async () => ({ esp32_ver: 'v1.12.0', stm32_ver: '1' })),
    getMemoryInfo: vi.fn(async () => ({ ram_bytes_free: 100000, flash_bytes_free: 200000 })),
    freeMemory: vi.fn(async () => {}),
    uploadFile: vi.fn(async (file: File) => { diagnostic(file, 'complete', 'Upload complete'); }),
    startMainSensorStreaming: vi.fn(async () => { emitSensors(); }),
    startSecondarySensorStreaming: vi.fn(async () => { emitSensors('secondary'); }),
    startAllSensorStreaming: vi.fn(async () => { emitSensors(); emitSensors('secondary'); }),
    stopSensorStreaming: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  };
}

function diagnostic(file: File, stage: string, message: string) {
  console.debug(`[File upload: ${file.name}] ${message}`, {
    fileName: file.name, fileSize: file.size, timestamp: Date.now(), elapsedMs: 1,
    uploadedPackets: 1, totalPackets: 1, uploadedBytes: file.size,
    stage, level: stage === 'failed' ? 'error' : 'info', message,
  });
}

describe('standalone upload stress runner', () => {
  beforeEach(() => vi.spyOn(console, 'debug').mockImplementation(() => {}));

  it('generates reproducible bytes from the reported seed', async () => {
    const first = createTestFile(100, 123, 1);
    const second = createTestFile(100, 123, 8);
    const bytes = Array.from(new Uint8Array(await first.arrayBuffer()));
    expect(bytes).toEqual(Array.from(new Uint8Array(await second.arrayBuffer())));
    expect(bytes).not.toEqual(Array.from(new Uint8Array(await createTestFile(100, 124, 1).arrayBuffer())));
    expect(first.name).toBe('stress-00001-100B.bin');
    expect(createTestFile(0, 123, 1).size).toBe(0);
  });

  it('cycles sizes, increments seeds, waits for every ACK, and records environment and results', async () => {
    const robot = fakeRobot();
    let inFlight = 0;
    robot.uploadFile.mockImplementation(async (file) => {
      expect(inFlight++).toBe(0);
      await Promise.resolve();
      diagnostic(file, 'preparing', 'Prepared 1 packet; CRC32 0x12345678.');
      diagnostic(file, 'complete', 'Upload complete');
      inFlight--;
    });
    const report = await runUploadStressTest(robot, { ...settings, freeMemory: true }, new AbortController().signal);
    expect(report).toMatchObject({
      outcome: 'completed', passed: 3, failed: 0, requiresReload: false,
      environment: { deviceName: 'THYMIO test', apiVersion: 'test-api' },
      firmware: { esp32_ver: 'v1.12.0' }, memoryBefore: { ram_bytes_free: 100000 },
    });
    expect(report.attempts.map(({ size, seed }) => ({ size, seed }))).toEqual([
      { size: 20, seed: 17 }, { size: 500, seed: 18 }, { size: 20, seed: 19 },
    ]);
    expect(robot.freeMemory).toHaveBeenCalledTimes(3);
    expect(report.attempts.every(({ outcome, diagnostics, uploadedPackets }) => outcome === 'passed' && diagnostics.length === 0 && uploadedPackets === 1)).toBe(true);
    expect(report.attempts[0].preparation).toContain('CRC32');
    expect(report.finishedAt).toBeDefined();
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(1);
    expect(robot.stopSensorStreaming.mock.invocationCallOrder[0]).toBeLessThan(robot.uploadFile.mock.invocationCallOrder[0]);
    expect(robot.startAllSensorStreaming).not.toHaveBeenCalled();
    expect(report.sensorStreaming).toMatchObject({ mode: 'off', confirmed: false, notifications: { main: 0, secondary: 0 } });
  });

  it.each(['main', 'secondary', 'all'] as const)('keeps %s streaming enabled across uploads and records overlapping notifications', async (mode) => {
    const robot = fakeRobot();
    robot.freeMemory.mockImplementation(async () => { emitSensors(); });
    robot.uploadFile.mockImplementation(async (file) => {
      // The only stop so far establishes the initial state; cleanup is after all uploads.
      expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(1);
      if (mode !== 'secondary') emitSensors();
      if (mode !== 'main') emitSensors('secondary');
      diagnostic(file, 'complete', 'Upload complete');
    });
    const report = await runUploadStressTest(robot, { ...settings, sensorStreaming: mode, freeMemory: true }, new AbortController().signal);
    expect(report).toMatchObject({ schemaVersion: 3, outcome: 'completed', passed: 3, sensorStreaming: { mode, confirmed: true } });
    expect(robot.startMainSensorStreaming).toHaveBeenCalledTimes(mode === 'main' ? 1 : 0);
    expect(robot.startSecondarySensorStreaming).toHaveBeenCalledTimes(mode === 'secondary' ? 1 : 0);
    expect(robot.startAllSensorStreaming).toHaveBeenCalledTimes(mode === 'all' ? 1 : 0);
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(2);
    expect(report.sensorStreaming.notifications).toMatchObject({
      main: mode === 'secondary' ? 3 : 7, secondary: mode === 'main' ? 0 : 4,
      firstAt: expect.any(String), lastAt: expect.any(String),
    });
    for (const attempt of report.attempts) {
      // Startup and RAM cleanup notifications are excluded from the upload counts.
      expect(attempt.sensorNotifications).toEqual({
        main: mode === 'secondary' ? 0 : 1, secondary: mode === 'main' ? 0 : 1,
        firstAt: expect.any(String), lastAt: expect.any(String),
      });
    }
    const snapshot = JSON.stringify(report);
    emitSensors();
    emitSensors('secondary');
    expect(JSON.stringify(report)).toBe(snapshot);
  });

  it('waits for both selected streams before uploading, even when notifications start after the command resolves', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    robot.startAllSensorStreaming.mockImplementation(async () => {});
    const run = runUploadStressTest(robot, { ...settings, count: 1, sensorStreaming: 'all' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    emitSensors();
    await vi.advanceTimersByTimeAsync(500);
    expect(robot.uploadFile).not.toHaveBeenCalled();
    emitSensors('secondary');
    const report = await run;
    expect(report).toMatchObject({ outcome: 'completed', sensorStreaming: { confirmed: true } });
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails setup if either requested stream is absent and stops streaming without requiring a reload', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    robot.startAllSensorStreaming.mockImplementation(async () => { emitSensors(); });
    const run = runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', attempts: [], requiresReload: false, sensorStreaming: { confirmed: false } });
    expect(report.reason).toContain('main: 1, secondary: 0');
    expect(robot.uploadFile).not.toHaveBeenCalled();
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(2);
    expect(robot.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors Stop while waiting for sensor data and removes the readiness listeners', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    robot.startAllSensorStreaming.mockImplementation(async () => {});
    const controller = new AbortController();
    const run = runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const report = await run;
    expect(report).toMatchObject({ outcome: 'stopped', attempts: [] });
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(2);
    emitSensors();
    emitSensors('secondary');
    expect(report.sensorStreaming.notifications).toEqual({ main: 0, secondary: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not resume or send stream cleanup commands after a disconnect and reconnection during startup', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    robot.startAllSensorStreaming.mockImplementation(async () => {});
    const run = runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new CustomEvent('thymio-connected', { detail: false }));
    document.dispatchEvent(new CustomEvent('thymio-connected', { detail: true }));
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', attempts: [] });
    expect(report.reason).toContain('disconnected');
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a rejected streaming command before any uploads and attempts stream cleanup', async () => {
    const robot = fakeRobot();
    robot.startAllSensorStreaming.mockRejectedValue(new Error('Stream start failed'));
    const report = await runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    expect(report).toMatchObject({ outcome: 'failed', reason: 'Error: Stream start failed', attempts: [] });
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(2);
  });

  it('never queues cleanup behind a stuck streaming start', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const pending = createDeferred();
    robot.startAllSensorStreaming.mockImplementation(() => pending.promise);
    const run = runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', requiresReload: true, attempts: [] });
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(1);
    expect(robot.disconnect).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(robot.uploadFile).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops streaming after an upload rejection and preserves that error if stream cleanup also fails', async () => {
    const robot = fakeRobot();
    robot.uploadFile.mockRejectedValueOnce('File upload: Wrong sequence');
    robot.stopSensorStreaming.mockResolvedValueOnce().mockRejectedValueOnce(new Error('Stream stop failed'));
    const report = await runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    expect(report).toMatchObject({
      outcome: 'failed', failed: 1, reason: 'File upload: Wrong sequence',
      sensorStreaming: { cleanupError: 'Error: Stream stop failed' },
    });
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(2);
  });

  it('reports a stream cleanup timeout after successful uploads and requires a reload', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    robot.stopSensorStreaming.mockResolvedValueOnce().mockImplementationOnce(() => new Promise(() => {}));
    const run = runUploadStressTest(robot, { ...settings, count: 1, sensorStreaming: 'all' }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', passed: 1, failed: 0, requiresReload: true });
    expect(report.sensorStreaming.cleanupError).toContain('Stopping sensor streaming after the run');
    expect(robot.disconnect).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out a stalled upload while sensors keep streaming, without queueing stream cleanup behind it', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const pending = createDeferred();
    robot.uploadFile.mockImplementation(() => pending.promise);
    const run = runUploadStressTest(robot, { ...settings, sensorStreaming: 'all' }, new AbortController().signal);
    const notifications = setInterval(() => { emitSensors(); emitSensors('secondary'); }, 100);
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    clearInterval(notifications);
    expect(report).toMatchObject({ outcome: 'failed', requiresReload: true, failed: 1 });
    expect(report.reason).toContain('made no packet progress');
    expect(report.attempts[0].sensorNotifications.main).toBeGreaterThan(0);
    expect(report.attempts[0].sensorNotifications.secondary).toBeGreaterThan(0);
    expect(robot.stopSensorStreaming).toHaveBeenCalledTimes(1);
    expect(robot.disconnect).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0x00, 0x03])('handles real upload packets with interleaved parsed sensor notifications and ACK code %i', async (ackCode) => {
    const robot = fakeRobot();
    let mode = 0;
    let remaining = 0;
    const streamCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (packet, target) => {
        mode = packet[1];
        if (mode === 3) {
          target.emitValue([0x01, ...new Uint8Array(38)]);
          target.emitValue([0x02, ...new Uint8Array(30)]);
        }
      },
    });
    streamCharacteristic.addEventListener('characteristicvaluechanged', sensorStream.handleStreamResponse);
    const fileCharacteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: async (packet, target) => {
        expect(mode).toBe(3);
        const first = remaining === 0;
        if (first) remaining = new DataView(packet.buffer).getUint32(1);
        remaining -= packet.byteLength - (first ? 11 : 2);
        streamCharacteristic.emitValue([0x01, ...new Uint8Array(38)]);
        await Promise.resolve();
        streamCharacteristic.emitValue([0x02, ...new Uint8Array(30)]);
        if (remaining === 0) target.emitValue([0x01, ackCode]);
      },
    });
    robot.startAllSensorStreaming.mockImplementation(() => sensorStream.startAllSensorStreaming(streamCharacteristic.asBluetoothCharacteristic()));
    robot.stopSensorStreaming.mockImplementation(() => sensorStream.stopSensorStreaming(streamCharacteristic.asBluetoothCharacteristic()));
    robot.uploadFile.mockImplementation((file) => uploadFile(fileCharacteristic.asBluetoothCharacteristic(), file));
    const report = await runUploadStressTest(robot, {
      ...settings, count: 1, sizes: [4096], sensorStreaming: 'all',
    }, new AbortController().signal);
    expect(report).toMatchObject({
      outcome: ackCode === 0 ? 'completed' : 'failed', passed: ackCode === 0 ? 1 : 0, failed: ackCode === 0 ? 0 : 1,
      sensorStreaming: { confirmed: true, notifications: { main: 10, secondary: 10 } },
    });
    expect(report.attempts[0].sensorNotifications).toMatchObject({ main: 9, secondary: 9 });
    expect(fileCharacteristic.writesWithResponse).toHaveLength(9);
    expect(streamCharacteristic.writesWithResponse.map((packet) => [...packet])).toEqual([[1, 0], [1, 3], [1, 0]]);
    if (ackCode === 0x03) expect(report.attempts[0].error).toContain('Wrong sequence');
    expect(mode).toBe(0);
  });

  it('stops at a rejection and retains bounded diagnostics plus the preparation summary', async () => {
    const robot = fakeRobot();
    const originalDebug = console.debug;
    robot.uploadFile.mockImplementation(async (file) => {
      diagnostic(file, 'preparing', 'Prepared 150 packets; CRC32 0x12345678.');
      for (let index = 0; index < 150; index++) diagnostic(file, 'sending', `Packet ${index}`);
      diagnostic(file, 'failed', 'Robot response 0x03: Wrong sequence');
      throw 'File upload: Wrong sequence';
    });
    const report = await runUploadStressTest(robot, settings, new AbortController().signal);
    expect(report).toMatchObject({ outcome: 'failed', passed: 0, failed: 1 });
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(report.attempts[0].diagnostics).toHaveLength(100);
    expect(report.attempts[0].omittedDiagnostics).toBe(52);
    expect(report.attempts[0].preparation).toContain('Prepared 150');
    expect(report.attempts[0].diagnostics.at(-1)?.message).toContain('Wrong sequence');
    expect(console.debug).toBe(originalDebug);
    expect(originalDebug).toHaveBeenCalledTimes(152);
  });

  it('continues after explicit robot rejections when requested, and reports overall failures', async () => {
    const robot = fakeRobot();
    robot.uploadFile.mockRejectedValueOnce('File upload: CRC Mismatch');
    const report = await runUploadStressTest(robot, { ...settings, stopOnFailure: false }, new AbortController().signal);
    expect(report).toMatchObject({ outcome: 'completed', passed: 2, failed: 1 });
    expect(report.reason).toContain('with upload failures');
  });

  it('never continues after an unconfirmed upload even when continue-on-failure is enabled', async () => {
    const robot = fakeRobot();
    robot.uploadFile.mockRejectedValueOnce(new Error('No acknowledgement from the robot within 15 seconds'));
    const report = await runUploadStressTest(robot, { ...settings, stopOnFailure: false }, new AbortController().signal);
    expect(report.outcome).toBe('failed');
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('finishes the current upload before honoring Stop', async () => {
    const robot = fakeRobot();
    const controller = new AbortController();
    robot.uploadFile.mockImplementation(async () => { controller.abort(); });
    const report = await runUploadStressTest(robot, settings, controller.signal);
    expect(report).toMatchObject({ outcome: 'stopped', passed: 1, failed: 0 });
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
  });

  it('interrupts the inter-upload delay when Stop is requested', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const controller = new AbortController();
    const run = runUploadStressTest(robot, { ...settings, delayMs: 60000 }, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    const report = await run;
    expect(report).toMatchObject({ outcome: 'stopped', passed: 1 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a stuck write without starting another upload, then requires a reload', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const pending = createDeferred();
    const originalDebug = console.debug;
    robot.uploadFile.mockImplementation(() => pending.promise);
    const run = runUploadStressTest(robot, { ...settings, stopOnFailure: false }, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', passed: 0, failed: 1, requiresReload: true });
    expect(report.reason).toContain('made no packet progress for 1 seconds');
    expect(report.events.at(-1)?.message).toContain('Tester requested a disconnect');
    expect(robot.disconnect).toHaveBeenCalledTimes(1);
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(console.debug).toBe(originalDebug);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(10000);
    expect(report.passed).toBe(0);
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a 64 KiB upload taking over 30 seconds while real API packets keep progressing', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    let receivedBytes = 0;
    const characteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: async (packet, target) => {
        const firstPacket = receivedBytes === 0;
        if (firstPacket) expect(new DataView(packet.buffer).getUint32(1)).toBe(65536);
        receivedBytes += packet.byteLength - (firstPacket ? 11 : 2);
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (receivedBytes === 65536) target.emitValue([0x01, 0x00]);
      },
    });
    robot.uploadFile.mockImplementation((file) => uploadFile(characteristic.asBluetoothCharacteristic(), file));
    let latest: Report | undefined;
    const run = runUploadStressTest(
      robot, { ...settings, count: 1, sizes: [65536], timeoutMs: 30000 },
      new AbortController().signal, (report) => { latest = report; },
    );

    await vi.advanceTimersByTimeAsync(30000);
    expect(latest?.outcome).toBe('running');
    expect(latest?.attempts[0].uploadedPackets).toBe(120);
    expect(robot.disconnect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'completed', passed: 1, failed: 0, uploadTimeoutMode: 'inactivity' });
    expect(report.attempts[0]).toMatchObject({ uploadedPackets: 132, uploadedBytes: 65536, outcome: 'passed' });
    expect(characteristic.writesWithResponse).toHaveLength(132);
    expect(robot.disconnect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('times out after progress stops, even when duplicate progress and debug messages keep arriving', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const pending = createDeferred();
    robot.uploadFile.mockImplementation(() => pending.promise);
    let latest: Report | undefined;
    const run = runUploadStressTest(robot, settings, new AbortController().signal, (report) => { latest = report; });
    const progress = () => document.dispatchEvent(new CustomEvent(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, {
      detail: { uploadedPackets: 1, totalPackets: 2, percentage: 50 },
    }));

    await vi.advanceTimersByTimeAsync(500);
    progress();
    await vi.advanceTimersByTimeAsync(500);
    expect(latest?.outcome).toBe('running');
    progress();
    diagnostic(robot.uploadFile.mock.calls[0][0], 'sending', 'Waiting for Bluetooth write response.');
    await vi.advanceTimersByTimeAsync(499);
    expect(latest?.outcome).toBe('running');
    await vi.advanceTimersByTimeAsync(1);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', failed: 1, requiresReload: true });
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(robot.disconnect).toHaveBeenCalledTimes(1);
    progress();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not resume after a disconnect followed by automatic reconnection', async () => {
    const robot = fakeRobot();
    robot.uploadFile.mockImplementation(async () => {
      document.dispatchEvent(new CustomEvent('thymio-connected', { detail: false }));
      document.dispatchEvent(new CustomEvent('thymio-connected', { detail: true }));
      throw new Error('Bluetooth disconnected');
    });
    const report = await runUploadStressTest(robot, { ...settings, stopOnFailure: false }, new AbortController().signal);
    expect(report.outcome).toBe('failed');
    expect(robot.uploadFile).toHaveBeenCalledTimes(1);
    expect(report.events.some(({ message }) => message.includes('disconnected'))).toBe(true);
  });

  it('reports setup timeouts with no attempted uploads and restores console capture', async () => {
    vi.useFakeTimers();
    const robot = fakeRobot();
    const originalDebug = console.debug;
    robot.getFirmwareInfo.mockImplementation(() => new Promise(() => {}));
    const updates: Report[] = [];
    const run = runUploadStressTest(robot, settings, new AbortController().signal, (report) => updates.push(report));
    await vi.advanceTimersByTimeAsync(1000);
    const report = await run;
    expect(report).toMatchObject({ outcome: 'failed', failed: 0, attempts: [], requiresReload: true });
    expect(report.reason).toContain('Reading firmware');
    expect(robot.uploadFile).not.toHaveBeenCalled();
    expect(updates.length).toBeGreaterThan(1);
    expect(console.debug).toBe(originalDebug);
  });

  it('reports RAM cleanup failures separately from upload failures', async () => {
    const robot = fakeRobot();
    robot.freeMemory.mockRejectedValue(new Error('Cleanup failed'));
    const report = await runUploadStressTest(robot, { ...settings, freeMemory: true }, new AbortController().signal);
    expect(report.attempts[0]).toMatchObject({ phase: 'cleanup', outcome: 'failed' });
    expect(robot.uploadFile).not.toHaveBeenCalled();
  });

  it.each([
    { count: 0 }, { count: 1.5 }, { seed: 0 }, { sizes: [] }, { sizes: [NaN] },
    { sizes: [-1] }, { sizes: [1048577] }, { delayMs: -1 }, { timeoutMs: Infinity },
    { sensorStreaming: 'unknown' as Settings['sensorStreaming'] },
  ])('rejects invalid settings before contacting the robot: %j', (invalid) => {
    expect(() => validateSettings({ ...settings, ...invalid })).toThrow();
  });
});
