import { useEffect, useState } from "react";
import { RgbColorPicker } from "react-colorful";
import { PRESETS } from "./presets";
import MotorSliders from "./motor-sliders";
import { clampInt, rgbToCss, areIntensitiesEqual, areRgbEqual } from "./utils";
import "./actuator-panel.css";

function getThymio() {
  return window.thymio;
}

const ACTUATOR_SEND_INTERVAL_MS = 100;
const DEFAULT_ACTUATOR_DATA = {
  circleLEDs: Array(8).fill(0),
  frontLegoLEDs: Array(8).fill(0),
  rearLegoLEDs: Array(8).fill(0),
  flRGB: { r: 0, g: 0, b: 0 },
  frRGB: { r: 0, g: 0, b: 0 },
  blRGB: { r: 0, g: 0, b: 0 },
  brRGB: { r: 0, g: 0, b: 0 },
  motorLeft: 0,
  motorRight: 0,
  sound: 0,
  smallBottomRGB: { r: 0, g: 0, b: 0 },
  smallBackRGB: { r: 0, g: 0, b: 0 },
  buttonLEDs: Array(4).fill(0),
  receiverLED: 0,
  microphoneLED: false,
};

let latestActuatorData = DEFAULT_ACTUATOR_DATA;
let pendingActuatorData = null;
let actuatorSendTimer = null;
let actuatorSendInFlight = false;
let lastActuatorSendAt = 0;

function buildActuatorData(overrides = {}, base = latestActuatorData) {
  return {
    circleLEDs: overrides.circleLEDs ?? base.circleLEDs,
    frontLegoLEDs: overrides.frontLegoLEDs ?? base.frontLegoLEDs,
    rearLegoLEDs: overrides.rearLegoLEDs ?? base.rearLegoLEDs,
    flRGB: overrides.flRGB ?? base.flRGB,
    frRGB: overrides.frRGB ?? base.frRGB,
    blRGB: overrides.blRGB ?? base.blRGB,
    brRGB: overrides.brRGB ?? base.brRGB,
    motorLeft: clampInt(overrides.motorLeft ?? base.motorLeft, -1000, 1000),
    motorRight: clampInt(overrides.motorRight ?? base.motorRight, -1000, 1000),
    sound: clampInt(overrides.sound ?? base.sound, 0, 19),
    smallBottomRGB: overrides.smallBottomRGB ?? base.smallBottomRGB,
    smallBackRGB: overrides.smallBackRGB ?? base.smallBackRGB,
    buttonLEDs: overrides.buttonLEDs ?? overrides.buttonLEDS ?? base.buttonLEDs,
    receiverLED: clampInt(overrides.receiverLED ?? base.receiverLED, 0, 15),
    microphoneLED: overrides.microphoneLED ?? base.microphoneLED,
  };
}

function scheduleActuatorFlush() {
  if (actuatorSendTimer !== null) {
    return;
  }

  const elapsed = Date.now() - lastActuatorSendAt;
  const delay = Math.max(0, ACTUATOR_SEND_INTERVAL_MS - elapsed);

  actuatorSendTimer = setTimeout(() => {
    actuatorSendTimer = null;
    void flushActuatorData();
  }, delay);
}

async function flushActuatorData() {
  if (actuatorSendInFlight) {
    return;
  }

  const actuatorData = pendingActuatorData;
  if (!actuatorData) {
    return;
  }

  const t = getThymio();
  if (!t?.setActuatorState) {
    pendingActuatorData = null;
    return;
  }

  pendingActuatorData = null;
  actuatorSendInFlight = true;
  lastActuatorSendAt = Date.now();

  try {
    await t.setActuatorState(actuatorData);
  } catch (err) {
    console.error("Failed to send actuator data", err);
  } finally {
    actuatorSendInFlight = false;

    if (pendingActuatorData) {
      scheduleActuatorFlush();
    }
  }
}

function scheduleActuatorData(overrides = {}, { alertIfMissing = false } = {}) {
  latestActuatorData = buildActuatorData(overrides);

  const t = getThymio();
  if (!t?.setActuatorState) {
    if (alertIfMissing) alert("thymio not loaded");
    return;
  }

  pendingActuatorData = latestActuatorData;
  scheduleActuatorFlush();
}

function clearScheduledActuatorData() {
  if (actuatorSendTimer !== null) {
    clearTimeout(actuatorSendTimer);
    actuatorSendTimer = null;
  }

  pendingActuatorData = null;
}

function LedMatrixRow({ label, values, onChange }) {
  const normalizedValues = values.map((value) => clampInt(value, 0, 15));
  const allValue = Math.round(
    normalizedValues.reduce((total, value) => total + value, 0) / Math.max(1, normalizedValues.length)
  );

  function updateValue(index, value) {
    const next = [...normalizedValues];
    next[index] = clampInt(value, 0, 15);

    if (areIntensitiesEqual(next, normalizedValues)) {
      return;
    }

    onChange(next);
  }

  function updateAll(value) {
    const next = Array(normalizedValues.length).fill(clampInt(value, 0, 15));

    if (areIntensitiesEqual(next, normalizedValues)) {
      return;
    }

    onChange(next);
  }

  return (
    <div className="led-matrix-row">
      <div className="led-matrix-label">{label}</div>
      <input
        aria-label={`${label} all LED intensity`}
        max="15"
        min="0"
        onChange={(e) => updateAll(parseInt(e.target.value, 10))}
        type="range"
        value={allValue}
      />
      <div className="led-matrix-cells">
        {Array.from({ length: 8 }, (_, index) => {
          const value = normalizedValues[index];

          return (
            <label className={`led-matrix-cell ${value === undefined ? "empty" : ""}`} key={index}>
              <span>{index + 1}</span>
              {value === undefined ? (
                <span className="led-matrix-placeholder" />
              ) : (
                <>
                  <input
                    aria-label={`${label} LED ${index + 1} intensity`}
                    max="15"
                    min="0"
                    onChange={(e) => updateValue(index, parseInt(e.target.value, 10))}
                    type="range"
                    value={value}
                  />
                  <strong>{value}</strong>
                </>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function LedMatrix({ rows }) {
  return (
    <div className="actuator-block led-matrix">
      <div className="grid-title">LED intensity</div>
      <div className="led-matrix-header">
        <span />
        <span>All</span>
        <span>1</span>
        <span>2</span>
        <span>3</span>
        <span>4</span>
        <span>5</span>
        <span>6</span>
        <span>7</span>
        <span>8</span>
      </div>
      <div className="led-matrix-body">
        {rows.map((row) => (
          <LedMatrixRow key={row.label} {...row} />
        ))}
      </div>
    </div>
  );
}

function rgb15ToRgb255(rgb) {
  return {
    r: clampInt(rgb.r, 0, 15) * 17,
    g: clampInt(rgb.g, 0, 15) * 17,
    b: clampInt(rgb.b, 0, 15) * 17,
  };
}

function rgb255ToRgb15(rgb) {
  return {
    r: clampInt(Math.round(rgb.r / 17), 0, 15),
    g: clampInt(Math.round(rgb.g / 17), 0, 15),
    b: clampInt(Math.round(rgb.b / 17), 0, 15),
  };
}

function normalizeRgb255(rgb) {
  return {
    r: clampInt(Math.round(rgb.r), 0, 255),
    g: clampInt(Math.round(rgb.g), 0, 255),
    b: clampInt(Math.round(rgb.b), 0, 255),
  };
}

function RgbChip({ label, rgb, onChange }) {
  const [draftPickerRgb, setDraftPickerRgb] = useState(null);
  const draftRgb = draftPickerRgb === null ? null : rgb255ToRgb15(draftPickerRgb);
  const hasValidDraft = draftRgb !== null && areRgbEqual(draftRgb, rgb);
  const pickerRgb = hasValidDraft ? draftPickerRgb : rgb15ToRgb255(rgb);
  const displayedRgb = hasValidDraft ? draftRgb : rgb;

  function updateRgb(value) {
    const nextPickerRgb = normalizeRgb255(value);
    const nextRgb = rgb255ToRgb15(nextPickerRgb);

    setDraftPickerRgb(nextPickerRgb);

    if (areRgbEqual(nextRgb, rgb)) {
      return;
    }

    onChange(nextRgb);
  }

  return (
    <div className="rgb-chip">
      <span className="rgb-chip-header">
        <span className="rgb-chip-swatch" style={{ backgroundColor: rgbToCss(displayedRgb) }} />
        <span>{label}</span>
        <span className="rgb-chip-values">R {displayedRgb.r} G {displayedRgb.g} B {displayedRgb.b}</span>
      </span>
      <RgbColorPicker
        aria-label={`${label} colour`}
        color={pickerRgb}
        onChange={updateRgb}
      />
    </div>
  );
}

function ReceiverLedSlider({ receiverLED, onChange }) {
  const normalizedValue = clampInt(receiverLED, 0, 15);

  function updateValue(value) {
    const nextValue = clampInt(parseInt(value, 10), 0, 15);

    if (nextValue === normalizedValue) {
      return;
    }

    onChange(nextValue);
  }

  return (
    <>
      <input
        aria-label="Receiver LED intensity"
        max="15"
        min="0"
        onChange={(e) => updateValue(e.target.value)}
        type="range"
        value={normalizedValue}
      />
      <strong>{normalizedValue}</strong>
    </>
  );
}

function RgbCluster({ items }) {
  return (
    <div className="actuator-block rgb-cluster">
      <div className="grid-title">RGB LEDs</div>
      <div className="rgb-chip-grid">
        {items.map((item) => (
          <RgbChip key={item.label} {...item} />
        ))}
      </div>
    </div>
  );
}

export default function ActuatorPanel() {
  const [circleLEDs, setCircleLEDs] = useState(latestActuatorData.circleLEDs);
  const [frontLegoLEDs, setFrontLegoLEDs] = useState(latestActuatorData.frontLegoLEDs);
  const [rearLegoLEDs, setRearLegoLEDs] = useState(latestActuatorData.rearLegoLEDs);
  const [flRGB, setFlRGB] = useState(latestActuatorData.flRGB);
  const [frRGB, setFrRGB] = useState(latestActuatorData.frRGB);
  const [blRGB, setBlRGB] = useState(latestActuatorData.blRGB);
  const [brRGB, setBrRGB] = useState(latestActuatorData.brRGB);
  const [motorLeft, setMotorLeft] = useState(latestActuatorData.motorLeft);
  const [motorRight, setMotorRight] = useState(latestActuatorData.motorRight);
  const [sound, setSound] = useState(latestActuatorData.sound);
  const [smallBottomRGB, setSmallBottomRGB] = useState(latestActuatorData.smallBottomRGB);
  const [smallBackRGB, setSmallBackRGB] = useState(latestActuatorData.smallBackRGB);
  const [buttonLEDS, setButtonLEDS] = useState(latestActuatorData.buttonLEDs);
  const [receiverLED, setReceiverLED] = useState(latestActuatorData.receiverLED);
  const [microphoneLED, setMicrophoneLED] = useState(latestActuatorData.microphoneLED);

  useEffect(() => {
    return () => {
      clearScheduledActuatorData();
    };
  }, []);

  function updateRgbFromSlider(key, setRgb) {
    return (rgb) => {
      setRgb(rgb);
      scheduleActuatorData({ [key]: rgb });
    };
  }

  function updateLedIntensitiesFromSlider(key, setValues) {
    return (values) => {
      setValues(values);
      scheduleActuatorData({ [key]: values });
    };
  }

  function updateMotorsFromSlider(values) {
    if (typeof values.motorLeft === "number") setMotorLeft(values.motorLeft);
    if (typeof values.motorRight === "number") setMotorRight(values.motorRight);
    scheduleActuatorData(values);
  }

  function updateSoundFromPicker(value) {
    const nextSound = clampInt(value, 0, 19);
    setSound(nextSound);
    scheduleActuatorData({ sound: nextSound });
  }

  function applyPreset(preset) {
    if (preset.circleLEDs) setCircleLEDs(preset.circleLEDs);
    if (preset.frontLegoLEDs) setFrontLegoLEDs(preset.frontLegoLEDs);
    if (preset.rearLegoLEDs) setRearLegoLEDs(preset.rearLegoLEDs);

    if (preset.flRGB) setFlRGB(preset.flRGB);
    if (preset.frRGB) setFrRGB(preset.frRGB);
    if (preset.blRGB) setBlRGB(preset.blRGB);
    if (preset.brRGB) setBrRGB(preset.brRGB);

    if (typeof preset.motorLeft === "number") setMotorLeft(preset.motorLeft);
    if (typeof preset.motorRight === "number") setMotorRight(preset.motorRight);
    if (typeof preset.sound === "number") setSound(preset.sound);
    if (preset.smallBottomRGB) setSmallBottomRGB(preset.smallBottomRGB);
    if (preset.smallBackRGB) setSmallBackRGB(preset.smallBackRGB);
    if (preset.buttonLEDS) setButtonLEDS(preset.buttonLEDS);
    if (typeof preset.receiverLED === "number") setReceiverLED(preset.receiverLED);
    if (typeof preset.microphoneLED === "boolean") setMicrophoneLED(preset.microphoneLED);

    scheduleActuatorData(preset);
  }

  return (
    <div className="tab-stack">
      <div className="preset-bar">
        <div className="preset-title">Presets</div>

        <div className="preset-buttons">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="secondary"
              onClick={() => applyPreset(p.data)}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="actuator-top-grid">
        <div className="actuator-block motor-block">
          <MotorSliders left={motorLeft} right={motorRight} onChange={updateMotorsFromSlider} />
        </div>

        <div className="actuator-block compact-actuator-card">
          <div className="grid-title">Sound & misc</div>
          <div className="actuator-field-row">
            <label className="compact-field">
              <span>Sound</span>
              <select
                aria-label="Sound"
                onChange={(e) => updateSoundFromPicker(parseInt(e.target.value, 10))}
                value={sound}
              >
                {Array.from({ length: 20 }, (_, value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className="compact-field grow">
              <span>Receiver</span>
              <ReceiverLedSlider
                receiverLED={receiverLED}
                onChange={(nextReceiverLED) => {
                  setReceiverLED(nextReceiverLED);
                  scheduleActuatorData({ receiverLED: nextReceiverLED });
                }}
              />
            </label>

            <label className="extra-actuator-toggle compact-toggle">
              <input
                checked={microphoneLED}
                type="checkbox"
                onChange={(e) => {
                  setMicrophoneLED(e.target.checked);
                  scheduleActuatorData({ microphoneLED: e.target.checked });
                }}
              />
              <span>Mic {microphoneLED ? "On" : "Off"}</span>
            </label>
          </div>
        </div>
      </div>

      <LedMatrix
        rows={[
          {
            label: "Circle",
            values: circleLEDs,
            onChange: updateLedIntensitiesFromSlider("circleLEDs", setCircleLEDs),
          },
          {
            label: "Front",
            values: frontLegoLEDs,
            onChange: updateLedIntensitiesFromSlider("frontLegoLEDs", setFrontLegoLEDs),
          },
          {
            label: "Rear",
            values: rearLegoLEDs,
            onChange: updateLedIntensitiesFromSlider("rearLegoLEDs", setRearLegoLEDs),
          },
          {
            label: "Button",
            values: buttonLEDS,
            onChange: (values) => {
              setButtonLEDS(values);
              scheduleActuatorData({ buttonLEDs: values });
            },
          },
        ]}
      />

      <RgbCluster
        items={[
          { label: "FL", rgb: flRGB, onChange: updateRgbFromSlider("flRGB", setFlRGB) },
          { label: "FR", rgb: frRGB, onChange: updateRgbFromSlider("frRGB", setFrRGB) },
          { label: "BL", rgb: blRGB, onChange: updateRgbFromSlider("blRGB", setBlRGB) },
          { label: "BR", rgb: brRGB, onChange: updateRgbFromSlider("brRGB", setBrRGB) },
          {
            label: "Bottom",
            rgb: smallBottomRGB,
            onChange: (rgb) => {
              setSmallBottomRGB(rgb);
              scheduleActuatorData({ smallBottomRGB: rgb });
            },
          },
          {
            label: "Back",
            rgb: smallBackRGB,
            onChange: (rgb) => {
              setSmallBackRGB(rgb);
              scheduleActuatorData({ smallBackRGB: rgb });
            },
          },
        ]}
      />
    </div>
  );
}
