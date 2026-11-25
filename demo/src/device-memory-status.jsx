import { useEffect, useRef, useState } from 'react';
import './device-memory-status.css';
import { formatBytes } from './utils';

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Memory request timed out')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function MemorySparkline({ samples, field, label, state, error, lastUpdated }) {
  const values = samples.map(sample => sample[field]);
  const latest = values.at(-1);
  const max = values.length ? Math.max(...values) : 0;
  const points = values.map((value, index) => {
    const x = 3 + index / Math.max(1, values.length - 1) * 194;
    const y = 24 - (max > 0 ? value / max : 0) * 20;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const detail = [
    `${label}: ${formatBytes(latest)}`,
    state,
    values.length ? `${values.length} samples; scale 0 to ${formatBytes(max)}` : 'No samples',
    lastUpdated ? `Last received ${new Date(lastUpdated).toLocaleTimeString()}` : '',
    error,
  ].filter(Boolean).join('. ');

  return (
    <div className={`device-memory-chart ${field}`} title={detail} data-sample-count={samples.length}>
      <div className="device-memory-graph-label"><span>{label}</span><strong>{formatBytes(latest)}</strong></div>
      <div className="device-memory-plot">
        <svg role="img" aria-label={`${label} history. ${detail}`} viewBox="0 0 200 28" preserveAspectRatio="none">
          <title>{detail}</title>
          {values.length > 0 && <line className="device-memory-baseline" x1="3" y1="24" x2="197" y2="24" />}
          {values.length === 1 && <circle className="device-memory-point" cx="3" cy={max > 0 ? 4 : 24} r="2" />}
          {values.length > 1 && <polyline className="device-memory-line" points={points} />}
        </svg>
        {state !== 'Live' && <span className="device-memory-state">{state}</span>}
      </div>
    </div>
  );
}

export default function DeviceMemoryStatus({ isConnected, isActive = true, onFlashFreeChange, pollIntervalMs = 1000, requestTimeoutMs = 4000 }) {
  const [samples, setSamples] = useState([]);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const lastRequest = useRef(0);

  useEffect(() => {
    if (!isConnected || !isActive) return;
    let cancelled = false;
    let timer;

    async function poll() {
      // An operation may pause and resume the component while a request settles.
      // Keep only one request in flight and never restart faster than the interval.
      if (inFlight.current) {
        timer = setTimeout(poll, pollIntervalMs);
        return;
      }
      inFlight.current = true;
      lastRequest.current = Date.now();
      try {
        const api = window.thymio;
        if (!api?.getMemoryInfo) throw new Error('Memory API unavailable');
        const info = await withTimeout(api.getMemoryInfo(), requestTimeoutMs);
        if (cancelled) return;
        if (![info?.ram_bytes_free, info?.flash_bytes_free].every(value => Number.isFinite(value) && value >= 0)) {
          throw new Error('Invalid memory reading');
        }
        setSamples(current => [...current.slice(-29), { time: Date.now(), ram: info.ram_bytes_free, flash: info.flash_bytes_free }]);
        setError('');
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      } finally {
        inFlight.current = false;
        if (!cancelled) timer = setTimeout(poll, pollIntervalMs);
      }
    }

    // Deferring also prevents duplicate requests during React Strict Mode setup.
    timer = setTimeout(poll, Math.max(0, pollIntervalMs - (Date.now() - lastRequest.current)));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isConnected, isActive, pollIntervalMs, requestTimeoutMs]);

  const flashFree = error ? null : samples.at(-1)?.flash ?? null;
  useEffect(() => {
    onFlashFreeChange(flashFree);
  }, [flashFree, onFlashFreeChange]);

  const state = !isConnected ? 'Disconnected' : !isActive ? 'Paused' : error ? 'Unavailable' : samples.length ? 'Live' : 'Waiting';
  return (
    <section className="device-memory-status" aria-label="Robot memory">
      {[["ram", "RAM free"], ["flash", "Flash free"]].map(([field, label]) => (
        <MemorySparkline key={field} samples={samples} field={field} label={label} state={state} error={error} lastUpdated={samples.at(-1)?.time} />
      ))}
    </section>
  );
}
