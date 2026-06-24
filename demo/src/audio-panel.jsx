import { useEffect, useRef, useState } from "react";
import ProgressBar from "./progress-bar";
import { clampInt } from "./utils";
import "./audio-panel.css";

function getThymio() {
  return window.thymio;
}

export default function AudioPanel() {
  const audioRef = useRef(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioFreq, setAudioFreq] = useState(0);
  const [audioFreqDuration, setAudioFreqDuration] = useState(0);

  useEffect(() => {
    const onAudioProgress = (event) => setAudioProgress(clampInt(event.detail?.percentage ?? 0, 0, 100));

    document.addEventListener("thymio-audio-upload-progress", onAudioProgress);

    return () => {
      document.removeEventListener("thymio-audio-upload-progress", onAudioProgress);
    };
  }, []);

  async function uploadAudio() {
    const t = getThymio();
    const file = audioRef.current?.files?.[0];
    if (!t?.uploadAudioFile) return;
    if (!file) return alert("Pick an audio file first");
    setAudioProgress(0);
    await t.uploadAudioFile(file);
  }

  async function playFrequency() {
    const t = getThymio();
    if (!t?.playFrequency) return;
    await t.playFrequency(clampInt(audioFreq, 0, 300), clampInt(audioFreqDuration, 0, 1000));
  }

  return (
    <div className="compact-group">
      <div className="grid-title">Audio</div>
      <div className="row wrap">
        <input ref={audioRef} type="file" />
        <button onClick={uploadAudio}>Upload Audio file</button>
        <button className="secondary" onClick={() => getThymio()?.playAudioFile?.()}>
          Play
        </button>
        <button className="secondary" onClick={() => getThymio()?.stopAudioFile?.()}>
          Stop
        </button>
        <button className="secondary" onClick={() => getThymio()?.recordAudio?.(3)}>
          Record (3s)
        </button>
      </div>

      <div className="subhead">Upload progress</div>
      <ProgressBar value={audioProgress} />

      <div className="row wrap">
        <input
          type="number"
          min={0}
          max={300}
          value={audioFreq}
          onChange={(e) => setAudioFreq(parseInt(e.target.value, 10) || 0)}
          placeholder="frequency"
        />
        <input
          type="number"
          min={0}
          max={1000}
          value={audioFreqDuration}
          onChange={(e) => setAudioFreqDuration(parseInt(e.target.value, 10) || 0)}
          placeholder="duration"
        />
        <button onClick={playFrequency}>Play Frequency</button>
      </div>
    </div>
  );
}
