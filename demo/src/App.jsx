import React, { useEffect, useRef, useState } from "react";
import ActuatorPanel from "./actuator-panel";
import DeviceMemoryStatus from "./device-memory-status";
import FilesAndFirmwarePanel from "./files-and-firmware-panel";
import PythonEditor from "./python-editor";
import RobotStatusCard from "./robot-status-card";
import SensorPanel from "./sensor-panel";
import StdoutPanel from "./stdout-panel";
import { clampInt } from "./utils";

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

  // Actuators
  const [circleLEDs, setCircleLEDs] = useState(Array(8).fill(0));
  const [frontLegoLEDs, setFrontLegoLEDs] = useState(Array(8).fill(0));
  const [rearLegoLEDs, setRearLegoLEDs] = useState(Array(8).fill(0));
  const [flRGB, setFlRGB] = useState({ r: 0, g: 0, b: 0 });
  const [frRGB, setFrRGB] = useState({ r: 0, g: 0, b: 0 });
  const [blRGB, setBlRGB] = useState({ r: 0, g: 0, b: 0 });
  const [brRGB, setBrRGB] = useState({ r: 0, g: 0, b: 0 });
  const [motorLeft, setMotorLeft] = useState(0);
  const [motorRight, setMotorRight] = useState(0);
  const [sound, setSound] = useState(0);
  const [smallBottomRGB, setSmallBottomRGB] = useState({ r: 0, g: 0, b: 0 });
  const [smallBackRGB, setSmallBackRGB] = useState({ r: 0, g: 0, b: 0 });
  const [buttonLEDS, setButtonLEDS] = useState(Array(4).fill(0));
  const [receiverLED, setReceiverLED] = useState(0);
  const [microphoneLED, setMicrophoneLED] = useState(false);

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
      console.log(event);
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

  function buildActuatorData(overrides = {}) {
    return {
      circleLEDs: overrides.circleLEDs ?? circleLEDs,
      frontLegoLEDs: overrides.frontLegoLEDs ?? frontLegoLEDs,
      rearLegoLEDs: overrides.rearLegoLEDs ?? rearLegoLEDs,
      flRGB: overrides.flRGB ?? flRGB,
      frRGB: overrides.frRGB ?? frRGB,
      blRGB: overrides.blRGB ?? blRGB,
      brRGB: overrides.brRGB ?? brRGB,
      motorLeft: clampInt(overrides.motorLeft ?? motorLeft, -1000, 1000),
      motorRight: clampInt(overrides.motorRight ?? motorRight, -1000, 1000),
      sound: clampInt(overrides.sound ?? sound, 0, 19),
      smallBottomRGB: overrides.smallBottomRGB ?? smallBottomRGB,
      smallBackRGB: overrides.smallBackRGB ?? smallBackRGB,
      buttonLEDs: overrides.buttonLEDs ?? overrides.buttonLEDS ?? buttonLEDS,
      receiverLED: clampInt(overrides.receiverLED ?? receiverLED, 0, 15),
      microphoneLED: overrides.microphoneLED ?? microphoneLED,
    };
  }

  async function sendActuatorData(overrides = {}, { alertIfMissing = false } = {}) {
    const t = getThymio();
    if (!t?.setActuatorState) {
      if (alertIfMissing) alert("thymio not loaded");
      return;
    }

    await t.setActuatorState(buildActuatorData(overrides));
  }

  function updateRgbFromSlider(key, setRgb) {
    return (rgb) => {
      setRgb(rgb);
      void sendActuatorData({ [key]: rgb });
    };
  }

  function updateLedIntensitiesFromSlider(key, setValues) {
    return (values) => {
      setValues(values);
      void sendActuatorData({ [key]: values });
    };
  }

  function updateMotorsFromSlider(values) {
    if (typeof values.motorLeft === "number") setMotorLeft(values.motorLeft);
    if (typeof values.motorRight === "number") setMotorRight(values.motorRight);
    void sendActuatorData(values);
  }

  function updateSoundFromPicker(value) {
    const nextSound = clampInt(value, 0, 19);
    setSound(nextSound);
    void sendActuatorData({ sound: nextSound });
  }

  function applyPreset(preset) {
    // helper to set many fields safely
    if (preset.circleLEDs) setCircleLEDs(preset.circleLEDs);
    if (preset.frontLegoLEDs) setFrontLegoLEDs(preset.frontLegoLEDs);
    if (preset.rearLegoLEDs) setRearLegoLEDs(preset.rearLegoLEDs);

    if (preset.flRGB) setFlRGB(preset.flRGB);
    if (preset.frRGB) setFrRGB(preset.frRGB);
    if (preset.blRGB) setBlRGB(preset.blRGB);
    if (preset.brRGB) setBrRGB(preset.brRGB);

    if (typeof preset.motorLeft === "number") setMotorLeft(preset.motorLeft);
    if (typeof preset.motorRight === "number") setMotorRight(preset.motorRight);
    if (typeof preset.sound === "number") setSound(preset.sound);
    if (preset.smallBottomRGB) setSmallBottomRGB(preset.smallBottomRGB);
    if (preset.smallBackRGB) setSmallBackRGB(preset.smallBackRGB);
    if (preset.buttonLEDS) setButtonLEDS(preset.buttonLEDS);
    if (typeof preset.receiverLED === "number") setReceiverLED(preset.receiverLED);
    if (typeof preset.microphoneLED === "boolean") setMicrophoneLED(preset.microphoneLED);

    void sendActuatorData(preset);
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
            {activeTab === "actuators" ? (
              <ActuatorPanel
                circleLEDs={circleLEDs}
                frontLegoLEDs={frontLegoLEDs}
                rearLegoLEDs={rearLegoLEDs}
                buttonLEDS={buttonLEDS}
                flRGB={flRGB}
                frRGB={frRGB}
                blRGB={blRGB}
                brRGB={brRGB}
                smallBottomRGB={smallBottomRGB}
                smallBackRGB={smallBackRGB}
                motorLeft={motorLeft}
                motorRight={motorRight}
                sound={sound}
                receiverLED={receiverLED}
                microphoneLED={microphoneLED}
                onApplyPreset={applyPreset}
                onCircleLEDsChange={updateLedIntensitiesFromSlider("circleLEDs", setCircleLEDs)}
                onFrontLegoLEDsChange={updateLedIntensitiesFromSlider("frontLegoLEDs", setFrontLegoLEDs)}
                onRearLegoLEDsChange={updateLedIntensitiesFromSlider("rearLegoLEDs", setRearLegoLEDs)}
                onButtonLEDsChange={(values) => {
                  setButtonLEDS(values);
                  void sendActuatorData({ buttonLEDs: values });
                }}
                onFlRGBChange={updateRgbFromSlider("flRGB", setFlRGB)}
                onFrRGBChange={updateRgbFromSlider("frRGB", setFrRGB)}
                onBlRGBChange={updateRgbFromSlider("blRGB", setBlRGB)}
                onBrRGBChange={updateRgbFromSlider("brRGB", setBrRGB)}
                onSmallBottomRGBChange={(rgb) => {
                  setSmallBottomRGB(rgb);
                  void sendActuatorData({ smallBottomRGB: rgb });
                }}
                onSmallBackRGBChange={(rgb) => {
                  setSmallBackRGB(rgb);
                  void sendActuatorData({ smallBackRGB: rgb });
                }}
                onMotorsChange={updateMotorsFromSlider}
                onSoundChange={updateSoundFromPicker}
                onReceiverLEDChange={(nextReceiverLED) => {
                  setReceiverLED(nextReceiverLED);
                  void sendActuatorData({ receiverLED: nextReceiverLED });
                }}
                onMicrophoneLEDChange={(nextMicrophoneLED) => {
                  setMicrophoneLED(nextMicrophoneLED);
                  void sendActuatorData({ microphoneLED: nextMicrophoneLED });
                }}
              />
            ) : null}

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
