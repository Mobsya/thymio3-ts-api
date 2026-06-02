import "./robot-status-card.css";

function formatFirmwareVersion(value) {
  return Number.isFinite(value) ? String(value) : "Unknown";
}

export default function RobotStatusCard({ connectionStatus, deviceName, firmwareInfo, firmwareInfoError }) {
  return (
    <div className={`robot-status-card ${connectionStatus}`}>
      <div className="robot-status">
        <span className="robot-status-dot" />
        {connectionStatus === "connected" && "Connected"}
        {connectionStatus === "connecting" && "Connecting..."}
        {connectionStatus === "disconnected" && "Disconnected"}
      </div>

      {connectionStatus === "connected" && deviceName ? (
        <div className="robot-device">
          <span className="robot-device-name">{deviceName}</span>
          <div className="robot-firmware">
            <span>ESP32 {formatFirmwareVersion(firmwareInfo?.esp32_ver)}</span>
            <span>STM32 {formatFirmwareVersion(firmwareInfo?.stm32_ver)}</span>
          </div>
          {firmwareInfoError ? (
            <div className="robot-firmware-error">{firmwareInfoError}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
