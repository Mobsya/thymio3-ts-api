import "./robot-status-card.css";

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
            <span>ESP32 {firmwareInfo?.esp32_ver ? firmwareInfo.esp32_ver : "Unknown"}</span>
            <span>STM32 {firmwareInfo?.stm32_ver ? firmwareInfo.stm32_ver : "Unknown"}</span>
          </div>
          {firmwareInfoError ? (
            <div className="robot-firmware-error">{firmwareInfoError}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
