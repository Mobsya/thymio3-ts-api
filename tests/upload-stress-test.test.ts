import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestFile, runUploadStressTest, validateSettings, type Report, type Settings } from '../tools/upload-stress-runner';
import { createDeferred, FakeBluetoothCharacteristic } from './helpers/fake-bluetooth';
import { THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID } from '../src/constants';
import { uploadFile } from '../src/files';

const settings: Settings = {
  count: 3, sizes: [20, 500], seed: 17, delayMs: 0, timeoutMs: 1000,
  freeMemory: false, stopOnFailure: true,
};

function fakeRobot() {
  return {
    isConnected: vi.fn(() => true),
    getAPIVersion: () => 'test-api',
    getDeviceName: () => 'THYMIO test',
    getFirmwareInfo: vi.fn(async () => ({ esp32_ver: 'v1.12.0', stm32_ver: '1' })),
    getMemoryInfo: vi.fn(async () => ({ ram_bytes_free: 100000, flash_bytes_free: 200000 })),
    freeMemory: vi.fn(async () => {}),
    uploadFile: vi.fn(async (file: File) => { diagnostic(file, 'complete', 'Upload complete'); }),
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
  ])('rejects invalid settings before contacting the robot: %j', (invalid) => {
    expect(() => validateSettings({ ...settings, ...invalid })).toThrow();
  });
});
