import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../demo/src/session.js';

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(fn => fn()));
function setup() {
  const events = new EventTarget();
  let connected = false;
  const api = {
    requestAndConnect: vi.fn(async () => {}), isConnected: () => connected,
    disconnect: vi.fn(async () => emit(false)), getDeviceName: () => 'THYMIO-test',
    getFirmwareInfo: vi.fn(async () => ({ esp32_ver: '1.12.0' })),
    startAllSensorStreaming: vi.fn(async () => {}), stopSensorStreaming: vi.fn(async () => {}),
    setActuatorState: vi.fn(async (_data: unknown) => {}),
    stopScriptExecution: vi.fn(async () => {}), stopAudioFile: vi.fn(async () => {}),
    sendPythonScript: vi.fn(async (_code: string) => {}), executeLoadedScript: vi.fn(async () => {}),
    stopFirmwareUpload: vi.fn(async () => {}),
  };
  const session = createSession(() => api, events);
  cleanups.push(session.start());
  function emit(value: boolean) { connected = value; events.dispatchEvent(new CustomEvent('thymio-connected', { detail: value })); }
  return { session, api, events, emit };
}
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

describe('demo session', () => {
  it('returns to disconnected when the API resolves after chooser cancellation', async () => {
    const { session, api } = setup();
    await session.connect();
    expect(api.requestAndConnect).toHaveBeenCalledOnce();
    expect(session.getSnapshot().connection).toBe('disconnected');
  });
  it('blocks hardware work while disconnected', async () => {
    const { session, api } = setup();
    session.updateActuators({ motorLeft: 500 });
    await session.stopRobot();
    const callback = vi.fn();
    await session.perform('Upload', callback);
    expect(callback).not.toHaveBeenCalled();
    expect(api.setActuatorState).not.toHaveBeenCalled();
  });
  it('starts streaming on connection and reloads metadata after reconnect', async () => {
    const { session, api, emit } = setup();
    emit(true); await Promise.resolve();
    expect(session.getSnapshot().firmware).toEqual({ esp32_ver: '1.12.0' });
    emit(false);
    expect(session.getSnapshot().connection).toBe('reconnecting');
    emit(true); await Promise.resolve();
    expect(api.startAllSensorStreaming).toHaveBeenCalledTimes(2);
    expect(api.getFirmwareInfo).toHaveBeenCalledTimes(2);
  });
  it('retains robot identity through reconnect attempts without claiming connection', async () => {
    const { session, emit, events } = setup();
    emit(true);
    expect(session.getSnapshot().lastDeviceName).toBe('THYMIO-test');
    emit(false);
    expect(session.getSnapshot()).toMatchObject({ connection: 'reconnecting', deviceName: '', lastDeviceName: 'THYMIO-test' });
    events.dispatchEvent(new CustomEvent('thymio-prompt-manual-reconnection'));
    expect(session.getSnapshot().connection).toBe('disconnected');
    emit(true);
    await session.disconnect();
    expect(session.getSnapshot()).toMatchObject({ connection: 'disconnected', deviceName: '' });
  });
  it('does not apply stale firmware metadata to a later connection', async () => {
    const { session, api, emit } = setup();
    const old = deferred<{ esp32_ver: string }>();
    api.getFirmwareInfo.mockReturnValueOnce(old.promise);
    emit(true); emit(false); emit(true); await Promise.resolve();
    old.resolve({ esp32_ver: 'old' }); await Promise.resolve();
    expect(session.getSnapshot().firmware.esp32_ver).toBe('1.12.0');
  });
  it('cancels pending movement on stop and retains LED values', async () => {
    vi.useFakeTimers();
    const { session, api, emit } = setup(); emit(true);
    session.updateActuators({ motorLeft: 600, flRGB: { r: 15, g: 3, b: 1 } });
    await session.stopRobot(); await vi.runAllTimersAsync();
    expect(api.setActuatorState).toHaveBeenCalledTimes(1);
    expect(api.setActuatorState).toHaveBeenLastCalledWith(expect.objectContaining({ motorLeft: 0, motorRight: 0, sound: 0, flRGB: { r: 15, g: 3, b: 1 } }));
    expect(api.stopScriptExecution).toHaveBeenCalledBefore(api.setActuatorState);
    expect(api.stopAudioFile).toHaveBeenCalledOnce();
  });
  it('does not start a script whose upload completes after Stop robot', async () => {
    const { session, api, emit, events } = setup(); emit(true);
    const upload = deferred(); api.sendPythonScript.mockReturnValueOnce(upload.promise);
    const run = session.runCode('print(1)');
    await session.stopRobot();
    events.dispatchEvent(new CustomEvent('thymio-python-execution-status', { detail: true }));
    upload.resolve(); await run;
    expect(api.executeLoadedScript).not.toHaveBeenCalled();
    expect(session.getSnapshot().execution).toBe('Idle');
  });
  it('attempts motors and audio after a Python stop failure and reports partial failure', async () => {
    const { session, api, emit } = setup(); emit(true);
    api.stopScriptExecution.mockRejectedValueOnce(new Error('Write failed'));
    await session.stopRobot();
    expect(api.setActuatorState).toHaveBeenCalledOnce();
    expect(api.stopAudioFile).toHaveBeenCalledOnce();
    expect(session.getSnapshot().notice).toEqual(expect.objectContaining({ error: true, text: expect.stringContaining('Stop incomplete') }));
  });
  it('never replays queued movement on reconnect', async () => {
    vi.useFakeTimers();
    const { session, api, emit } = setup(); emit(true);
    session.updateActuators({ motorRight: 700 }); emit(false); emit(true);
    await vi.runAllTimersAsync();
    expect(api.setActuatorState).not.toHaveBeenCalled();
    expect(session.getSnapshot().actuators.motorRight).toBe(0);
  });
  it('ignores completion of an operation from a previous connection', async () => {
    const { session, emit } = setup(); emit(true);
    const task = deferred(); let validAfter = true;
    const result = session.perform('Download', async (_api: unknown, valid: () => boolean) => { await task.promise; validAfter = valid(); });
    emit(false); emit(true); task.resolve();
    expect(await result).toEqual({ ok: false });
    expect(validAfter).toBe(false);
    expect(session.getSnapshot().notice).toBeNull();
  });
  it('serializes operations and blocks controls and Stop during firmware transfer', async () => {
    const { session, api, emit } = setup(); emit(true);
    const task = deferred(); const second = vi.fn();
    const update = session.perform('Firmware', () => task.promise, { firmware: true });
    await session.perform('Other upload', second);
    session.updateActuators({ motorLeft: 100 }); await session.stopRobot();
    expect(second).not.toHaveBeenCalled(); expect(api.stopScriptExecution).not.toHaveBeenCalled();
    expect(session.getSnapshot().ota).toBe(true);
    task.resolve(); await update;
    expect(session.getSnapshot().ota).toBe(false);
  });
  it('reports operation errors and releases the busy state', async () => {
    const { session, emit } = setup(); emit(true);
    await session.perform('Upload', () => Promise.reject(new Error('No memory')));
    expect(session.getSnapshot().busy).toBe('');
    expect(session.getSnapshot().notice).toEqual({ text: 'Upload: No memory', error: true });
  });
  it('preserves paused samples and clears telemetry on disconnect', async () => {
    const { session, events, emit } = setup(); emit(true); await Promise.resolve();
    events.dispatchEvent(new CustomEvent('thymio-sensor-values', { detail: { microphoneVolume: 42 } }));
    await session.streaming(false);
    events.dispatchEvent(new CustomEvent('thymio-sensor-values', { detail: { microphoneVolume: 99 } }));
    expect(session.getSnapshot().main.microphoneVolume).toBe(42);
    expect(session.getSnapshot().stream).toBe('Paused');
    emit(false);
    expect(session.getSnapshot().main).toBeNull();
    expect(session.getSnapshot().history).toEqual([]);
  });
});
