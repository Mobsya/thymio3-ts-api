import { useState } from "react";
import "./led-intensity-sliders.css";
import { clampInt } from "./utils";

function areIntensitiesEqual(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => clampInt(value, 0, 15) === clampInt(right[index], 0, 15))
  );
}

export default function LedIntensitySliders({ label, values, onChange }) {
  const [draftValues, setDraftValues] = useState(null);
  const displayedValues = draftValues ?? values;

  function updateDraftValue(index, value) {
    setDraftValues((currentValues) => {
      const next = [...(currentValues ?? values)];
      next[index] = clampInt(value, 0, 15);
      return next;
    });
  }

  function commitValue(index, value) {
    const next = [...displayedValues];
    next[index] = clampInt(value, 0, 15);
    setDraftValues(null);

    if (areIntensitiesEqual(next, values)) {
      return;
    }

    onChange(next);
  }

  return (
    <div className="grid-block led-intensity-sliders">
      <div className="grid-title">{label}</div>
      <div className="led-intensity-list">
        {displayedValues.map((value, index) => {
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
                onChange={(e) => updateDraftValue(index, parseInt(e.target.value, 10))}
                onBlur={(e) => commitValue(index, parseInt(e.currentTarget.value, 10))}
                onKeyUp={(e) => commitValue(index, parseInt(e.currentTarget.value, 10))}
                onPointerUp={(e) => commitValue(index, parseInt(e.currentTarget.value, 10))}
              />
              <span className="led-intensity-value">{intensity}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
