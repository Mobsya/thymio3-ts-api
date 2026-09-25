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

  useEffect(() => {
    const onSensors = (event) => setMainSensors(event.detail ?? null);
    const onOtherSensors = (event) => setOtherSensors(event.detail ?? null);
    const onConnected = (event) => {
      const isConnected = Boolean(event.detail);

      if (!isConnected) return;

      void (async () => {
        try {
          await getThymio()?.startAllSensorStreaming?.();
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

  return (
    <section className="dashboard-panel telemetry-panel sensors-panel">
      <div className="panel-header">
        <h3>Sensors</h3>
        <div className="actions">
          <div className="row wrap compact-actions">
            <button className="secondary" onClick={startAllSensors}>
              Start
            </button>
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
