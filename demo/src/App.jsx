import React, { useEffect, useRef, useState } from "react";
import ActuatorPanel from "./actuator-panel";
import DeviceMemoryStatus from "./device-memory-status";
import FilesAndFirmwarePanel from "./files-and-firmware-panel";
import PythonEditor from "./python-editor";
import RobotStatusCard from "./robot-status-card";
import SensorPanel from "./sensor-panel";
import StdoutPanel from "./stdout-panel";

/**
 * Assumes thymio.iife.js exposes `window.thymio`.
 * We keep this app defensive in case the script isn't loaded yet.
 */
function getThymio() {
  return window.thymio;
}

const DEFAULT_CODE = `
import thymio
import time

mot = thymio.MOTORS()
mot.set_speed(200, -200)
rgb_fl = thymio.LEDS_RGB(0)

while True:
    rgb_fl.set_intensity(1, 0, 0)
    time.sleep(0.2)
    rgb_fl.set_intensity(0, 1, 0)
    time.sleep(0.2)
    rgb_fl.set_intensity(0, 0, 1)
    time.sleep(0.2)
`;

function Panel({ title, children, actions, className = "" }) {
  return (
    <section className={`dashboard-panel ${className}`.trim()}>
      <div className="panel-header">
        <h3>{title}</h3>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function TabButton({ id, activeTab, onSelect, children }) {
  const isSelected = activeTab === id;

  return (
    <button
      aria-controls={`dashboard-tab-${id}`}
      aria-selected={isSelected}
      className={`tab-button ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(id)}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [deviceName, setDeviceName] = useState("");
  // possible values: "disconnected" | "connecting" | "connected"
  const [promptManualReconnection, setPromptManualReconnection] = useState(false);

  // Code + exec
  const [code, setCode] = useState(DEFAULT_CODE);
  const [scriptIdToSave, setScriptIdToSave] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);

  // Streams / output
  const [stdOut, setStdOut] = useState([]);

  const stdOutEntryId = useRef(0);

  // Device info
  const [firmwareInfo, setFirmwareInfo] = useState(null);
  const [firmwareInfoError, setFirmwareInfoError] = useState("");
  const [activeTab, setActiveTab] = useState("actuators");

  // --- Event listeners from thymio.global.js ---
  useEffect(() => {
    const onStdOut = (event) => {
      const value = String(event.detail ?? "");
      setStdOut((entries) => [
        ...entries,
        { id: ++stdOutEntryId.current, value },
      ]);
    };
    const onConnected = (event) => {
      const isConnected = Boolean(event.detail);

      if (isConnected) {
        setConnectionStatus("connected");
        setDeviceName(getThymio()?.getDeviceName?.() ?? "Unknown device");
        setPromptManualReconnection(false);
        setFirmwareInfo(null);
        setFirmwareInfoError("");

        void (async () => {
          try {
            const info = await getThymio()?.getFirmwareInfo?.();
            if (info) setFirmwareInfo(info);
          } catch (err) {
            setFirmwareInfoError(err?.message ?? "Failed to read firmware info");
          }
        })();
      } else {
        // If connection drops and library tries to auto-reconnect
        setConnectionStatus("connecting");
        setDeviceName("");
        setFirmwareInfo(null);
        setFirmwareInfoError("");
      }
    };

    const onManualReconn = () => {
      setPromptManualReconnection(true);
      setConnectionStatus("disconnected");
      setDeviceName("");
      setFirmwareInfo(null);
      setFirmwareInfoError("");
    };

    const onPythonExecStatus = (event) => {
      //console.log(event);
      const isExecuting = Boolean(event.detail);
      setIsExecuting(isExecuting);
    };

    document.addEventListener("thymio-connected", onConnected);
    document.addEventListener("thymio-prompt-manual-reconnection", onManualReconn);
    document.addEventListener("thymio-python-execution-status", onPythonExecStatus);
    document.addEventListener("thymio-std-out-values", onStdOut);

    return () => {
      document.removeEventListener("thymio-connected", onConnected);
      document.removeEventListener("thymio-prompt-manual-reconnection", onManualReconn);
      document.removeEventListener("thymio-python-execution-status", onPythonExecStatus);
      document.removeEventListener("thymio-std-out-values", onStdOut);

    };
  }, []);

  // --- Actions ---
  async function connect() {
    if (!getThymio()?.requestAndConnect) return alert("thymio not loaded");
    setConnectionStatus("connecting");
    await getThymio().requestAndConnect();
  }

  async function disconnect() {
    if (!getThymio()?.disconnect) return;
    await getThymio().disconnect();
    setConnectionStatus("disconnected");
    setDeviceName("");
  }

  async function executeCode() {
    const t = getThymio();
    if (!t?.sendPythonScript || !t?.executeLoadedScript) return alert("thymio not loaded");
    await t.sendPythonScript(code);
    await t.executeLoadedScript();
  }

  async function stopCode() {
    const t = getThymio();
    if (!t?.stopScriptExecution) return;

    await t.stopScriptExecution();
  }

  async function saveToPartition() {
    const t = getThymio();
    if (!t?.saveScriptToPartition) return;
    await t.saveScriptToPartition(scriptIdToSave);
  }

  async function resetInterpreter() {
    const t = getThymio();
    if (!t?.softResetPythonInterpreter) return;
    await t.softResetPythonInterpreter();
  }

  return (
    <div className="page">
      <main className="dashboard-grid">
        <div className="telemetry-stack">
          <SensorPanel />

          <StdoutPanel entries={stdOut} onClear={() => setStdOut([])} />
        </div>

        <Panel title="Device & Memory" className="telemetry-panel memory-panel">
          <div className="panel-scroll memory-panel-scroll">
            <RobotStatusCard
              connectionStatus={connectionStatus}
              deviceName={deviceName}
              firmwareInfo={firmwareInfo}
              firmwareInfoError={firmwareInfoError}
              promptManualReconnection={promptManualReconnection}
              onConnect={connect}
              onDisconnect={disconnect}
            />
            <DeviceMemoryStatus isConnected={connectionStatus === "connected"} />
          </div>
        </Panel>

        <Panel title="Controls" className="workbench-panel">
          <div className="tab-list" role="tablist" aria-label="Demo controls">
            <TabButton id="actuators" activeTab={activeTab} onSelect={setActiveTab}>
              Actuators
            </TabButton>
            <TabButton id="python" activeTab={activeTab} onSelect={setActiveTab}>
              Python
            </TabButton>
            <TabButton id="files" activeTab={activeTab} onSelect={setActiveTab}>
              Files & Firmware
            </TabButton>
          </div>

          <div className="tab-panel panel-scroll" id={`dashboard-tab-${activeTab}`} role="tabpanel">
            {activeTab === "actuators" ? <ActuatorPanel /> : null}

            {activeTab === "python" ? (
              <div className="tab-stack python-tab-stack">
                <div className="row wrap python-actions">
                  <div className={`exec-pill ${isExecuting ? "running" : "idle"}`}>
                    <span className="dot" />
                    {isExecuting ? "Executing…" : "Idle"}
                  </div>

                  <button onClick={executeCode}>Execute code</button>
                  <button className="secondary" onClick={stopCode}>
                    Stop code execution
                  </button>
                </div>

                <div className="python-editor-region">
                  <PythonEditor
                    value={code}
                    onChange={setCode}
                  />
                </div>

                <div className="row wrap">
                  <input
                    type="number"
                    placeholder="script id"
                    value={scriptIdToSave}
                    onChange={(e) => setScriptIdToSave(e.target.value)}
                  />
                  <button onClick={saveToPartition}>Save to partition</button>
                  <button className="secondary" onClick={resetInterpreter}>
                    Reset interpreter
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "files" ? <FilesAndFirmwarePanel /> : null}
          </div>
        </Panel>
      </main>
    </div>
  );
}
