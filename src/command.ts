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
  sound: number,               // Integer 0 to 19
  smallBottomRGB: RGB,         // { r: 0-15, g: 0-15, b: 0-15 }
  smallBackRGB: RGB,           // { r: 0-15, g: 0-15, b: 0-15 }
  buttonLEDs: number[],        // Array of 4 numbers (0-15)
  receiverLED : number,        // 0-15 brightness/intensity
  microphoneLED: boolean       // on/off
}

/**
 * Set the state of the Thymio 3 actuators.
 * @param {*} actuatorData
 */
export async function setActuatorState(
  commandCharacteristic: BluetoothRemoteGATTCharacteristic,
  actuatorData: ActuatorData
) {
  const commandArray = createCommandByteArray(actuatorData);
  const secondaryCommandArray = createSecondaryCommandByteArray(actuatorData);

  await commandCharacteristic.writeValueWithResponse(commandArray);
  await commandCharacteristic.writeValueWithResponse(secondaryCommandArray);
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

    // Circle LEDs (4 bytes)
    pack4bitArrayto4Bytes(circleLEDs).forEach(byte => view.setUint8(offset++, byte));

    // Front Lego LEDs (4 bytes)
    pack4bitArrayto4Bytes(frontLegoLEDs).forEach(byte => view.setUint8(offset++, byte));

    // Rear Lego LEDs (4 bytes)
    pack4bitArrayto4Bytes(rearLegoLEDs).forEach(byte => view.setUint8(offset++, byte));

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

function createSecondaryCommandByteArray({
  smallBottomRGB,
  smallBackRGB,
  buttonLEDs,
  receiverLED,
  microphoneLED
}: ActuatorData) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    let offset = 0;

    // ID (1 byte)
    view.setUint8(offset, 0x02); offset++;

    view.setUint16(offset, packRGB(smallBottomRGB), true); offset += 2;

    view.setUint16(offset, packRGB(smallBackRGB), true); offset += 2;

    pack4bitArrayTo2Bytes(buttonLEDs).forEach(byte => view.setUint8(offset++, byte));

    view.setUint8(offset++, packReceiverAndMicrophoneLED(receiverLED, microphoneLED)); offset++;

    return new Uint8Array(buffer);
}

// Helper to pack 8 4-bit values into 4 bytes
function pack4bitArrayto4Bytes(arr: number[]) {
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

// Helper to pack 4 4-bit values into 2 bytes
function pack4bitArrayTo2Bytes(arr: number[]) {
    const packed = new Uint8Array(2);
    for (let i = 0; i < 4; i++) {
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

// Helper to pack RGB values into 2 bytes
function packRGB({ r, g, b }: RGB) {
    let rgb = ((b & 0x0F) << 8) | ((g & 0x0F) << 4) | (r & 0x0F);
    return rgb;
}

function packReceiverAndMicrophoneLED(receiverLED: number, microphoneLED: boolean) {
  return (receiverLED & 0x0F) | (microphoneLED ? 0x10 : 0x00);
}
