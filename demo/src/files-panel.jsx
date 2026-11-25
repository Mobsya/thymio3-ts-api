import { useCallback, useEffect, useRef, useState } from 'react';
import { session, useSession } from './use-session';
import { Confirm } from './ui';
import FileDropZone from './file-drop-zone';
import { formatBytes } from './utils';
import './files-panel.css';

function FlashUsage({ listing, free }) {
  const stored = listing?.reduce((sum, row) => sum + row.size, 0);
  const total = Number.isFinite(stored) && Number.isFinite(free) ? stored + free : 0;
  const amounts = `Stored files ${formatBytes(stored)}, free ${formatBytes(free)}`;

  return <div className="flash-usage" role="group" aria-label="Flash storage">
    <div className="flash-amounts">
      <span>Stored files <strong>{formatBytes(stored)}</strong></span>
      <span>Free <strong>{formatBytes(free)}</strong></span>
    </div>
    {total > 0
      ? <div className="flash-track measured" role="meter" aria-label="Flash storage used by listed files"
          aria-valuemin={0} aria-valuemax={total} aria-valuenow={stored} aria-valuetext={amounts}>
          <div className="flash-used" style={{ width: `${100 * stored / total}%` }} />
        </div>
      : <div className="flash-track" aria-hidden="true" />}
  </div>;
}

function TransferProgress({ progress }) {
  return <label className="progress-label">Transfer · {Math.round(progress)}%
    <progress value={progress} max="100" />
  </label>;
}

export default function FilesPanel({ disabled, active, flashFree }) {
  const s = useSession();
  const [listing, setListing] = useState(null);
  const [file, setFile] = useState(null);
  const [uploadedName, setUploadedName] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const loadedConnection = useRef(false);
  const connected = s.connection === 'connected';
  const nameTooLong = uploadedName !== null && new TextEncoder().encode(uploadedName).length > 29;

  const readListing = useCallback(async (api, valid) => {
    try {
      const rows = await api.listFiles();
      if (valid()) setListing(rows);
    } catch (error) {
      if (valid()) setListing(null);
      throw error;
    }
  }, []);
  const refresh = useCallback(() => session.perform('Refresh files', readListing), [readListing]);

  useEffect(() => {
    if (!connected) {
      loadedConnection.current = false;
      return;
    }
    if (!active || disabled || loadedConnection.current) return;
    loadedConnection.current = true;
    void refresh();
  }, [connected, active, disabled, refresh]);

  useEffect(() => {
    function reset(event) {
      if (event.detail) return;
      loadedConnection.current = false;
      setListing(null);
      setUploadedName(null);
      setTransfer(null);
      setConfirmation(null);
    }
    document.addEventListener('thymio-connected', reset);
    return () => document.removeEventListener('thymio-connected', reset);
  }, []);

  function selectFile(nextFile) {
    if (!nextFile) return;
    setFile(nextFile);
    setTransfer(null);
  }

  async function trackTransfer(direction, valid, action) {
    const eventName = `thymio-file-${direction}-progress`;
    const update = progress => {
      if (valid()) setTransfer({ direction, progress });
    };
    const onProgress = event => update(Math.max(0, Math.min(100, event.detail.percentage)));
    update(0);
    document.addEventListener(eventName, onProgress);
    try {
      const result = await action();
      update(100);
      return result;
    } catch (error) {
      if (valid()) setTransfer(null);
      throw error;
    } finally {
      document.removeEventListener(eventName, onProgress);
    }
  }

  function upload() {
    if (!file) return;
    return session.perform('Upload file', async (api, valid) => {
      setUploadedName(null);
      await trackTransfer('upload', valid, () => api.uploadFile(file));
      if (valid()) setUploadedName(file.name);
    });
  }

  function save() {
    return session.perform('Save file', async (api, valid) => {
      await api.saveFile(uploadedName);
      if (!valid()) return;
      setUploadedName(null);
      await readListing(api, valid);
    });
  }

  function download(name) {
    return session.perform('Download file', async (api, valid) => {
      const bytes = await trackTransfer('download', valid, () => api.downloadFile(name));
      if (!valid()) return;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function remove(name) {
    return session.perform(name ? 'Delete file' : 'Erase files', async (api, valid) => {
      if (name) await api.deleteFile(name);
      else await api.eraseAllFiles();
      if (valid()) await readListing(api, valid);
    });
  }

  function freeRam() {
    return session.perform('Free RAM', async (api, valid) => {
      await api.freeMemory();
      if (valid()) setUploadedName(null);
    });
  }

  return <div className="files-panel">
    <div className="section-heading">
      <h2>Files</h2>
      <button className="secondary" disabled={disabled} onClick={refresh}>Refresh</button>
    </div>
    <section aria-labelledby="stored-files-heading">
      <div className="section-heading">
        <h3 id="stored-files-heading">Stored files</h3>
        <span className="muted">{listing ? `${listing.length} ${listing.length === 1 ? 'file' : 'files'}` : 'Not loaded'}</span>
      </div>
      {listing?.length ? <div className="file-list">
        {listing.map(row => <div className="file-row" key={row.name}>
          <div><strong>{row.name}</strong><small>{row.size.toLocaleString()} bytes</small></div>
          <div className="row">
            <button className="secondary" disabled={disabled} onClick={() => download(row.name)}>Download</button>
            <button className="danger-quiet" disabled={disabled} onClick={() => setConfirmation({ name: row.name })}>Delete</button>
          </div>
        </div>)}
      </div> : <div className="empty-state">{listing ? 'No files in robot storage.' : 'Connect a robot and refresh to view stored files.'}</div>}
      <FlashUsage listing={listing} free={flashFree} />
      <div className="row wrap">
        <button className="danger-quiet" disabled={disabled} onClick={() => setConfirmation({ name: null })}>Delete all files</button>
        <button className="secondary" disabled={disabled} onClick={freeRam}>Free RAM</button>
      </div>
      {transfer?.direction === 'download' && <TransferProgress progress={transfer.progress} />}
    </section>
    <section className="upload-card" aria-labelledby="file-upload-heading">
      <h3 id="file-upload-heading">Upload file</h3>
      <FileDropZone file={file} onSelect={selectFile} disabled={disabled} />
      <div className="row wrap">
        <button disabled={disabled || !file} onClick={upload}>Upload file</button>
        <button className="secondary" disabled={disabled || !uploadedName || nameTooLong}
          aria-describedby={uploadedName ? 'pending-file-name' : undefined} onClick={save}>Save to storage</button>
        <span className="muted pending-file" id="pending-file-name" role="status">{uploadedName && `In RAM: ${uploadedName}`}</span>
      </div>
      {nameTooLong && <p>Rename the local file to fit within 29 UTF-8 bytes, then upload it again to save it.</p>}
      {transfer?.direction === 'upload' && <TransferProgress progress={transfer.progress} />}
    </section>
    {confirmation && <Confirm title={confirmation.name ? `Delete ${confirmation.name}?` : 'Delete all stored files?'}
      onClose={() => setConfirmation(null)} onConfirm={() => remove(confirmation.name)}>
      This permanently removes {confirmation.name ? 'this file' : 'all files'} from robot storage.
    </Confirm>}
  </div>;
}
