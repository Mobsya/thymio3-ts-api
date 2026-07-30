import { useEffect, useRef, useState } from "react";
import ProgressBar from "./progress-bar";
import { clampInt } from "./utils";
import "./firmware-update-panel.css";

function getThymio() {
  return window.thymio;
}

export default function FirmwareUpdatePanel() {
  const firmwareRef = useRef(null);
  const [otaProgress, setOtaProgress] = useState(0);
  const [newFirmwareInfo, setNewFirmwareInfo] = useState("Waiting for firmware info...");
  const [canUpdateFirmware, setCanUpdateFirmware] = useState(false);
  const [isOtaUploading, setIsOtaUploading] = useState(false);
  const [firmwareFile, setFirmwareFile] = useState(null);
  const [firmwareFileError, setFirmwareFileError] = useState("");
  const [isFirmwareDragActive, setIsFirmwareDragActive] = useState(false);

  useEffect(() => {
    const onOtaProgress = (event) => setOtaProgress(clampInt(event.detail?.percentage ?? 0, 0, 100));

    document.addEventListener("thymio-ota-upload-progress", onOtaProgress);

    return () => {
      document.removeEventListener("thymio-ota-upload-progress", onOtaProgress);
    };
  }, []);

  async function checkForNewFirmware() {
    const t = getThymio();
    if (!t?.isNewerFirmwareAvailable) return;
    const info = await t.isNewerFirmwareAvailable();
    setCanUpdateFirmware(Boolean(info));
    setNewFirmwareInfo(JSON.stringify(info, null, 2));
  }

  async function updateFirmware() {
    const t = getThymio();
    if (!t?.updateFirmware) return;
    setOtaProgress(0);
    await t.updateFirmware();
  }

  function isBinFile(file) {
    return file?.name?.toLowerCase().endsWith(".bin");
  }

  function selectFirmwareFile(file) {
    if (!file) return;
    if (!isBinFile(file)) {
      setFirmwareFile(null);
      setFirmwareFileError("Select a .bin firmware file.");
      if (firmwareRef.current) firmwareRef.current.value = "";
      return;
    }

    setFirmwareFile(file);
    setFirmwareFileError("");
  }

  function handleFirmwareFileChange(event) {
    selectFirmwareFile(event.target.files?.[0]);
  }

  function handleFirmwareDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsFirmwareDragActive(true);
  }

  function handleFirmwareDragLeave() {
    setIsFirmwareDragActive(false);
  }

  function handleFirmwareDrop(event) {
    event.preventDefault();
    setIsFirmwareDragActive(false);
    selectFirmwareFile(event.dataTransfer.files?.[0]);
  }

  async function startOtaUpload() {
    const t = getThymio();
    if (!t?.uploadFirmware) return;
    if (!firmwareFile) return alert("Pick a .bin firmware file first");
    setOtaProgress(0);
    setIsOtaUploading(true);

    try {
      const arrayBuffer = await firmwareFile.arrayBuffer();
      const firmware = new Uint8Array(arrayBuffer);
      await t.uploadFirmware(firmware);
    } finally {
      setIsOtaUploading(false);
    }
  }

  async function stopOtaUpload() {
    const t = getThymio();
    if (!t?.stopFirmwareUpload) return;
    await t.stopFirmwareUpload();
    setIsOtaUploading(false);
  }

  return (
    <div className="compact-group firmware-update-panel maintenance-module firmware-module">
      <div className="grid-title maintenance-title">Firmware Update</div>

      <div className="firmware-command-grid">
        <div className="firmware-command-group maintenance-submodule">
          <div className="subhead">Automatic update</div>
          <div className="row wrap">
            <button onClick={checkForNewFirmware}>Check for newer firmware</button>
            <button className="secondary" disabled={!canUpdateFirmware} onClick={updateFirmware}>
              Update Firmware
            </button>
          </div>
          <pre className="pre compact-pre firmware-check-result">{newFirmwareInfo}</pre>
        </div>

        <div className="firmware-command-group maintenance-submodule">
          <div className="subhead">Manual update</div>
          <div
            className={`firmware-drop-area${isFirmwareDragActive ? " is-drag-active" : ""}${
              firmwareFileError ? " has-error" : ""
            }`}
            onDragLeave={handleFirmwareDragLeave}
            onDragOver={handleFirmwareDragOver}
            onDrop={handleFirmwareDrop}
          >
            <span className="firmware-drop-title">Drop .bin firmware here</span>
            <span className="firmware-drop-meta">
              {firmwareFile ? firmwareFile.name : "No firmware selected"}
            </span>
            {firmwareFileError ? <span className="firmware-drop-error">{firmwareFileError}</span> : null}
          </div>
          <div className="row wrap firmware-upload-row">
            <input ref={firmwareRef} type="file" accept=".bin" onChange={handleFirmwareFileChange} />
            <button
              className={isOtaUploading ? "secondary" : ""}
              disabled={!isOtaUploading && !firmwareFile}
              onClick={isOtaUploading ? stopOtaUpload : startOtaUpload}
            >
              {isOtaUploading ? "Stop OTA Upload" : "Start OTA"}
            </button>
          </div>
        </div>
      </div>

      <div className="firmware-status-group maintenance-submodule">
        <div className="subhead">Upload progress</div>
        <ProgressBar value={otaProgress} />
      </div>
    </div>
  );
}
