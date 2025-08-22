"use strict";
var thymio = (() => {
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
    executeLoadedScript: () => executeLoadedScript,
    requestAndConnect: () => requestAndConnect,
    sendPythonScript: () => sendPythonScript,
    setActuatorState: () => setActuatorState,
    stopScriptExecution: () => stopScriptExecution
  });
  var MAIN_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
  var COMMAND_CHARACTERISTIC_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
  var SENSOR_STREAM_CHARACTERISTIC_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";
  var PYTHON_CHARACTERISTIC_UUID = "0000abf3-0000-1000-8000-00805f9b34fb";
  var MTU = 500;
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
  return __toCommonJS(thymio_exports);
})();
