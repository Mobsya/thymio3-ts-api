import "./sensor-focus-panel.css";
import { hsvToRgb } from "./color-utils";
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

function SensorValueEntries({ entries }) {
  return entries.map(([key, entryValue]) => (
    <span className="sensor-focus-value" key={key}>
      <span className="sensor-focus-key">{formatKey(key)}</span>
      <span className="sensor-focus-reading">{formatValue(entryValue)}</span>
    </span>
  ));
}

function SensorValue({ value, colourPreviewMode }) {
  const colourPreview = colourPreviewMode ? <SensorColourPreview mode={colourPreviewMode} value={value} /> : null;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (colourPreviewMode === "hsv") {
      const rgb = hsvToRgb(value);
      const hsvEntries = Object.entries(value);
      const rgbEntries = rgb ? Object.entries(rgb) : [];

      return (
        <div className="sensor-focus-value-display">
          <div className="sensor-focus-color-values">
            <div className="sensor-focus-color-group">
              <SensorValueEntries entries={hsvEntries} />
            </div>
            {rgbEntries.length > 0 ? (
              <div className="sensor-focus-color-group">
                <SensorValueEntries entries={rgbEntries} />
              </div>
            ) : null}
          </div>
          {colourPreview}
        </div>
      );
    }

    return (
      <div className="sensor-focus-value-display">
        <div className="sensor-focus-values">
          <SensorValueEntries entries={Object.entries(value)} />
        </div>
        {colourPreview}
      </div>
    );
  }

  return (
    <span className="sensor-focus-value-display">
      <span className="sensor-focus-reading">{formatValue(value)}</span>
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
