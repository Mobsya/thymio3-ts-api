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

  async function startOtaUpload() {
    const t = getThymio();
    if (!t?.uploadFirmware) return;
    const file = firmwareRef.current?.files?.[0];
    if (!file) return alert("Pick a firmware file first");
    setOtaProgress(0);
    setIsOtaUploading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
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
    <div className="compact-group firmware-update-panel">
      <div className="grid-title">Firmware Update</div>

      <div className="firmware-command-grid">
        <div className="firmware-command-group">
          <div className="subhead">Automatic update</div>
          <div className="row wrap">
            <button onClick={checkForNewFirmware}>Check for newer firmware</button>
            <button className="secondary" disabled={!canUpdateFirmware} onClick={updateFirmware}>
              Update Firmware
            </button>
          </div>
          <pre className="pre compact-pre firmware-check-result">{newFirmwareInfo}</pre>
        </div>

        <div className="firmware-command-group">
          <div className="subhead">Manual update</div>
          <div className="row wrap">
            <input ref={firmwareRef} type="file" />
            <button
              className={isOtaUploading ? "secondary" : ""}
              onClick={isOtaUploading ? stopOtaUpload : startOtaUpload}
            >
              {isOtaUploading ? "Stop OTA Upload" : "Start OTA"}
            </button>
          </div>
        </div>
      </div>

      <div className="firmware-status-group">
        <div className="subhead">Upload progress</div>
        <ProgressBar value={otaProgress} />
      </div>
    </div>
  );
}
