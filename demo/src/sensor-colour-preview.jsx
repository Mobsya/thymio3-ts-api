import "./sensor-colour-preview.css";
import { colorRawToRgb, getDetectedColour, hsvToRgb } from "./color-utils";

function hsvToRgbCss(colorSensor) {
  const rgb = hsvToRgb(colorSensor);
  if (!rgb) return null;

  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

function colorRawToRgbCss(colorRaw) {
  const rgb = colorRawToRgb(colorRaw);
  if (!rgb) return null;

  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

export default function SensorColourPreview({ mode, value, children }) {
  let backgroundColor;
  let label;
  let previewLabel;

  if (mode === "detected") {
    const colour = getDetectedColour(value);
    const status = value === null || value === undefined ? "Waiting" : colour?.name ?? "Unknown";
    backgroundColor = colour ? `rgb(${colour.rgb.r}, ${colour.rgb.g}, ${colour.rgb.b})` : null;
    previewLabel = `Detected colour preview · ${status}`;
    label = previewLabel;
  } else {
    backgroundColor = mode === "hsv" ? hsvToRgbCss(value) : colorRawToRgbCss(value);
    label = mode === "hsv" ? "Color HSV preview" : "Color raw preview";
    if (!backgroundColor) label += ": Waiting";
    previewLabel = `Colour preview${backgroundColor ? "" : " · Waiting"}`;
  }

  return (
    <div className="sensor-colour-preview-container">
      <div className="sensor-colour-preview-header">
        <span className="sensor-colour-preview-label">{previewLabel}</span>
        {children}
      </div>
      <span
        role="img"
        aria-label={label}
        className="sensor-colour-preview"
        style={{ backgroundColor: backgroundColor ?? "#f8fafc" }}
      />
    </div>
  );
}
