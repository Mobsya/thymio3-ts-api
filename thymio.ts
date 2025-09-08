/// <reference types="web-bluetooth" />

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

const MAIN_SERVICE_UUID = '0000abf0-0000-1000-8000-00805f9b34fb';

const COMMAND_CHARACTERISTIC_UUID = '0000abf1-0000-1000-8000-00805f9b34fb';
const SENSOR_STREAM_CHARACTERISTIC_UUID = '0000abf2-0000-1000-8000-00805f9b34fb';
const PYTHON_CHARACTERISTIC_UUID = '0000abf3-0000-1000-8000-00805f9b34fb';

const MTU = 500;

const THYMIO_SENSOR_VALUES_EVENT_ID = 'thymio-values';

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
      MAIN_SERVICE_UUID
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
      const service = await server.getPrimaryService(MAIN_SERVICE_UUID);

      commandCharacteristic = await service.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

      sensorStreamcharacteristic = await service.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
      await sensorStreamcharacteristic.startNotifications();
      sensorStreamcharacteristic.addEventListener('characteristicvaluechanged', handleStreamResponse);

      pythonCharacteristic = await service.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
      await pythonCharacteristic.startNotifications();
      pythonCharacteristic.addEventListener('characteristicvaluechanged', handlePythonResponse);

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
                packed[byteIndex] |= val << 4;
            } else {
                packed[byteIndex] |= val;
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
    view.setUint16(offset, packRGB(flRGB)); offset += 2;

    // FR RGB (2 bytes)
    view.setUint16(offset, packRGB(frRGB)); offset += 2;

    // BL RGB (2 bytes)
    view.setUint16(offset, packRGB(blRGB)); offset += 2;

    // BR RGB (2 bytes)
    view.setUint16(offset, packRGB(brRGB)); offset += 2;

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

export async function enableSensorStreaming(other = false) {
  const id = 0x01;

  let body;
  if (!other) {
    body = 0x00;
  } else {
    body = 0x01;
  }

  const payload = new Uint8Array([id, body]);

  return await sensorStreamcharacteristic.writeValueWithoutResponse(payload);
}

async function handleStreamResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;
  console.log(value)

  if (value) {
    const id = value.getUint8(0);
    const data = new Uint8Array(value.buffer.slice(1));
    console.log(data)

    if (id === 0x01) {
      const sensorsData = parseSensorsData(data);

      const mostValuesEvent = new CustomEvent(THYMIO_SENSOR_VALUES_EVENT_ID, {
        detail: sensorsData
      });
      console.log(sensorsData)
      document.dispatchEvent(mostValuesEvent);
    }
  }
}

function parseSensorsData(bytes: Uint8Array): SensorsData {
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

/*
async function sendFileData(file) {
  const arrayBuffer = await file.arrayBuffer();
  const base64String = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  );

  await sendData(base64String);
  console.log('✅ File sent');
}
*/
