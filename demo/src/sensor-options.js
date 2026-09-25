export const SENSOR_OPTIONS = [
  { id: "colorSensor", label: "Color HSV", group: "colour", source: "main", path: ["colorSensor"] },
  { id: "groundSensors", label: "Ground", group: "ground", source: "main", path: ["groundSensors"] },
  { id: "accelerationRaw", label: "Acceleration", source: "main", path: ["accelerationRaw"] },
  { id: "gyroRaw", label: "Gyro", source: "main", path: ["gyroRaw"] },
  { id: "buttons", label: "Buttons", source: "main", path: ["buttons"] },
  { id: "microphoneVolume", label: "Microphone", source: "main", path: ["microphoneVolume"] },
  { id: "proximitySensors", label: "Proximity", source: "main", path: ["proximitySensors"] },
  { id: "tvRemote", label: "TV remote", source: "main", path: ["tvRemote"] },
  { id: "colorRaw", label: "Color raw", group: "colour", source: "secondary", path: ["colorRaw"] },
  { id: "colorDetected", label: "Color detected", group: "colour", source: "secondary", path: ["colorDetected"] },
  { id: "groundAmbient", label: "Ground ambient", group: "ground", source: "secondary", path: ["groundAmbient"] },
  { id: "groundReflected", label: "Ground reflected", group: "ground", source: "secondary", path: ["groundReflected"] },
  { id: "angleDegrees", label: "Angle", source: "secondary", path: ["angleDegrees"] },
  { id: "eventFlags", label: "Events", source: "secondary", path: ["eventFlags"] },
  { id: "motor", label: "Motor feedback", source: "secondary", path: ["motor"] },
  { id: "batteryVoltage", label: "Battery", source: "secondary", path: ["batteryVoltage"] },
];

export const SENSOR_FOCUS_SENSOR_IDS = SENSOR_OPTIONS.map((option) => option.id);
