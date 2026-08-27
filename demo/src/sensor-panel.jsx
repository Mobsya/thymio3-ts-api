import { useState } from "react";
import { SENSOR_FOCUS_SENSOR_IDS } from "./sensor-options";
import SensorFocusPanel from "./sensor-focus-panel";
import "./sensor-panel.css";

export default function SensorPanel({
  mainSensors,
  otherSensors,
  onSelectSensorStream,
  onStopSensors,
  sensorStreamMode,
}) {
  const [focusedSensors, setFocusedSensors] = useState(SENSOR_FOCUS_SENSOR_IDS);
  const [isSensorSelectorOpen, setIsSensorSelectorOpen] = useState(false);

  async function selectSensorStream(event) {
    await onSelectSensorStream(event.target.value);
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
            <button className="secondary" onClick={onStopSensors}>
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
