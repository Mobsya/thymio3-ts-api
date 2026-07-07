import { MTU, THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID } from "./constants";
import { crc16_ccitt, delay, type UploadProgress } from "./utils";

const FIRMWARE_SECTOR_SIZE = 4096; // 4KB;

const CMD_FLASH = 0x0001;
const CMD_STOP = 0x0002;
const CMD_ACK = 0x0003;

const CMD_RESPONSE_OK = 0x0000;
const CMD_RESPONSE_NACK = 0x0001;
const CMD_RESPONSE_SIGNATURE_ERROR = 0x0003;

const FW_RESPONSE_OK = 0x0000;
const FW_RESPONSE_CRC_ERROR = 0x0001;
const FW_RESPONSE_INDEX_ERROR = 0x0002;
const FW_RESPONSE_PAYLOAD_LENGTH_ERROR = 0x0003;
const FW_RESPONSE_CANNOT_START_OTA = 0x0005;

const COMMAND_TIMEOUT_MS = 15000;
const SECTOR_TIMEOUT_MS = 15000;
const MAX_SECTOR_RETRIES = 3;

type CommandStatus = -2 | -1 | 0 | 1;
type FirmwareStatus = -1 | 0 | 1;

let commandStatus: CommandStatus = 0;
let commandErrorMessage = "";
let firmwareStatus: FirmwareStatus = 0;
let expectedSector = 0;
let abortRequested = false;

export async function uploadFirmware(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
  otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic,
  firmware: Uint8Array<ArrayBuffer>
): Promise<void> {

  abortRequested = false;
  const total = firmware.length;
  const mtuPayloadSize = await probeMTUPayloadSize(otaFirmwareCharacteristic);

  try {
    resetCommandState();
    await sendStartCommand(otaCommandCharacteristic, total);

    try {
      await waitForCommand(COMMAND_TIMEOUT_MS);
    } catch (error) {
      throw new Error(`OTA start failed: ${getErrorMessage(error)}`);
    }

    // ── Send firmware sector by sector ──
    // Strategy: send all packets of a sector as fast as possible (burst),
    // then wait for ACK. If CRC error or timeout → retry the sector (max 3x).
    // This is fast on all platforms and self-healing on lossy BLE connections.

    let writtenSize = 0;
    const totalSectors = Math.ceil(total / FIRMWARE_SECTOR_SIZE);
    const startedAt = Date.now();

    while (writtenSize < total && !abortRequested) {
      const sector = firmware.slice(writtenSize, writtenSize + FIRMWARE_SECTOR_SIZE);
      if (sector.length === 0) break;

      const sectorIndex = Math.floor(writtenSize / FIRMWARE_SECTOR_SIZE);

      // Pre-build all packets for this sector so we can resend quickly on retry
      const packets = buildSectorPackets(sector, sectorIndex, mtuPayloadSize);
      let success = false;

      for (let attempt = 0; attempt < MAX_SECTOR_RETRIES && !abortRequested; attempt++) {
        if (attempt > 0) {
          await delay(200);
        }

        // Reset ACK state before sending last packet
        firmwareStatus = 0;
        expectedSector = sectorIndex;

        // Send all packets in burst — writeValueWithoutResponse is fire-and-forget
        for (let i = 0; i < packets.length && !abortRequested; i++) {
          await bleWrite(otaFirmwareCharacteristic, packets[i]!);
          if (i % 8 === 7) {
            await delay(0);
          }
        }

        if (abortRequested) break;

        // Wait for sector ACK
        const firmwareOk = await waitForFirmware(SECTOR_TIMEOUT_MS);
        if (firmwareOk) {
          success = true;
          break;
        }
      }

      if (abortRequested) break;

      if (!success) {
        throw new Error(`Sector ${sectorIndex} failed after ${MAX_SECTOR_RETRIES} attempts`);
      }

      writtenSize += sector.length;
      dispatchProgress({
        uploadedPackets: sectorIndex + 1,
        totalPackets: totalSectors,
        percentage: total === 0 ? 100 : (writtenSize / total) * 100
      });

      const elapsed = (Date.now() - startedAt) / 1000;
      const speed = elapsed > 0 ? writtenSize / elapsed : 0;
      console.log(
        `OTA sector ${sectorIndex + 1}/${totalSectors} uploaded (${writtenSize}/${total} bytes, ${Math.round(speed)} B/s)`
      );
    }

    if (abortRequested) {
      await sendStopCommand(otaCommandCharacteristic);
      throw new Error("Firmware upload aborted");
    }

    resetCommandState();
    await sendStopCommand(otaCommandCharacteristic);

    try {
      await waitForCommand(COMMAND_TIMEOUT_MS);
    } catch (error) {
      throw new Error(`OTA stop failed: ${getErrorMessage(error)}`);
    }
  } catch (error) {
    try {
      await sendStopCommand(otaCommandCharacteristic);
    } catch {
      // The connection may already be closing after an OTA failure.
    }
    throw error;
  } finally {
    abortRequested = false;
  }
}

export async function stopFirmwareUpload(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
): Promise<void> {
  abortRequested = true;
  return await sendStopCommand(otaCommandCharacteristic);
}

export function otaCommandNotificationHandler(event: Event): void {
  const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
  if (!value || value.byteLength < 20) return;

  const receivedCrc = value.getUint16(18, true);
  const crcInput = new Uint8Array(value.buffer, value.byteOffset, 18);
  if (crc16_ccitt(crcInput) !== receivedCrc) return;

  const command = value.getUint16(0, true);
  if (command !== CMD_ACK) return;

  const response = value.getUint16(4, true);

  switch(response) {
    case CMD_RESPONSE_OK:
      commandStatus = 1;
      commandErrorMessage = "";
      break;
    case CMD_RESPONSE_SIGNATURE_ERROR:
      commandStatus = -2;
      commandErrorMessage = "Firmware signature verification failed";
      break;
    case CMD_RESPONSE_NACK:
      commandStatus = -1;
      commandErrorMessage = "Command rejected";
      break;
    default:
      commandStatus = -1;
      commandErrorMessage = `Command rejected with response 0x${response.toString(16)}`;
  }
}

export function otaFirmwareNotificationHandler(event: Event): void {
  const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
  if (!value || value.byteLength < 4) return;

  const sectorIndex = value.getUint16(0, true);
  const response = value.getUint16(2, true);

  if (sectorIndex !== expectedSector) return;

  if (response === FW_RESPONSE_OK) {
    firmwareStatus = 1;
    return;
  }

  firmwareStatus = -1;

  const desiredSector = value.byteLength >= 6 ? value.getUint16(4, true) : undefined;
  const errorMessage = getFirmwareResponseError(response, desiredSector);
  console.error(`OTA firmware NACK for sector ${sectorIndex}: ${errorMessage}`);
}

async function sendStartCommand(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
  firmwareLength: number
): Promise<void> {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);

  // Command ID - 2 bytes
  view.setUint16(0, CMD_FLASH, true);

  // FirmwareLength - 4 bytes
  view.setUint32(2, firmwareLength, true);

  // CRC16 - 2 bytes
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);

  // Send packet
  const packet = new Uint8Array(buffer);
  await bleWrite(otaCommandCharacteristic, packet);
}

async function sendStopCommand(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<void> {
  const buffer = new ArrayBuffer(20);
  const view = new DataView(buffer);

  // Command ID - 2 bytes
  view.setUint16(0, CMD_STOP, true);

  // CRC16 - 2 bytes
  const crcInput = new Uint8Array(buffer, 0, 18);
  const crc = crc16_ccitt(crcInput);
  view.setUint16(18, crc, true);

  // Send packet
  const packet = new Uint8Array(buffer);
  await bleWrite(otaCommandCharacteristic, packet);
}

function buildSectorPackets(
  sectorData: Uint8Array<ArrayBuffer>,
  sectorIndex: number,
  mtuPayloadSize: number
): Uint8Array<ArrayBuffer>[] {
  const packets: Uint8Array<ArrayBuffer>[] = [];
  let sectorSize = 0;
  let sequence = 0;
  let crc = 0;

  while (sectorSize < sectorData.length) {
    const readLength = Math.min(mtuPayloadSize, sectorData.length - sectorSize);
    const chunk = sectorData.slice(sectorSize, sectorSize + readLength);

    sectorSize += readLength;
    crc = crc16_ccitt(chunk, crc);

    const isLastPacket = sectorSize >= sectorData.length || sectorSize >= FIRMWARE_SECTOR_SIZE;
    const packet = new Uint8Array(3 + chunk.length + (isLastPacket ? 2 : 0));

    packet[0] = sectorIndex & 0xff;
    packet[1] = (sectorIndex >> 8) & 0xff;
    packet[2] = isLastPacket ? 0xff : sequence & 0xff;
    packet.set(chunk, 3);

    if (isLastPacket) {
      packet[3 + chunk.length] = crc & 0xff;
      packet[3 + chunk.length + 1] = (crc >> 8) & 0xff;
    }

    packets.push(packet);
    sequence++;
  }

  return packets;
}

/**
 * Finds the largest writeValueWithoutResponse payload that succeeds.
 * The OTA packet has a 3-byte header, so usable payload = probed_size - 3.
 * @returns The optimal MTU
 */
async function probeMTUPayloadSize(
  otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<number> {
  if (!supportsWriteWithoutResponse(otaFirmwareCharacteristic)) {
    // Compat mode: write-with-response payloads are fragmented/reassembled by
    // the ATT layer (prepared writes), so the full packet size always fits.
    console.warn("OTA compat mode: using write-with-response because write-without-response is not exposed");
    return MTU - 3;
  }

  const candidates = [510, 247, 185, 122, 23];
  for (const size of candidates) {
    try {
      await otaFirmwareCharacteristic.writeValueWithoutResponse(new Uint8Array(size));
      return size - 3; // subtract 3-byte OTA header → usable payload
    } catch {
      // BLE stack rejected this size — try smaller
    }
  }

  return 20; // 23 - 3 header = 20 bytes absolute minimum
}

function resetCommandState(): void {
  commandStatus = 0;
  commandErrorMessage = "";
}

function waitForCommand(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      callback();
    };

    const checkStatus = () => {
      if (commandStatus === 1) {
        settle(resolve);
      } else if (commandStatus < 0) {
        settle(() => reject(new Error(commandErrorMessage)));
      }
    };

    const intervalId = setInterval(checkStatus, 50);
    const timeoutId = setTimeout(() => {
      if (commandStatus === 0) {
        settle(() => reject(new Error("Command ACK timed out")));
      }
    }, timeoutMs);

    checkStatus();
  });
}

function waitForFirmware(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;

    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearInterval(intervalId);
      clearTimeout(timeoutId);
      resolve(value);
    };

    const checkStatus = () => {
      if (abortRequested) {
        settle(false);
      } else if (firmwareStatus !== 0) {
        settle(firmwareStatus === 1);
      }
    };

    const intervalId = setInterval(checkStatus, 20);
    const timeoutId = setTimeout(() => {
      settle(false);
    }, timeoutMs);

    checkStatus();
  });
}

async function bleWrite(
  characteristic: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array<ArrayBuffer>
): Promise<void> {
  if (supportsWriteWithoutResponse(characteristic)) {
    await characteristic.writeValueWithoutResponse(data);
  } else {
    await characteristic.writeValueWithResponse(data);
  }
}

/**
 * Old firmwares declare the OTA characteristics as plain "Write" without the
 * WriteWithoutResponse property. Permissive stacks (BlueZ / Android / Windows)
 * send Write-NR PDUs anyway, but CoreBluetooth (macOS / iPadOS) silently drops
 * them, so nothing ever reaches the device. When the property is missing we
 * fall back to write-with-response: slower, but works everywhere.
 */
function supportsWriteWithoutResponse(characteristic: BluetoothRemoteGATTCharacteristic): boolean {
  return Boolean(characteristic.properties?.writeWithoutResponse);
}

function dispatchProgress(
  progress: UploadProgress,
): void {
  const uploadProgressEvent = new CustomEvent(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID, {
    detail: progress
  });
  document.dispatchEvent(uploadProgressEvent);
}

function getFirmwareResponseError(response: number, desiredSector?: number): string {
  switch(response) {
    case FW_RESPONSE_CRC_ERROR:
      return "CRC error";
    case FW_RESPONSE_INDEX_ERROR:
      return `Index error${desiredSector === undefined ? "" : ` (want ${desiredSector})`}`;
    case FW_RESPONSE_PAYLOAD_LENGTH_ERROR:
      return "Payload length error";
    case FW_RESPONSE_CANNOT_START_OTA:
      return "Cannot start OTA";
    default:
      return `0x${response.toString(16)}`;
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
