import { useEffect, useState } from "react";
import "./device-memory-status.css";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown";

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function getThymio() {
  return window.thymio;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;

  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function getChartY(value, minValue, maxValue, height, padding) {
  const drawableHeight = height - padding.top - padding.bottom;
  const valueRange = Math.max(1, maxValue - minValue);
  const normalized = (value - minValue) / valueRange;
  return padding.top + drawableHeight - normalized * drawableHeight;
}

function buildPolylinePoints(samples, key, minValue, maxValue, width, height, padding) {
  if (samples.length === 0) return "";

  const drawableWidth = width - padding.left - padding.right;
  const xStep = samples.length > 1 ? drawableWidth / (samples.length - 1) : 0;

  return samples
    .map((sample, index) => {
      const x = padding.left + index * xStep;
      const y = getChartY(sample[key], minValue, maxValue, height, padding);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function MemorySparkline({ samples, keyName, label, colorClass, value }) {
  const width = 320;
  const height = 110;
  const padding = { top: 12, right: 10, bottom: 16, left: 58 };
  const values = samples.map((sample) => sample[keyName]);
  const minValue = 0;
  const maxValue = values.length ? Math.max(...values) : 1;
  const points = buildPolylinePoints(samples, keyName, minValue, maxValue, width, height, padding);
  const tickValues = [maxValue, (minValue + maxValue) / 2, minValue];

  return (
    <div className="device-memory-chart">
      <div className="device-memory-chart-header">
        <span className={`device-memory-legend ${colorClass}`}>{label}</span>
        <strong className="device-memory-chart-value">{formatBytes(value)}</strong>
      </div>
      <svg aria-label={`${label} memory history`} viewBox={`0 0 ${width} ${height}`} role="img">
        {tickValues.map((value, index) => {
          const y = getChartY(value, minValue, maxValue, height, padding);

          return (
            <g key={`${label}-${index}`}>
              <line className="device-memory-grid-line" x1={padding.left} y1={y} x2={width - padding.right} y2={y} />
              <text className="device-memory-tick-label" x={padding.left - 8} y={y} textAnchor="end" dominantBaseline="middle">
                {formatBytes(value)}
              </text>
            </g>
          );
        })}
        <line className="device-memory-axis" x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} />
        <line className="device-memory-axis" x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} />
        {samples.length > 1 ? (
          <polyline className={`device-memory-line ${colorClass}`} points={points} />
        ) : null}
      </svg>
      {samples.length < 2 ? (
        <div className="muted device-memory-chart-empty">Waiting for graph samples...</div>
      ) : null}
    </div>
  );
}

export default function DeviceMemoryStatus({ isConnected, pollIntervalMs = 1000, requestTimeoutMs = 4000 }) {
  const [memoryInfo, setMemoryInfo] = useState(null);
  const [samples, setSamples] = useState([]);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (!isConnected) return undefined;

    let cancelled = false;
    let timeoutId;

    async function pollMemory() {
      try {
        const t = getThymio();
        if (!t?.getMemoryInfo) throw new Error("Memory API unavailable");

        const nextMemoryInfo = await withTimeout(
          t.getMemoryInfo(),
          requestTimeoutMs,
          "Memory polling timed out"
        );
        if (cancelled) return;

        setMemoryInfo(nextMemoryInfo);
        setSamples((current) => [
          ...current.slice(-29),
          {
            time: Date.now(),
            ram: nextMemoryInfo.ram_bytes_free,
            flash: nextMemoryInfo.flash_bytes_free,
          },
        ]);
        setError("");
        setLastUpdated(new Date());
      } catch (err) {
        if (!cancelled) setError(err?.message ?? "Failed to read memory info");
      } finally {
        if (!cancelled) timeoutId = window.setTimeout(pollMemory, pollIntervalMs);
      }
    }

    void pollMemory();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isConnected, pollIntervalMs, requestTimeoutMs]);

  return (
    <div className="device-memory-status">
      <div className="device-memory-header">
        <div className="grid-title">Memory</div>
        <span className={`device-memory-state ${isConnected ? "connected" : "disconnected"}`}>
          {isConnected ? "Polling" : "Disconnected"}
        </span>
      </div>

      <div className="device-memory-chart-grid">
        <MemorySparkline
          samples={samples}
          keyName="ram"
          label="RAM free"
          colorClass="ram"
          value={memoryInfo?.ram_bytes_free}
        />
        <MemorySparkline
          samples={samples}
          keyName="flash"
          label="Flash free"
          colorClass="flash"
          value={memoryInfo?.flash_bytes_free}
        />
      </div>

      {lastUpdated ? (
        <div className="muted device-memory-footnote">
          Updated {lastUpdated.toLocaleTimeString()}
        </div>
      ) : (
        <div className="muted device-memory-footnote">
          {isConnected ? "Waiting for first memory sample..." : "Connect to poll memory."}
        </div>
      )}

      {error ? <div className="error-box device-memory-error">{error}</div> : null}
    </div>
  );
}
