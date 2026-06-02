import "./colour-slider.css";
import { clampInt } from "./utils";

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

export default function ColourSlider({ label, rgb, onChange }) {
  const hue = rgb15ToHue(rgb);

  function handleChange(e) {
    const nextHue = clampInt(parseInt(e.target.value, 10), 0, 360);
    onChange(hueToRgb15(nextHue));
  }

  return (
    <fieldset className="fieldset colour-slider">
      <legend>{label}</legend>
      <div className="colour-slider-row">
        <span className="colour-swatch" style={{ backgroundColor: rgbToCss(rgb) }} />
        <input
          aria-label={`${label} colour`}
          className="colour-range"
          type="range"
          min="0"
          max="360"
          value={hue}
          onChange={handleChange}
        />
      </div>
      <div className="colour-values">
        <span>R {rgb.r}</span>
        <span>G {rgb.g}</span>
        <span>B {rgb.b}</span>
      </div>
    </fieldset>
  );
}
