export type MemoryPoll = {
  number: number;
  attempt?: number;
  uploadedPackets?: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  outcome: 'running' | 'passed' | 'failed' | 'timeout' | 'stopped';
  connectedAtEnd?: boolean;
  error?: string;
  value?: unknown;
  settledAt?: string;
  lateError?: string;
};

export type MemoryPollingReport = {
  enabled: boolean;
  startedAt?: string;
  stoppedAt?: string;
  requested: number;
  succeeded: number;
  failed: number;
  timedOut: number;
  pending: number;
  peakPending: number;
  firstIssue?: MemoryPoll;
  samples: MemoryPoll[];
  omittedSamples: number;
};

// Match the demo/reproducer: await a response or timeout, then delay before
// issuing the next request. A timeout does NOT cancel the underlying API call.
export function createMemoryPoller(
  read: () => Promise<unknown>,
  isConnected: () => boolean,
  context: () => { attempt?: number; uploadedPackets?: number },
  intervalMs: number,
  timeoutMs: number,
  report: MemoryPollingReport,
  canPoll: () => boolean = isConnected,
): { start(): void; stop(immediate?: boolean): Promise<void> } {
  const controller = new AbortController();
  let task: Promise<void> | undefined;
  let closed = false;
  let stopping = false;
  let wakeDelay: (() => void) | undefined;
  const pending = new Set<number>();
  const errorText = (error: unknown) => error instanceof Error ? `${error.name}: ${error.message}` : String(error);

  const poll = async () => {
    const started = performance.now();
    const sample: MemoryPoll = {
      number: ++report.requested, ...context(), startedAt: new Date().toISOString(), outcome: 'running',
    };
    report.samples.push(sample);
    if (report.samples.length > 1000) { report.samples.shift(); report.omittedSamples++; }
    pending.add(sample.number);
    report.pending = pending.size;
    report.peakPending = Math.max(report.peakPending, pending.size);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onStop: () => void = () => {};
    type Result = { outcome: 'passed'; value: unknown } | { outcome: 'failed'; error: unknown } | { outcome: 'timeout' | 'stopped' };
    const settled = (error?: unknown) => {
      pending.delete(sample.number);
      if (closed) return;
      report.pending = pending.size;
      sample.settledAt = new Date().toISOString();
      if (sample.outcome === 'timeout' && error !== undefined) sample.lateError = errorText(error);
    };
    const response: Promise<Result> = Promise.resolve().then(read).then(
      (value) => { settled(); return { outcome: 'passed', value }; },
      (error) => { settled(error); return { outcome: 'failed', error }; },
    );
    try {
      const result = await Promise.race([
        response,
        new Promise<Result>((resolve) => {
          timer = setTimeout(() => resolve({ outcome: 'timeout' }), timeoutMs);
          onStop = () => resolve({ outcome: 'stopped' });
          controller.signal.addEventListener('abort', onStop, { once: true });
          if (controller.signal.aborted) onStop();
        }),
      ]);
      sample.outcome = result.outcome;
      sample.finishedAt = new Date().toISOString();
      sample.durationMs = performance.now() - started;
      sample.connectedAtEnd = isConnected();
      if (result.outcome === 'passed') { report.succeeded++; sample.value = result.value; }
      if (result.outcome === 'failed') { report.failed++; sample.error = errorText(result.error); }
      if (result.outcome === 'timeout') {
        report.timedOut++;
        sample.error = `No memory response within ${timeoutMs / 1000} seconds; the API request remains pending.`;
      }
      if (sample.error) {
        report.firstIssue ??= sample;
        console.warn(`[Upload stress test: memory poll ${sample.number}] ${sample.error}`);
      }
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', onStop);
    }
  };
  const delay = () => new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', done);
      wakeDelay = undefined;
      resolve();
    };
    const timer = setTimeout(done, intervalMs);
    wakeDelay = done;
    controller.signal.addEventListener('abort', done, { once: true });
    if (controller.signal.aborted) done();
  });
  return {
    start() {
      if (task || stopping || !report.enabled) return;
      report.startedAt = new Date().toISOString();
      task = (async () => {
        while (!stopping && canPoll()) {
          await poll();
          if (!stopping) await delay();
        }
      })();
    },
    async stop(immediate = false) {
      stopping = true;
      wakeDelay?.();
      // On a healthy run, allow the current read its remaining response deadline.
      // A stalled upload or disconnected link must finish without another wait.
      if (immediate) controller.abort();
      await task;
      if (report.startedAt) report.stoppedAt = new Date().toISOString();
      report.pending = pending.size;
      closed = true;
    },
  };
}
