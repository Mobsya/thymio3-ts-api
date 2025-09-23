// thymio.ts
import { BehaviorSubject, filter, firstValueFrom, timeout } from "rxjs";
var MAIN_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
var COMMAND_CHARACTERISTIC_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
var SENSOR_STREAM_CHARACTERISTIC_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";
var PYTHON_CHARACTERISTIC_UUID = "0000abf3-0000-1000-8000-00805f9b34fb";
var OTA_SERVICE_UUID = 32792;
var OTA_FIRMWARE_CHARACTERISTIC_UUID = 32800;
var OTA_COMMAND_CHARACTERISTIC_UUID = 32802;
var otaFirmwareCharacteristic;
var otaCommandCharacteristic;
var MTU = 500;
var FIRMWARE_PAYLOAD_SIZE = MTU - 4;
var FIRMWARE_SECTOR_SIZE = 4096;
var THYMIO_SENSOR_VALUES_EVENT_ID = "thymio-sensor-values";
var THYMIO_OTHER_SENSOR_VALUES_EVENT_ID = "thymio-sensor-other-values";
var THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID = "thymio-ota-upload-progress";
var otaCommandResponse$;
var otaSectorUploadResponse$;
var commandCharacteristic;
var sensorStreamcharacteristic;
var pythonCharacteristic;
var reconnecting = false;
var device;
async function requestAndConnect() {
  device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: "THYMIO" }],
    optionalServices: [
      MAIN_SERVICE_UUID,
      OTA_SERVICE_UUID
    ]
  });
  device.addEventListener("gattserverdisconnected", onDisconnected);
  await connect();
}
async function connect() {
  if (device.gatt) {
    try {
      const server = await device.gatt.connect();
      const mainService = await server.getPrimaryService(MAIN_SERVICE_UUID);
      commandCharacteristic = await mainService.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
      sensorStreamcharacteristic = await mainService.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
      await sensorStreamcharacteristic.startNotifications();
      sensorStreamcharacteristic.addEventListener("characteristicvaluechanged", handleStreamResponse);
      pythonCharacteristic = await mainService.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
      await pythonCharacteristic.startNotifications();
      pythonCharacteristic.addEventListener("characteristicvaluechanged", handlePythonResponse);
      const otaService = await server.getPrimaryService(OTA_SERVICE_UUID);
      otaFirmwareCharacteristic = await otaService.getCharacteristic(OTA_FIRMWARE_CHARACTERISTIC_UUID);
      otaFirmwareCharacteristic.startNotifications();
      otaFirmwareCharacteristic.addEventListener("characteristicvaluechanged", otaFirmwareNotificationHandler);
      otaCommandCharacteristic = await otaService.getCharacteristic(OTA_COMMAND_CHARACTERISTIC_UUID);
      otaCommandCharacteristic.startNotifications();
      otaCommandCharacteristic.addEventListener("characteristicvaluechanged", otaCommandNotificationHandler);
    } catch (e) {
      console.error(`Could not connect to Thymio 3.`, e);
    }
    console.log("\u2705 Connected to Thymio 3 !");
  } else {
    throw new Error("Bluetooth GATT is not available.");
  }
}
function onDisconnected() {
  console.log("\u26A0\uFE0F Disconnected. Attempting to reconnect...");
  if (!reconnecting) {
    reconnecting = true;
    retryConnection();
  }
}
async function retryConnection() {
  let attempts = 0;
  const maxAttempts = 10;
  while (attempts < maxAttempts) {
    try {
      await delay(2e3);
      if (!device.gatt.connected) {
        await connect();
        reconnecting = false;
        return;
      }
    } catch (e) {
      console.warn(`Retry ${attempts + 1} failed:`, e);
    }
    attempts++;
  }
  console.log(`\u274C Failed to reconnect after ${attempts} attempts`);
}
async function setActuatorState(actuatorData) {
  const commandArray = createCommandByteArray(actuatorData);
  await commandCharacteristic.writeValue(commandArray);
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
        packed[byteIndex] |= val;
      } else {
        packed[byteIndex] |= val << 4;
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
  view.setUint16(offset, packRGB(flRGB), true);
  offset += 2;
  view.setUint16(offset, packRGB(frRGB), true);
  offset += 2;
  view.setUint16(offset, packRGB(blRGB), true);
  offset += 2;
  view.setUint16(offset, packRGB(brRGB), true);
  offset += 2;
  view.setInt16(offset, motorLeft);
  offset += 2;
  view.setInt16(offset, motorRight);
  offset += 2;
  view.setUint8(offset, sound);
  offset++;
  return new Uint8Array(buffer);
}
async function sendPythonScript(script) {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createScriptPackets(scriptDataArray);
  for (const packet of packets) {
    await pythonCharacteristic.writeValueWithResponse(packet);
  }
}
async function executeLoadedScript() {
  const packet = new Uint8Array([2]);
  await pythonCharacteristic.writeValueWithResponse(packet);
}
async function stopScriptExecution() {
  const packet = new Uint8Array([3]);
  await pythonCharacteristic.writeValueWithResponse(packet);
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
async function startSensorStreaming(other = false) {
  const id = 1;
  let body = 0;
  if (!other) {
    body |= 1;
  } else {
    body |= 2;
  }
  const payload = new Uint8Array([id, body]);
  return await sensorStreamcharacteristic.writeValueWithResponse(payload);
}
async function stopSensorStreaming() {
  const id = 1;
  const body = 0;
  const payload = new Uint8Array([id, body]);
  return await sensorStreamcharacteristic.writeValueWithResponse(payload);
}
async function handleStreamResponse(event) {
  const value = event.target.value;
  if (value) {
    const id = value.getUint8(0);
    const data = new Uint8Array(value.buffer.slice(1));
    if (id === 1) {
      const sensorsData = parseSensorsData(data);
      const mostValuesEvent = new CustomEvent(THYMIO_SENSOR_VALUES_EVENT_ID, {
        detail: sensorsData
      });
      document.dispatchEvent(mostValuesEvent);
    } else if (id === 2) {
      const otherSensorData = parseOtherSensorData(data);
      const otherValueEvent = new CustomEvent(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, {
        detail: otherSensorData
      });
      document.dispatchEvent(otherValueEvent);
    }
  }
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
async function uploadFirmware(firmware) {
  otaCommandResponse$ = new BehaviorSubject(false);
  await startOTA(firmware.byteLength);
  otaSectorUploadResponse$ = new BehaviorSubject(0);
  return await uploadFirmwareData(firmware);
}
async function stopFirmwareUpload() {
  return await stopOTA();
}
async function startOTA(firmwareLength) {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint16(0, 1, true);
  view.setUint32(2, firmwareLength, true);
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);
  const packet = new Uint8Array(buffer);
  await otaCommandCharacteristic.writeValueWithResponse(packet);
  await firstValueFrom(
    otaCommandResponse$.pipe(
      filter((res) => res),
      timeout(1e4)
      // timeout of 3 seconds
    )
  );
}
async function stopOTA() {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint16(0, 2, true);
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);
  const packet = new Uint8Array(buffer);
  return await otaCommandCharacteristic.writeValueWithResponse(packet);
}
async function uploadFirmwareData(firmware) {
  const firmwareBytes = new Uint8Array(firmware);
  const totalSectors = Math.ceil(firmwareBytes.length / FIRMWARE_SECTOR_SIZE);
  console.log(
    `Uploading firmware: ${firmwareBytes.length} bytes, ${totalSectors} sectors`
  );
  for (let sector = 0; sector < totalSectors; sector++) {
    const start = sector * FIRMWARE_SECTOR_SIZE;
    const end = Math.min(start + FIRMWARE_SECTOR_SIZE, firmwareBytes.length);
    const sectorData = firmwareBytes.slice(start, end);
    console.log(`Sending sector ${sector}`);
    let seq = 0;
    while (seq * FIRMWARE_PAYLOAD_SIZE < sectorData.length) {
      const slice = sectorData.slice(
        seq * FIRMWARE_PAYLOAD_SIZE,
        (seq + 1) * FIRMWARE_PAYLOAD_SIZE
      );
      const packet = buildPacket(sector, seq, slice);
      await otaFirmwareCharacteristic.writeValueWithResponse(packet);
      seq++;
    }
    const finalPacket = buildFinalPacket(sector, sectorData);
    await otaFirmwareCharacteristic.writeValueWithResponse(finalPacket);
    await firstValueFrom(
      otaSectorUploadResponse$.pipe(
        filter((res) => res === sector),
        timeout(1e4)
        // timeout of 3 seconds
      )
    );
    const uploadProgressData = {
      sector,
      totalSectors,
      percentage: sector / totalSectors
    };
    const uploadProgressEvent = new CustomEvent(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID, {
      detail: uploadProgressData
    });
    document.dispatchEvent(uploadProgressEvent);
  }
  console.log("Firmware upload complete.");
}
function otaCommandNotificationHandler(event) {
  const value = event.target.value;
  if (value && value.buffer.byteLength === 20) {
    const buffer = value.buffer;
    const view = new DataView(buffer);
    const ack = view.getUint16(0, true);
    const cmd = view.getUint16(2, true);
    const response = view.getUint16(4, true);
    const crc = view.getUint16(18, true);
    const crcInput = new Uint8Array(buffer, 0, 18);
    const calculatedCRC = crc16_ccitt(crcInput);
    if (calculatedCRC !== crc) {
      otaCommandResponse$.error(new Error(`OTA CRC error: the transmitted crc is ${crc}, while the calculated crc is ${calculatedCRC}`));
    }
    switch (response) {
      case 0:
        otaCommandResponse$.next(true);
        break;
      case 1:
        otaCommandResponse$.error(new Error(`Command rejected`));
        break;
      default:
        otaCommandResponse$.error(new Error("Unknown command response"));
    }
  }
}
function otaFirmwareNotificationHandler(event) {
  const value = event.target.value;
  if (value && value.buffer.byteLength === 20) {
    const buffer = value.buffer;
    const view = new DataView(buffer);
    const sectorIndex = view.getUint16(0, true);
    const status = view.getUint16(2, true);
    const desiredSector = view.getUint16(4, true);
    const crc = view.getUint16(18, true);
    const crcInput = new Uint8Array(buffer, 0, 18);
    const calculatedCRC = crc16_ccitt(crcInput);
    if (calculatedCRC !== crc) {
      otaSectorUploadResponse$.error(new Error(`OTA CRC error: the transmitted crc is ${crc}, while the calculated crc is ${calculatedCRC}`));
    }
    switch (status) {
      case 0:
        console.log("Success");
        break;
      case 1:
        otaSectorUploadResponse$.error(new Error(`CRC Error`));
        break;
      case 2:
        otaSectorUploadResponse$.error(new Error(`Sector Index error. Desired sector: ${desiredSector}`));
        break;
      case 3:
        otaSectorUploadResponse$.error(new Error(`Payload length error`));
        break;
      default:
        otaSectorUploadResponse$.error(new Error("Unknown response status"));
    }
    otaSectorUploadResponse$.next(sectorIndex);
  }
}
function buildPacket(sectorIndex, seq, payload) {
  const packetLength = 3 + payload.length;
  const buffer = new ArrayBuffer(packetLength);
  const view = new DataView(buffer);
  view.setUint16(0, sectorIndex, true);
  view.setUint8(2, seq);
  const payloadView = new Uint8Array(buffer, 3);
  payloadView.set(payload);
  return new Uint8Array(buffer);
}
function buildFinalPacket(sectorIndex, data) {
  const buffer = new ArrayBuffer(3 + FIRMWARE_PAYLOAD_SIZE);
  const view = new DataView(buffer);
  view.setUint16(0, sectorIndex, true);
  view.setUint8(2, 255);
  const payloadView = new Uint8Array(buffer, 3);
  payloadView.fill(0);
  const crc = crc16_ccitt(data);
  view.setUint16(3 + FIRMWARE_PAYLOAD_SIZE - 2, crc, true);
  return new Uint8Array(buffer);
}
function numberToBytes(value, byteLength) {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[byteLength - 1 - i] = value & 255;
    value >>= 8;
  }
  return bytes;
}
function crc16_ccitt(buffer) {
  let crc = 0;
  for (let b of buffer) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 32768 ? crc << 1 ^ 4129 : crc << 1;
    }
    crc &= 65535;
  }
  return crc;
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
function delay(timeout2) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), timeout2);
  });
}
export {
  executeLoadedScript,
  requestAndConnect,
  sendPythonScript,
  setActuatorState,
  startSensorStreaming,
  stopFirmwareUpload,
  stopScriptExecution,
  stopSensorStreaming,
  uploadFirmware
};
//# sourceMappingURL=thymio.mjs.map