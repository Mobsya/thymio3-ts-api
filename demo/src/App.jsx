import React, { useEffect, useRef, useState } from "react";
import { PRESETS } from "./presets";
import ColourSlider from "./colour-slider";
import LedIntensitySliders from "./led-intensity-sliders";
import MotorSliders from "./motor-sliders";
import PythonEditor from "./python-editor";

/**
 * Assumes thymio.global.js exposes `window.thymio`.
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

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? Math.trunc(n) : 0;
  return Math.min(max, Math.max(min, x));
}

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

function Section({ title, children, actions }) {
  return (
    <section className="card">
      <div className="card-header">
        <h3>{title}</h3>
        {actions ? <div className="actions">{actions}</div> : null}
      </div>
      <div className="card-body">{children}</div>
    </section>
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
  const [stdOut, setStdOut] = useState("Waiting for the std out data...");
  const [mainSensors, setMainSensors] = useState("Waiting for main sensor data...");
  const [otherSensors, setOtherSensors] = useState("Waiting for other sensor data...");

  // Actuators
  const [showActuators, setShowActuators] = useState(true);
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

  // Audio
  const audioRef = useRef(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioFreq, setAudioFreq] = useState(0);
  const [audioFreqDuration, setAudioFreqDuration] = useState(0);

  // Files
  const fileUploadRef = useRef(null);
  const [fileProgress, setFileProgress] = useState(0);
  const [fileDownloadName, setFileDownloadName] = useState("");
  const [filename, setFilename] = useState("");
  const [fileList, setFileList] = useState("Waiting for file listings...");

  // Device info
  const [firmwareInfo, setFirmwareInfo] = useState("Waiting for firmware info...");
  const [memoryInfo, setMemoryInfo] = useState("Waiting for memory info...");
  const [newFirmwareInfo, setNewFirmwareInfo] = useState("Waiting for firmware info...");

  // OTA
  const firmwareRef = useRef(null);
  const [otaProgress, setOtaProgress] = useState(0);

  // --- Event listeners from thymio.global.js ---
  useEffect(() => {
    const onStdOut = (event) => setStdOut(String(event.detail ?? ""));
    const onSensors = (event) => setMainSensors(JSON.stringify(event.detail, null, 2));
    const onOtherSensors = (event) => setOtherSensors(JSON.stringify(event.detail, null, 2));

    const onAudioProgress = (e) => setAudioProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));
    const onFileProgress = (e) => setFileProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));
    const onOtaProgress = (e) => setOtaProgress(clampInt(e.detail?.percentage ?? 0, 0, 100));

    const onConnected = (event) => {
      const isConnected = Boolean(event.detail);

      if (isConnected) {
        setConnectionStatus("connected");
        setDeviceName(getThymio()?.getDeviceName?.() ?? "Unknown device");
        setPromptManualReconnection(false);
      } else {
        // If connection drops and library tries to auto-reconnect
        setConnectionStatus("connecting");
        setDeviceName("");
      }
    };

    const onManualReconn = () => {
      setPromptManualReconnection(true);
    }

    const onPythonExecStatus = (event) => {
      console.log(event)
      const isExecuting = Boolean(event.detail);
      setIsExecuting(isExecuting);
    }

    document.addEventListener("thymio-connected", onConnected);
    document.addEventListener("thymio-prompt-manual-reconnection", onManualReconn)
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
      document.removeEventListener("thymio-prompt-manual-reconnection", onManualReconn)
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
    setConnectionStatus("connecting")
    await getThymio().requestAndConnect();
  }

  async function disconnect() {
    if (!getThymio()?.disconnect) return;
    await getThymio().disconnect();
    setConnectionStatus("disconnected")
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

  async function submitActuatorData() {
    await sendActuatorData({}, { alertIfMissing: true });
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

  async function getFirmwareInfo() {
    const t = getThymio();
    if (!t?.getFirmwareInfo) return;
    const info = await t.getFirmwareInfo();
    setFirmwareInfo(JSON.stringify(info, null, 2));
  }

  async function getMemoryInfo() {
    const t = getThymio();
    if (!t?.getMemoryInfo) return;
    const info = await t.getMemoryInfo();
    setMemoryInfo(JSON.stringify(info, null, 2));
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

    void sendActuatorData(preset);
  }


  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>Thymio 3 Test</h1>
          <div className={`connection-summary ${connectionStatus}`}>
            <div className="connection-status">
              <span className="dot" />
              {connectionStatus === "connected" && "Connected"}
              {connectionStatus === "connecting" && "Connecting…"}
              {connectionStatus === "disconnected" && "Disconnected"}
            </div>

            {connectionStatus === "connected" && deviceName ? (
              <div className="connection-device">
                <span className="device-name-value">{deviceName}</span>
              </div>
            ) : null}
          </div>

          <p className="muted">
            Reactive UI for Thymio Web API (global <code>thymio</code>)
          </p>
        </div>

        {promptManualReconnection &&
          <div>
            <p>Please reconnect manually</p>
          </div>
        }

        <div className="row">
          <button onClick={connect}>{connectionStatus === "connected" ? "Reconnect" : "Connect"}</button>
          <button className="secondary" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </header>

      <Section
        title="Python"
        actions={
          <div className="row">
            <div className={`exec-pill ${isExecuting ? "running" : "idle"}`}>
              <span className="dot" />
              {isExecuting ? "Executing…" : "Idle"}
            </div>

            <button onClick={executeCode}>Execute code</button>
            <button className="secondary" onClick={stopCode}>
              Stop code execution
            </button>
          </div>
        }
      >
        <PythonEditor
          value={code}
          onChange={setCode}
          height={280}
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
      </Section>

      <Section title="STD OUT">
        <pre className="pre">{stdOut}</pre>
      </Section>

      <Section
        title="Actuators"
        actions={
          <button className="secondary" onClick={() => setShowActuators((s) => !s)}>
            {showActuators ? "Hide actuator form" : "Show actuator form"}
          </button>
        }
      >
        {showActuators ? (
          <>
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

              <div className="muted preset-hint">
                Tip: click a preset to fill the form, then “Apply to robot”.
              </div>
            </div>

            <LedIntensitySliders
              label="Circle LEDs"
              values={circleLEDs}
              onChange={updateLedIntensitiesFromSlider("circleLEDs", setCircleLEDs)}
            />
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

            <div className="grid-2">
              <ColourSlider label="FL RGB" rgb={flRGB} onChange={updateRgbFromSlider("flRGB", setFlRGB)} />
              <ColourSlider label="FR RGB" rgb={frRGB} onChange={updateRgbFromSlider("frRGB", setFrRGB)} />
              <ColourSlider label="BL RGB" rgb={blRGB} onChange={updateRgbFromSlider("blRGB", setBlRGB)} />
              <ColourSlider label="BR RGB" rgb={brRGB} onChange={updateRgbFromSlider("brRGB", setBrRGB)} />
            </div>

            <div className="grid-2">
              <MotorSliders left={motorLeft} right={motorRight} onChange={updateMotorsFromSlider} />

              <div className="grid-block">
                <div className="grid-title">Sound (0-19)</div>
                <input
                  type="number"
                  min={0}
                  max={19}
                  value={sound}
                  onChange={(e) => setSound(parseInt(e.target.value, 10) || 0)}
                />
              </div>
            </div>

            <div className="row">
              <button onClick={submitActuatorData}>Submit actuator state</button>
            </div>
          </>
        ) : (
          <p className="muted">Actuator form hidden.</p>
        )}
      </Section>

      <Section
        title="Sensors"
        actions={
          <div className="row wrap">
            <button onClick={startMainSensors}>Start main sensor streaming</button>
            <button onClick={startOtherSensors}>Start other sensor streaming</button>
            <button onClick={startAllSensors}>Start all sensor streaming</button>
            <button className="secondary" onClick={stopSensors}>
              Stop all sensor streaming
            </button>
          </div>
        }
      >
        <div className="grid-2">
          <div>
            <div className="subhead">Main Sensor Data</div>
            <pre className="pre">{mainSensors}</pre>
          </div>
          <div>
            <div className="subhead">Other Sensor Data</div>
            <pre className="pre">{otherSensors}</pre>
          </div>
        </div>
      </Section>

      <Section title="Audio">
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
      </Section>

      <Section title="Files">
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
        </div>

        <div className="row wrap">
          <button onClick={listFiles}>List files</button>
        </div>
        <pre className="pre">{fileList}</pre>
      </Section>

      <Section title="Device Info">
        <div className="grid-2">
          <div>
            <div className="row wrap">
              <button onClick={getFirmwareInfo}>Get firmware info</button>
            </div>
            <pre className="pre">{firmwareInfo}</pre>
          </div>
          <div>
            <div className="row wrap">
              <button onClick={getMemoryInfo}>Get memory info</button>
            </div>
            <pre className="pre">{memoryInfo}</pre>
          </div>
        </div>
      </Section>

      <Section title="Automatic Firmware update">
        <div className="row wrap">
          <button onClick={checkForNewFirmware}>Check for newer firmware</button>
          <button className="secondary" onClick={updateFirmware}>
            Update Firmware
          </button>
        </div>
        <pre className="pre">{newFirmwareInfo}</pre>

        <div className="subhead">Upload progress</div>
        <ProgressBar value={otaProgress} />
      </Section>

      <Section title="Manual Firmware update">
        <div className="row wrap">
          <input ref={firmwareRef} type="file" />
          <button onClick={startOtaUpload}>Start OTA</button>
          <button className="secondary" onClick={stopOtaUpload}>
            Stop OTA Upload
          </button>
        </div>

        <div className="subhead">Upload progress</div>
        <ProgressBar value={otaProgress} />
      </Section>

      <footer className="footer muted">
        Tip: open DevTools console for any download responses (we log the result).
      </footer>
    </div>
  );
}
