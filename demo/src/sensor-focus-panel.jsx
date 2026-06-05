import "./sensor-focus-panel.css";

const SENSOR_OPTIONS = [
  { id: "colorSensor", label: "Color HSV", source: "main", path: ["colorSensor"] },
  { id: "groundSensors", label: "Ground", source: "main", path: ["groundSensors"] },
  { id: "accelerationRaw", label: "Acceleration", source: "main", path: ["accelerationRaw"] },
  { id: "gyroRaw", label: "Gyro", source: "main", path: ["gyroRaw"] },
  { id: "buttons", label: "Buttons", source: "main", path: ["buttons"] },
  { id: "microphoneVolume", label: "Microphone", source: "main", path: ["microphoneVolume"] },
  { id: "proximitySensors", label: "Proximity", source: "main", path: ["proximitySensors"] },
  { id: "tvRemote", label: "TV remote", source: "main", path: ["tvRemote"] },
  { id: "colorRaw", label: "Color raw", source: "secondary", path: ["colorRaw"] },
  { id: "colorDetected", label: "Color detected", source: "secondary", path: ["colorDetected"] },
  { id: "groundAmbient", label: "Ground ambient", source: "secondary", path: ["groundAmbient"] },
  { id: "groundReflected", label: "Ground reflected", source: "secondary", path: ["groundReflected"] },
  { id: "angleDegrees", label: "Angle", source: "secondary", path: ["angleDegrees"] },
  { id: "eventFlags", label: "Events", source: "secondary", path: ["eventFlags"] },
  { id: "motor", label: "Motor feedback", source: "secondary", path: ["motor"] },
  { id: "batteryVoltage", label: "Battery", source: "secondary", path: ["batteryVoltage"] },
];

export const SENSOR_FOCUS_SENSOR_IDS = SENSOR_OPTIONS.map((option) => option.id);

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

function SensorValue({ value }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="sensor-focus-values">
        {Object.entries(value).map(([key, entryValue]) => (
          <span className="sensor-focus-value" key={key}>
            <span className="sensor-focus-key">{formatKey(key)}</span>
            <span className="sensor-focus-reading">{formatValue(entryValue)}</span>
          </span>
        ))}
      </div>
    );
  }

  return <span className="sensor-focus-reading">{formatValue(value)}</span>;
}

export default function SensorFocusPanel({ mainSensors, otherSensors, focusedSensors, onFocusedSensorsChange }) {
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
              <SensorValue value={value} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
