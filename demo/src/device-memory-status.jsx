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

export default function DeviceMemoryStatus({ isConnected, pollIntervalMs = 5000, requestTimeoutMs = 4000 }) {
  const [memoryInfo, setMemoryInfo] = useState(null);
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

      <div className="device-memory-grid">
        <div className="device-memory-metric">
          <span>RAM free</span>
          <strong>{formatBytes(memoryInfo?.ram_bytes_free)}</strong>
        </div>
        <div className="device-memory-metric">
          <span>Flash free</span>
          <strong>{formatBytes(memoryInfo?.flash_bytes_free)}</strong>
        </div>
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

      {/* {error ? <div className="error-box device-memory-error">{error}</div> : null} */}
    </div>
  );
}
