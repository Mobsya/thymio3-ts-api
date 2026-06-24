import "./robot-status-card.css";

export default function RobotStatusCard({
  connectionStatus,
  deviceName,
  firmwareInfo,
  firmwareInfoError,
  promptManualReconnection,
  onConnect,
  onDisconnect,
}) {
  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  return (
    <div className={`robot-status-card ${connectionStatus}`}>
      <div className="robot-status-row">
        <div className="robot-status">
          <span className="robot-status-dot" />
          {connectionStatus === "connected" && "Connected"}
          {connectionStatus === "connecting" && "Connecting..."}
          {connectionStatus === "disconnected" && "Disconnected"}
        </div>

        <div className="robot-status-actions">
          <button
            type="button"
            className={isConnected ? "secondary" : ""}
            disabled={isConnecting}
            onClick={isConnected ? onDisconnect : onConnect}
          >
            {isConnecting ? "Connecting..." : isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
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

      {promptManualReconnection ? (
        <div className="robot-reconnect-warning">Reconnect manually</div>
      ) : null}
    </div>
  );
}
