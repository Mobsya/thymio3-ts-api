import { useEffect, useRef, useState } from "react";
import ProgressBar from "./progress-bar";
import { clampInt } from "./utils";
import "./files-panel.css";

function getThymio() {
  return window.thymio;
}

export default function FilesPanel() {
  const fileUploadRef = useRef(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [fileDownloadName, setFileDownloadName] = useState("");
  const [filename, setFilename] = useState("");
  const [fileList, setFileList] = useState("Waiting for file listings...");

  useEffect(() => {
    const onFileProgress = (event) => setFileProgress(clampInt(event.detail?.percentage ?? 0, 0, 100));

    document.addEventListener("thymio-file-upload-progress", onFileProgress);
    document.addEventListener("thymio-file-download-progress", onFileProgress);

    return () => {
      document.removeEventListener("thymio-file-upload-progress", onFileProgress);
      document.removeEventListener("thymio-file-download-progress", onFileProgress);
    };
  }, []);

  async function uploadFile() {
    const t = getThymio();
    const file = fileUploadRef.current?.files?.[0];
    if (!t?.uploadFile) return;
    if (!file) return alert("Pick a file first");
    setFileProgress(0);
    await t.uploadFile(file);
  }

  async function downloadFile() {
    const t = getThymio();
    if (!t?.downloadFile) return;
    if (!fileDownloadName.trim()) return alert("Enter a filename to download");
    setFileProgress(0);
    const res = await t.downloadFile(fileDownloadName.trim());
    console.log(res);
  }

  async function saveFile() {
    const t = getThymio();
    if (!t?.saveFile) return;
    if (!filename.trim()) return alert("Enter a filename");
    await t.saveFile(filename.trim());
  }

  async function deleteFile() {
    const t = getThymio();
    if (!t?.deleteFile) return;
    if (!filename.trim()) return alert("Enter a filename");
    await t.deleteFile(filename.trim());
  }

  async function eraseAllFiles() {
    const t = getThymio();
    if (!t?.eraseAllFiles) return;
    await t.eraseAllFiles();
  }

  async function freeMemory() {
    const t = getThymio();
    if (!t?.freeMemory) return;
    await t.freeMemory();
  }

  async function listFiles() {
    const t = getThymio();
    if (!t?.listFiles) return;
    const list = await t.listFiles();
    setFileList(JSON.stringify(list, null, 2));
  }

  return (
    <div className="compact-group files-panel">
      <div className="grid-title">Files</div>
      <div className="row wrap">
        <input ref={fileUploadRef} type="file" />
        <button onClick={uploadFile}>Upload file</button>
      </div>

      <div className="row wrap">
        <input
          type="text"
          value={fileDownloadName}
          onChange={(e) => setFileDownloadName(e.target.value)}
          placeholder="filename to download"
        />
        <button onClick={downloadFile}>Download file</button>
      </div>

      <div className="subhead">Upload/Download progress</div>
      <ProgressBar value={fileProgress} />

      <div className="row wrap">
        <input
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="filename"
        />
        <button onClick={saveFile}>Save file</button>
        <button className="secondary" onClick={deleteFile}>
          Delete file
        </button>
        <button className="secondary" onClick={eraseAllFiles}>
          Erase all files
        </button>
        <button className="secondary" onClick={freeMemory}>
          Free memory
        </button>
        <button className="secondary" onClick={listFiles}>
          List files
        </button>
      </div>
      <pre className="pre compact-pre">{fileList}</pre>
    </div>
  );
}
