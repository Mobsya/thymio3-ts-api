import "./motor-sliders.css";
import { clampInt } from "./utils";

function MotorSlider({ label, value, onChange }) {
  const motorValue = clampInt(value, -1000, 1000);

  function handleChange(e) {
    onChange(clampInt(parseInt(e.target.value, 10), -1000, 1000));
  }

  return (
    <label className="motor-slider">
      <span className="motor-slider-label">{label}</span>
      <input
        aria-label={`${label} motor speed`}
        className="motor-range"
        type="range"
        min="-1000"
        max="1000"
        value={motorValue}
        onChange={handleChange}
      />
      <span className="motor-slider-value">{motorValue}</span>
    </label>
  );
}

export default function MotorSliders({ left, right, onChange }) {
  return (
    <div className="grid-block motor-sliders">
      <div className="grid-title">Motors</div>
      <div className="motor-slider-list">
        <MotorSlider label="Left" value={left} onChange={(motorLeft) => onChange({ motorLeft })} />
        <MotorSlider label="Right" value={right} onChange={(motorRight) => onChange({ motorRight })} />
      </div>
    </div>
  );
}
