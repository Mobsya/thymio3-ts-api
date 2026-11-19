import { useEffect, useState } from 'react';
import { session } from './use-session';
export default function AudioPanel({
  disabled
}) {
  const [file, setFile] = useState(null);
  const [frequency, setFrequency] = useState(440);
  const [duration, setDuration] = useState(1);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    const update = e => {
      if (uploading) setProgress(Math.min(100, Math.max(0, e.detail?.percentage ?? 0)));
    };
    document.addEventListener('thymio-audio-upload-progress', update);
    return () => document.removeEventListener('thymio-audio-upload-progress', update);
  }, [uploading]);
  async function upload() {
    if (!file) return;
    setProgress(0);
    setUploading(true);
    const result = await session.perform('Upload audio', api => api.uploadAudioFile(file));
    if (result.ok) setProgress(100);
    setUploading(false);
  }
  return (
    <div className="audio-panel">
      <div className="audio-upload-row">
        <label className="file-field">Audio file
          <input disabled={disabled} type="file" accept=".wav,.mp3,audio/wav,audio/mpeg" onChange={e => setFile(e.target.files[0] || null)} />
        </label>
        <button disabled={disabled || !file} onClick={upload}>Upload</button>
      </div>
      <p className="muted audio-format">WAV / MP3 · mono · 12 kHz</p>
      {(uploading || progress > 0) && (
        <label className="progress-label">Audio upload · {Math.round(progress)}%<progress value={progress} max="100" /></label>
      )}
      <fieldset disabled={disabled} className="row wrap audio-transport">
        <button className="secondary" onClick={() => session.perform('Play audio', api => api.playAudioFile())}>▶ Play</button>
        <button className="secondary" onClick={() => session.perform('Stop audio', api => api.stopAudioFile())}>■ Stop audio</button>
        <button className="secondary" onClick={() => session.perform('Record audio', api => api.recordAudio(3))}>● Record 3s</button>
      </fieldset>
      <h3 className="spaced-heading">Frequency generator</h3>
      <fieldset disabled={disabled} className="frequency-grid">
        <label className="frequency-field">Frequency · {frequency} Hz
          <input type="range" min="0" max="3000" step="10" value={frequency} onChange={e => setFrequency(Number(e.target.value))} />
        </label>
        <label className="duration-field">Duration (s)
          <input type="number" min="0" max="100" step="0.1" value={duration} aria-describedby="duration-help" onChange={e => setDuration(Math.min(100, Math.max(0, Number(e.target.value))))} />
        </label>
        <button onClick={() => session.perform('Play frequency', api => api.playFrequency(frequency, Math.round(duration * 10)))}>Play tone</button>
      </fieldset>
      <p id="duration-help" className="muted duration-help">0 seconds = continuous</p>
    </div>
  );
}
