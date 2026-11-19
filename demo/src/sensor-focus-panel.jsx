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

const VECTOR_KEYS = ["x", "y", "z"];
const BUTTON_KEYS = ["back", "left", "center", "forward", "right"];
const EVENT_KEYS = ["tapDetected", "freefallDetected", "clapDetected"];
const PROXIMITY_KEYS = ["left", "frontLeft", "center", "frontRight", "right", "backLeft", "backRight"];

function ReadingColumn({ option }) {
  const keys = option.id === "buttons" ? BUTTON_KEYS : option.id === "eventFlags" ? EVENT_KEYS : VECTOR_KEYS;
  return <section className="sensor-reading-column" aria-label={option.label}>
    <h4 className="sensor-focus-section-heading">{option.label}</h4>
    {keys.map(key => {
      const value = option.value?.[key];
      return <div className={`sensor-compact-reading ${value === true ? 'active' : ''}`} key={key}>
        <span className="sensor-focus-key">{formatKey(key.replace(/Detected$/, ''))}</span>
        <SensorReading value={option.id === "buttons" && typeof value === "boolean" ? (value ? 'pressed' : 'released') : value} />
      </div>;
    })}
  </section>;
}

function PairedSection({ options }) {
  return <div className="sensor-focus-section sensor-pair">
    {options.map(option => <ReadingColumn key={option.id} option={option} />)}
  </div>;
}

function ProximitySection({ value }) {
  const max = Math.max(1, ...PROXIMITY_KEYS.map(key => value?.[key]).filter(Number.isFinite));
  return <section className="sensor-focus-section" aria-label="Proximity">
    <div className="sensor-section-title"><h4 className="sensor-focus-section-heading">Proximity</h4><span className="sensor-scale">Raw · relative 0–{max}</span></div>
    <div className="sensor-bars">{PROXIMITY_KEYS.map(key => <div className="sensor-bar" key={key}>
      <span>{formatKey(key)}</span>
      <progress aria-label={`${formatKey(key)} proximity`} max={max} value={value?.[key] ?? 0} />
      <SensorReading value={value?.[key]} />
    </div>)}</div>
  </section>;
}

function MotorSection({ value }) {
  return <section className="sensor-focus-section" aria-label="Motor feedback">
    <h4 className="sensor-focus-section-heading">Motor feedback</h4>
    <table className="sensor-focus-ground-table" aria-label="Motor feedback readings">
      <thead><tr><th scope="col">Motor</th><th scope="col">Speed</th><th scope="col">PWM</th></tr></thead>
      <tbody>{['left', 'right'].map(side => <tr key={side}><th scope="row">{formatKey(side)}</th><td><SensorReading value={value?.[`${side}Speed`]} /></td><td><SensorReading value={value?.[`${side}PwmDuty`]} /></td></tr>)}</tbody>
    </table>
  </section>;
}

function OtherSection({ options }) {
  return <section className="sensor-focus-section sensor-summary" aria-label="Other readings">
    {options.map(option => <div className="sensor-compact-reading" key={option.id}><span className="sensor-focus-key">{option.label}</span><SensorReading value={option.value} /></div>)}
  </section>;
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
      {hsv ? <SensorColourPreview mode="hsv" value={hsv.value} compact /> : null}
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
          <SensorColourPreview mode="detected" value={detected.value} compact>
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

  const groups = [
    ['colour', ['colorRaw', 'colorSensor', 'colorDetected']],
    ['ground', ['groundAmbient', 'groundReflected', 'groundSensors']],
    ['motion', ['accelerationRaw', 'gyroRaw']],
    ['input', ['buttons', 'eventFlags']],
    ['proximity', ['proximitySensors']],
    ['motor', ['motor']],
    ['other', ['microphoneVolume', 'tvRemote', 'angleDegrees', 'batteryVoltage']],
  ];
  const selectedSections = groups.map(([id, ids]) => [id, ids.filter(sensorId => focusedSensors.includes(sensorId)).map(sensorId => {
    const option = SENSOR_OPTIONS.find(option => option.id === sensorId);
    return { ...option, value: getValue(option.source === "main" ? mainSensors : otherSensors, option.path) };
  })]).filter(([, options]) => options.length);

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

          if (sectionId === "motion" || sectionId === "input") return <PairedSection key={sectionId} options={options} />;
          if (sectionId === "proximity") return <ProximitySection key={sectionId} value={options[0].value} />;
          if (sectionId === "motor") return <MotorSection key={sectionId} value={options[0].value} />;
          return <OtherSection key={sectionId} options={options} />;
        })}
      </div>
    </div>
  );
}
