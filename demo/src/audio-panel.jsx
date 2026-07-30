import { useEffect, useRef, useState } from "react";
import ProgressBar from "./progress-bar";
import { clampInt } from "./utils";
import "./audio-panel.css";

function getThymio() {
  return window.thymio;
}

export default function AudioPanel() {
  const audioFileRef = useRef(null);
  const [audioFreq, setAudioFreq] = useState(0);
  const [audioFreqDuration, setAudioFreqDuration] = useState(0);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);

  useEffect(() => {
    const onAudioProgress = (event) => setAudioUploadProgress(clampInt(event.detail?.percentage ?? 0, 0, 100));

    document.addEventListener("thymio-audio-upload-progress", onAudioProgress);

    return () => {
      document.removeEventListener("thymio-audio-upload-progress", onAudioProgress);
    };
  }, []);

  async function uploadAudioFile() {
    const t = getThymio();
    const file = audioFileRef.current?.files?.[0];
    if (!t?.uploadAudioFile) return;
    if (!file) return alert("Pick an audio file first");
    setAudioUploadProgress(0);
    await t.uploadAudioFile(file);
  }

  async function playFrequency() {
    const t = getThymio();
    if (!t?.playFrequency) return;
    await t.playFrequency(clampInt(audioFreq, 0, 3000), clampInt(audioFreqDuration, 0, 1000));
  }

  return (
    <div className="compact-group audio-panel maintenance-module audio-module">
      <div className="grid-title maintenance-title">Audio</div>

      <div className="audio-subpanel-grid">
        <div className="audio-subpanel maintenance-submodule">
          <div className="subhead">Audio file upload</div>
          <div className="audio-upload-controls">
            <div className="row wrap">
              <input ref={audioFileRef} type="file" accept="audio/wav,audio/mpeg,.wav,.mp3" />
              <button onClick={uploadAudioFile}>Upload audio file</button>
            </div>
            <ProgressBar value={audioUploadProgress} />
          </div>
        </div>

        <div className="audio-subpanel maintenance-submodule">
          <div className="subhead">Audio actions</div>
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

        <div className="audio-subpanel audio-frequency-panel maintenance-submodule">
          <div className="subhead">Frequency play</div>
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
      </div>
    </div>
  );
}
