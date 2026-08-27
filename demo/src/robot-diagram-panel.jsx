import { buildActuatorData } from "./actuator-state";
import { hsvToRgb } from "./color-utils";
import { clampInt, rgbToCss } from "./utils";
import "./robot-diagram-panel.css";

const PROXIMITY_MAX_VALUE = 5000;
const PROXIMITY_BAR_LENGTH = 58;

const CIRCLE_LED_CENTER = { x: 132, y: 150 };

const PROXIMITY_SENSORS = [
  { id: "right", name: "Right", short: "R", x: 116, y: 85, rotation: 240, labelX: 88, labelY: 64, valueX: 88, valueY: 80 },
  { id: "frontRight", name: "Front right", short: "FR", x: 88, y: 112, rotation: 210, labelX: 45, labelY: 101, valueX: 45, valueY: 117 },
  { id: "center", name: "Center", short: "C", x: 78, y: 150, rotation: 180, labelX: 36, labelY: 145, valueX: 36, valueY: 161 },
  { id: "frontLeft", name: "Front left", short: "FL", x: 88, y: 188, rotation: 150, labelX: 45, labelY: 202, valueX: 45, valueY: 218 },
  { id: "left", name: "Left", short: "L", x: 116, y: 215, rotation: 120, labelX: 88, labelY: 239, valueX: 88, valueY: 255 },
  { id: "backRight", name: "Back right", short: "BR", x: 294, y: 104, rotation: 0, labelX: 354, labelY: 96, valueX: 354, valueY: 112 },
  { id: "backLeft", name: "Back left", short: "BL", x: 294, y: 196, rotation: 0, labelX: 354, labelY: 188, valueX: 354, valueY: 204 },
];

const GROUND_SENSORS = [
  { id: "right", name: "Ground right", x: 184, y: 212 },
  { id: "left", name: "Ground left", x: 222, y: 212 },
];

const RGB_LEDS = [
  { key: "frRGB", label: "FR", x: 113, y: 112, labelY: 98 },
  { key: "flRGB", label: "FL", x: 113, y: 188, labelY: 204 },
  { key: "brRGB", label: "BR", x: 258, y: 104, labelY: 91 },
  { key: "blRGB", label: "BL", x: 258, y: 196, labelY: 213 },
  { key: "smallBottomRGB", label: "Bottom", x: 193, y: 150, labelY: 169 },
  { key: "smallBackRGB", label: "Back", x: 285, y: 150, labelX: 318, labelY: 154, textAnchor: "start" },
];

const BUTTON_PADS = [
  { key: "forward", label: "F", x: 132, y: 131, ledIndex: 0 },
  { key: "left", label: "L", x: 113, y: 150, ledIndex: 1 },
  { key: "center", label: "C", x: 132, y: 150 },
  { key: "right", label: "R", x: 151, y: 150, ledIndex: 2 },
  { key: "back", label: "B", x: 132, y: 169, ledIndex: 3 },
];

const FRONT_LED_POINTS = [
  { x: 139, y: 83 },
  { x: 119, y: 92 },
  { x: 102, y: 109 },
  { x: 92, y: 132 },
  { x: 92, y: 168 },
  { x: 102, y: 191 },
  { x: 119, y: 208 },
  { x: 139, y: 217 },
];

const REAR_LED_POINTS = [
  { x: 277, y: 91 },
  { x: 277, y: 108 },
  { x: 277, y: 125 },
  { x: 277, y: 142 },
  { x: 277, y: 158 },
  { x: 277, y: 175 },
  { x: 277, y: 192 },
  { x: 277, y: 209 },
];

function getProximityValue(proximitySensors, sensorId) {
  const value = proximitySensors?.[sensorId];
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function getGroundValue(mainSensors, sensorId) {
  const value = mainSensors?.groundSensors?.[sensorId];
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getRatio(value, maxValue) {
  if (value === null) return 0;
  return clampInt(value, 0, maxValue) / maxValue;
}

function getProximityColor(ratio) {
  if (ratio <= 0) return "#cee6c7";
  if (ratio < 0.18) return "#35b34a";
  if (ratio < 0.36) return "#9ccb2a";
  if (ratio < 0.54) return "#d8d520";
  if (ratio < 0.72) return "#dba51f";
  if (ratio < 0.9) return "#e8601c";
  return "#de2222";
}

function formatValue(value) {
  return value === null ? "Waiting" : String(value);
}

function formatDiagramValue(value) {
  return value === null ? "-" : String(value);
}

function rgb255ToCss(rgb) {
  if (!rgb) return "#e2e8f0";
  return `rgb(${clampInt(rgb.r, 0, 255)} ${clampInt(rgb.g, 0, 255)} ${clampInt(rgb.b, 0, 255)})`;
}

function getAmberLedStyle(value) {
  const intensity = clampInt(value, 0, 15);
  const ratio = intensity / 15;

  return {
    fill: intensity > 0 ? "#facc15" : "#e2e8f0",
    opacity: intensity > 0 ? 0.38 + ratio * 0.62 : 0.48,
    filter: intensity > 0 ? `drop-shadow(0 0 ${2 + ratio * 8}px rgba(250, 204, 21, ${0.35 + ratio * 0.35}))` : "none",
  };
}

function getRgbLedStyle(rgb) {
  const color = rgbToCss(rgb);
  const ratio = Math.max(clampInt(rgb.r, 0, 15), clampInt(rgb.g, 0, 15), clampInt(rgb.b, 0, 15)) / 15;

  return {
    fill: ratio > 0 ? color : "#e2e8f0",
    opacity: ratio > 0 ? 0.45 + ratio * 0.55 : 0.52,
    filter: ratio > 0 ? `drop-shadow(0 0 ${3 + ratio * 10}px ${color})` : "none",
  };
}

function MonochromeLed({ className = "", label, r = 5, value, x, y }) {
  return (
    <g className={`robot-led-marker ${className}`.trim()}>
      <title>{`${label}: ${clampInt(value, 0, 15)}`}</title>
      <circle className="robot-led-halo" cx={x} cy={y} r={r + 3} style={getAmberLedStyle(value)} />
      <circle className="robot-led-lens" cx={x} cy={y} r={r} style={getAmberLedStyle(value)} />
    </g>
  );
}

function RgbLed({ label, labelX, labelY, rgb, r = 9, textAnchor = "middle", x, y }) {
  const normalizedRgb = buildActuatorData({ flRGB: rgb }).flRGB;
  const renderedLabelX = labelX ?? x;
  const renderedLabelY = labelY ?? y + 22;

  return (
    <g className="robot-rgb-marker">
      <title>{`${label}: R ${normalizedRgb.r} G ${normalizedRgb.g} B ${normalizedRgb.b}`}</title>
      <circle className="robot-rgb-halo" cx={x} cy={y} r={r + 6} style={getRgbLedStyle(normalizedRgb)} />
      <circle className="robot-rgb-lens" cx={x} cy={y} r={r} style={getRgbLedStyle(normalizedRgb)} />
      <text className="robot-led-label" x={renderedLabelX} y={renderedLabelY} textAnchor={textAnchor}>
        {label}
      </text>
    </g>
  );
}

function CircleLeds({ values }) {
  const centerX = CIRCLE_LED_CENTER.x;
  const centerY = CIRCLE_LED_CENTER.y;
  const radius = 39;

  return Array.from({ length: 8 }, (_, index) => {
    const angle = (-90 + index * 45) * (Math.PI / 180);
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    return (
      <MonochromeLed
        key={index}
        label={`Circle LED ${index + 1}`}
        r={5.5}
        value={values[index]}
        x={x}
        y={y}
      />
    );
  });
}

function ProximityMarker({ sensor, value }) {
  const ratio = getRatio(value, PROXIMITY_MAX_VALUE);
  const fillWidth = Math.max(0, PROXIMITY_BAR_LENGTH * ratio);

  return (
    <g className="robot-proximity-marker">
      <title>{`${sensor.name}: ${formatValue(value)}`}</title>
      <g transform={`translate(${sensor.x} ${sensor.y}) rotate(${sensor.rotation})`}>
        <rect className="robot-proximity-bar-plate" x="0" y="-7.5" width={PROXIMITY_BAR_LENGTH} height="15" rx="3" />
        <rect
          className="robot-proximity-bar-fill"
          x="0"
          y="-7.5"
          width={fillWidth}
          height="15"
          rx="3"
          style={{
            fill: getProximityColor(ratio),
            opacity: value === null ? 0.24 : 0.96,
          }}
        />
        <rect className="robot-proximity-bar-outline" x="0" y="-7.5" width={PROXIMITY_BAR_LENGTH} height="15" rx="3" />
      </g>
      <circle className="robot-proximity-dot" cx={sensor.x} cy={sensor.y} r="7" style={{ opacity: 0.55 + ratio * 0.45 }} />
      <text className="robot-proximity-label" x={sensor.labelX} y={sensor.labelY} textAnchor="middle">
        {sensor.short}
      </text>
      <text className="robot-proximity-value" x={sensor.valueX} y={sensor.valueY} textAnchor="middle">
        {formatDiagramValue(value)}
      </text>
    </g>
  );
}

function GroundSensorMarker({ sensor, mainSensors, otherSensors }) {
  const value = getGroundValue(mainSensors, sensor.id);
  const ambient = otherSensors?.groundAmbient?.[sensor.id];
  const reflected = otherSensors?.groundReflected?.[sensor.id];

  return (
    <g className="robot-ground-marker">
      <title>
        {`${sensor.name}: ${formatValue(value)}${Number.isFinite(ambient) ? `, ambient ${ambient}` : ""}${Number.isFinite(reflected) ? `, reflected ${reflected}` : ""}`}
      </title>
      <rect className="robot-ground-pad" x={sensor.x - 18} y={sensor.y - 9} width="36" height="18" rx="6" />
      <text className="robot-ground-label" x={sensor.x} y={sensor.y + 4} textAnchor="middle">
        {formatDiagramValue(value)}
      </text>
    </g>
  );
}

function ButtonPad({ button, buttons, ledValues }) {
  const isPressed = Boolean(buttons?.[button.key]);
  const hasLed = typeof button.ledIndex === "number";

  return (
    <g className={`robot-button-pad ${isPressed ? "pressed" : ""}`}>
      <title>{`${button.label} button${hasLed ? ` LED: ${clampInt(ledValues[button.ledIndex], 0, 15)}` : ""}${isPressed ? ", pressed" : ""}`}</title>
      <circle className="robot-button-touch" cx={button.x} cy={button.y} r={button.key === "center" ? 16 : 14} />
      {hasLed ? (
        <circle
          className="robot-button-led"
          cx={button.x}
          cy={button.y}
          r="6"
          style={getAmberLedStyle(ledValues[button.ledIndex])}
        />
      ) : null}
      <text className="robot-button-label" x={button.x} y={button.y + 4} textAnchor="middle">
        {button.label}
      </text>
    </g>
  );
}

function ProximityMeter({ sensor, value }) {
  const ratio = getRatio(value, PROXIMITY_MAX_VALUE);
  const width = `${Math.round(ratio * 100)}%`;

  return (
    <div className="proximity-meter">
      <div className="proximity-meter-header">
        <span title={sensor.name}>{sensor.short}</span>
        <strong>{formatValue(value)}</strong>
      </div>
      <div className="proximity-meter-track" aria-label={`${sensor.name} proximity`}>
        <span className="proximity-meter-fill" style={{ width, "--proximity-color": getProximityColor(ratio) }} />
      </div>
    </div>
  );
}

export default function RobotDiagramPanel({ actuatorData, mainSensors, otherSensors }) {
  const normalizedActuatorData = buildActuatorData(actuatorData);
  const proximitySensors = mainSensors?.proximitySensors;
  const colorSensorRgb = hsvToRgb(mainSensors?.colorSensor);
  const colorRawRgb = otherSensors?.colorRaw ? rgb255ToCss(otherSensors.colorRaw) : null;
  const colorFill = colorRawRgb ?? rgb255ToCss(colorSensorRgb);
  const tvRemoteValue = mainSensors?.tvRemote;

  return (
    <section className="dashboard-panel telemetry-panel robot-diagram-panel">
      <div className="panel-header">
        <h3>Robot Diagram</h3>
      </div>

      <div className="panel-body">
        <div className="panel-scroll robot-diagram-scroll">
          <div className="robot-diagram-shell">
            <div className="robot-visual-frame">
              <svg className="robot-diagram" viewBox="0 0 400 300" role="img" aria-labelledby="robot-diagram-title robot-diagram-desc">
                <title id="robot-diagram-title">Thymio robot diagram</title>
                <desc id="robot-diagram-desc">Live LED colours, button sensors, receiver, microphone, ground sensors, colour sensor, and proximity sensors.</desc>

                <rect className="robot-footprint" x="24" y="35" width="352" height="230" rx="12" />

                <rect className="robot-wheel top" x="232" y="62" width="54" height="24" rx="3" />
                <rect className="robot-wheel bottom" x="232" y="214" width="54" height="24" rx="3" />

                <path className="robot-body" d="M154 75 A 75 75 0 0 0 154 225 L292 225 L292 75 Z" />
                <path className="robot-body-highlight" d="M155 91 A 59 59 0 0 0 155 209 L272 209 L272 91 Z" />
                <line className="robot-rear-edge" x1="292" y1="75" x2="292" y2="225" />
                <path className="robot-deck-line" d="M154 75 A 75 75 0 0 0 154 225" />

                <g className="robot-front-arrow">
                  <line x1="73" y1="150" x2="105" y2="150" />
                  <path d="M80 142 L72 150 L80 158" />
                  <text x="66" y="154" textAnchor="end">Front</text>
                </g>

                {PROXIMITY_SENSORS.map((sensor) => (
                  <ProximityMarker
                    key={sensor.id}
                    sensor={sensor}
                    value={getProximityValue(proximitySensors, sensor.id)}
                  />
                ))}

                {FRONT_LED_POINTS.map((point, index) => (
                  <MonochromeLed
                    key={index}
                    className="front-lego-led"
                    label={`Front LED ${index + 1}`}
                    r={4.2}
                    value={normalizedActuatorData.frontLegoLEDs[index]}
                    x={point.x}
                    y={point.y}
                  />
                ))}

                {REAR_LED_POINTS.map((point, index) => (
                  <MonochromeLed
                    key={index}
                    className="rear-lego-led"
                    label={`Rear LED ${index + 1}`}
                    r={3.8}
                    value={normalizedActuatorData.rearLegoLEDs[index]}
                    x={point.x}
                    y={point.y}
                  />
                ))}

                <circle className="robot-button-ring" cx={CIRCLE_LED_CENTER.x} cy={CIRCLE_LED_CENTER.y} r="33" />

                <CircleLeds values={normalizedActuatorData.circleLEDs} />

                {RGB_LEDS.map((led) => (
                  <RgbLed
                    key={led.key}
                    label={led.label}
                    labelX={led.labelX}
                    labelY={led.labelY}
                    rgb={normalizedActuatorData[led.key]}
                    r={led.key.startsWith("small") ? 7 : 9}
                    textAnchor={led.textAnchor}
                    x={led.x}
                    y={led.y}
                  />
                ))}

                <g className="robot-buttons">
                  {BUTTON_PADS.map((button) => (
                    <ButtonPad
                      key={button.key}
                      button={button}
                      buttons={mainSensors?.buttons}
                      ledValues={normalizedActuatorData.buttonLEDs}
                    />
                  ))}
                </g>

                {GROUND_SENSORS.map((sensor) => (
                  <GroundSensorMarker
                    key={sensor.id}
                    sensor={sensor}
                    mainSensors={mainSensors}
                    otherSensors={otherSensors}
                  />
                ))}

                <g className="robot-receiver">
                  <title>{`Receiver LED: ${normalizedActuatorData.receiverLED}${Number.isFinite(tvRemoteValue) ? `, TV remote ${tvRemoteValue}` : ""}`}</title>
                  <rect className="robot-sensor-chip" x="166" y="103" width="38" height="15" rx="6" />
                  <MonochromeLed label="Receiver LED" r={5} value={normalizedActuatorData.receiverLED} x={185} y={110.5} />
                  <text className="robot-sensor-chip-label" x="185" y="99" textAnchor="middle">IR</text>
                </g>

                <g className={`robot-microphone ${normalizedActuatorData.microphoneLED ? "on" : ""}`}>
                  <title>{`Microphone LED: ${normalizedActuatorData.microphoneLED ? "on" : "off"}`}</title>
                  <circle className="robot-sensor-chip" cx="228" cy="185" r="12" />
                  <circle className="robot-microphone-led" cx="228" cy="185" r="6" />
                  <text className="robot-sensor-chip-label" x="228" y="205" textAnchor="middle">Mic</text>
                </g>

                <g className="robot-color-sensor">
                  <title>Colour sensor</title>
                  <rect className="robot-sensor-chip" x="163" y="180" width="31" height="24" rx="7" />
                  <circle className="robot-color-swatch" cx="178.5" cy="192" r="8" style={{ fill: colorFill }} />
                  <text className="robot-sensor-chip-label" x="178.5" y="176" textAnchor="middle">Color</text>
                </g>

                <g className="robot-inertial-sensor">
                  <title>Acceleration and gyro sensors</title>
                  <rect className="robot-sensor-chip" x="214" y="136" width="38" height="20" rx="6" />
                  <path className="robot-inertial-axis" d="M223 146 H243 M233 140 V152" />
                  <text className="robot-sensor-chip-label" x="233" y="132" textAnchor="middle">IMU</text>
                </g>

                <g className="robot-pen-hole">
                  <title>Pen holder</title>
                  <circle cx="235" cy="150" r="12" />
                  <circle cx="235" cy="150" r="4" />
                </g>
              </svg>
            </div>

            <div className="proximity-readouts">
              {PROXIMITY_SENSORS.map((sensor) => (
                <ProximityMeter
                  key={sensor.id}
                  sensor={sensor}
                  value={getProximityValue(proximitySensors, sensor.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
