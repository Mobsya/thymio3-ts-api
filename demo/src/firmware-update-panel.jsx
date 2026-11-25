import { useEffect, useState } from 'react';
import { session, useSession } from './use-session';
import FileDropZone from './file-drop-zone';

export default function FirmwareUpdatePanel({ disabled }) {
  const s = useSession();
  const [result, setResult] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const version = result?.version;
  const manual = s.busy === 'Install selected firmware';
  const checking = s.busy === 'Check firmware';

  useEffect(() => {
    function onProgress(event) {
      setProgress(Math.max(0, Math.min(100, event.detail.percentage)));
    }
    document.addEventListener('thymio-ota-upload-progress', onProgress);
    return () => document.removeEventListener('thymio-ota-upload-progress', onProgress);
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

  function check() {
    return session.perform('Check firmware', async (api, valid) => {
      setResult(null);
      const version = await api.getAvailableFirmwareVersion();
      if (valid()) setResult({ version });
    });
  }

  async function install(localFile) {
    let isCurrent;
    await session.perform(localFile ? 'Install selected firmware' : 'Update firmware', async (api, valid) => {
      isCurrent = valid;
      setProgress(0);
      try {
        await api.stopSensorStreaming();
        if (!valid()) return;
        if (localFile) {
          const bytes = new Uint8Array(await localFile.arrayBuffer());
          if (valid()) await api.uploadFirmware(bytes);
        } else {
          await api.updateFirmware({ expectedVersion: version });
        }
      } finally {
        if (valid()) setResult(null);
      }
    }, { firmware: true });
    if (isCurrent?.()) void session.streaming(true);
  }

  let action = 'Check for updates';
  if (checking) action = 'Checking…';
  else if (version && !manual) action = s.ota ? `Installing ${version}…` : `Install version ${version}`;

  const transfer = s.ota && <div className="firmware-transfer">
    <label className="progress-label">Firmware transfer · {Math.round(progress)}%
      <progress max="100" value={progress} />
    </label>
    <p>The robot restarts after installation. Keep it powered on and nearby during transfer.</p>
  </div>;

  return <>
    <section className="firmware-panel" aria-labelledby="firmware-update-heading">
      <h3 id="firmware-update-heading">Firmware update</h3>
      <div className="row wrap firmware-actions">
        <button disabled={disabled} onClick={version ? () => install() : check}>{action}</button>
        <span className="firmware-result" role="status">
          {result && !s.ota && (version ? `A new version ${version} is available` : "You're at the latest version")}
        </span>
      </div>
      {!manual && transfer}
    </section>
    <section className="upload-card" aria-labelledby="manual-firmware-heading">
      <h3 id="manual-firmware-heading">Manual firmware update</h3>
      <FileDropZone file={file} onSelect={select} disabled={disabled} accept=".bin" label="Firmware application file" />
      <div className="row wrap">
        <button disabled={disabled || !file} onClick={() => install(file)}>Install selected firmware</button>
        {manual && <button className="danger-quiet" onClick={session.cancelFirmware}>Cancel firmware upload</button>}
      </div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {manual && transfer}
    </section>
  </>;
}
