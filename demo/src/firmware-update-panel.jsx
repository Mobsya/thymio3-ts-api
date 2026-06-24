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

    const arrayBuffer = await file.arrayBuffer();
    const firmware = new Uint8Array(arrayBuffer);
    await t.uploadFirmware(firmware);
  }

  async function stopOtaUpload() {
    const t = getThymio();
    if (!t?.stopFirmwareUpload) return;
    await t.stopFirmwareUpload();
  }

  return (
    <div className="compact-group firmware-update-panel">
      <div className="grid-title">Firmware Update</div>
      <div className="row wrap">
        <button onClick={checkForNewFirmware}>Check for newer firmware</button>
        <button className="secondary" onClick={updateFirmware}>
          Update Firmware
        </button>
      </div>
      <pre className="pre compact-pre">{newFirmwareInfo}</pre>

      <div className="subhead">Upload progress</div>
      <ProgressBar value={otaProgress} />

      <div className="row wrap">
        <input ref={firmwareRef} type="file" />
        <button onClick={startOtaUpload}>Start OTA</button>
        <button className="secondary" onClick={stopOtaUpload}>
          Stop OTA Upload
        </button>
      </div>
    </div>
  );
}
