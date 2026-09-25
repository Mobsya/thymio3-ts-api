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
  if (value === null || value === undefined) return "—";
  return String(value);
}

function SensorReading({ value }) {
  const isWaiting = value === null || value === undefined;

  return (
    <span
      className="sensor-focus-reading"
      role={isWaiting ? "img" : undefined}
      aria-label={isWaiting ? "Waiting" : undefined}
      title={isWaiting ? "Waiting" : undefined}
    >
      {formatValue(value)}
    </span>
  );
}

function SensorValueEntries({ entries }) {
  return entries.map(([key, entryValue]) => (
    <span className="sensor-focus-value" key={key}>
      <span className="sensor-focus-key">{formatKey(key)}</span>
      <SensorReading value={entryValue} />
    </span>
  ));
}

function SensorValue({ value }) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="sensor-focus-values">
        <SensorValueEntries entries={Object.entries(value)} />
      </div>
    );
  }

  return (
    <span className="sensor-focus-value-display">
      <SensorReading value={value} />
    </span>
  );
}

function ColourColumn({ title, value, channels }) {
  return (
    <div className="sensor-focus-colour-column">
      <h5 className="sensor-focus-column-heading">{title}</h5>
      <SensorValueEntries entries={channels.map((channel) => [channel, value?.[channel]])} />
    </div>
  );
}

function ColourSection({ options }) {
  const raw = options.find((option) => option.id === "colorRaw");
  const hsv = options.find((option) => option.id === "colorSensor");
  const detected = options.find((option) => option.id === "colorDetected");

  return (
    <section className="sensor-focus-section" aria-label="Colour">
      <h4 className="sensor-focus-section-heading">Colour</h4>
      {hsv ? <SensorColourPreview mode="hsv" value={hsv.value} /> : null}
      {raw || hsv ? (
        <div className="sensor-focus-colour-columns">
          {raw ? <ColourColumn title="Raw" value={raw.value} channels={["red", "green", "blue", "clear"]} /> : null}
          {hsv ? (
            <>
              <ColourColumn title="HSV" value={hsv.value} channels={["h", "s", "v"]} />
              <ColourColumn
                title={<>RGB <span className="sensor-focus-column-note">(derived)</span></>}
                value={hsvToRgb(hsv.value)}
                channels={["r", "g", "b"]}
              />
            </>
          ) : null}
        </div>
      ) : null}
      {detected ? (
        <div className="sensor-focus-detected">
          <SensorColourPreview mode="detected" value={detected.value}>
            <SensorReading value={detected.value} />
          </SensorColourPreview>
        </div>
      ) : null}
    </section>
  );
}

function GroundSection({ options }) {
  const columns = [
    ["groundAmbient", "Ambient"],
    ["groundReflected", "Reflected"],
    ["groundSensors", "Value"],
  ].flatMap(([id, label]) => {
    const option = options.find((option) => option.id === id);
    return option ? [{ ...option, label }] : [];
  });

  return (
    <section className="sensor-focus-section" aria-label="Ground">
      <h4 className="sensor-focus-section-heading">Ground</h4>
      <table className="sensor-focus-ground-table" aria-label="Ground readings">
        <thead>
          <tr>
            <th scope="col">Sensor</th>
            {columns.map((column) => <th scope="col" key={column.id}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {["left", "right"].map((side) => (
            <tr key={side}>
              <th scope="row">{formatKey(side)}</th>
              {columns.map((column) => (
                <td key={column.id}><SensorReading value={column.value?.[side]} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
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

  // Keep each section in its original position even when only its secondary readings are selected.
  const sections = new Map();
  for (const option of SENSOR_OPTIONS) {
    const sectionId = option.group ?? option.id;
    if (!sections.has(sectionId)) sections.set(sectionId, []);
    if (focusedSensors.includes(option.id)) {
      const data = option.source === "main" ? mainSensors : otherSensors;
      sections.get(sectionId).push({ ...option, value: getValue(data, option.path) });
    }
  }
  const selectedSections = [...sections].filter(([, options]) => options.length > 0);

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
        {selectedSections.length === 0 ? (
          <div className="sensor-focus-empty">No sensors selected.</div>
        ) : null}

        {selectedSections.map(([sectionId, options]) => {
          if (sectionId === "colour") return <ColourSection key={sectionId} options={options} />;
          if (sectionId === "ground") return <GroundSection key={sectionId} options={options} />;

          const [option] = options;

          return (
            <div className="sensor-focus-row" key={option.id}>
              <span className="sensor-focus-row-label">{option.label}</span>
              <span className="sensor-focus-row-source">{option.source}</span>
              <SensorValue value={option.value} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
