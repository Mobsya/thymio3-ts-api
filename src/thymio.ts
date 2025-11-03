/// <reference types="web-bluetooth" />

import type { ActuatorData } from "./command";
import * as command from './command';
import * as python from './python';
import * as sensorStream from './sensor-stream';
import * as ota from './ota';
import * as audio from './audio';
import { delay } from "./utils";
import { MAIN_SERVICE_UUID, OTA_SERVICE_UUID, COMMAND_CHARACTERISTIC_UUID, SENSOR_STREAM_CHARACTERISTIC_UUID, PYTHON_CHARACTERISTIC_UUID, AUDIO_CHARACTERISTIC_UUID, OTA_FIRMWARE_CHARACTERISTIC_UUID, OTA_COMMAND_CHARACTERISTIC_UUID } from "./constants";

let otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic;
let otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic;

let device: BluetoothDevice;
let reconnecting = false;
let commandCharacteristic: BluetoothRemoteGATTCharacteristic;
let sensorStreamCharacteristic: BluetoothRemoteGATTCharacteristic;
let pythonCharacteristic: BluetoothRemoteGATTCharacteristic;
let audioCharacteristic: BluetoothRemoteGATTCharacteristic;

/**
 * Request a bluetooth device and connect to it.
 */
export async function requestAndConnect(): Promise<void> {
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

export function isConnected(): boolean {
  if(device && device.gatt) {
    return device.gatt.connected;
  } else {
    return false;
  }
}

export async function disconnect(): Promise<void> {
  device.removeEventListener('gattserverdisconnected', onDisconnected);
  await device.gatt?.disconnect();
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

      sensorStreamCharacteristic = await mainService.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
      await sensorStreamCharacteristic.startNotifications();
      sensorStreamCharacteristic.addEventListener('characteristicvaluechanged', sensorStream.handleStreamResponse);

      pythonCharacteristic = await mainService.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
      await pythonCharacteristic.startNotifications();
      pythonCharacteristic.addEventListener('characteristicvaluechanged', python.handlePythonResponse);

      audioCharacteristic = await mainService.getCharacteristic(AUDIO_CHARACTERISTIC_UUID);
      await audioCharacteristic.startNotifications();
      audioCharacteristic.addEventListener('characteristicvaluechanged', audio.handleAudioResponse);

      const otaService = await server.getPrimaryService(OTA_SERVICE_UUID);

      otaFirmwareCharacteristic = await otaService.getCharacteristic(OTA_FIRMWARE_CHARACTERISTIC_UUID);
      otaFirmwareCharacteristic.startNotifications();
      otaFirmwareCharacteristic.addEventListener('characteristicvaluechanged', ota.otaFirmwareNotificationHandler);

      otaCommandCharacteristic = await otaService.getCharacteristic(OTA_COMMAND_CHARACTERISTIC_UUID);
      otaCommandCharacteristic.startNotifications();
      otaCommandCharacteristic.addEventListener('characteristicvaluechanged', ota.otaCommandNotificationHandler);

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

// COMMAND CHARACTERISTIC

/**
 * Set the state of the Thymio 3 actuators.
 * @param {*} actuatorData
 */
export async function setActuatorState(actuatorData: ActuatorData) {
  await command.setActuatorState(commandCharacteristic, actuatorData)
}

// PYTHON CHARACTERISTIC

export async function sendPythonScript(script: string) {
  await python.sendPythonScript(pythonCharacteristic, script);
}

export async function executeLoadedScript() {
  await python.executeLoadedScript(pythonCharacteristic);
}

export async function stopScriptExecution() {
  await python.stopScriptExecution(pythonCharacteristic);
}

//// SENSOR STREAM CHARACTERISTIC

/**
 * Start the sensor streaming. By default, only the main sensors are enabled.
 * @param other Enable/disable other sensors
 */
export async function startSensorStreaming(other = false) {
  return await sensorStream.startSensorStreaming(sensorStreamCharacteristic, other);
}

/**
 * Stop all sensor streaming.
 */
export async function stopSensorStreaming() {
  return await sensorStream.stopSensorStreaming(sensorStreamCharacteristic);
}

//// OTA CHARACTERISTIC

export async function uploadFirmware(firmware: ArrayBuffer): Promise<void> {
  return await ota.uploadFirmware(otaCommandCharacteristic, otaFirmwareCharacteristic, firmware);
}

export async function stopFirmwareUpload(): Promise<void> {
  return await ota.stopFirmwareUpload(otaCommandCharacteristic);
}

//// AUDIO CHARACTERISTIC

/**
 * Upload a custom audio file.
 * @param file The audio file to upload.
 */
export async function uploadAudioFile(file: File) {
  return await audio.uploadAudioFile(audioCharacteristic, file)
}

/**
 * Play the audio file that is currently in memory.
 */
export async function playAudioFile() {
  return await audio.playAudioFile(audioCharacteristic);
}

/**
 * Stop the audio file that is currently playing.
 */
export async function stopAudioFile() {
  return await audio.stopAudioFile(audioCharacteristic);
}

/**
 * Start recording audio to memory.
 * @param duration The duration of the recording (maximum 10 seconds).
 */
export async function recordAudio(duration: number) {
  return await audio.recordAudio(audioCharacteristic, duration);
}

/**
 * Play a frequency.
 * @param frequency Frequency in Hz (up to 3kHz)
 * @param duration Duration in tenths of a second, 0 means play forever
 */
export async function playFrequency(
  frequency: number,
  duration: number
) {
  return await audio.playFrequency(audioCharacteristic, frequency, duration);
}
