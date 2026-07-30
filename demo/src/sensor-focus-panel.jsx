import { useEffect, useRef, useState } from "react";
import "./sensor-focus-panel.css";
import SensorColourPreview from "./sensor-colour-preview";
import { SENSOR_FOCUS_SENSOR_IDS, SENSOR_OPTIONS } from "./sensor-options";

function getValue(data, path) {
  return path.reduce((current, key) => current?.[key], data);
}

function formatKey(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

function formatValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined) return "Waiting";
  return String(value);
}

function getComparableValue(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value !== "object") return `${typeof value}:${value}`;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function useValueChangePulse(value) {
  const comparableValue = getComparableValue(value);
  const previousValue = useRef(comparableValue);
  const hasMounted = useRef(false);
  const lastPulseAt = useRef(0);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      previousValue.current = comparableValue;
      return undefined;
    }

    if (previousValue.current === comparableValue) {
      return undefined;
    }

    previousValue.current = comparableValue;

    const now = Date.now();
    if (now - lastPulseAt.current < 1200) {
      return undefined;
    }

    lastPulseAt.current = now;
    setIsPulsing(false);

    const frameId = requestAnimationFrame(() => setIsPulsing(true));
    const timeoutId = setTimeout(() => setIsPulsing(false), 420);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [comparableValue]);

  return isPulsing;
}

function SensorReading({ value }) {
  const isPulsing = useValueChangePulse(value);

  return (
    <span className={`sensor-focus-reading${isPulsing ? " is-changing" : ""}`}>
      {formatValue(value)}
    </span>
  );
}

function SensorValueChip({ name, value }) {
  const isPulsing = useValueChangePulse(value);

  return (
    <span className={`sensor-focus-value${isPulsing ? " is-changing" : ""}`}>
      <span className="sensor-focus-key">{formatKey(name)}</span>
      <SensorReading value={value} />
    </span>
  );
}

function SensorValue({ value, colourPreviewMode }) {
  const colourPreview = colourPreviewMode ? <SensorColourPreview mode={colourPreviewMode} value={value} /> : null;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="sensor-focus-value-display">
        <div className="sensor-focus-values">
          {Object.entries(value).map(([key, entryValue]) => (
            <SensorValueChip key={key} name={key} value={entryValue} />
          ))}
        </div>
        {colourPreview}
      </div>
    );
  }

  return (
    <span className="sensor-focus-value-display">
      <SensorReading value={value} />
      {colourPreview}
    </span>
  );
}

function getColourPreviewMode(sensorId) {
  if (sensorId === "colorSensor") return "hsv";
  return null;
}

export default function SensorFocusPanel({
  mainSensors,
  otherSensors,
  focusedSensors,
  onFocusedSensorsChange,
  showSelector = true,
}) {
  function toggleSensor(sensorId) {
    if (focusedSensors.includes(sensorId)) {
      onFocusedSensorsChange(focusedSensors.filter((id) => id !== sensorId));
      return;
    }

    onFocusedSensorsChange([...focusedSensors, sensorId]);
  }

  const selectedOptions = SENSOR_OPTIONS.filter((option) => focusedSensors.includes(option.id));

  return (
    <div className="sensor-focus-panel">
      {showSelector ? (
        <>
          <div className="sensor-focus-controls">
            <button type="button" className="secondary sensor-focus-control" onClick={() => onFocusedSensorsChange(SENSOR_FOCUS_SENSOR_IDS)}>
              Select all
            </button>
            <button type="button" className="secondary sensor-focus-control" onClick={() => onFocusedSensorsChange([])}>
              Deselect all
            </button>
          </div>

          <div className="sensor-focus-selector">
            {SENSOR_OPTIONS.map((option) => (
              <label className="sensor-focus-option" key={option.id}>
                <input
                  checked={focusedSensors.includes(option.id)}
                  onChange={() => toggleSensor(option.id)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}

      <div className="sensor-focus-table">
        {selectedOptions.length === 0 ? (
          <div className="sensor-focus-empty">No sensors selected.</div>
        ) : null}

        {selectedOptions.map((option) => {
          const data = option.source === "main" ? mainSensors : otherSensors;
          const value = getValue(data, option.path);

          return (
            <div className="sensor-focus-row" key={option.id}>
              <span className="sensor-focus-row-label">{option.label}</span>
              <span className="sensor-focus-row-source">{option.source}</span>
              <SensorValue colourPreviewMode={getColourPreviewMode(option.id)} value={value} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
