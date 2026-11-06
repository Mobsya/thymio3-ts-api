import {
  THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID,
  THYMIO_OTHER_SENSOR_VALUES_EVENT_ID,
  THYMIO_SENSOR_VALUES_EVENT_ID,
} from '../src/constants';
import type { UploadProgress } from '../src/utils';
import { createMemoryPoller, type MemoryPollingReport } from './upload-stress-memory';

export type SensorStreamingMode = 'off' | 'main' | 'secondary' | 'all';

export type Settings = {
  count: number;
  sizes: number[];
  seed: number;
  delayMs: number;
  timeoutMs: number;
  freeMemory: boolean;
  stopOnFailure: boolean;
  sensorStreaming: SensorStreamingMode;
  trafficStart: 'before-uploads' | 'first-packet';
  memoryPolling: boolean;
  memoryPollIntervalMs: number;
  memoryPollTimeoutMs: number;
};

type RobotAPI = {
  isConnected(): boolean;
  getAPIVersion(): string;
  getDeviceName(): string;
  getFirmwareInfo(): Promise<unknown>;
  getMemoryInfo(): Promise<unknown>;
  freeMemory(): Promise<void>;
  uploadFile(file: File): Promise<void>;
  startMainSensorStreaming(): Promise<void>;
  startSecondarySensorStreaming(): Promise<void>;
  startAllSensorStreaming(): Promise<void>;
  stopSensorStreaming(): Promise<void>;
  disconnect(): Promise<void>;
};

type SensorActivity = {
  main: number;
  secondary: number;
  firstAt?: string;
  lastAt?: string;
};

type Diagnostic = {
  timestamp: number;
  elapsedMs: number;
  level: string;
  stage: string;
  message: string;
  fileName: string;
  fileSize: number;
  uploadedPackets: number;
  totalPackets: number;
  uploadedBytes: number;
};

export type Attempt = {
  number: number;
  fileName: string;
  size: number;
  seed: number;
  startedAt: string;
  durationMs: number;
  finishedElapsedMs?: number;
  uploadDurationMs?: number;
  uploadStartedAt?: string;
  uploadBytesPerSecond?: number;
  lastProgressAt?: string;
  lastProgressElapsedMs?: number;
  lastPacketIntervalMs?: number;
  noProgressMs?: number;
  connectedAtEnd?: boolean;
  phase: 'cleanup' | 'upload';
  outcome: 'running' | 'passed' | 'failed';
  error?: string;
  preparation?: string;
  uploadedPackets: number;
  totalPackets: number;
  uploadedBytes: number;
  diagnostics: Diagnostic[];
  omittedDiagnostics: number;
  sensorNotifications: SensorActivity;
};

export type Report = {
  schemaVersion: number;
  uploadTimeoutMode: 'inactivity';
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'completed' | 'stopped' | 'failed';
  reason: string;
  requiresReload: boolean;
  settings: Settings;
  environment: { apiVersion: string; deviceName: string; userAgent: string; secureContext: boolean };
  firmware?: unknown;
  memoryBefore?: unknown;
  sensorStreaming: {
    mode: SensorStreamingMode;
    confirmed: boolean;
    confirmedAt?: string;
    notifications: SensorActivity;
    cleanupError?: string;
  };
  traffic: {
    startedAt?: string;
    triggerAttempt?: number;
    triggerPacket?: number;
    startError?: string;
  };
  memoryPolling: MemoryPollingReport;
  connection: {
    disconnectedAt?: string;
    testerDisconnectRequestedAt?: string;
    connectedBeforeTesterDisconnect?: boolean;
  };
  passed: number;
  failed: number;
  attempts: Attempt[];
  events: { at: string; message: string }[];
};

export class OperationTimeout extends Error {
  constructor(label: string, timeoutMs: number, inactivity = false) {
    const reason = inactivity
      ? `${label} made no packet progress for ${timeoutMs / 1000} seconds.`
      : `${label} did not finish within ${timeoutMs / 1000} seconds.`;
    super(`${reason} Reload this page before another run; the pending Bluetooth operation cannot be cancelled safely.`);
    this.name = 'OperationTimeout';
  }
}

export async function withTimeout<T>(operation: () => Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new OperationTimeout(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function withUploadInactivityTimeout(
  operation: () => Promise<void>, timeoutMs: number, label: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let uploadedPackets = 0;
  let resetTimeout: () => void;
  const timeout = new Promise<never>((_, reject) => {
    resetTimeout = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new OperationTimeout(label, timeoutMs, true)), timeoutMs);
    };
    resetTimeout();
  });
  const onProgress = (event: Event) => {
    const detail = (event as CustomEvent<UploadProgress>).detail;
    // Only a completed new packet extends the deadline. Repeated notifications
    // or verbose messages about queueing/writing are not evidence of progress.
    if (!detail || !Number.isInteger(detail.uploadedPackets) || detail.uploadedPackets <= uploadedPackets) return;
    uploadedPackets = detail.uploadedPackets;
    resetTimeout();
  };
  document.addEventListener(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, onProgress);
  try {
    await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    clearTimeout(timer);
    document.removeEventListener(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, onProgress);
  }
}

export function validateSettings(settings: Settings): void {
  const integer = (value: number, min: number, max: number, label: string) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label} must be an integer between ${min} and ${max}.`);
    }
  };
  integer(settings.count, 1, 10000, 'Upload count');
  integer(settings.seed, 1, 0xffffffff, 'Seed');
  integer(settings.delayMs, 0, 60000, 'Delay');
  integer(settings.timeoutMs, 1000, 600000, 'Inactivity timeout');
  integer(settings.memoryPollIntervalMs, 1, 60000, 'Delay after memory reads');
  integer(settings.memoryPollTimeoutMs, 100, 600000, 'Memory read timeout');
  if (typeof settings.memoryPolling !== 'boolean') throw new Error('Memory polling must be enabled or disabled.');
  if (!['before-uploads', 'first-packet'].includes(settings.trafficStart)) {
    throw new Error('Background traffic must start before uploads or after the first packet.');
  }
  if (!['off', 'main', 'secondary', 'all'].includes(settings.sensorStreaming)) {
    throw new Error('Sensor streaming must be off, main, secondary, or all.');
  }
  if (!settings.sizes.length || settings.sizes.length > 100) throw new Error('Enter between 1 and 100 file sizes.');
  for (const size of settings.sizes) integer(size, 0, 1024 * 1024, 'File size');
}

// Xorshift32 gives the same file bytes for the size and seed in a saved report.
export function createTestFile(size: number, seed: number, number: number): File {
  const bytes = new Uint8Array(size);
  let state = seed >>> 0;
  for (let index = 0; index < size; index++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return new File([bytes], `stress-${String(number).padStart(5, '0')}-${size}B.bin`, { type: 'application/octet-stream' });
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function waitBetweenUploads(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, delayMs);
    signal.addEventListener('abort', done, { once: true });
    if (signal.aborted) done();
  });
}

function hasRequestedSensors(mode: SensorStreamingMode, activity: SensorActivity): boolean {
  return (mode === 'secondary' || activity.main > 0) && (mode === 'main' || activity.secondary > 0);
}

// A successful start write alone does not prove the robot is sending sensor data.
function waitForSensors(
  mode: SensorStreamingMode, activity: SensorActivity, timeoutMs: number, signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      document.removeEventListener(THYMIO_SENSOR_VALUES_EVENT_ID, check);
      document.removeEventListener(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, check);
      document.removeEventListener('thymio-connected', onConnection);
      signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve();
    };
    const check = () => { if (hasRequestedSensors(mode, activity)) finish(); };
    const onAbort = () => finish();
    const onConnection = (event: Event) => {
      if (!(event as CustomEvent<boolean>).detail) finish(new Error('Bluetooth disconnected while waiting for sensor notifications.'));
    };
    const timer = setTimeout(() => finish(new Error(
      `Requested ${mode} sensor streaming was not observed within ${timeoutMs / 1000} seconds (main: ${activity.main}, secondary: ${activity.secondary}). No uploads were attempted.`,
    )), timeoutMs);
    document.addEventListener(THYMIO_SENSOR_VALUES_EVENT_ID, check);
    document.addEventListener(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, check);
    document.addEventListener('thymio-connected', onConnection);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) finish();
    else check();
  });
}

export async function runUploadStressTest(
  api: RobotAPI,
  settings: Settings,
  signal: AbortSignal,
  onUpdate: (report: Report) => void = () => {},
): Promise<Report> {
  validateSettings(settings);
  if (!api.isConnected()) throw new Error('Connect to a robot before starting a run.');

  const runStarted = performance.now();
  const report: Report = {
    schemaVersion: 5,
    uploadTimeoutMode: 'inactivity',
    startedAt: new Date().toISOString(),
    outcome: 'running', reason: '', requiresReload: false,
    settings: { ...settings, sizes: [...settings.sizes] },
    environment: {
      apiVersion: api.getAPIVersion(), deviceName: api.getDeviceName(),
      userAgent: navigator.userAgent, secureContext: window.isSecureContext,
    },
    sensorStreaming: {
      mode: settings.sensorStreaming, confirmed: false,
      notifications: { main: 0, secondary: 0 },
    },
    traffic: {},
    memoryPolling: {
      enabled: settings.memoryPolling, requested: 0, succeeded: 0, failed: 0, timedOut: 0,
      pending: 0, peakPending: 0, samples: [], omittedSamples: 0,
    },
    connection: {},
    passed: 0, failed: 0, attempts: [], events: [],
  };
  let active: Attempt | undefined;
  let disconnected = false;
  let streamingRequested = false;
  let observingSensors = false;
  let uploading = false;
  let finishing = false;
  let lastPacketTime = runStarted;
  let trafficStartTask: Promise<void> | undefined;
  const event = (message: string) => report.events.push({ at: new Date().toISOString(), message });
  const memoryPoller = createMemoryPoller(
    () => api.getMemoryInfo(), () => api.isConnected(),
    () => ({ attempt: active?.number, uploadedPackets: active?.uploadedPackets }),
    settings.memoryPollIntervalMs, settings.memoryPollTimeoutMs, report.memoryPolling,
    () => !disconnected && api.isConnected(),
  );
  const onSensor = (notification: Event) => {
    if (!observingSensors) return;
    const kind = notification.type === THYMIO_SENSOR_VALUES_EVENT_ID ? 'main' : 'secondary';
    const at = new Date().toISOString();
    const record = (activity: SensorActivity) => {
      activity[kind]++;
      activity.firstAt ??= at;
      activity.lastAt = at;
    };
    record(report.sensorStreaming.notifications);
    if (active && uploading) record(active.sensorNotifications);
    if (streamingRequested && !report.sensorStreaming.confirmed && hasRequestedSensors(settings.sensorStreaming, report.sensorStreaming.notifications)) {
      report.sensorStreaming.confirmed = true;
      report.sensorStreaming.confirmedAt = at;
      event('Requested sensor streaming confirmed by received notifications.');
    }
  };
  const onConnection = (notification: Event) => {
    if (!(notification as CustomEvent<boolean>).detail) {
      disconnected = true;
      report.connection.disconnectedAt ??= new Date().toISOString();
      event('Bluetooth disconnected. This run will not resume after reconnection.');
    }
  };
  const startTraffic = async () => {
    report.traffic.startedAt = new Date().toISOString();
    event(`Starting background traffic: ${settings.sensorStreaming} sensors, memory polling ${settings.memoryPolling ? 'on' : 'off'}.`);
    if (settings.sensorStreaming !== 'off') {
      const start = {
        main: () => api.startMainSensorStreaming(),
        secondary: () => api.startSecondarySensorStreaming(),
        all: () => api.startAllSensorStreaming(),
      }[settings.sensorStreaming];
      streamingRequested = true;
      await withTimeout(start, settings.timeoutMs, 'Starting sensor streaming');
      if (disconnected || !api.isConnected()) throw new Error('Bluetooth disconnected while starting sensor streaming.');
      // The reproduction starts polling once the stream command completes,
      // without delaying uploads until sensor notifications arrive.
      if (settings.trafficStart === 'before-uploads') {
        await waitForSensors(settings.sensorStreaming, report.sensorStreaming.notifications, settings.timeoutMs, signal);
      }
    }
    if (!finishing && !signal.aborted && !disconnected && api.isConnected()) memoryPoller.start();
  };
  const onProgress = (notification: Event) => {
    const detail = (notification as CustomEvent<UploadProgress>).detail;
    if (!active || !uploading || !detail || !Number.isInteger(detail.uploadedPackets) || detail.uploadedPackets <= active.uploadedPackets) return;
    const now = performance.now();
    active.uploadedPackets = detail.uploadedPackets;
    active.totalPackets = detail.totalPackets;
    active.lastProgressAt = new Date().toISOString();
    active.lastProgressElapsedMs = now - runStarted;
    active.lastPacketIntervalMs = now - lastPacketTime;
    lastPacketTime = now;
    if (settings.trafficStart === 'first-packet' && !trafficStartTask && !finishing && !signal.aborted && !disconnected) {
      report.traffic.triggerAttempt = active.number;
      report.traffic.triggerPacket = detail.uploadedPackets;
      trafficStartTask = startTraffic().catch((error) => {
        report.traffic.startError = describeError(error);
        event(report.traffic.startError);
        if (error instanceof OperationTimeout) report.requiresReload = true;
        if (report.outcome === 'running' || report.outcome === 'completed') {
          report.outcome = 'failed';
          report.reason = report.traffic.startError;
        }
      });
    }
  };
  const onVisibility = () => event(`Page visibility: ${document.visibilityState}`);
  const originalDebug = console.debug;
  const captureDebug: typeof console.debug = (...args) => {
    originalDebug.apply(console, args);
    const detail = args[1] as Diagnostic | undefined;
    if (!active || detail?.fileName !== active.fileName || !String(args[0]).startsWith('[File upload:')) return;
    const entry = { ...detail };
    active.uploadedPackets = entry.uploadedPackets;
    active.totalPackets = entry.totalPackets;
    active.uploadedBytes = entry.uploadedBytes;
    if (entry.message.startsWith('Prepared ')) active.preparation = entry.message;
    active.diagnostics.push(entry);
    if (active.diagnostics.length > 100) {
      active.diagnostics.shift();
      active.omittedDiagnostics++;
    }
  };
  console.debug = captureDebug;
  document.addEventListener('thymio-connected', onConnection);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener(THYMIO_SENSOR_VALUES_EVENT_ID, onSensor);
  document.addEventListener(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, onSensor);
  document.addEventListener(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, onProgress);

  try {
    event('Reading firmware and memory information.');
    onUpdate(report);
    report.firmware = await withTimeout(() => api.getFirmwareInfo(), settings.timeoutMs, 'Reading firmware information');
    report.memoryBefore = await withTimeout(() => api.getMemoryInfo(), settings.timeoutMs, 'Reading memory information');

    if (!signal.aborted && !disconnected && api.isConnected()) {
      event('Stopping sensor streaming to establish the selected mode.');
      await withTimeout(() => api.stopSensorStreaming(), settings.timeoutMs, 'Stopping sensor streaming');
      observingSensors = true;
      if (settings.trafficStart === 'before-uploads' && !signal.aborted && !disconnected && api.isConnected()) {
        event('Starting background traffic before uploads.');
        onUpdate(report);
        await startTraffic();
      } else if (settings.trafficStart === 'first-packet') {
        event('Background traffic will start after the first completed upload packet.');
      }
      onUpdate(report);
    }

    for (let index = 0; index < settings.count; index++) {
      if (report.outcome !== 'running' || signal.aborted || disconnected || !api.isConnected()) break;
      const size = settings.sizes[index % settings.sizes.length];
      const seed = ((settings.seed - 1 + index) % 0xffffffff) + 1;
      const file = createTestFile(size, seed, index + 1);
      const attempt: Attempt = {
        number: index + 1, fileName: file.name, size, seed,
        startedAt: new Date().toISOString(), durationMs: 0,
        phase: settings.freeMemory ? 'cleanup' : 'upload', outcome: 'running',
        uploadedPackets: 0, totalPackets: 0, uploadedBytes: 0,
        diagnostics: [], omittedDiagnostics: 0,
        sensorNotifications: { main: 0, secondary: 0 },
      };
      active = attempt;
      report.attempts.push(attempt);
      const started = performance.now();
      let uploadStarted: number | undefined;
      onUpdate(report);
      try {
        if (settings.freeMemory) {
          await withTimeout(() => api.freeMemory(), settings.timeoutMs, 'Freeing uploaded-file RAM');
        }
        if (disconnected || !api.isConnected()) throw new Error('Bluetooth disconnected before upload.');
        attempt.phase = 'upload';
        uploading = true;
        await withUploadInactivityTimeout(() => {
          uploadStarted = performance.now();
          attempt.uploadStartedAt = new Date().toISOString();
          lastPacketTime = uploadStarted;
          return api.uploadFile(file);
        }, settings.timeoutMs, `Upload ${attempt.number}`);
        attempt.outcome = 'passed';
        report.passed++;
        // Preserve summaries for successes and the last 100 diagnostics for failures.
        attempt.diagnostics = [];
        attempt.omittedDiagnostics = 0;
      } catch (error) {
        attempt.outcome = 'failed';
        attempt.error = describeError(error);
        report.failed++;
        // Only explicit robot rejections are safe to follow with another upload.
        const robotRejected = typeof error === 'string' && /^File upload: (CRC Mismatch|Partial upload|Wrong sequence|File too big|Unknown response code)$/.test(error);
        if (error instanceof OperationTimeout) report.requiresReload = true;
        if (settings.stopOnFailure || !robotRejected || attempt.phase !== 'upload') {
          report.outcome = 'failed';
          report.reason = attempt.error;
        }
      } finally {
        uploading = false;
        const finished = performance.now();
        attempt.durationMs = Math.round(finished - started);
        attempt.finishedElapsedMs = finished - runStarted;
        attempt.connectedAtEnd = api.isConnected();
        if (uploadStarted !== undefined) {
          attempt.noProgressMs = finished - lastPacketTime;
          // Include preparation and the robot's ACK, but exclude RAM cleanup and inter-upload delays.
          attempt.uploadDurationMs = finished - uploadStarted;
          if (attempt.outcome === 'passed' && attempt.uploadDurationMs > 0) {
            attempt.uploadBytesPerSecond = attempt.size * 1000 / attempt.uploadDurationMs;
          }
        }
        active = undefined;
        onUpdate(report);
      }
      if (report.outcome === 'failed' || signal.aborted || disconnected) break;
      if (index + 1 < settings.count) await waitBetweenUploads(settings.delayMs, signal);
    }

    if (report.outcome === 'running') {
      if (disconnected || !api.isConnected()) {
        report.outcome = 'failed';
        report.reason = 'Bluetooth disconnected; the remaining uploads were not attempted.';
      } else if (signal.aborted) {
        report.outcome = 'stopped';
        report.reason = 'Stopped by the user after the current operation finished.';
      } else {
        report.outcome = 'completed';
        report.reason = report.failed ? 'Run completed with upload failures.' : 'All uploads were acknowledged by the robot.';
      }
    }
  } catch (error) {
    report.outcome = 'failed';
    report.reason = describeError(error);
    if (error instanceof OperationTimeout) report.requiresReload = true;
  } finally {
    active = undefined;
    finishing = true;
    document.removeEventListener(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, onProgress);
    await memoryPoller.stop(report.requiresReload || disconnected || !api.isConnected());
    await trafficStartTask;
    if (report.memoryPolling.pending > 0) {
      report.requiresReload = true;
      event(`${report.memoryPolling.pending} memory request(s) still pending at shutdown. Reload before another run.`);
    }
    observingSensors = false;
    document.removeEventListener(THYMIO_SENSOR_VALUES_EVENT_ID, onSensor);
    document.removeEventListener(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, onSensor);
    // A stalled GATT call cannot be cancelled; never queue cleanup behind it.
    if (streamingRequested && !report.requiresReload && !disconnected && api.isConnected()) {
      try {
        event('Stopping sensor streaming after the run.');
        await withTimeout(() => api.stopSensorStreaming(), settings.timeoutMs, 'Stopping sensor streaming after the run');
      } catch (error) {
        report.sensorStreaming.cleanupError = describeError(error);
        event(report.sensorStreaming.cleanupError);
        if (report.outcome !== 'failed') {
          report.outcome = 'failed';
          report.reason = report.sensorStreaming.cleanupError;
        }
        if (error instanceof OperationTimeout) report.requiresReload = true;
      }
    }
    if (console.debug === captureDebug) console.debug = originalDebug;
    document.removeEventListener('thymio-connected', onConnection);
    document.removeEventListener('visibilitychange', onVisibility);
    report.finishedAt = new Date().toISOString();
    event(report.reason);
    // Do not wait for a stuck Bluetooth operation, or start another upload behind it.
    if (report.requiresReload) {
      report.connection.testerDisconnectRequestedAt = new Date().toISOString();
      report.connection.connectedBeforeTesterDisconnect = api.isConnected();
      const message = `Tester requested a disconnect after a timeout or pending operation: ${report.reason}`;
      event(message);
      console.debug(`[Upload stress test] ${message}`);
      void api.disconnect().catch(() => {});
    }
    onUpdate(report);
  }
  return report;
}
