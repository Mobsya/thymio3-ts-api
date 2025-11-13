// src/command.ts
async function setActuatorState(commandCharacteristic2, actuatorData) {
  const commandArray = createCommandByteArray(actuatorData);
  await commandCharacteristic2.writeValue(commandArray);
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

// src/constants.ts
var MAIN_SERVICE_UUID = "0000abf0-0000-1000-8000-00805f9b34fb";
var COMMAND_CHARACTERISTIC_UUID = "0000abf1-0000-1000-8000-00805f9b34fb";
var SENSOR_STREAM_CHARACTERISTIC_UUID = "0000abf2-0000-1000-8000-00805f9b34fb";
var PYTHON_CHARACTERISTIC_UUID = "0000abf3-0000-1000-8000-00805f9b34fb";
var AUDIO_CHARACTERISTIC_UUID = "0000abf4-0000-1000-8000-00805f9b34fb";
var FILE_CHARACTERISTIC_UUID = "0000abf6-0000-1000-8000-00805f9b34fb";
var DEVICE_INFO_CHARACTERISTIC_UUID = "0000abf5-0000-1000-8000-00805f9b34fb";
var OTA_SERVICE_UUID = 32792;
var OTA_FIRMWARE_CHARACTERISTIC_UUID = 32800;
var OTA_COMMAND_CHARACTERISTIC_UUID = 32802;
var MTU = 500;
var FIRMWARE_PAYLOAD_SIZE = MTU - 4;
var FIRMWARE_SECTOR_SIZE = 4096;
var THYMIO_SENSOR_VALUES_EVENT_ID = "thymio-sensor-values";
var THYMIO_OTHER_SENSOR_VALUES_EVENT_ID = "thymio-sensor-other-values";
var THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID = "thymio-ota-upload-progress";
var THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID = "thymio-audio-upload-progress";
var THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID = "thymio-file-upload-progress";

// src/utils.ts
function createPayloadPackets(payload, isAudio = false) {
  let FIRST_PACKET_HEADER_SIZE = 1 + 2 + 4 + 2;
  if (isAudio) {
    FIRST_PACKET_HEADER_SIZE = 1 + 4 + 4 + 2;
  }
  const SUBSEQUENT_PACKET_HEADER_SIZE = 2;
  const PAYLOAD_ID = 1;
  const packets = [];
  const payloadLength = payload.length;
  const crc = computeCRC32(payload);
  let seqId = 0;
  const header = new Uint8Array(FIRST_PACKET_HEADER_SIZE);
  header[0] = PAYLOAD_ID;
  if (isAudio) {
    header.set(numberToBytes(payloadLength, 4), 1);
    header.set(numberToBytes(crc, 4), 5);
    header.set(numberToBytes(seqId, 2), 9);
  } else {
    header.set(numberToBytes(payloadLength, 2), 1);
    header.set(numberToBytes(crc, 4), 3);
    header.set(numberToBytes(seqId, 2), 7);
  }
  const firstChunkSize = MTU - FIRST_PACKET_HEADER_SIZE;
  const firstChunk = payload.slice(0, firstChunkSize);
  const firstPacket = new Uint8Array(header.length + firstChunk.length);
  firstPacket.set(header, 0);
  firstPacket.set(firstChunk, header.length);
  packets.push(firstPacket);
  seqId++;
  let offset = firstChunkSize;
  while (offset < payload.length) {
    const chunkSize = Math.min(MTU - SUBSEQUENT_PACKET_HEADER_SIZE, payloadLength - offset);
    const packet = new Uint8Array(SUBSEQUENT_PACKET_HEADER_SIZE + chunkSize);
    packet.set(numberToBytes(seqId, 2), 0);
    packet.set(payload.slice(offset, offset + chunkSize), SUBSEQUENT_PACKET_HEADER_SIZE);
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

// src/python.ts
async function sendPythonScript(pythonCharacteristic2, script) {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createPayloadPackets(scriptDataArray);
  for (const packet of packets) {
    await pythonCharacteristic2.writeValueWithResponse(packet);
  }
}
async function executeLoadedScript(pythonCharacteristic2) {
  const packet = new Uint8Array([2]);
  await pythonCharacteristic2.writeValueWithResponse(packet);
}
async function stopScriptExecution(pythonCharacteristic2) {
  const packet = new Uint8Array([3]);
  await pythonCharacteristic2.writeValueWithResponse(packet);
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

// src/sensor-stream.ts
async function startSensorStreaming(sensorStreamCharacteristic2, other = false) {
  const id = 1;
  let body = 0;
  if (!other) {
    body |= 1;
  } else {
    body |= 2;
  }
  const payload = new Uint8Array([id, body]);
  return await sensorStreamCharacteristic2.writeValueWithResponse(payload);
}
async function stopSensorStreaming(sensorStreamCharacteristic2) {
  const id = 1;
  const body = 0;
  const payload = new Uint8Array([id, body]);
  return await sensorStreamCharacteristic2.writeValueWithResponse(payload);
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

// src/ota.ts
import { BehaviorSubject, filter, firstValueFrom, timeout } from "rxjs";
var otaCommandResponse$;
var otaSectorUploadResponse$;
async function uploadFirmware(otaCommandCharacteristic2, otaFirmwareCharacteristic2, firmware) {
  otaCommandResponse$ = new BehaviorSubject(false);
  await startOTA(otaCommandCharacteristic2, firmware.byteLength);
  otaSectorUploadResponse$ = new BehaviorSubject(0);
  return await uploadFirmwareData(otaFirmwareCharacteristic2, firmware);
}
async function stopFirmwareUpload(otaCommandCharacteristic2) {
  return await stopOTA(otaCommandCharacteristic2);
}
async function startOTA(otaCommandCharacteristic2, firmwareLength) {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint16(0, 1, true);
  view.setUint32(2, firmwareLength, true);
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);
  const packet = new Uint8Array(buffer);
  await otaCommandCharacteristic2.writeValueWithResponse(packet);
  await firstValueFrom(
    otaCommandResponse$.pipe(
      filter((res) => res),
      timeout(1e4)
      // timeout of 3 seconds
    )
  );
}
async function stopOTA(otaCommandCharacteristic2) {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);
  view.setUint16(0, 2, true);
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);
  const packet = new Uint8Array(buffer);
  return await otaCommandCharacteristic2.writeValueWithResponse(packet);
}
async function uploadFirmwareData(otaFirmwareCharacteristic2, firmware) {
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
      await otaFirmwareCharacteristic2.writeValueWithResponse(packet);
      seq++;
    }
    const finalPacket = buildFinalPacket(sector, sectorData);
    await otaFirmwareCharacteristic2.writeValueWithResponse(finalPacket);
    await firstValueFrom(
      otaSectorUploadResponse$.pipe(
        filter((res) => res === sector),
        timeout(1e4)
        // timeout of 3 seconds
      )
    );
    const uploadProgressData = {
      uploadedPackets: sector,
      totalPackets: totalSectors,
      percentage: sector / totalSectors * 100
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

// src/audio.ts
async function uploadAudioFile(audioCharacteristic2, file) {
  await isFileWavOrMp3(file);
  await isMonoAndCorrectSampleRate(file);
  const buffer = await file.arrayBuffer();
  const payload = new Uint8Array(buffer);
  const packets = createPayloadPackets(payload, true);
  const totalPackets = packets.length;
  let uploadedPackets = 0;
  for (const packet of packets) {
    await audioCharacteristic2.writeValueWithResponse(packet);
    const uploadProgressData = {
      uploadedPackets,
      totalPackets,
      percentage: uploadedPackets / totalPackets * 100
    };
    const uploadProgressEvent = new CustomEvent(THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID, {
      detail: uploadProgressData
    });
    document.dispatchEvent(uploadProgressEvent);
    uploadedPackets++;
  }
}
async function playAudioFile(audioCharacteristic2) {
  const id = 2;
  const body = new Array(20).fill(0);
  const payload = new Uint8Array([id, ...body]);
  return await audioCharacteristic2.writeValueWithResponse(payload);
}
async function stopAudioFile(audioCharacteristic2) {
  const id = 3;
  const payload = new Uint8Array([id]);
  return await audioCharacteristic2.writeValueWithResponse(payload);
}
async function recordAudio(audioCharacteristic2, duration) {
  if (duration > 10) {
    throw new Error(`Can not record more than 10 seconds.`);
  }
  const id = 5;
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint8(0, id);
  view.setUint8(1, duration);
  const payload = new Uint8Array(buffer);
  return await audioCharacteristic2.writeValueWithResponse(payload);
}
async function playFrequency(audioCharacteristic2, frequency, duration) {
  const id = 6;
  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);
  view.setUint8(0, id);
  view.setUint16(1, frequency);
  view.setUint16(3, duration);
  const payload = new Uint8Array(buffer);
  return await audioCharacteristic2.writeValueWithResponse(payload);
}
function handleAudioResponse(event) {
  const value = event.target.value;
  if (value) {
    const buffer = value.buffer;
    const view = new DataView(buffer);
    const id = view.getUint8(0);
    const cmd = view.getUint8(1);
    if (id === 1) {
      if (cmd === 0) {
        console.log(`Audio loaded correctly`);
      } else if (cmd === 1) {
        console.log(`Audio file CRC mismatch`);
      } else if (cmd === 2) {
        console.log(`Audio partial upload`);
      } else if (cmd === 3) {
        console.log(`Audio wrong sequence`);
      } else if (cmd === 4) {
        console.log(`Audio file too big`);
      } else {
        throw new Error(`Command ID unknown`);
      }
    } else if (id === 2) {
      if (cmd === 0) {
        console.log(`Audio command executed correctly`);
      } else if (cmd === 1) {
        console.log(`Audio play error`);
      } else if (cmd === 2) {
        console.log(`Audio file not found`);
      } else if (cmd === 3) {
        console.log(`Audio file not supported`);
      } else {
        throw new Error(`Command ID unknown`);
      }
    } else if (id === 3) {
      if (cmd === 0) {
        console.log(`Audio recording saved correctly`);
      } else if (cmd === 1) {
        console.log(`Audio recording error`);
      } else if (cmd === 2) {
        console.log(`Audio recording duration too long`);
      } else {
        throw new Error(`Command ID unknown`);
      }
    }
  }
}
async function isFileWavOrMp3(file) {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 65 && bytes[10] === 86 && bytes[11] === 69) {
    return true;
  }
  if (bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    return true;
  }
  if (bytes[0] === 255 && (bytes[1] & 224) === 224) {
    return true;
  }
  throw new Error(`The audio file must be in WAV or MP3 format`);
}
async function isMonoAndCorrectSampleRate(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new AudioContext({ sampleRate: 12e3 });
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    if (audioBuffer.numberOfChannels !== 1) {
      throw new Error(`The audio file is not mono.`);
    } else if (audioBuffer.sampleRate !== 12e3) {
      throw new Error(`The audio file's sample rate is not 12kHz`);
    } else {
      return true;
    }
  } catch (error) {
    throw new Error(`Error decoding audio: ${error}`);
  }
}

// src/files.ts
async function uploadFile(fileCharacteristic2, file) {
  return new Promise(async (resolve, reject) => {
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id = view.getUint8(0);
      if (id !== 1) return;
      const responseCode = view.getUint8(1);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      switch (responseCode) {
        case 0:
          resolve();
          break;
        case 1:
          reject(`File upload: CRC Mismatch`);
          break;
        case 2:
          reject("File upload: Partial upload");
          break;
        case 3:
          reject("File upload: Wrong sequence");
          break;
        case 4:
          reject("File upload: File too big");
          break;
        default:
          reject("File upload: Unknown response code");
      }
    };
    fileCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    try {
      const buffer = await file.arrayBuffer();
      const payload = new Uint8Array(buffer);
      const packets = createPayloadPackets(payload, true);
      const totalPackets = packets.length;
      let uploadedPackets = 0;
      for (const packet of packets) {
        await fileCharacteristic2.writeValueWithResponse(packet);
        const uploadProgressData = {
          uploadedPackets,
          totalPackets,
          percentage: uploadedPackets / totalPackets * 100
        };
        const uploadProgressEvent = new CustomEvent(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, {
          detail: uploadProgressData
        });
        document.dispatchEvent(uploadProgressEvent);
        uploadedPackets++;
      }
    } catch (err) {
      console.error(err);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}
async function saveFile(fileCharacteristic2, filename) {
  return new Promise(async (resolve, reject) => {
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id = view.getUint8(0);
      if (id !== 2) return;
      const responseCode = view.getUint8(1);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      switch (responseCode) {
        case 0:
          resolve();
          break;
        case 1:
          reject(`File save: File not found`);
          break;
        case 2:
          reject("File save: File too big");
          break;
        case 3:
          reject("File save: Unknown error");
          break;
        default:
          reject("File save: Unknown response code");
      }
    };
    fileCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    try {
      const id = 2;
      const encoder = new TextEncoder();
      const array = encoder.encode(filename);
      if (array.byteLength > 30) {
        throw new Error("File name too long.");
      }
      const body = new Uint8Array(30);
      body.set(array.slice(0, 30));
      const payload = new Uint8Array([id, ...body]);
      await fileCharacteristic2.writeValueWithResponse(payload);
    } catch (err) {
      console.error(err);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}
async function deleteFile(fileCharacteristic2, filename) {
  return new Promise(async (resolve, reject) => {
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id = view.getUint8(0);
      if (id !== 3) return;
      const responseCode = view.getUint8(1);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      switch (responseCode) {
        case 0:
          resolve();
          break;
        case 1:
          reject(`File delete: File not found`);
          break;
        case 2:
          reject("File delete: Unknown error");
          break;
        default:
          reject("File delete: Unknown response code");
      }
    };
    fileCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    try {
      const id = 3;
      const encoder = new TextEncoder();
      const array = encoder.encode(filename);
      if (array.byteLength > 30) {
        throw new Error("File name too long.");
      }
      const body = new Uint8Array(30);
      body.set(array.slice(0, 30));
      const payload = new Uint8Array([id, ...body]);
      await fileCharacteristic2.writeValueWithResponse(payload);
    } catch (err) {
      console.error(err);
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}
async function listFiles(fileCharacteristic2) {
  return new Promise((resolve, reject) => {
    let totalLength = 0;
    let receivedLength = 0;
    let expectedCrc = 0;
    let chunks = [];
    let messageData = null;
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id2 = view.getUint8(0);
      if (id2 === 5) {
        fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
        reject("File list: could not generate file listing");
      }
      if (id2 !== 4 && receivedLength === 0) return;
      let offset = 0;
      if (receivedLength === 0) {
        offset = 1;
        totalLength = view.getUint16(offset, true);
        offset += 2;
        expectedCrc = view.getUint32(offset, true);
        offset += 4;
      }
      const seqId = view.getUint16(offset, true);
      offset += 2;
      const data = new Uint8Array(value.buffer, offset);
      chunks.push(data);
      receivedLength += data.length;
      if (receivedLength >= totalLength) {
        messageData = new Uint8Array(totalLength);
        let pos = 0;
        for (const chunk of chunks) {
          messageData.set(chunk, pos);
          pos += chunk.length;
        }
        fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
        const decoder = new TextDecoder();
        const listingString = decoder.decode(messageData);
        const fileListings = JSON.parse(listingString);
        resolve(fileListings);
      }
    };
    fileCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    const id = 4;
    const payload = new Uint8Array([id]);
    fileCharacteristic2.writeValueWithResponse(payload).catch((err) => {
      fileCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    });
  });
}
async function eraseAllFiles(fileCharacteristic2) {
  const id = 5;
  const payload = new Uint8Array([id]);
  return await fileCharacteristic2.writeValueWithResponse(payload);
}
async function downloadFile(fileCharacteristic2, filename) {
  throw new Error(`Not implemented yet`);
}
async function freeMemory(fileCharacteristic2) {
  const id = 8;
  const payload = new Uint8Array([id]);
  return await fileCharacteristic2.writeValueWithResponse(payload);
}

// src/device-info.ts
async function getFirmwareInfo(deviceInfoCharacteristic2) {
  return new Promise(async (resolve, reject) => {
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id = view.getUint8(0);
      if (id !== 1) return;
      deviceInfoCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      const messageLength = view.getUint16(1, true);
      const data = new Uint8Array(value.buffer, 3);
      const decoder = new TextDecoder();
      const firmwareInfoString = decoder.decode(data);
      const firmwareInfo = JSON.parse(firmwareInfoString);
      resolve(firmwareInfo);
    };
    deviceInfoCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    try {
      const id = 1;
      const payload = new Uint8Array([id]);
      await deviceInfoCharacteristic2.writeValueWithResponse(payload);
    } catch (err) {
      reject(err);
    }
  });
}
async function getMemoryInfo(deviceInfoCharacteristic2) {
  return new Promise(async (resolve, reject) => {
    const onResponse = (event) => {
      const value = event.target.value;
      if (!value) return;
      const view = new DataView(value.buffer);
      const id = view.getUint8(0);
      if (id !== 2) return;
      deviceInfoCharacteristic2.removeEventListener("characteristicvaluechanged", onResponse);
      const messageLength = view.getUint16(1, true);
      const data = new Uint8Array(value.buffer, 3);
      const decoder = new TextDecoder();
      const memoryInfoString = decoder.decode(data);
      const memoryInfo = JSON.parse(memoryInfoString);
      resolve(memoryInfo);
    };
    deviceInfoCharacteristic2.addEventListener("characteristicvaluechanged", onResponse);
    try {
      const id = 2;
      const payload = new Uint8Array([id]);
      await deviceInfoCharacteristic2.writeValueWithResponse(payload);
    } catch (err) {
      reject(err);
    }
  });
}

// src/thymio.ts
var device;
var reconnecting = false;
var commandCharacteristic;
var sensorStreamCharacteristic;
var pythonCharacteristic;
var audioCharacteristic;
var fileCharacteristic;
var deviceInfoCharacteristic;
var otaFirmwareCharacteristic;
var otaCommandCharacteristic;
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
function isConnected() {
  if (device && device.gatt) {
    return device.gatt.connected;
  } else {
    return false;
  }
}
async function disconnect() {
  device.removeEventListener("gattserverdisconnected", onDisconnected);
  await device.gatt?.disconnect();
}
async function connect() {
  if (device.gatt) {
    try {
      const server = await device.gatt.connect();
      const mainService = await server.getPrimaryService(MAIN_SERVICE_UUID);
      commandCharacteristic = await mainService.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);
      sensorStreamCharacteristic = await mainService.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
      await sensorStreamCharacteristic.startNotifications();
      sensorStreamCharacteristic.addEventListener("characteristicvaluechanged", handleStreamResponse);
      pythonCharacteristic = await mainService.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
      await pythonCharacteristic.startNotifications();
      pythonCharacteristic.addEventListener("characteristicvaluechanged", handlePythonResponse);
      audioCharacteristic = await mainService.getCharacteristic(AUDIO_CHARACTERISTIC_UUID);
      await audioCharacteristic.startNotifications();
      audioCharacteristic.addEventListener("characteristicvaluechanged", handleAudioResponse);
      fileCharacteristic = await mainService.getCharacteristic(FILE_CHARACTERISTIC_UUID);
      await fileCharacteristic.startNotifications();
      deviceInfoCharacteristic = await mainService.getCharacteristic(DEVICE_INFO_CHARACTERISTIC_UUID);
      await deviceInfoCharacteristic.startNotifications();
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
async function setActuatorState2(actuatorData) {
  await setActuatorState(commandCharacteristic, actuatorData);
}
async function sendPythonScript2(script) {
  await sendPythonScript(pythonCharacteristic, script);
}
async function executeLoadedScript2() {
  await executeLoadedScript(pythonCharacteristic);
}
async function stopScriptExecution2() {
  await stopScriptExecution(pythonCharacteristic);
}
async function startSensorStreaming2(other = false) {
  return await startSensorStreaming(sensorStreamCharacteristic, other);
}
async function stopSensorStreaming2() {
  return await stopSensorStreaming(sensorStreamCharacteristic);
}
async function uploadFirmware2(firmware) {
  return await uploadFirmware(otaCommandCharacteristic, otaFirmwareCharacteristic, firmware);
}
async function stopFirmwareUpload2() {
  return await stopFirmwareUpload(otaCommandCharacteristic);
}
async function uploadAudioFile2(file) {
  return await uploadAudioFile(audioCharacteristic, file);
}
async function playAudioFile2() {
  return await playAudioFile(audioCharacteristic);
}
async function stopAudioFile2() {
  return await stopAudioFile(audioCharacteristic);
}
async function recordAudio2(duration) {
  return await recordAudio(audioCharacteristic, duration);
}
async function playFrequency2(frequency, duration) {
  return await playFrequency(audioCharacteristic, frequency, duration);
}
async function uploadFile2(file) {
  return await uploadFile(fileCharacteristic, file);
}
async function saveFile2(filename) {
  return await saveFile(fileCharacteristic, filename);
}
async function deleteFile2(filename) {
  return await deleteFile(fileCharacteristic, filename);
}
async function listFiles2() {
  return await listFiles(fileCharacteristic);
}
async function eraseAllFiles2() {
  return await eraseAllFiles(fileCharacteristic);
}
async function downloadFile2(filename) {
  return await downloadFile(fileCharacteristic, filename);
}
async function freeMemory2() {
  return await freeMemory(fileCharacteristic);
}
async function getFirmwareInfo2() {
  return await getFirmwareInfo(deviceInfoCharacteristic);
}
async function getMemoryInfo2() {
  return await getMemoryInfo(deviceInfoCharacteristic);
}
export {
  deleteFile2 as deleteFile,
  disconnect,
  downloadFile2 as downloadFile,
  eraseAllFiles2 as eraseAllFiles,
  executeLoadedScript2 as executeLoadedScript,
  freeMemory2 as freeMemory,
  getFirmwareInfo2 as getFirmwareInfo,
  getMemoryInfo2 as getMemoryInfo,
  isConnected,
  listFiles2 as listFiles,
  playAudioFile2 as playAudioFile,
  playFrequency2 as playFrequency,
  recordAudio2 as recordAudio,
  requestAndConnect,
  saveFile2 as saveFile,
  sendPythonScript2 as sendPythonScript,
  setActuatorState2 as setActuatorState,
  startSensorStreaming2 as startSensorStreaming,
  stopAudioFile2 as stopAudioFile,
  stopFirmwareUpload2 as stopFirmwareUpload,
  stopScriptExecution2 as stopScriptExecution,
  stopSensorStreaming2 as stopSensorStreaming,
  uploadAudioFile2 as uploadAudioFile,
  uploadFile2 as uploadFile,
  uploadFirmware2 as uploadFirmware
};
//# sourceMappingURL=thymio.mjs.map