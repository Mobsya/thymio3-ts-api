import { useEffect, useState } from "react";
import { RgbColorPicker } from "react-colorful";
import { PRESETS } from "./presets";
import MotorSliders from "./motor-sliders";
import { buildActuatorData, clearScheduledActuatorData } from "./actuator-state";
import { clampInt, rgbToCss, areIntensitiesEqual, areRgbEqual } from "./utils";
import "./actuator-panel.css";

const SOUND_OPTIONS = [
  { value: 0, label: "no sound" },
  { value: 1, label: "a3" },
  { value: 2, label: "alarm" },
  { value: 3, label: "b3" },
  { value: 4, label: "bad" },
  { value: 5, label: "beep" },
  { value: 6, label: "blop" },
  { value: 7, label: "bye" },
  { value: 8, label: "c3" },
  { value: 9, label: "d3" },
  { value: 10, label: "detect" },
  { value: 11, label: "e3" },
  { value: 12, label: "f3" },
  { value: 13, label: "fall" },
  { value: 14, label: "g3" },
  { value: 15, label: "good" },
  { value: 16, label: "magic" },
  { value: 17, label: "notify" },
  { value: 18, label: "ping" },
  { value: 19, label: "tick" },
];

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

export default function ActuatorPanel({ actuatorData, onActuatorDataChange }) {
  const normalizedActuatorData = buildActuatorData(actuatorData);
  const {
    circleLEDs,
    frontLegoLEDs,
    rearLegoLEDs,
    flRGB,
    frRGB,
    blRGB,
    brRGB,
    motorLeft,
    motorRight,
    sound,
    smallBottomRGB,
    smallBackRGB,
    buttonLEDs,
    receiverLED,
    microphoneLED,
  } = normalizedActuatorData;

  useEffect(() => {
    return () => {
      clearScheduledActuatorData();
    };
  }, []);

  function updateActuatorData(overrides) {
    onActuatorDataChange(buildActuatorData(overrides, normalizedActuatorData));
  }

  function updateRgbFromSlider(key) {
    return (rgb) => updateActuatorData({ [key]: rgb });
  }

  function updateLedIntensitiesFromSlider(key) {
    return (values) => updateActuatorData({ [key]: values });
  }

  function updateMotorsFromSlider(values) {
    updateActuatorData(values);
  }

  function updateSoundFromPicker(value) {
    const nextSound = clampInt(value, 0, 19);
    updateActuatorData({ sound: nextSound });
  }

  function applyPreset(preset) {
    updateActuatorData(preset);
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
                {SOUND_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="compact-field grow">
              <span>Receiver</span>
              <ReceiverLedSlider
                receiverLED={receiverLED}
                onChange={(nextReceiverLED) => updateActuatorData({ receiverLED: nextReceiverLED })}
              />
            </label>

            <label className="extra-actuator-toggle compact-toggle">
              <input
                checked={microphoneLED}
                type="checkbox"
                onChange={(e) => updateActuatorData({ microphoneLED: e.target.checked })}
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
            onChange: updateLedIntensitiesFromSlider("circleLEDs"),
          },
          {
            label: "Front",
            values: frontLegoLEDs,
            onChange: updateLedIntensitiesFromSlider("frontLegoLEDs"),
          },
          {
            label: "Rear",
            values: rearLegoLEDs,
            onChange: updateLedIntensitiesFromSlider("rearLegoLEDs"),
          },
          {
            label: "Button",
            values: buttonLEDs,
            onChange: updateLedIntensitiesFromSlider("buttonLEDs"),
          },
        ]}
      />

      <RgbCluster
        items={[
          { label: "FL", rgb: flRGB, onChange: updateRgbFromSlider("flRGB") },
          { label: "FR", rgb: frRGB, onChange: updateRgbFromSlider("frRGB") },
          { label: "BL", rgb: blRGB, onChange: updateRgbFromSlider("blRGB") },
          { label: "BR", rgb: brRGB, onChange: updateRgbFromSlider("brRGB") },
          {
            label: "Bottom",
            rgb: smallBottomRGB,
            onChange: updateRgbFromSlider("smallBottomRGB"),
          },
          {
            label: "Back",
            rgb: smallBackRGB,
            onChange: updateRgbFromSlider("smallBackRGB"),
          },
        ]}
      />
    </div>
  );
}
