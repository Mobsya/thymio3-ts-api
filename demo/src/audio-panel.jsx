import { useState } from "react";
import { clampInt } from "./utils";
import "./audio-panel.css";

function getThymio() {
  return window.thymio;
}

export default function AudioPanel() {
  const [audioFreq, setAudioFreq] = useState(0);
  const [audioFreqDuration, setAudioFreqDuration] = useState(0);

  async function playFrequency() {
    const t = getThymio();
    if (!t?.playFrequency) return;
    await t.playFrequency(clampInt(audioFreq, 0, 3000), clampInt(audioFreqDuration, 0, 1000));
  }

  return (
    <div className="compact-group audio-panel">
      <div className="grid-title">Audio</div>

      <div className="row wrap">
        <div className="audio-transport-group" aria-label="Audio playback controls">
          <button className="secondary audio-transport-button" onClick={() => getThymio()?.playAudioFile?.()}>
            <span className="audio-transport-icon" aria-hidden="true">▶</span>
            <span>Play</span>
          </button>
          <button className="secondary audio-transport-button" onClick={() => getThymio()?.stopAudioFile?.()}>
            <span className="audio-transport-icon" aria-hidden="true">■</span>
            <span>Stop</span>
          </button>
          <button className="secondary audio-transport-button" onClick={() => getThymio()?.recordAudio?.(3)}>
            <span className="audio-transport-icon record" aria-hidden="true">●</span>
            <span>Record (3s)</span>
          </button>
        </div>
      </div>

      <div className="audio-frequency-controls">
        <label className="audio-slider-field">
          <span className="audio-slider-header">
            <span>Frequency</span>
            <strong>{audioFreq} Hz</strong>
          </span>
          <input
            type="range"
            min={0}
            max={3000}
            step={10}
            value={audioFreq}
            onChange={(e) => setAudioFreq(parseInt(e.target.value, 10) || 0)}
          />
          <span className="audio-frequency-help">0 to 3 KHz</span>
        </label>
        <label className="audio-slider-field">
          <span className="audio-slider-header">
            <span>Duration</span>
            <strong>{audioFreqDuration === 0 ? "Forever" : `${audioFreqDuration} tenths`}</strong>
          </span>
          <input
            type="range"
            min={0}
            max={1000}
            value={audioFreqDuration}
            onChange={(e) => setAudioFreqDuration(parseInt(e.target.value, 10) || 0)}
          />
          <span className="audio-frequency-help">0 plays forever</span>
        </label>
        <button className="audio-play-frequency-button" onClick={playFrequency}>
          Play Frequency
        </button>
      </div>
    </div>
  );
}
