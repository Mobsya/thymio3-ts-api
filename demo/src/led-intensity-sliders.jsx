import "./led-intensity-sliders.css";
import { clampInt } from "./utils";

function areIntensitiesEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => clampInt(value, 0, 15) === clampInt(right[index], 0, 15))
  );
}

export default function LedIntensitySliders({ label, values, onChange }) {
  const normalizedValues = values.map((value) => clampInt(value, 0, 15));

  function updateValue(index, value) {
    const next = [...normalizedValues];
    next[index] = clampInt(value, 0, 15);

    if (areIntensitiesEqual(next, normalizedValues)) {
      return;
    }

    onChange(next);
  }

  return (
    <div className="grid-block led-intensity-sliders">
      <div className="grid-title">{label}</div>
      <div className="led-intensity-list">
        {normalizedValues.map((intensity, index) => {
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
