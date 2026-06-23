import { PRESETS } from "./presets";
import MotorSliders from "./motor-sliders";
import { clampInt } from "./utils";
import "./actuator-panel.css";

function rgbToCss(rgb) {
  const toHex = (value) => (clampInt(value, 0, 15) * 17).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function hueToRgb15(hue) {
  const h = ((clampInt(hue, 0, 360) % 360) + 360) % 360;
  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: clampInt(Math.round(r * 15), 0, 15),
    g: clampInt(Math.round(g * 15), 0, 15),
    b: clampInt(Math.round(b * 15), 0, 15),
  };
}

function rgb15ToHue(rgb) {
  const r = clampInt(rgb.r, 0, 15) / 15;
  const g = clampInt(rgb.g, 0, 15) / 15;
  const b = clampInt(rgb.b, 0, 15) / 15;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) return 0;
  if (max === r) return Math.round(60 * (((g - b) / delta + 6) % 6));
  if (max === g) return Math.round(60 * ((b - r) / delta + 2));
  return Math.round(60 * ((r - g) / delta + 4));
}

function LedMatrixRow({ label, values, onChange }) {
  const normalizedValues = values.map((value) => clampInt(value, 0, 15));
  const allValue = Math.round(
    normalizedValues.reduce((total, value) => total + value, 0) / Math.max(1, normalizedValues.length)
  );

  function updateValue(index, value) {
    const next = [...normalizedValues];
    next[index] = clampInt(value, 0, 15);
    onChange(next);
  }

  function updateAll(value) {
    onChange(Array(normalizedValues.length).fill(clampInt(value, 0, 15)));
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

function RgbChip({ label, rgb, onChange }) {
  const hue = rgb15ToHue(rgb);

  return (
    <label className="rgb-chip">
      <span className="rgb-chip-header">
        <span className="rgb-chip-swatch" style={{ backgroundColor: rgbToCss(rgb) }} />
        <span>{label}</span>
      </span>
      <input
        aria-label={`${label} colour`}
        className="rgb-chip-range"
        max="360"
        min="0"
        onChange={(e) => onChange(hueToRgb15(parseInt(e.target.value, 10)))}
        type="range"
        value={hue}
      />
      <span className="rgb-chip-values">R {rgb.r} G {rgb.g} B {rgb.b}</span>
    </label>
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

export default function ActuatorPanel({
  circleLEDs,
  frontLegoLEDs,
  rearLegoLEDs,
  buttonLEDS,
  flRGB,
  frRGB,
  blRGB,
  brRGB,
  smallBottomRGB,
  smallBackRGB,
  motorLeft,
  motorRight,
  sound,
  receiverLED,
  microphoneLED,
  onApplyPreset,
  onCircleLEDsChange,
  onFrontLegoLEDsChange,
  onRearLegoLEDsChange,
  onButtonLEDsChange,
  onFlRGBChange,
  onFrRGBChange,
  onBlRGBChange,
  onBrRGBChange,
  onSmallBottomRGBChange,
  onSmallBackRGBChange,
  onMotorsChange,
  onSoundChange,
  onReceiverLEDChange,
  onMicrophoneLEDChange,
}) {
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
              onClick={() => onApplyPreset(p.data)}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="actuator-top-grid">
        <div className="actuator-block motor-block">
          <MotorSliders left={motorLeft} right={motorRight} onChange={onMotorsChange} />
        </div>

        <div className="actuator-block compact-actuator-card">
          <div className="grid-title">Sound & misc</div>
          <div className="actuator-field-row">
            <label className="compact-field">
              <span>Sound</span>
              <select
                aria-label="Sound"
                onChange={(e) => onSoundChange(parseInt(e.target.value, 10))}
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
              <input
                aria-label="Receiver LED intensity"
                max="15"
                min="0"
                onChange={(e) => onReceiverLEDChange(clampInt(parseInt(e.target.value, 10), 0, 15))}
                type="range"
                value={clampInt(receiverLED, 0, 15)}
              />
              <strong>{clampInt(receiverLED, 0, 15)}</strong>
            </label>

            <label className="extra-actuator-toggle compact-toggle">
              <input
                checked={microphoneLED}
                type="checkbox"
                onChange={(e) => onMicrophoneLEDChange(e.target.checked)}
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
            onChange: onCircleLEDsChange,
          },
          {
            label: "Front",
            values: frontLegoLEDs,
            onChange: onFrontLegoLEDsChange,
          },
          {
            label: "Rear",
            values: rearLegoLEDs,
            onChange: onRearLegoLEDsChange,
          },
          {
            label: "Button",
            values: buttonLEDS,
            onChange: onButtonLEDsChange,
          },
        ]}
      />

      <RgbCluster
        items={[
          { label: "FL", rgb: flRGB, onChange: onFlRGBChange },
          { label: "FR", rgb: frRGB, onChange: onFrRGBChange },
          { label: "BL", rgb: blRGB, onChange: onBlRGBChange },
          { label: "BR", rgb: brRGB, onChange: onBrRGBChange },
          { label: "Bottom", rgb: smallBottomRGB, onChange: onSmallBottomRGBChange },
          { label: "Back", rgb: smallBackRGB, onChange: onSmallBackRGBChange },
        ]}
      />
    </div>
  );
}
