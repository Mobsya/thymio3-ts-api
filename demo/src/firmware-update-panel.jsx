import { useEffect, useState } from 'react';
import { session, useSession } from './use-session';
export default function FirmwareUpdatePanel({
  disabled
}) {
  const s = useSession();
  const [release, setRelease] = useState(null);
  const [checked, setChecked] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    const progress = e => setProgress(Math.max(0, Math.min(100, e.detail?.percentage ?? 0)));
    const reset = e => {
      if (!e.detail) {
        setRelease(null);
        setChecked(false);
      }
    };
    document.addEventListener('thymio-ota-upload-progress', progress);
    document.addEventListener('thymio-connected', reset);
    return () => {
      document.removeEventListener('thymio-ota-upload-progress', progress);
      document.removeEventListener('thymio-connected', reset);
    };
  }, []);
  function select(file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.bin')) {
      setFile(null);
      setError('Choose a .bin application firmware file.');
      return;
    }
    setError('');
    setFile(file);
  }
  async function check() {
    await session.perform('Check firmware', async (api, valid) => {
      const info = await api.isNewerFirmwareAvailable();
      if (valid()) {
        setRelease(info || null);
        setChecked(true);
      }
    });
  }
  async function update(isManual) {
    setManual(isManual);
    setProgress(0);
    await session.perform('Update firmware', async (api, valid) => {
      await api.stopSensorStreaming();
      if (!valid()) return;
      if (isManual) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (valid()) await api.uploadFirmware(bytes);
      } else await api.updateFirmware();
    }, {
      firmware: true
    });
    if (session.getSnapshot().connection === 'connected') void session.streaming(true);
  }
  return <section className="firmware-panel"><div className="section-heading"><h3>Firmware update</h3></div><p className="muted">The robot restarts after installation. Keep it powered on and nearby during transfer.</p>
    <div className="row wrap"><button disabled={disabled} onClick={check}>Check for updates</button><button className="secondary" disabled={disabled || !release} onClick={() => update(false)}>Install update</button></div>
    <p className="firmware-result">{checked ? release ? 'A newer release is available. Ready to download and verify.' : 'No newer firmware is available.' : 'Check for a newer compatible release.'}</p>
    <details className="advanced"><summary>Manual firmware update</summary><p className="muted">Select the application .bin image for Bluetooth OTA.</p><label className="drop-zone" onDragOver={e => e.preventDefault()} onDrop={e => {
        e.preventDefault();
        if (!disabled) select(e.dataTransfer.files[0]);
      }}>Drop a .bin file or browse<input disabled={disabled} type="file" accept=".bin" onChange={e => select(e.target.files[0])} /><span>{file?.name || 'No firmware selected'}</span></label>{error && <p className="error-box" role="alert">{error}</p>}<button disabled={disabled || !file} onClick={() => update(true)}>Install selected firmware</button></details>
    {(s.ota || progress > 0) && <label className="progress-label">Firmware transfer · {Math.round(progress)}%<progress max="100" value={progress} /></label>}
    {s.ota && manual && <button className="danger-quiet" onClick={session.cancelFirmware}>Cancel firmware upload</button>}
  </section>;
}
