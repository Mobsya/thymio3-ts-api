import React, { useEffect, useState } from "react";
import { SENSOR_FOCUS_SENSOR_IDS } from "./sensor-options";
import SensorFocusPanel from "./sensor-focus-panel";
import "./sensor-panel.css";

function getThymio() {
  return window.thymio;
}

export default function SensorPanel() {
  const [mainSensors, setMainSensors] = useState(null);
  const [otherSensors, setOtherSensors] = useState(null);
  const [focusedSensors, setFocusedSensors] = useState(SENSOR_FOCUS_SENSOR_IDS);
  const [isSensorSelectorOpen, setIsSensorSelectorOpen] = useState(false);
  const [sensorStreamMode, setSensorStreamMode] = useState("idle");

  useEffect(() => {
    const onSensors = (event) => setMainSensors(event.detail ?? null);
    const onOtherSensors = (event) => setOtherSensors(event.detail ?? null);
    const onConnected = (event) => {
      const isConnected = Boolean(event.detail);

      if (!isConnected) {
        setSensorStreamMode("idle");
        return;
      }

      void (async () => {
        try {
          await getThymio()?.startAllSensorStreaming?.();
          setSensorStreamMode("all");
        } catch (err) {
          console.warn("Failed to start sensor streaming", err);
        }
      })();
    };

    document.addEventListener("thymio-connected", onConnected);
    document.addEventListener("thymio-sensor-values", onSensors);
    document.addEventListener("thymio-sensor-other-values", onOtherSensors);

    return () => {
      document.removeEventListener("thymio-connected", onConnected);
      document.removeEventListener("thymio-sensor-values", onSensors);
      document.removeEventListener("thymio-sensor-other-values", onOtherSensors);
    };
  }, []);

  async function startMainSensors() {
    const t = getThymio();
    if (!t?.startMainSensorStreaming) return;
    await t.startMainSensorStreaming();
    setSensorStreamMode("main");
  }

  async function startOtherSensors() {
    const t = getThymio();
    if (!t?.startSecondarySensorStreaming) return;
    await t.startSecondarySensorStreaming();
    setSensorStreamMode("other");
  }

  async function startAllSensors() {
    const t = getThymio();
    if (!t?.startAllSensorStreaming) return;
    await t.startAllSensorStreaming();
    setSensorStreamMode("all");
  }

  async function stopSensors() {
    const t = getThymio();
    if (!t?.stopSensorStreaming) return;
    await t.stopSensorStreaming();
    setSensorStreamMode("stopped");
  }

  async function selectSensorStream(event) {
    const stream = event.target.value;

    if (stream === "main") {
      await startMainSensors();
      return;
    }

    if (stream === "other") {
      await startOtherSensors();
      return;
    }

    if (stream === "all") {
      await startAllSensors();
    }
  }

  return (
    <section className="dashboard-panel telemetry-panel sensors-panel">
      <div className="panel-header">
        <h3>Sensors</h3>
        <div className="actions">
          <div className="row wrap compact-actions">
            <label className="sensor-stream-select">
              <span>Stream</span>
              <select onChange={selectSensorStream} value={sensorStreamMode}>
                <option disabled value="idle">
                  Idle
                </option>
                <option value="all">All</option>
                <option value="main">Main</option>
                <option value="other">Other</option>
                <option disabled value="stopped">
                  Stopped
                </option>
              </select>
            </label>
            <button className="secondary" onClick={stopSensors}>
              Stop
            </button>
            <button className="secondary" onClick={() => setIsSensorSelectorOpen((isOpen) => !isOpen)}>
              Values
            </button>
          </div>
        </div>
      </div>

      <div className="panel-body">
        <div className="panel-scroll sensor-panel-scroll">
          <SensorFocusPanel
            mainSensors={mainSensors}
            otherSensors={otherSensors}
            focusedSensors={focusedSensors}
            onFocusedSensorsChange={setFocusedSensors}
            showSelector={isSensorSelectorOpen}
          />
        </div>
      </div>
    </section>
  );
}
