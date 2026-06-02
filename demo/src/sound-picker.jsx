import "./sound-picker.css";

const SOUNDS = Array.from({ length: 20 }, (_, sound) => sound);

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.min(max, Math.max(min, x));
}

export default function SoundPicker({ value, onChange }) {
  const selectedSound = clampInt(value, 0, 19);

  return (
    <div className="grid-block sound-picker">
      <div className="grid-title">Sound</div>
      <div className="sound-grid">
        {SOUNDS.map((sound) => (
          <button
            className={`sound-button ${selectedSound === sound ? "selected" : ""}`}
            key={sound}
            type="button"
            onClick={() => onChange(sound)}
          >
            {sound}
          </button>
        ))}
      </div>
    </div>
  );
}
