import React, { useEffect, useRef, useState } from "react";
import { PRESETS } from "./presets";
import ColourSlider from "./colour-slider";
import DeviceMemoryStatus from "./device-memory-status";
import LedIntensitySliders from "./led-intensity-sliders";
import MotorSliders from "./motor-sliders";
import PythonEditor from "./python-editor";
import RobotStatusCard from "./robot-status-card";
import { SENSOR_FOCUS_SENSOR_IDS } from "./sensor-options";
import SensorFocusPanel from "./sensor-focus-panel";
import SoundPicker from "./sound-picker";
import StdoutConsole from "./stdout-console";
import { clampInt } from "./utils";

/**
 * Assumes thymio.iife.js exposes `window.thymio`.
 * We keep this app defensive in case the script isn't loaded yet.
 */
function getThymio() {
  return window.thymio;
}

const DEFAULT_CODE = `import thymio
import time
mot = thymio.MOTORS()
mot.set_speed(200, -200)
rgb_fl = thymio.LEDS_RGB(0)
while 1:
    rgb_fl.set_intensity(1, 0, 0)
    time.sleep(0.2)
    rgb_fl.set_intensity(0, 1, 0)
    time.sleep(0.2)
    rgb_fl.set_intensity(0, 0, 1)
    time.sleep(0.2)
`;

function ProgressBar({ value }) {
  const pct = clampInt(value ?? 0, 0, 100);
  return (
    <div className="progress-container">
      <div className="progress-bar" style={{ width: `${pct}%` }}>
        {pct}%
      </div>
    </div>
  );
}

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
  const [mainSensors, setMainSensors] = useState(null);
  const [otherSensors, setOtherSensors] = useState(null);

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

  // Audio
  const audioRef = useRef(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioFreq, setAudioFreq] = useState(0);
  const [audioFreqDuration, setAudioFreqDuration] = useState(0);
  const stdOutEntryId = useRef(0);

  // Files
  const fileUploadRef = useRef(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [fileDownloadName, setFileDownloadName] = useState("");
  const [filename, setFilename] = useState("");
  const [fileList, setFileList] = useState("Waiting for file listings...");

  // Device info
  const [firmwareInfo, setFirmwareInfo] = useState(null);
  const [firmwareInfoError, setFirmwareInfoError] = useState("");
  const [newFirmwareInfo, setNewFirmwareInfo] = useState("Waiting for firmware info...");
  const [activeTab, setActiveTab] = useState("actuators");

  // OTA
  const firmwareRef = useRef(null);
  const [otaProgress, setOtaProgress] = useState(0);

  // --- Event listeners from thymio.global.js ---
  useEffect(() => {
    const onStdOut = (event) => {
      const value = String(event.detail ?? "");
      setStdOut((entries) => [
        ...entries,
        { id: ++stdOutEntryId.current, value },
      ]);
    };
    const onSensors = (event) => setMainSensors(event.detail ?? null);
    const onOtherSensors = (event) => setOtherSensors(event.detail ?? null);

    const onAudioProgress = (e) => setAudioProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));
    const onFileProgress = (e) => setFileProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));
    const onOtaProgress = (e) => setOtaProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));

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
            await getThymio()?.startAllSensorStreaming?.();
          } catch (err) {
            console.warn("Failed to start sensor streaming", err);
          }
        })();

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
    document.addEventListener("thymio-sensor-values", onSensors);
    document.addEventListener("thymio-sensor-other-values", onOtherSensors);

    document.addEventListener("thymio-audio-upload-progress", onAudioProgress);
    document.addEventListener("thymio-file-upload-progress", onFileProgress);
    document.addEventListener("thymio-file-download-progress", onFileProgress);
    document.addEventListener("thymio-ota-upload-progress", onOtaProgress);

    return () => {
      document.removeEventListener("thymio-connected", onConnected);
      document.removeEventListener("thymio-prompt-manual-reconnection", onManualReconn);
      document.removeEventListener("thymio-python-execution-status", onPythonExecStatus);
      document.removeEventListener("thymio-std-out-values", onStdOut);
      document.removeEventListener("thymio-sensor-values", onSensors);
      document.removeEventListener("thymio-sensor-other-values", onOtherSensors);

      document.removeEventListener("thymio-audio-upload-progress", onAudioProgress);
      document.removeEventListener("thymio-file-upload-progress", onFileProgress);
      document.removeEventListener("thymio-file-download-progress", onFileProgress);
      document.removeEventListener("thymio-ota-upload-progress", onOtaProgress);
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

  async function startMainSensors() {
    const t = getThymio();
    if (!t?.startMainSensorStreaming) return;
    await t.startMainSensorStreaming();
  }

  async function startOtherSensors() {
    const t = getThymio();
    if (!t?.startSecondarySensorStreaming) return;
    await t.startSecondarySensorStreaming();
  }

  async function startAllSensors() {
    const t = getThymio();
    if (!t?.startAllSensorStreaming) return;
    await t.startAllSensorStreaming();
  }

  async function stopSensors() {
    const t = getThymio();
    if (!t?.stopSensorStreaming) return;
    await t.stopSensorStreaming();
  }

  async function uploadAudio() {
    const t = getThymio();
    const file = audioRef.current?.files?.[0];
    if (!t?.uploadAudioFile) return;
    if (!file) return alert("Pick an audio file first");
    setAudioProgress(0);
    await t.uploadAudioFile(file);
  }

  async function playFrequency() {
    const t = getThymio();
    if (!t?.playFrequency) return;
    await t.playFrequency(clampInt(audioFreq, 0, 300), clampInt(audioFreqDuration, 0, 1000));
  }

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
          <Panel
            title="Sensors"
            className="telemetry-panel sensors-panel"
            actions={
              <div className="row wrap compact-actions">
                <button onClick={startMainSensors}>Main</button>
                <button onClick={startOtherSensors}>Other</button>
                <button onClick={startAllSensors}>All</button>
                <button className="secondary" onClick={stopSensors}>
                  Stop
                </button>
              </div>
            }
          >
            <div className="panel-scroll sensor-panel-scroll">
              <SensorFocusPanel
                mainSensors={mainSensors}
                otherSensors={otherSensors}
                focusedSensors={SENSOR_FOCUS_SENSOR_IDS}
                onFocusedSensorsChange={() => {}}
                showSelector={false}
              />
            </div>
          </Panel>

          <Panel title="STD OUT" className="telemetry-panel stdout-panel">
            <div className="panel-scroll stdout-panel-scroll">
              <StdoutConsole entries={stdOut} />
            </div>
          </Panel>
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
              <div className="tab-stack">
                <div className="preset-bar">
                  <div className="preset-title">Presets</div>

                  <div className="preset-buttons">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="secondary"
                        onClick={() => applyPreset(p.data)}
                        title={p.desc}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid-2 dense-grid">
                  <LedIntensitySliders
                    label="Circle LEDs"
                    values={circleLEDs}
                    onChange={updateLedIntensitiesFromSlider("circleLEDs", setCircleLEDs)}
                  />
                  <LedIntensitySliders
                    label="Button LEDs"
                    values={buttonLEDS}
                    onChange={(values) => {
                      setButtonLEDS(values);
                      void sendActuatorData({ buttonLEDs: values });
                    }}
                  />
                </div>

                <div className="grid-2 dense-grid">
                  <LedIntensitySliders
                    label="Front LEGO LEDs"
                    values={frontLegoLEDs}
                    onChange={updateLedIntensitiesFromSlider("frontLegoLEDs", setFrontLegoLEDs)}
                  />
                  <LedIntensitySliders
                    label="Rear LEGO LEDs"
                    values={rearLegoLEDs}
                    onChange={updateLedIntensitiesFromSlider("rearLegoLEDs", setRearLegoLEDs)}
                  />
                </div>

                <div className="grid-2 dense-grid">
                  <MotorSliders left={motorLeft} right={motorRight} onChange={updateMotorsFromSlider} />
                  <SoundPicker value={sound} onChange={updateSoundFromPicker} />
                </div>

                <div className="grid-2 dense-grid">
                  <ColourSlider label="FL RGB" rgb={flRGB} onChange={updateRgbFromSlider("flRGB", setFlRGB)} />
                  <ColourSlider label="FR RGB" rgb={frRGB} onChange={updateRgbFromSlider("frRGB", setFrRGB)} />
                  <ColourSlider label="BL RGB" rgb={blRGB} onChange={updateRgbFromSlider("blRGB", setBlRGB)} />
                  <ColourSlider label="BR RGB" rgb={brRGB} onChange={updateRgbFromSlider("brRGB", setBrRGB)} />
                </div>

                <div className="grid-2 dense-grid">
                  <ColourSlider
                    label="Small bottom RGB"
                    rgb={smallBottomRGB}
                    onChange={(rgb) => {
                      setSmallBottomRGB(rgb);
                      void sendActuatorData({ smallBottomRGB: rgb });
                    }}
                  />
                  <ColourSlider
                    label="Small back RGB"
                    rgb={smallBackRGB}
                    onChange={(rgb) => {
                      setSmallBackRGB(rgb);
                      void sendActuatorData({ smallBackRGB: rgb });
                    }}
                  />
                </div>

                <div className="grid-2 dense-grid">
                  <div className="grid-block extra-actuator-receiver">
                    <div className="grid-title">Receiver LED</div>
                    <label className="extra-actuator-slider">
                      <span>Intensity</span>
                      <input
                        aria-label="Receiver LED intensity"
                        type="range"
                        min="0"
                        max="15"
                        value={clampInt(receiverLED, 0, 15)}
                        onChange={(e) => {
                          const nextReceiverLED = clampInt(parseInt(e.target.value, 10), 0, 15);
                          setReceiverLED(nextReceiverLED);
                          void sendActuatorData({ receiverLED: nextReceiverLED });
                        }}
                      />
                      <strong>{clampInt(receiverLED, 0, 15)}</strong>
                    </label>
                  </div>

                  <div className="grid-block extra-actuator-microphone">
                    <div className="grid-title">Microphone LED</div>
                    <label className="extra-actuator-toggle">
                      <input
                        checked={microphoneLED}
                        type="checkbox"
                        onChange={(e) => {
                          setMicrophoneLED(e.target.checked);
                          void sendActuatorData({ microphoneLED: e.target.checked });
                        }}
                      />
                      <span>{microphoneLED ? "On" : "Off"}</span>
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "python" ? (
              <div className="tab-stack">
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

                <PythonEditor
                  value={code}
                  onChange={setCode}
                  height={310}
                />

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

            {activeTab === "files" ? (
              <div className="tab-stack">
                <div className="compact-group">
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

                <div className="compact-group">
                  <div className="grid-title">Automatic Firmware Update</div>
                  <div className="row wrap">
                    <button onClick={checkForNewFirmware}>Check for newer firmware</button>
                    <button className="secondary" onClick={updateFirmware}>
                      Update Firmware
                    </button>
                  </div>
                  <pre className="pre compact-pre">{newFirmwareInfo}</pre>

                  <div className="subhead">Upload progress</div>
                  <ProgressBar value={otaProgress} />
                </div>

                <div className="compact-group">
                  <div className="grid-title">Manual Firmware Update</div>
                  <div className="row wrap">
                    <input ref={firmwareRef} type="file" />
                    <button onClick={startOtaUpload}>Start OTA</button>
                    <button className="secondary" onClick={stopOtaUpload}>
                      Stop OTA Upload
                    </button>
                  </div>
                </div>

                <div className="compact-group">
                  <div className="grid-title">Audio</div>
                  <div className="row wrap">
                    <input ref={audioRef} type="file" />
                    <button onClick={uploadAudio}>Upload Audio file</button>
                    <button className="secondary" onClick={() => getThymio()?.playAudioFile?.()}>
                      Play
                    </button>
                    <button className="secondary" onClick={() => getThymio()?.stopAudioFile?.()}>
                      Stop
                    </button>
                    <button className="secondary" onClick={() => getThymio()?.recordAudio?.(3)}>
                      Record (3s)
                    </button>
                  </div>

                  <div className="subhead">Upload progress</div>
                  <ProgressBar value={audioProgress} />

                  <div className="row wrap">
                    <input
                      type="number"
                      min={0}
                      max={300}
                      value={audioFreq}
                      onChange={(e) => setAudioFreq(parseInt(e.target.value, 10) || 0)}
                      placeholder="frequency"
                    />
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={audioFreqDuration}
                      onChange={(e) => setAudioFreqDuration(parseInt(e.target.value, 10) || 0)}
                      placeholder="duration"
                    />
                    <button onClick={playFrequency}>Play Frequency</button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      </main>
    </div>
  );
}
