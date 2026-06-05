import "./led-intensity-sliders.css";
import { clampInt } from "./utils";

export default function LedIntensitySliders({ label, values, onChange }) {
  function updateValue(index, value) {
    const next = [...values];
    next[index] = clampInt(value, 0, 15);
    onChange(next);
  }

  return (
    <div className="grid-block led-intensity-sliders">
      <div className="grid-title">{label}</div>
      <div className="led-intensity-list">
        {values.map((value, index) => {
          const intensity = clampInt(value, 0, 15);

          return (
            <label className="led-intensity-slider" key={index}>
              <span className="led-intensity-label">LED {index + 1}</span>
              <input
                aria-label={`${label} LED ${index + 1} intensity`}
                className="led-intensity-range"
                type="range"
                min="0"
                max="15"
                value={intensity}
                onChange={(e) => updateValue(index, parseInt(e.target.value, 10))}
              />
              <span className="led-intensity-value">{intensity}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
