/// <reference types="web-bluetooth" />

import { BehaviorSubject, filter, firstValueFrom, timeout } from "rxjs";

export type RGB = {
  r: number, // number 0-15
  g: number, // number 0-15
  b: number  // number 0-15
}

export type ActuatorData = {
  circleLEDs: number[],         // Array of 8 numbers (0-15)
  frontLegoLEDs: number[],      // Array of 8 numbers (0-15)
  rearLegoLEDs: number[],       // Array of 8 numbers (0-15)
  flRGB: RGB,              // { r: 0-15, g: 0-15, b: 0-15 }
  frRGB: RGB,              // { r: 0-15, g: 0-15, b: 0-15 }
  blRGB: RGB,              // { r: 0-15, g: 0-15, b: 0-15 }
  brRGB: RGB,              // { r: 0-15, g: 0-15, b: 0-15 }
  motorLeft: number,          // Integer -1000 to 1000
  motorRight: number,         // Integer -1000 to 1000
  sound: number               // Integer 0 to 19
}

export type SensorsData = {
  colorSensor: {
    h: number; // 2 bytes
    s: number; // 1 byte
    v: number; // 1 byte
  };
  groundSensors: {
    left: number;  // 2 bytes
    right: number; // 2 bytes
  };
  accelerationRaw: {
    x: number; // 2 bytes
    y: number;
    z: number;
  };
  gyroRaw: {
    x: number; // 2 bytes
    y: number;
    z: number;
  };
  buttons: {
    back: boolean;
    left: boolean;
    center: boolean;
    forward: boolean;
    right: boolean;
  };
  microphoneVolume: number; // 2 bytes
  proximitySensors: {
    left: number;
    frontLeft: number;
    center: number;
    frontRight: number;
    right: number;
    backLeft: number;
    backRight: number;
  };
  tvRemote: number; // 1 byte
};

export type OtherSensorData = {
  colorRaw: {
    red: number;
    green: number;
    blue: number;
    clear: number;
  };
  colorDetected: number;
  groundAmbient: {
    left: number;
    right: number;
  };
  groundReflected: {
    left: number;
    right: number;
  };
  angleDegrees: number;
  eventFlags: {
    tapDetected: boolean;
    freefallDetected: boolean;
    clapDetected: boolean;
  };
  motor: {
    leftSpeed: number;
    rightSpeed: number;
    leftPwmDuty: number;
    rightPwmDuty: number;
  };
  batteryVoltage: number;
};


const MAIN_SERVICE_UUID = '0000abf0-0000-1000-8000-00805f9b34fb';

const COMMAND_CHARACTERISTIC_UUID = '0000abf1-0000-1000-8000-00805f9b34fb';
const SENSOR_STREAM_CHARACTERISTIC_UUID = '0000abf2-0000-1000-8000-00805f9b34fb';
const PYTHON_CHARACTERISTIC_UUID = '0000abf3-0000-1000-8000-00805f9b34fb';

const OTA_SERVICE_UUID = 0x8018;
const OTA_FIRMWARE_CHARACTERISTIC_UUID = 0x8020;
const OTA_PROGRESS_BAR_CHARACTERISTIC_UUID = 0x8021;
const OTA_COMMAND_CHARACTERISTIC_UUID = 0x8022;
const OTA_CUSTOMER_CHARACTERISTIC_UUID = 0x8023;

let otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic;
let otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic;

const MTU = 500;

const FIRMWARE_PAYLOAD_SIZE = MTU - 4;
const FIRMWARE_SECTOR_SIZE = 4096; // 4KB;

const THYMIO_SENSOR_VALUES_EVENT_ID = 'thymio-sensor-values';
const THYMIO_OTHER_SENSOR_VALUES_EVENT_ID = 'thymio-sensor-other-values';
const THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID = 'thymio-ota-upload-progress';

let otaCommandResponse$: BehaviorSubject<boolean>;
let otaSectorUploadResponse$: BehaviorSubject<number>;

let commandCharacteristic: BluetoothRemoteGATTCharacteristic;
let sensorStreamcharacteristic: BluetoothRemoteGATTCharacteristic;
let pythonCharacteristic: BluetoothRemoteGATTCharacteristic;

let reconnecting = false;
let device: BluetoothDevice;

/**
 * Request a bluetooth device and connect to it.
 */
export async function requestAndConnect() {
  device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'THYMIO' }],
    optionalServices: [
      MAIN_SERVICE_UUID,
      OTA_SERVICE_UUID
    ]
  });

  // To handle the reconnects
  device.addEventListener('gattserverdisconnected', onDisconnected);

  await connect();
}

/**
 * Connect to the device and to all of the exposed services and characteristics.
 */
async function connect() {
  if (device.gatt) {
    try {
      const server = await device.gatt.connect();
      const mainService = await server.getPrimaryService(MAIN_SERVICE_UUID);

      commandCharacteristic = await mainService.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

      sensorStreamcharacteristic = await mainService.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
      await sensorStreamcharacteristic.startNotifications();
      sensorStreamcharacteristic.addEventListener('characteristicvaluechanged', handleStreamResponse);

      pythonCharacteristic = await mainService.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
      await pythonCharacteristic.startNotifications();
      pythonCharacteristic.addEventListener('characteristicvaluechanged', handlePythonResponse);

      const otaService = await server.getPrimaryService(OTA_SERVICE_UUID);

      otaFirmwareCharacteristic = await otaService.getCharacteristic(OTA_FIRMWARE_CHARACTERISTIC_UUID);
      otaFirmwareCharacteristic.startNotifications();
      otaFirmwareCharacteristic.addEventListener('characteristicvaluechanged', otaFirmwareNotificationHandler);

      otaCommandCharacteristic = await otaService.getCharacteristic(OTA_COMMAND_CHARACTERISTIC_UUID);
      otaCommandCharacteristic.startNotifications();
      otaCommandCharacteristic.addEventListener('characteristicvaluechanged', otaCommandNotificationHandler);

    } catch (e) {
      console.error(`Could not connect to Thymio 3.`, e)
    }

    console.log("✅ Connected to Thymio 3 !");
  } else {
    throw new Error("Bluetooth GATT is not available.")
  }
}

function onDisconnected() {
  console.log('⚠️ Disconnected. Attempting to reconnect...');
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
      await delay(2000);  // Wait 2 seconds before retry
      if (!device.gatt!.connected) {
        await connect();
        reconnecting = false;
        return;
      }
    } catch (e) {
      console.warn(`Retry ${attempts + 1} failed:`, e);
    }
    attempts++;
  }

  console.log(`❌ Failed to reconnect after ${attempts} attempts`);
}

/// COMMAND CHARACTERISTIC

/**
 * Set the state of the Thymio 3 actuators.
 * @param {*} actuatorData
 */
export async function setActuatorState(actuatorData: ActuatorData) {
  const commandArray = createCommandByteArray(actuatorData);

  await commandCharacteristic.writeValue(commandArray);
}

/**
 * Auxiliary function that creates the command byte array.
 * @param {*} actuatorData The actuator data object
 * @returns The byte array containing the actuator data
 */
function createCommandByteArray({
    circleLEDs,         // Array of 8 numbers (0-15)
    frontLegoLEDs,      // Array of 8 numbers (0-15)
    rearLegoLEDs,       // Array of 8 numbers (0-15)
    flRGB,              // { r: 0-15, g: 0-15, b: 0-15 }
    frRGB,              // { r: 0-15, g: 0-15, b: 0-15 }
    blRGB,              // { r: 0-15, g: 0-15, b: 0-15 }
    brRGB,              // { r: 0-15, g: 0-15, b: 0-15 }
    motorLeft,          // Integer -1000 to 1000
    motorRight,         // Integer -1000 to 1000
    sound               // Integer 0 to 19
}: ActuatorData) {
    const buffer = new ArrayBuffer(26);
    const view = new DataView(buffer);
    let offset = 0;

    // ID (1 byte)
    view.setUint8(offset, 0x01); offset++;

    // Helper to pack 8 4-bit values into 4 bytes
    function pack4bitArray(arr: number[]) {
        const packed = new Uint8Array(4);
        for (let i = 0; i < 8; i++) {
            const val = arr[i] & 0x0F;
            const byteIndex = Math.floor(i / 2);
            if (i % 2 === 0) {
                packed[byteIndex] |= val;
            } else {
                packed[byteIndex] |= val << 4;
            }
        }
        return packed;
    }

    // Circle LEDs (4 bytes)
    pack4bitArray(circleLEDs).forEach(byte => view.setUint8(offset++, byte));

    // Front Lego LEDs (4 bytes)
    pack4bitArray(frontLegoLEDs).forEach(byte => view.setUint8(offset++, byte));

    // Rear Lego LEDs (4 bytes)
    pack4bitArray(rearLegoLEDs).forEach(byte => view.setUint8(offset++, byte));

    // Helper to pack RGB values into 2 bytes
    function packRGB({ r, g, b }: RGB) {
        let rgb = ((b & 0x0F) << 8) | ((g & 0x0F) << 4) | (r & 0x0F);
        return rgb;
    }

    // FL RGB (2 bytes)
    // Little-endian (explicite) for RGB values
    view.setUint16(offset, packRGB(flRGB),true); offset += 2;

    // FR RGB (2 bytes)
    view.setUint16(offset, packRGB(frRGB),true); offset += 2;

    // BL RGB (2 bytes)
    view.setUint16(offset, packRGB(blRGB),true); offset += 2;

    // BR RGB (2 bytes)
    view.setUint16(offset, packRGB(brRGB),true); offset += 2;

    // Motor left (2 bytes - signed 16-bit)
    view.setInt16(offset, motorLeft); offset += 2;

    // Motor right (2 bytes - signed 16-bit)
    view.setInt16(offset, motorRight); offset += 2;

    // Sound (1 byte)
    view.setUint8(offset, sound); offset++;

    return new Uint8Array(buffer);
}

// PYTHON CHARACTERISTIC

export async function sendPythonScript(script: string) {
  const encoder = new TextEncoder();
  const scriptDataArray = encoder.encode(script);
  const packets = createScriptPackets(scriptDataArray);

  for (const packet of packets) {
    await pythonCharacteristic.writeValueWithResponse(packet);
  }
}

export async function executeLoadedScript() {
  const packet = new Uint8Array([0x02]);

  await pythonCharacteristic.writeValueWithResponse(packet);
}

export async function stopScriptExecution() {
  const packet = new Uint8Array([0x03]);

  await pythonCharacteristic.writeValueWithResponse(packet);
}

function handlePythonResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;
	if (value) {
		const id = value.getUint8(0);

		if (id === 0x01) {
			const loadResult = value.getUint8(1);
			const resultMessages: {[index: number]: string} = {
				0: "✅ Script loaded successfully.",
				1: "❌ CRC mismatch.",
				2: "⚠️ Partial upload.",
				3: "❌ Wrong sequence.",
				4: "❌ Script too big (2 KB limit).",
				// Add more error codes if needed
			};

			console.log(
				`[Notification] Script Loaded: ${resultMessages[loadResult] || "Unknown error code: " + loadResult}`
			);
		} else if (id === 0x02) {
			const result = value.getUint8(1);

			const exception = (result & 0b00000001) !== 0;
			const scriptRunning = (result & 0b00000010) !== 0;

			console.log("[Notification] Script Terminated:");
			if (!exception && !scriptRunning) {
				console.log("✅ Script terminated normally.");
			} else {
				if (exception) console.log("❌ Script terminated with exception.");
				if (scriptRunning)
					console.log("⚠️ Another script was already running.");
			}
		} else {
			console.warn(
				`[Notification] Unknown ID: 0x${id.toString(16).padStart(2, "0")}`
			);
		}
	}
}

/**
 * Creates BLE packets based on the script content
 * @param {Uint8Array} scriptBytes
 * @returns {Uint8Array[]} Array of packet Uint8Arrays
 */
function createScriptPackets(scriptBytes: Uint8Array) {
  const FIRST_PACKET_HEADER_SIZE = 1 + 2 + 4 + 2; // 9 bytes
  const SUBSEQUENT_PACKET_HEADER_SIZE = 2; // 2 bytes
  const PAYLOAD_ID = 0x01;

  const packets = [];
  const scriptLength = scriptBytes.length;
  const crc = computeCRC32(scriptBytes);
  let seqId = 0;

  // --- First Packet ---
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

  // --- Subsequent Packets ---
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

//// SENSOR STREAM CHARACTERISTIC

/**
 * Start the sensor streaming. By default, only the main sensors are enabled.
 * @param other Enable/disable other sensors
 */
export async function startSensorStreaming(other = false) {
  const id = 0x01;

  let body = 0;
  if (!other) {
    body |= 0b00000001;
  } else {
    body |= 0b00000010;
  }

  const payload = new Uint8Array([id, body]);

  return await sensorStreamcharacteristic.writeValueWithResponse(payload);
}

/**
 * Stop all sensor streaming.
 */
export async function stopSensorStreaming() {
  const id = 0x01;

  const body = 0x00;
  const payload = new Uint8Array([id, body]);

  return await sensorStreamcharacteristic.writeValueWithResponse(payload);
}

/**
 * Handler for the stream response. Captures the event data, transforms it into the appropriate
 * object and fires the appropriate event with the transformed data.
 */
async function handleStreamResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;

  if (value) {
    const id = value.getUint8(0);
    const data = new Uint8Array(value.buffer.slice(1));

    if (id === 0x01) {
      const sensorsData = parseSensorsData(data);

      const mostValuesEvent = new CustomEvent(THYMIO_SENSOR_VALUES_EVENT_ID, {
        detail: sensorsData
      });
      document.dispatchEvent(mostValuesEvent);
    } else if(id === 0x02) {
      const otherSensorData = parseOtherSensorData(data);

      const otherValueEvent = new CustomEvent(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID, {
        detail: otherSensorData
      });
      document.dispatchEvent(otherValueEvent);
    }
  }
}

/**
 * Parses the main sensor data.
 * @param bytes Raw main sensor data
 * @returns A typed sensor data object
 */
function parseSensorsData(bytes: Uint8Array): SensorsData {
  if (bytes.length !== 38) {
    throw new Error("Invalid byte array length. Expected 38 bytes.");
  }

  const dv = new DataView(bytes.buffer);
  let offset = 0;

  const h = dv.getUint16(offset, true); offset += 2;
  const s = dv.getUint8(offset); offset += 1;
  const v = dv.getUint8(offset); offset += 1;

  const groundLeft = dv.getUint16(offset, true); offset += 2;
  const groundRight = dv.getUint16(offset, true); offset += 2;

  const accelX = dv.getInt16(offset, true); offset += 2;
  const accelY = dv.getInt16(offset, true); offset += 2;
  const accelZ = dv.getInt16(offset, true); offset += 2;

  const gyroX = dv.getInt16(offset, true); offset += 2;
  const gyroY = dv.getInt16(offset, true); offset += 2;
  const gyroZ = dv.getInt16(offset, true); offset += 2;

  const buttonsByte = dv.getUint8(offset); offset += 1;

  const micVolume = dv.getUint16(offset, true); offset += 2;

  const proximity = {
    left: dv.getUint16(offset, true), offset1: offset += 2,
    frontLeft: dv.getUint16(offset, true), offset2: offset += 2,
    center: dv.getUint16(offset, true), offset3: offset += 2,
    frontRight: dv.getUint16(offset, true), offset4: offset += 2,
    right: dv.getUint16(offset, true), offset5: offset += 2,
    backLeft: dv.getUint16(offset, true), offset6: offset += 2,
    backRight: dv.getUint16(offset, true), offset7: offset += 2,
  };

  const tvRemote = dv.getUint8(offset); offset += 1;

  return {
    colorSensor: { h, s, v },
    groundSensors: { left: groundLeft, right: groundRight },
    accelerationRaw: { x: accelX, y: accelY, z: accelZ },
    gyroRaw: { x: gyroX, y: gyroY, z: gyroZ },
    buttons: {
      back: !!(buttonsByte & (1 << 0)),
      left: !!(buttonsByte & (1 << 1)),
      center: !!(buttonsByte & (1 << 2)),
      forward: !!(buttonsByte & (1 << 3)),
      right: !!(buttonsByte & (1 << 4)),
    },
    microphoneVolume: micVolume,
    proximitySensors: {
      left: proximity.left,
      frontLeft: proximity.frontLeft,
      center: proximity.center,
      frontRight: proximity.frontRight,
      right: proximity.right,
      backLeft: proximity.backLeft,
      backRight: proximity.backRight,
    },
    tvRemote
  };
}

/**
 * Parses the additional sensor data.
 * @param bytes Raw extra sensor data
 * @returns A typed other sensor data object
 */
function parseOtherSensorData(bytes: Uint8Array): OtherSensorData {
  if (bytes.length !== 30) {
    throw new Error("Invalid byte array length. Expected 30 bytes.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const red = view.getUint16(offset, true); offset += 2;
  const green = view.getUint16(offset, true); offset += 2;
  const blue = view.getUint16(offset, true); offset += 2;
  const clear = view.getUint16(offset, true); offset += 2;

  const colorDetected = bytes[offset]; offset += 1;

  const groundAmbientLeft = view.getUint16(offset, true); offset += 2;
  const groundAmbientRight = view.getUint16(offset, true); offset += 2;

  const groundReflectedLeft = view.getUint16(offset, true); offset += 2;
  const groundReflectedRight = view.getUint16(offset, true); offset += 2;

  const angleDegrees = view.getInt16(offset, true); offset += 2;

  const eventByte = bytes[offset]; offset += 1;

  const leftSpeed = view.getInt16(offset, true); offset += 2;
  const rightSpeed = view.getInt16(offset, true); offset += 2;
  const leftPwmDuty = view.getInt16(offset, true); offset += 2;
  const rightPwmDuty = view.getInt16(offset, true); offset += 2;

  const batteryVoltage = view.getUint16(offset, true); offset += 2;

  return {
    colorRaw: { red, green, blue, clear },
    colorDetected,
    groundAmbient: { left: groundAmbientLeft, right: groundAmbientRight },
    groundReflected: { left: groundReflectedLeft, right: groundReflectedRight },
    angleDegrees,
    eventFlags: {
      tapDetected: (eventByte & 0b00000001) !== 0,
      freefallDetected: (eventByte & 0b00000010) !== 0,
      clapDetected: (eventByte & 0b00000100) !== 0,
    },
    motor: {
      leftSpeed,
      rightSpeed,
      leftPwmDuty,
      rightPwmDuty,
    },
    batteryVoltage,
  };
}


//// OTA CHARACTERISTIC

export async function uploadFirmware(firmware: ArrayBuffer): Promise<void> {
  // Start the OTA
  otaCommandResponse$ = new BehaviorSubject<boolean>(false);
  await startOTA(firmware.byteLength);

  otaSectorUploadResponse$ = new BehaviorSubject<number>(0);
  // Send the firmware
  return await uploadFirmwareData(firmware);
}

export async function stopFirmwareUpload(): Promise<void> {
  return await stopOTA();
}

// OTA Commands

async function startOTA(firmwareLength: number): Promise<void> {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);

  // Command ID - 2 bytes
  view.setUint16(0, 0x0001, true);

  // FirmwareLength - 4 bytes
  view.setUint32(2, firmwareLength, true);

  // CRC16 - 2 bytes
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);

  // Send packet
  const packet = new Uint8Array(buffer);
  await otaCommandCharacteristic.writeValueWithResponse(packet);

  await firstValueFrom(
    otaCommandResponse$.pipe(
      filter(res => res),
      timeout(10000) // timeout of 3 seconds
    )
  );
}

async function stopOTA(): Promise<void> {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);

  // Command ID - 2 bytes
  view.setUint16(0, 0x0002, true);

  // Payload can be left at 0

  // CRC16 - 2 bytes
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);

  const packet = new Uint8Array(buffer);
  return await otaCommandCharacteristic.writeValueWithResponse(packet);
}

async function responseCommandOTA(
  commandId: number,
  responseStatus: 0x0000 | 0x0001
): Promise<void> {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);

  // Command ID - 2 bytes
  view.setUint16(0, 0x0003, true);

  // Payload bytes 2-3: command ID
  view.setUint16(2, commandId, true);

  // Payload bytes 4-5: responseStatus
  view.setUint16(4, responseStatus, true);

  // CRC16 - 2 bytes
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);

  const packet = new Uint8Array(buffer);
  return await otaCommandCharacteristic.writeValueWithResponse(packet);
}

// OTA File transfer

async function uploadFirmwareData(firmware: ArrayBuffer): Promise<void> {
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

    // Send packets
    let seq = 0;
    while (seq * FIRMWARE_PAYLOAD_SIZE < sectorData.length) {
      const slice = sectorData.slice(
        seq * FIRMWARE_PAYLOAD_SIZE,
        (seq + 1) * FIRMWARE_PAYLOAD_SIZE
      );
      const packet = buildPacket(sector, seq, slice);
      await otaFirmwareCharacteristic.writeValueWithResponse(packet);
      seq++;
      //await delay(10); // pacing
    }

    // Send final packet with CRC
    const finalPacket = buildFinalPacket(sector, sectorData);
    await otaFirmwareCharacteristic.writeValueWithResponse(finalPacket);

    await firstValueFrom(
      otaSectorUploadResponse$.pipe(
        filter(res => res === sector),
        timeout(10000) // timeout of 3 seconds
      )
    );

    const uploadProgressData = {
      sector,
      totalSectors,
      percentage: (sector / totalSectors) * 100
    };
    const uploadProgressEvent = new CustomEvent(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID, {
      detail: uploadProgressData
    });
    document.dispatchEvent(uploadProgressEvent);
  }

  console.log("Firmware upload complete.");
}

function otaCommandNotificationHandler(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;

  if (value && value.buffer.byteLength === 20) {
    const buffer = value.buffer;
    const view = new DataView(buffer);

    const ack = view.getUint16(0, true);
    const cmd = view.getUint16(2, true);
    const response = view.getUint16(4, true);
    const crc = view.getUint16(18, true);

    // Check CRC error
    const crcInput = new Uint8Array(buffer, 0, 18);
    const calculatedCRC = crc16_ccitt(crcInput);
    if (calculatedCRC !== crc) {
      otaCommandResponse$.error(new Error(`OTA CRC error: the transmitted crc is ${crc}, while the calculated crc is ${calculatedCRC}`));
    }

    switch(response) {
      case 0x0000:
        otaCommandResponse$.next(true);
        break;
      case 0x0001:
        otaCommandResponse$.error(new Error(`Command rejected`));
        break;
      default:
        otaCommandResponse$.error(new Error("Unknown command response"));
    }
  }
}

// OTA Notification handlers

function otaFirmwareNotificationHandler(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;

  if (value && value.buffer.byteLength === 20) {
    const buffer = value.buffer;
    const view = new DataView(buffer);

    const sectorIndex = view.getUint16(0, true);
    const status = view.getUint16(2, true);
    const desiredSector = view.getUint16(4, true);
    const crc = view.getUint16(18, true);

    // Check CRC error
    const crcInput = new Uint8Array(buffer, 0, 18);
    const calculatedCRC = crc16_ccitt(crcInput);
    if (calculatedCRC !== crc) {
      otaSectorUploadResponse$.error(new Error(`OTA CRC error: the transmitted crc is ${crc}, while the calculated crc is ${calculatedCRC}`));
    }

    switch(status) {
      case 0x0000:
        console.log("Success");
        break;
      case 0x0001:
        otaSectorUploadResponse$.error(new Error(`CRC Error`));
        break;
      case 0x0002:
        otaSectorUploadResponse$.error(new Error(`Sector Index error. Desired sector: ${desiredSector}`));
        break;
      case 0x0003:
        otaSectorUploadResponse$.error(new Error(`Payload length error`));
        break;
      default:
        otaSectorUploadResponse$.error(new Error('Unknown response status'));
    }

    otaSectorUploadResponse$.next(sectorIndex);
  }
}

// OTA Helper functions

function buildPacket(
  sectorIndex: number,
  seq: number,
  payload: Uint8Array
): Uint8Array<ArrayBuffer> {
  const packetLength = 3 + payload.length;
  const buffer = new ArrayBuffer(packetLength);
  const view = new DataView(buffer);

  // Sector_Index: bytes 0-1 (little endian)
  view.setUint16(0, sectorIndex, true);

  // Packet_Seq: byte 2
  view.setUint8(2, seq);

  // Payload: bytes 3 ~ (3 + payload.length - 1)
  const payloadView = new Uint8Array(buffer, 3);
  payloadView.set(payload);

  return new Uint8Array(buffer);
}

function buildFinalPacket(
  sectorIndex: number,
  data: Uint8Array
): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(3 + FIRMWARE_PAYLOAD_SIZE);
  const view = new DataView(buffer);

  // Sector_Index: bytes 0-1 (little endian)
  view.setUint16(0, sectorIndex, true);

  // Packet_Seq: byte 2 = 0xFF (last packet indicator)
  view.setUint8(2, 0xFF);

  // Payload: initialize all 0x00 first
  const payloadView = new Uint8Array(buffer, 3);
  payloadView.fill(0);

  // Calculate CRC16 of sector data
  const crc = crc16_ccitt(data);

  // Set last 2 bytes of payload to CRC16 (little endian)
  view.setUint16(3 + FIRMWARE_PAYLOAD_SIZE - 2, crc, true);

  return new Uint8Array(buffer);
}

//// HELPER FUNCTIONS

/**
 * Converts a number to a big-endian byte array
 */
function numberToBytes(value: number, byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[byteLength - 1 - i] = value & 0xff;
    value >>= 8;
  }
  return bytes;
}

function crc16_ccitt(buffer: Uint8Array): number {
  let crc = 0x0000;
  for (let b of buffer) {
      crc ^= b << 8;
      for (let i = 0; i < 8; i++) {
          crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      }
      crc &= 0xFFFF;
  }
  return crc;
}

/**
 * Calculate a CRC32 code.
 * @returns CRC32 code
 */
function computeCRC32(buf: Uint8Array, crc = 0xFFFFFFFF) {
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 24;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x80000000) === 0) {
        crc <<= 1;
      } else {
        crc = (crc << 1) ^ 0x04C11DB7;
      }
    }
  }
  return crc & 0xFFFFFFFF;
}


function delay(timeout: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), timeout);
  });
}
