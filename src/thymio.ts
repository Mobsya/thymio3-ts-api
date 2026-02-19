/// <reference types="web-bluetooth" />

import type { ActuatorData } from "./command";
import * as command from './command';
import * as python from './python';
import * as sensorStream from './sensor-stream';
import * as updater from './updater';
import * as ota from './ota';
import * as audio from './audio';
import * as files from './files';
import * as deviceInfo from './device-info';
import { delay } from "./utils";
import { MAIN_SERVICE_UUID, OTA_SERVICE_UUID, COMMAND_CHARACTERISTIC_UUID, SENSOR_STREAM_CHARACTERISTIC_UUID, PYTHON_CHARACTERISTIC_UUID, AUDIO_CHARACTERISTIC_UUID, OTA_FIRMWARE_CHARACTERISTIC_UUID, OTA_COMMAND_CHARACTERISTIC_UUID, FILE_CHARACTERISTIC_UUID, DEVICE_INFO_CHARACTERISTIC_UUID, STD_OUT_CHARACTERISTIC_UUID, THYMIO_CONNECTED_EVENT_ID, THYMIO_PROMPT_MANUAL_RECONNECTION_EVENT_ID } from "./constants";
import type { FileListing } from "./files";
import type { FirmwareInfo, MemoryInfo } from "./device-info";
import { handleStdOutResponse } from "./std-out";

let device: BluetoothDevice | undefined;
let reconnecting = false;
let commandCharacteristic: BluetoothRemoteGATTCharacteristic;
let sensorStreamCharacteristic: BluetoothRemoteGATTCharacteristic;
let pythonCharacteristic: BluetoothRemoteGATTCharacteristic;
let stdOutCharacteristic: BluetoothRemoteGATTCharacteristic;
let audioCharacteristic: BluetoothRemoteGATTCharacteristic;
let fileCharacteristic: BluetoothRemoteGATTCharacteristic;
let deviceInfoCharacteristic: BluetoothRemoteGATTCharacteristic;

let otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic;
let otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic;

/**
 * Request a bluetooth device and connect to it.
 */
export async function requestAndConnect(): Promise<void> {
  if (!navigator.bluetooth) {
    throw new Error("Web Bluetooth not supported");
  }

  // For Chromium-based browsers
  /*
  device = await navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'THYMIO' }],
    optionalServices: [
      MAIN_SERVICE_UUID,
      OTA_SERVICE_UUID
    ]
  });
  */

  device = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [MAIN_SERVICE_UUID, OTA_SERVICE_UUID]}
    ]
  });

  if (!device.name?.startsWith('THYMIO')) {
    device = undefined;
    throw new Error('Not a Thymio device');
  }

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
  if (device) {
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    await device.gatt?.disconnect();

    dispatchConnectedEvent(false);

    console.log("✅ Disconnected from Thymio 3.");
  } else {
    throw new Error('Bluetooth device is undefined');
  }
}

/**
 * Connect to the device and to all of the exposed services and characteristics.
 */
async function connect() {
  if (device && device.gatt) {
    const server = await device.gatt.connect();
    const mainService = await server.getPrimaryService(MAIN_SERVICE_UUID);

    commandCharacteristic = await mainService.getCharacteristic(COMMAND_CHARACTERISTIC_UUID);

    sensorStreamCharacteristic = await mainService.getCharacteristic(SENSOR_STREAM_CHARACTERISTIC_UUID);
    await sensorStreamCharacteristic.startNotifications();
    sensorStreamCharacteristic.addEventListener('characteristicvaluechanged', sensorStream.handleStreamResponse);

    pythonCharacteristic = await mainService.getCharacteristic(PYTHON_CHARACTERISTIC_UUID);
    await pythonCharacteristic.startNotifications();
    pythonCharacteristic.addEventListener('characteristicvaluechanged', python.handlePythonResponse);

    stdOutCharacteristic = await mainService.getCharacteristic(STD_OUT_CHARACTERISTIC_UUID);
    await stdOutCharacteristic.startNotifications();
    stdOutCharacteristic.addEventListener('characteristicvaluechanged', handleStdOutResponse);

    audioCharacteristic = await mainService.getCharacteristic(AUDIO_CHARACTERISTIC_UUID);
    await audioCharacteristic.startNotifications();
    audioCharacteristic.addEventListener('characteristicvaluechanged', audio.handleAudioResponse);

    fileCharacteristic = await mainService.getCharacteristic(FILE_CHARACTERISTIC_UUID);
    await fileCharacteristic.startNotifications();

    deviceInfoCharacteristic = await mainService.getCharacteristic(DEVICE_INFO_CHARACTERISTIC_UUID);
    await deviceInfoCharacteristic.startNotifications();

    const otaService = await server.getPrimaryService(OTA_SERVICE_UUID);

    otaFirmwareCharacteristic = await otaService.getCharacteristic(OTA_FIRMWARE_CHARACTERISTIC_UUID);
    otaFirmwareCharacteristic.startNotifications();
    otaFirmwareCharacteristic.addEventListener('characteristicvaluechanged', ota.otaFirmwareNotificationHandler);

    otaCommandCharacteristic = await otaService.getCharacteristic(OTA_COMMAND_CHARACTERISTIC_UUID);
    otaCommandCharacteristic.startNotifications();
    otaCommandCharacteristic.addEventListener('characteristicvaluechanged', ota.otaCommandNotificationHandler);

    dispatchConnectedEvent(true);

    console.log("✅ Connected to Thymio 3 !");
  } else {
    throw new Error("Bluetooth GATT is not available.")
  }
}

function onDisconnected() {
  dispatchConnectedEvent(false);

  console.log('⚠️ Disconnected. Attempting to reconnect...');

  if (!reconnecting) {
    reconnecting = true;
    retryConnection();
  }
}

// The automatic BT re-connection fails for devices that have not been manually connected
// for more than three minutes.
// We can remove this mitigation as soon as https://chromestatus.com/feature/4797798639730688 is implemented
// See also https://stackoverflow.com/questions/60603666/web-bluetooth-bypass-pairing-screen-for-a-known-device-id
async function retryConnection() {
  if (!device) {
    throw new Error('Bluetooth device is undefined');
  }

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      await delay(3000);  // Wait 2 seconds before retry
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

  // Prompt for manual reconnection if automatic reconnection fails
  dispatchManualReconnectionEvent();
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

export async function saveScriptToPartition(scriptId: number) {
	await python.saveScriptToPartition(pythonCharacteristic, scriptId);
}

export async function softResetPythonInterpreter() {
	await python.softResetPythonInterpreter(pythonCharacteristic);
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

//// FIRMWARE UPDATE

export async function isNewerFirmwareAvailable(): Promise<boolean> {
  return await updater.isNewerFirmwareAvailable(deviceInfoCharacteristic);
}

export async function getNewFirmware(): Promise<ArrayBuffer> {
  return await updater.getNewFirmware(deviceInfoCharacteristic);
}

export async function updateFirmware(): Promise<void> {
  // Temporary fix for the OTA slowdown
  unsubscribeFromCharacteristics();

  return await updater.updateFirmware(
    deviceInfoCharacteristic,
    otaCommandCharacteristic,
    otaFirmwareCharacteristic
  );
}

//// OTA CHARACTERISTIC

export async function uploadFirmware(firmware: ArrayBuffer): Promise<void> {
  // Temporary fix for the OTA slowdown
  unsubscribeFromCharacteristics();

  return await ota.uploadFirmware(
    otaCommandCharacteristic,
    otaFirmwareCharacteristic,
    firmware
  );
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

//// FILES CHARACTERISTIC

/**
 * Upload a file to the Thymio. It will be placed in RAM.
 * @param file File to upload
 */
export async function uploadFile(file: File): Promise<void> {
  return await files.uploadFile(fileCharacteristic, file);
}

/**
 * Save the file that is present in the RAM to the storage.
 * @param filename Name of the file new file.
 */
export async function saveFile(filename: string): Promise<void> {
  return await files.saveFile(fileCharacteristic, filename);
}

/**
 * Delete a file from the storage.
 * @param filename Name of the file to delete.
 * @returns
 */
export async function deleteFile(filename: string): Promise<void> {
  return await files.deleteFile(fileCharacteristic, filename);
}

/**
 * List files present in the Thymio storage.
 * @returns A listing of files with their names and sizes.
 */
export async function listFiles(): Promise<FileListing[]> {
  return await files.listFiles(fileCharacteristic);
}

/**
 * Erase all files from the Thymio storage.
 */
export async function eraseAllFiles(): Promise<void> {
  return await files.eraseAllFiles(fileCharacteristic);
}

/**
 * Download a file from the robot.
 * @param filename Name of the file to download.
 * @returns An byte array of the downloaded file.
 */
export async function downloadFile(filename: string): Promise<Uint8Array<ArrayBuffer>> {
  return await files.downloadFile(fileCharacteristic, filename);
}

/**
 * Free the RAM from the uploaded files.
 */
export async function freeMemory(): Promise<void> {
  return await files.freeMemory(fileCharacteristic);
}

//// DEVICE INFO CHARACTERISTIC

/**
 * Get the device firmware info.
 */
export async function getFirmwareInfo(): Promise<FirmwareInfo> {
  return await deviceInfo.getFirmwareInfo(deviceInfoCharacteristic);
}

/**
 * Get the device memory info.
 */
export async function getMemoryInfo(): Promise<MemoryInfo> {
  return await deviceInfo.getMemoryInfo(deviceInfoCharacteristic);
}

function dispatchManualReconnectionEvent() {
  const manualReconnEvent = new CustomEvent(THYMIO_PROMPT_MANUAL_RECONNECTION_EVENT_ID);
  document.dispatchEvent(manualReconnEvent);
}
function dispatchConnectedEvent(connected: boolean) {
  const connectedEvent = new CustomEvent(THYMIO_CONNECTED_EVENT_ID, {
    detail: connected
  });
  document.dispatchEvent(connectedEvent);
}

// Temporary fix for the OTA slowdown
async function unsubscribeFromCharacteristics() {
  await sensorStreamCharacteristic.stopNotifications();
  sensorStreamCharacteristic.removeEventListener('characteristicvaluechanged', sensorStream.handleStreamResponse);

  await pythonCharacteristic.stopNotifications();
  pythonCharacteristic.removeEventListener('characteristicvaluechanged', python.handlePythonResponse);

  await stdOutCharacteristic.stopNotifications();
  stdOutCharacteristic.removeEventListener('characteristicvaluechanged', handleStdOutResponse);

  await audioCharacteristic.stopNotifications();
  audioCharacteristic.removeEventListener('characteristicvaluechanged', audio.handleAudioResponse);

  await fileCharacteristic.stopNotifications();

  await deviceInfoCharacteristic.stopNotifications();
}
