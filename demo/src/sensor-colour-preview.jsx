import "./sensor-colour-preview.css";
import { colorRawToRgb, hsvToRgb } from "./color-utils";

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

export default function SensorColourPreview({ mode, value }) {
  const backgroundColor = mode === "hsv" ? hsvToRgbCss(value) : colorRawToRgbCss(value);
  const label = mode === "hsv" ? "Color HSV preview" : "Color raw preview";

  return (
    <span
      aria-label={label}
      className="sensor-colour-preview"
      style={{ backgroundColor: backgroundColor ?? "#f8fafc" }}
    />
  );
}
