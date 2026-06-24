import { clampInt } from "./utils";
import "./progress-bar.css";

export default function ProgressBar({ value }) {
  const pct = clampInt(value ?? 0, 0, 100);

  return (
    <div className="progress-container">
      <div className="progress-bar" style={{ width: `${pct}%` }}>
        {pct}%
      </div>
    </div>
  );
}
