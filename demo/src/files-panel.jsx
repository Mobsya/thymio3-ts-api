import { useEffect, useRef, useState } from 'react';
import { session, useSession } from './use-session';
import { Confirm } from './ui';
export default function FilesPanel({
  disabled,
  active
}) {
  const s = useSession();
  const [listing, setListing] = useState(null);
  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  const [filename, setFilename] = useState('');
  const [progress, setProgress] = useState(0);
  const [confirmation, setConfirmation] = useState(null);
  const [transfer, setTransfer] = useState(false);
  const loadedConnection = useRef('');
  const input = useRef(null);
  const connected = s.connection === 'connected';
  useEffect(() => {
    if (!connected) {
      loadedConnection.current = '';
      return;
    }
    if (!active || disabled || loadedConnection.current) return;
    loadedConnection.current = s.deviceName || 'connected';
    void refresh();
  }, [connected, active, disabled, s.deviceName]);
  useEffect(() => {
    const reset = e => {
      if (!e.detail) {
        setListing(null);
        setUploaded(false);
        setProgress(0);
        setTransfer(false);
      }
    };
    document.addEventListener('thymio-connected', reset);
    return () => document.removeEventListener('thymio-connected', reset);
  }, []);
  useEffect(() => {
    if (!transfer) return;
    const update = e => setProgress(Math.max(0, Math.min(100, e.detail?.percentage ?? 0)));
    document.addEventListener('thymio-file-upload-progress', update);
    document.addEventListener('thymio-file-download-progress', update);
    return () => {
      document.removeEventListener('thymio-file-upload-progress', update);
      document.removeEventListener('thymio-file-download-progress', update);
    };
  }, [transfer]);
  async function refresh() {
    await session.perform('Refresh files', async (api, valid) => {
      const rows = await api.listFiles();
      if (valid()) setListing(rows);
    });
  }
  async function upload() {
    if (!file) return;
    setProgress(0);
    setTransfer(true);
    setUploaded(false);
    const result = await session.perform('Upload file', async (api, valid) => {
      await api.uploadFile(file);
      if (valid()) {
        setUploaded(true);
        setFilename(file.name);
        setProgress(100);
      }
    });
    setTransfer(false);
    if (result.ok) session.notify('Upload confirmed. The file is in RAM; save it to keep it in storage.');
  }
  async function save() {
    await session.perform('Save file', async (api, valid) => {
      await api.saveFile(filename.trim());
      if (!valid()) return;
      setUploaded(false);
      const rows = await api.listFiles();
      if (valid()) setListing(rows);
    });
  }
  async function download(name) {
    setProgress(0);
    setTransfer(true);
    await session.perform('Download file', async (api, valid) => {
      const bytes = await api.downloadFile(name);
      if (!valid()) return;
      const url = URL.createObjectURL(new Blob([bytes], {
        type: 'application/octet-stream'
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setProgress(100);
    });
    setTransfer(false);
  }
  async function remove(name) {
    await session.perform(name ? 'Delete file' : 'Erase files', async (api, valid) => {
      if (name) await api.deleteFile(name);else await api.eraseAllFiles();
      if (!valid()) return;
      const rows = await api.listFiles();
      if (valid()) setListing(rows);
    });
  }
  return <div>
    <div className="section-heading"><div><h2>Files</h2></div><button className="secondary" disabled={disabled} onClick={refresh}>Refresh</button></div>
    <div className="upload-card"><h3>1. Upload to RAM</h3><p className="muted">Choose a file from your computer. Uploading replaces the temporary file in RAM.</p><div className="row wrap"><label className="file-field">Local file<input ref={input} type="file" disabled={disabled} onChange={e => {
            setFile(e.target.files[0] || null);
            setUploaded(false);
          }} /></label><button disabled={disabled || !file} onClick={upload}>Upload file</button></div>
    {(transfer || progress > 0) && <label className="progress-label">Transfer · {Math.round(progress)}%<progress value={progress} max="100" /></label>}
    <h3>2. Save to storage</h3><div className="row wrap"><label>Filename<input value={filename} onChange={e => setFilename(e.target.value)} /></label><button disabled={disabled || !uploaded || !filename.trim()} onClick={save}>Save to storage</button></div><p className="muted">{uploaded ? 'Ready to save the uploaded file.' : 'Upload a file first to enable saving.'}</p></div>
    <div className="section-heading"><h3>Stored files</h3><span className="muted">{listing ? `${listing.length} files` : 'Not loaded'}</span></div>
    {listing?.length ? <div className="file-list">{listing.map(row => <div className="file-row" key={row.name}><div><strong>{row.name}</strong><small>{row.size.toLocaleString()} bytes</small></div><div className="row"><button className="secondary" disabled={disabled} onClick={() => download(row.name)}>Download</button><button className="danger-quiet" disabled={disabled} onClick={() => setConfirmation({
            name: row.name
          })}>Delete</button></div></div>)}</div> : <div className="empty-state">{listing ? 'No files in robot storage.' : 'Connect a robot and refresh to view stored files.'}</div>}
    <details className="advanced maintenance"><summary>Storage maintenance</summary><p>These actions remove stored files or release the temporary upload in RAM.</p><div className="row wrap"><button className="danger-quiet" disabled={disabled} onClick={() => setConfirmation({
          name: null
        })}>Delete all files</button><button className="secondary" disabled={disabled} onClick={() => session.perform('Free RAM', async (api, valid) => {
          await api.freeMemory();
          if (valid()) setUploaded(false);
        })}>Free RAM</button></div></details>
    {confirmation && <Confirm title={confirmation.name ? `Delete ${confirmation.name}?` : 'Delete all stored files?'} onClose={() => setConfirmation(null)} onConfirm={() => remove(confirmation.name)}>This permanently removes {confirmation.name ? 'this file' : 'all files'} from robot storage.</Confirm>}
  </div>;
}
