import { clampInt } from "./utils";

export const DEFAULT_ACTUATOR_DATA = {
  circleLEDs: Array(8).fill(0),
  frontLegoLEDs: Array(8).fill(0),
  rearLegoLEDs: Array(8).fill(0),
  flRGB: { r: 0, g: 0, b: 0 },
  frRGB: { r: 0, g: 0, b: 0 },
  blRGB: { r: 0, g: 0, b: 0 },
  brRGB: { r: 0, g: 0, b: 0 },
  motorLeft: 0,
  motorRight: 0,
  sound: 0,
  smallBottomRGB: { r: 0, g: 0, b: 0 },
  smallBackRGB: { r: 0, g: 0, b: 0 },
  buttonLEDs: Array(4).fill(0),
  receiverLED: 0,
  microphoneLED: false,
};

const ACTUATOR_SEND_INTERVAL_MS = 100;

let pendingActuatorData = null;
let actuatorSendTimer = null;
let actuatorSendInFlight = false;
let lastActuatorSendAt = 0;

function getThymio() {
  return window.thymio;
}

function canSendActuatorData(t) {
  return Boolean(t?.setActuatorState && (!t.isConnected || t.isConnected()));
}

function normalizeRgb(rgb = DEFAULT_ACTUATOR_DATA.flRGB) {
  return {
    r: clampInt(rgb.r, 0, 15),
    g: clampInt(rgb.g, 0, 15),
    b: clampInt(rgb.b, 0, 15),
  };
}

function normalizeIntensityList(values = [], length) {
  return Array.from({ length }, (_, index) => clampInt(values[index], 0, 15));
}

export function buildActuatorData(overrides = {}, base = DEFAULT_ACTUATOR_DATA) {
  return {
    circleLEDs: normalizeIntensityList(overrides.circleLEDs ?? base.circleLEDs, 8),
    frontLegoLEDs: normalizeIntensityList(overrides.frontLegoLEDs ?? base.frontLegoLEDs, 8),
    rearLegoLEDs: normalizeIntensityList(overrides.rearLegoLEDs ?? base.rearLegoLEDs, 8),
    flRGB: normalizeRgb(overrides.flRGB ?? base.flRGB),
    frRGB: normalizeRgb(overrides.frRGB ?? base.frRGB),
    blRGB: normalizeRgb(overrides.blRGB ?? base.blRGB),
    brRGB: normalizeRgb(overrides.brRGB ?? base.brRGB),
    motorLeft: clampInt(overrides.motorLeft ?? base.motorLeft, -1000, 1000),
    motorRight: clampInt(overrides.motorRight ?? base.motorRight, -1000, 1000),
    sound: clampInt(overrides.sound ?? base.sound, 0, 19),
    smallBottomRGB: normalizeRgb(overrides.smallBottomRGB ?? base.smallBottomRGB),
    smallBackRGB: normalizeRgb(overrides.smallBackRGB ?? base.smallBackRGB),
    buttonLEDs: normalizeIntensityList(overrides.buttonLEDs ?? overrides.buttonLEDS ?? base.buttonLEDs, 4),
    receiverLED: clampInt(overrides.receiverLED ?? base.receiverLED, 0, 15),
    microphoneLED: Boolean(overrides.microphoneLED ?? base.microphoneLED),
  };
}

function scheduleActuatorFlush() {
  if (actuatorSendTimer !== null) {
    return;
  }

  const elapsed = Date.now() - lastActuatorSendAt;
  const delay = Math.max(0, ACTUATOR_SEND_INTERVAL_MS - elapsed);

  actuatorSendTimer = setTimeout(() => {
    actuatorSendTimer = null;
    void flushActuatorData();
  }, delay);
}

async function flushActuatorData() {
  if (actuatorSendInFlight) {
    return;
  }

  const actuatorData = pendingActuatorData;
  if (!actuatorData) {
    return;
  }

  const t = getThymio();
  if (!canSendActuatorData(t)) {
    pendingActuatorData = null;
    return;
  }

  pendingActuatorData = null;
  actuatorSendInFlight = true;
  lastActuatorSendAt = Date.now();

  try {
    await t.setActuatorState(actuatorData);
  } catch (err) {
    console.error("Failed to send actuator data", err);
  } finally {
    actuatorSendInFlight = false;

    if (pendingActuatorData) {
      scheduleActuatorFlush();
    }
  }
}

export function scheduleActuatorData(actuatorData, { alertIfMissing = false } = {}) {
  const t = getThymio();
  if (!t?.setActuatorState) {
    if (alertIfMissing) alert("thymio not loaded");
    return;
  }

  if (!canSendActuatorData(t)) {
    pendingActuatorData = null;
    return;
  }

  pendingActuatorData = buildActuatorData(actuatorData);
  scheduleActuatorFlush();
}

export function clearScheduledActuatorData() {
  if (actuatorSendTimer !== null) {
    clearTimeout(actuatorSendTimer);
    actuatorSendTimer = null;
  }

  pendingActuatorData = null;
}
