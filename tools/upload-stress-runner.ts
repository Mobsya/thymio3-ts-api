export type Settings = {
  count: number;
  sizes: number[];
  seed: number;
  delayMs: number;
  timeoutMs: number;
  freeMemory: boolean;
  stopOnFailure: boolean;
};

type RobotAPI = {
  isConnected(): boolean;
  getAPIVersion(): string;
  getDeviceName(): string;
  getFirmwareInfo(): Promise<unknown>;
  getMemoryInfo(): Promise<unknown>;
  freeMemory(): Promise<void>;
  uploadFile(file: File): Promise<void>;
  disconnect(): Promise<void>;
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
  phase: 'cleanup' | 'upload';
  outcome: 'running' | 'passed' | 'failed';
  error?: string;
  preparation?: string;
  uploadedPackets: number;
  totalPackets: number;
  uploadedBytes: number;
  diagnostics: Diagnostic[];
  omittedDiagnostics: number;
};

export type Report = {
  schemaVersion: number;
  startedAt: string;
  finishedAt?: string;
  outcome: 'running' | 'completed' | 'stopped' | 'failed';
  reason: string;
  requiresReload: boolean;
  settings: Settings;
  environment: { apiVersion: string; deviceName: string; userAgent: string; secureContext: boolean };
  firmware?: unknown;
  memoryBefore?: unknown;
  passed: number;
  failed: number;
  attempts: Attempt[];
  events: { at: string; message: string }[];
};

export class OperationTimeout extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} did not finish within ${timeoutMs / 1000} seconds. Reload this page before another run; the pending Bluetooth operation cannot be cancelled safely.`);
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

export function validateSettings(settings: Settings): void {
  const integer = (value: number, min: number, max: number, label: string) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label} must be an integer between ${min} and ${max}.`);
    }
  };
  integer(settings.count, 1, 10000, 'Upload count');
  integer(settings.seed, 1, 0xffffffff, 'Seed');
  integer(settings.delayMs, 0, 60000, 'Delay');
  integer(settings.timeoutMs, 1000, 600000, 'Operation timeout');
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

export async function runUploadStressTest(
  api: RobotAPI,
  settings: Settings,
  signal: AbortSignal,
  onUpdate: (report: Report) => void = () => {},
): Promise<Report> {
  validateSettings(settings);
  if (!api.isConnected()) throw new Error('Connect to a robot before starting a run.');

  const report: Report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    outcome: 'running', reason: '', requiresReload: false,
    settings: { ...settings, sizes: [...settings.sizes] },
    environment: {
      apiVersion: api.getAPIVersion(), deviceName: api.getDeviceName(),
      userAgent: navigator.userAgent, secureContext: window.isSecureContext,
    },
    passed: 0, failed: 0, attempts: [], events: [],
  };
  let active: Attempt | undefined;
  let disconnected = false;
  const event = (message: string) => report.events.push({ at: new Date().toISOString(), message });
  const onConnection = (notification: Event) => {
    if (!(notification as CustomEvent<boolean>).detail) {
      disconnected = true;
      event('Bluetooth disconnected. This run will not resume after reconnection.');
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

  try {
    event('Reading firmware and memory information.');
    onUpdate(report);
    report.firmware = await withTimeout(() => api.getFirmwareInfo(), settings.timeoutMs, 'Reading firmware information');
    report.memoryBefore = await withTimeout(() => api.getMemoryInfo(), settings.timeoutMs, 'Reading memory information');

    for (let index = 0; index < settings.count; index++) {
      if (signal.aborted || disconnected || !api.isConnected()) break;
      const size = settings.sizes[index % settings.sizes.length];
      const seed = ((settings.seed - 1 + index) % 0xffffffff) + 1;
      const file = createTestFile(size, seed, index + 1);
      const attempt: Attempt = {
        number: index + 1, fileName: file.name, size, seed,
        startedAt: new Date().toISOString(), durationMs: 0,
        phase: settings.freeMemory ? 'cleanup' : 'upload', outcome: 'running',
        uploadedPackets: 0, totalPackets: 0, uploadedBytes: 0,
        diagnostics: [], omittedDiagnostics: 0,
      };
      active = attempt;
      report.attempts.push(attempt);
      const started = performance.now();
      onUpdate(report);
      try {
        if (settings.freeMemory) {
          await withTimeout(() => api.freeMemory(), settings.timeoutMs, 'Freeing uploaded-file RAM');
        }
        if (disconnected || !api.isConnected()) throw new Error('Bluetooth disconnected before upload.');
        attempt.phase = 'upload';
        await withTimeout(() => api.uploadFile(file), settings.timeoutMs, `Upload ${attempt.number}`);
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
        attempt.durationMs = Math.round(performance.now() - started);
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
    report.requiresReload = error instanceof OperationTimeout;
  } finally {
    active = undefined;
    if (console.debug === captureDebug) console.debug = originalDebug;
    document.removeEventListener('thymio-connected', onConnection);
    document.removeEventListener('visibilitychange', onVisibility);
    report.finishedAt = new Date().toISOString();
    event(report.reason);
    // Do not wait for a stuck Bluetooth operation, or start another upload behind it.
    if (report.requiresReload) void api.disconnect().catch(() => {});
    onUpdate(report);
  }
  return report;
}
