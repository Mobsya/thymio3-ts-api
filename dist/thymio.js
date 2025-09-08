"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// thymio.ts
var thymio_exports = {};
__export(thymio_exports, {
  enableSensorStreaming: () => enableSensorStreaming,
  executeLoadedScript: () => executeLoadedScript,
  requestAndConnect: () => requestAndConnect,
  sendPythonScript: () => sendPythonScript,
  setActuatorState: () => setActuatorState,
  stopScriptExecution: () => stopScriptExecution
});
module.exports = __toCommonJS(thymio_exports);
var MAIN_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
var COMMAND_CHARACTERISTIC_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
var SENSOR_STREAM_CHARACTERISTIC_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";
var PYTHON_CHARACTERISTIC_UUID = "0000abf3-0000-1000-8000-00805f9b34fb";
var MTU = 500;
var THYMIO_SENSOR_VALUES_EVENT_ID = "thymio-values";
var THYMIO_OTHER_SENSOR_VALUES_EVENT_ID = "thymio-other-values";
var commandCharacteristic;
var sensorStreamcharacteristic;
var pythonCharacteristic;
var reconnecting = false;
var device;
function requestAndConnect() {
  return __async(this, null, function* () {
    device = yield navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: "THYMIO" }],
      optionalServices: [
        MAIN_SERVICE_UUID
      ]
    });
    device.addEventListener("gattserverdisconnected", onDisconnected);
    yield connect();
  });
}
function connect() {
  return __async(this, null, function* () {
    if (device.gatt) {
      try {
        const server = yield device.gatt.connect();
        const service = yield server.getPrimaryService(MAIN_SERVICE_UUID);
        commandCharacteristic = yield service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
        sensorStreamcharacteristic = yield service.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
        yield sensorStreamcharacteristic.startNotifications();
        sensorStreamcharacteristic.addEventListener("characteristicvaluechanged", handleStreamResponse);
        pythonCharacteristic = yield service.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
        yield pythonCharacteristic.startNotifications();
        pythonCharacteristic.addEventListener("characteristicvaluechanged", handlePythonResponse);
      } catch (e) {
        console.error(`Could not connect to Thymio 3.`, e);
      }
      console.log("\u2705 Connected to Thymio 3 !");
    } else {
      throw new Error("Bluetooth GATT is not available.");
    }
  });
}
function onDisconnected() {
  console.log("\u26A0\uFE0F Disconnected. Attempting to reconnect...");
  if (!reconnecting) {
    reconnecting = true;
    retryConnection();
  }
}
function retryConnection() {
  return __async(this, null, function* () {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      try {
        yield delay(2e3);
        if (!device.gatt.connected) {
          yield connect();
          reconnecting = false;
          return;
        }
      } catch (e) {
        console.warn(`Retry ${attempts + 1} failed:`, e);
      }
      attempts++;
    }
    console.log(`\u274C Failed to reconnect after ${attempts} attempts`);
  });
}
function setActuatorState(actuatorData) {
  return __async(this, null, function* () {
    const commandArray = createCommandByteArray(actuatorData);
    yield commandCharacteristic.writeValue(commandArray);
  });
}
function createCommandByteArray({
  circleLEDs,
  // Array of 8 numbers (0-15)
  frontLegoLEDs,
  // Array of 8 numbers (0-15)
  rearLegoLEDs,
  // Array of 8 numbers (0-15)
  flRGB,
  // { r: 0-15, g: 0-15, b: 0-15 }
  frRGB,
  // { r: 0-15, g: 0-15, b: 0-15 }
  blRGB,
  // { r: 0-15, g: 0-15, b: 0-15 }
  brRGB,
  // { r: 0-15, g: 0-15, b: 0-15 }
  motorLeft,
  // Integer -1000 to 1000
  motorRight,
  // Integer -1000 to 1000
  sound
  // Integer 0 to 19
}) {
  const buffer = new ArrayBuffer(26);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, 1);
  offset++;
  function pack4bitArray(arr) {
    const packed = new Uint8Array(4);
    for (let i = 0; i < 8; i++) {
      const val = arr[i] & 15;
      const byteIndex = Math.floor(i / 2);
      if (i % 2 === 0) {
        packed[byteIndex] |= val << 4;
      } else {
        packed[byteIndex] |= val;
      }
    }
    return packed;
  }
  pack4bitArray(circleLEDs).forEach((byte) => view.setUint8(offset++, byte));
  pack4bitArray(frontLegoLEDs).forEach((byte) => view.setUint8(offset++, byte));
  pack4bitArray(rearLegoLEDs).forEach((byte) => view.setUint8(offset++, byte));
  function packRGB({ r, g, b }) {
    let rgb = (b & 15) << 8 | (g & 15) << 4 | r & 15;
    return rgb;
  }
  view.setUint16(offset, packRGB(flRGB));
  offset += 2;
  view.setUint16(offset, packRGB(frRGB));
  offset += 2;
  view.setUint16(offset, packRGB(blRGB));
  offset += 2;
  view.setUint16(offset, packRGB(brRGB));
  offset += 2;
  view.setInt16(offset, motorLeft);
  offset += 2;
  view.setInt16(offset, motorRight);
  offset += 2;
  view.setUint8(offset, sound);
  offset++;
  return new Uint8Array(buffer);
}
function sendPythonScript(script) {
  return __async(this, null, function* () {
    const encoder = new TextEncoder();
    const scriptDataArray = encoder.encode(script);
    const packets = createScriptPackets(scriptDataArray);
    for (const packet of packets) {
      yield pythonCharacteristic.writeValueWithResponse(packet);
    }
  });
}
function executeLoadedScript() {
  return __async(this, null, function* () {
    const packet = new Uint8Array([2]);
    yield pythonCharacteristic.writeValueWithResponse(packet);
  });
}
function stopScriptExecution() {
  return __async(this, null, function* () {
    const packet = new Uint8Array([3]);
    yield pythonCharacteristic.writeValueWithResponse(packet);
  });
}
function handlePythonResponse(event) {
  const value = event.target.value;
  if (value) {
    const id = value.getUint8(0);
    if (id === 1) {
      const loadResult = value.getUint8(1);
      const resultMessages = {
        0: "\u2705 Script loaded successfully.",
        1: "\u274C CRC mismatch.",
        2: "\u26A0\uFE0F Partial upload.",
        3: "\u274C Wrong sequence.",
        4: "\u274C Script too big (2 KB limit)."
        // Add more error codes if needed
      };
      console.log(
        `[Notification] Script Loaded: ${resultMessages[loadResult] || "Unknown error code: " + loadResult}`
      );
    } else if (id === 2) {
      const result = value.getUint8(1);
      const exception = (result & 1) !== 0;
      const scriptRunning = (result & 2) !== 0;
      console.log("[Notification] Script Terminated:");
      if (!exception && !scriptRunning) {
        console.log("\u2705 Script terminated normally.");
      } else {
        if (exception) console.log("\u274C Script terminated with exception.");
        if (scriptRunning)
          console.log("\u26A0\uFE0F Another script was already running.");
      }
    } else {
      console.warn(
        `[Notification] Unknown ID: 0x${id.toString(16).padStart(2, "0")}`
      );
    }
  }
}
function createScriptPackets(scriptBytes) {
  const FIRST_PACKET_HEADER_SIZE = 1 + 2 + 4 + 2;
  const SUBSEQUENT_PACKET_HEADER_SIZE = 2;
  const PAYLOAD_ID = 1;
  const packets = [];
  const scriptLength = scriptBytes.length;
  const crc = computeCRC32(scriptBytes);
  let seqId = 0;
  const header = new Uint8Array(FIRST_PACKET_HEADER_SIZE);
  header[0] = PAYLOAD_ID;
  header.set(numberToBytes(scriptLength, 2), 1);
  header.set(numberToBytes(crc, 4), 3);
  header.set(numberToBytes(seqId, 2), 7);
  const firstChunkSize = MTU - FIRST_PACKET_HEADER_SIZE;
  const firstScriptChunk = scriptBytes.slice(0, firstChunkSize);
  const firstPacket = new Uint8Array(header.length + firstScriptChunk.length);
  firstPacket.set(header, 0);
  firstPacket.set(firstScriptChunk, header.length);
  packets.push(firstPacket);
  seqId++;
  let offset = firstChunkSize;
  while (offset < scriptBytes.length) {
    const chunkSize = Math.min(MTU - SUBSEQUENT_PACKET_HEADER_SIZE, scriptLength - offset);
    const packet = new Uint8Array(SUBSEQUENT_PACKET_HEADER_SIZE + chunkSize);
    packet.set(numberToBytes(seqId, 2), 0);
    packet.set(scriptBytes.slice(offset, offset + chunkSize), SUBSEQUENT_PACKET_HEADER_SIZE);
    packets.push(packet);
    offset += chunkSize;
    seqId++;
  }
  return packets;
}
function enableSensorStreaming(other = false) {
  return __async(this, null, function* () {
    const id = 1;
    let body = 0;
    if (!other) {
      body |= 1;
    } else {
      body |= 2;
    }
    const payload = new Uint8Array([id, 0]);
    return yield sensorStreamcharacteristic.writeValueWithoutResponse(payload);
  });
}
function handleStreamResponse(event) {
  return __async(this, null, function* () {
    const value = event.target.value;
    console.log(value);
    if (value) {
      const id = value.getUint8(0);
      const data = new Uint8Array(value.buffer.slice(1));
      console.log(data);
      if (id === 1) {
        const sensorsData = parseSensorsData(data);
        const mostValuesEvent = new CustomEvent(THYMIO_SENSOR_VALUES_EVENT_ID, {
          detail: sensorsData
        });
        console.log(sensorsData);
        document.dispatchEvent(mostValuesEvent);
      } else if (id === 2) {
        const otherSensorData = parseOtherSensorData(data);
        const otherValueEvent = new CustomEvent(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, {
          detail: otherSensorData
        });
        console.log(otherSensorData);
        document.dispatchEvent(otherValueEvent);
      }
    }
  });
}
function parseSensorsData(bytes) {
  if (bytes.length !== 38) {
    throw new Error("Invalid byte array length. Expected 38 bytes.");
  }
  const dv = new DataView(bytes.buffer);
  let offset = 0;
  const h = dv.getUint16(offset, true);
  offset += 2;
  const s = dv.getUint8(offset);
  offset += 1;
  const v = dv.getUint8(offset);
  offset += 1;
  const groundLeft = dv.getUint16(offset, true);
  offset += 2;
  const groundRight = dv.getUint16(offset, true);
  offset += 2;
  const accelX = dv.getInt16(offset, true);
  offset += 2;
  const accelY = dv.getInt16(offset, true);
  offset += 2;
  const accelZ = dv.getInt16(offset, true);
  offset += 2;
  const gyroX = dv.getInt16(offset, true);
  offset += 2;
  const gyroY = dv.getInt16(offset, true);
  offset += 2;
  const gyroZ = dv.getInt16(offset, true);
  offset += 2;
  const buttonsByte = dv.getUint8(offset);
  offset += 1;
  const micVolume = dv.getUint16(offset, true);
  offset += 2;
  const proximity = {
    left: dv.getUint16(offset, true),
    offset1: offset += 2,
    frontLeft: dv.getUint16(offset, true),
    offset2: offset += 2,
    center: dv.getUint16(offset, true),
    offset3: offset += 2,
    frontRight: dv.getUint16(offset, true),
    offset4: offset += 2,
    right: dv.getUint16(offset, true),
    offset5: offset += 2,
    backLeft: dv.getUint16(offset, true),
    offset6: offset += 2,
    backRight: dv.getUint16(offset, true),
    offset7: offset += 2
  };
  const tvRemote = dv.getUint8(offset);
  offset += 1;
  return {
    colorSensor: { h, s, v },
    groundSensors: { left: groundLeft, right: groundRight },
    accelerationRaw: { x: accelX, y: accelY, z: accelZ },
    gyroRaw: { x: gyroX, y: gyroY, z: gyroZ },
    buttons: {
      back: !!(buttonsByte & 1 << 0),
      left: !!(buttonsByte & 1 << 1),
      center: !!(buttonsByte & 1 << 2),
      forward: !!(buttonsByte & 1 << 3),
      right: !!(buttonsByte & 1 << 4)
    },
    microphoneVolume: micVolume,
    proximitySensors: {
      left: proximity.left,
      frontLeft: proximity.frontLeft,
      center: proximity.center,
      frontRight: proximity.frontRight,
      right: proximity.right,
      backLeft: proximity.backLeft,
      backRight: proximity.backRight
    },
    tvRemote
  };
}
function parseOtherSensorData(bytes) {
  if (bytes.length !== 30) {
    throw new Error("Invalid byte array length. Expected 30 bytes.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const red = view.getUint16(offset, true);
  offset += 2;
  const green = view.getUint16(offset, true);
  offset += 2;
  const blue = view.getUint16(offset, true);
  offset += 2;
  const clear = view.getUint16(offset, true);
  offset += 2;
  const colorDetected = bytes[offset];
  offset += 1;
  const groundAmbientLeft = view.getUint16(offset, true);
  offset += 2;
  const groundAmbientRight = view.getUint16(offset, true);
  offset += 2;
  const groundReflectedLeft = view.getUint16(offset, true);
  offset += 2;
  const groundReflectedRight = view.getUint16(offset, true);
  offset += 2;
  const angleDegrees = view.getInt16(offset, true);
  offset += 2;
  const eventByte = bytes[offset];
  offset += 1;
  const leftSpeed = view.getInt16(offset, true);
  offset += 2;
  const rightSpeed = view.getInt16(offset, true);
  offset += 2;
  const leftPwmDuty = view.getInt16(offset, true);
  offset += 2;
  const rightPwmDuty = view.getInt16(offset, true);
  offset += 2;
  const batteryVoltage = view.getUint16(offset, true);
  offset += 2;
  return {
    colorRaw: { red, green, blue, clear },
    colorDetected,
    groundAmbient: { left: groundAmbientLeft, right: groundAmbientRight },
    groundReflected: { left: groundReflectedLeft, right: groundReflectedRight },
    angleDegrees,
    eventFlags: {
      tapDetected: (eventByte & 1) !== 0,
      freefallDetected: (eventByte & 2) !== 0,
      clapDetected: (eventByte & 4) !== 0
    },
    motor: {
      leftSpeed,
      rightSpeed,
      leftPwmDuty,
      rightPwmDuty
    },
    batteryVoltage
  };
}
function numberToBytes(value, byteLength) {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[byteLength - 1 - i] = value & 255;
    value >>= 8;
  }
  return bytes;
}
function computeCRC32(buf, crc = 4294967295) {
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 24;
    for (let j = 0; j < 8; j++) {
      if ((crc & 2147483648) === 0) {
        crc <<= 1;
      } else {
        crc = crc << 1 ^ 79764919;
      }
    }
  }
  return crc & 4294967295;
}
function delay(timeout) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), timeout);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  enableSensorStreaming,
  executeLoadedScript,
  requestAndConnect,
  sendPythonScript,
  setActuatorState,
  stopScriptExecution
});
