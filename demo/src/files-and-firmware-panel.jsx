import AudioPanel from "./audio-panel";
import FilesPanel from "./files-panel";
import FirmwareUpdatePanel from "./firmware-update-panel";
import "./files-and-firmware-panel.css";

export default function FilesAndFirmwarePanel() {
  return (
    <div className="tab-stack files-and-firmware-panel maintenance-panel-shell">
      <AudioPanel />
      <FilesPanel />
      <FirmwareUpdatePanel />
    </div>
  );
}
