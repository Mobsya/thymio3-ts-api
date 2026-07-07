import { FIRMWARE_PAYLOAD_SIZE, FIRMWARE_SECTOR_SIZE, THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID } from "./constants";
import { crc16_ccitt, delay, type UploadProgress } from "./utils";

const CMD_FLASH = 0x0001;
const CMD_STOP = 0x0002;
const CMD_ACK = 0x0003;
const CMD_SPIFFS = 0x0004;

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

export type OtaTarget = "flash" | "spiffs";

export type FirmwareSource = ArrayBuffer | Uint8Array<ArrayBuffer>;

export type OtaUploadOptions = {
  target?: OtaTarget,
  commandTimeoutMs?: number,
  sectorTimeoutMs?: number,
  maxRetries?: number,
  mtuPayloadSize?: number,
  signal?: AbortSignal,
  onProgress?: (progress: UploadProgress) => void
};

let commandStatus: CommandStatus = 0;
let commandErrorMessage = "";
let expectedCommand = 0;
let firmwareStatus: FirmwareStatus = 0;
let expectedSector = 0;
let abortRequested = false;

export async function uploadFirmware(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
  otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic,
  firmware: FirmwareSource,
  options: OtaUploadOptions = {}
): Promise<void> {
  if (options.signal?.aborted) {
    throw new Error("Firmware upload aborted");
  }

  abortRequested = false;
  const firmwareBytes = toFirmwareBytes(firmware);
  const total = firmwareBytes.length;
  const target = options.target ?? "flash";
  const commandId = target === "flash" ? CMD_FLASH : CMD_SPIFFS;
  const commandTimeoutMs = options.commandTimeoutMs ?? COMMAND_TIMEOUT_MS;
  const sectorTimeoutMs = options.sectorTimeoutMs ?? SECTOR_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? MAX_SECTOR_RETRIES;
  const mtuPayloadSize = options.mtuPayloadSize ?? await probeMTUPayloadSize(otaFirmwareCharacteristic);

  const abortListener = () => {
    abortRequested = true;
  };

  options.signal?.addEventListener("abort", abortListener, { once: true });

  try {
    resetCommandState(commandId);
    await bleWrite(otaCommandCharacteristic, buildCommand(commandId, [
      total & 0xff,
      (total >> 8) & 0xff,
      (total >> 16) & 0xff,
      (total >> 24) & 0xff
    ]));

    try {
      await waitForCommand(commandTimeoutMs);
    } catch (error) {
      throw new Error(`OTA start failed: ${getErrorMessage(error)}`);
    }

    let writtenSize = 0;
    const totalSectors = Math.ceil(total / FIRMWARE_SECTOR_SIZE);
    const startedAt = Date.now();

    while (writtenSize < total && !abortRequested) {
      const sector = firmwareBytes.slice(writtenSize, writtenSize + FIRMWARE_SECTOR_SIZE);
      if (sector.length === 0) break;

      const sectorIndex = Math.floor(writtenSize / FIRMWARE_SECTOR_SIZE);
      const packets = buildSectorPackets(sector, sectorIndex, mtuPayloadSize);
      let success = false;

      for (let attempt = 0; attempt < maxRetries && !abortRequested; attempt++) {
        if (attempt > 0) {
          await delay(200);
        }

        firmwareStatus = 0;
        expectedSector = sectorIndex;

        for (let i = 0; i < packets.length && !abortRequested; i++) {
          await bleWrite(otaFirmwareCharacteristic, packets[i]!);
          if (i % 8 === 7) {
            await delay(0);
          }
        }

        if (abortRequested) break;

        const firmwareOk = await waitForFirmware(sectorTimeoutMs);
        if (firmwareOk) {
          success = true;
          break;
        }
      }

      if (abortRequested) break;

      if (!success) {
        throw new Error(`Sector ${sectorIndex} failed after ${maxRetries} attempts`);
      }

      writtenSize += sector.length;
      dispatchProgress({
        uploadedPackets: sectorIndex + 1,
        totalPackets: totalSectors,
        percentage: total === 0 ? 100 : (writtenSize / total) * 100
      }, options.onProgress);

      const elapsed = (Date.now() - startedAt) / 1000;
      const speed = elapsed > 0 ? writtenSize / elapsed : 0;
      console.log(
        `OTA sector ${sectorIndex + 1}/${totalSectors} uploaded (${writtenSize}/${total} bytes, ${Math.round(speed)} B/s)`
      );
    }

    if (abortRequested) {
      await bleWrite(otaCommandCharacteristic, buildCommand(CMD_STOP));
      throw new Error("Firmware upload aborted");
    }

    resetCommandState(CMD_STOP);
    await bleWrite(otaCommandCharacteristic, buildCommand(CMD_STOP));

    try {
      await waitForCommand(commandTimeoutMs);
    } catch (error) {
      throw new Error(`OTA stop failed: ${getErrorMessage(error)}`);
    }
  } catch (error) {
    try {
      await bleWrite(otaCommandCharacteristic, buildCommand(CMD_STOP));
    } catch {
      // The connection may already be closing after an OTA failure.
    }
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abortListener);
    abortRequested = false;
  }
}

export async function stopFirmwareUpload(
  otaCommandCharacteristic: BluetoothRemoteGATTCharacteristic,
): Promise<void> {
  abortRequested = true;
  return await bleWrite(otaCommandCharacteristic, buildCommand(CMD_STOP));
}

export function otaCommandNotificationHandler(event: Event): void {
  const value = getCharacteristicValue(event);
  if (!value || value.byteLength < 20) return;

  const receivedCrc = value.getUint16(18, true);
  const crcInput = new Uint8Array(value.buffer, value.byteOffset, 18);
  if (crc16_ccitt(crcInput) !== receivedCrc) return;

  const command = value.getUint16(0, true);
  if (command !== CMD_ACK) return;

  const forCommand = value.getUint16(2, true);
  const response = value.getUint16(4, true);

  if (forCommand !== expectedCommand) {
    console.info(
      `OTA command ACK ignored (forCommand=0x${forCommand.toString(16)}, expected=0x${expectedCommand.toString(16)})`
    );
    return;
  }

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
  const value = getCharacteristicValue(event);
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

function buildCommand(id: number, payload: number[] = []): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(20);
  const bytes = new Uint8Array(buffer);

  bytes[0] = id & 0xff;
  bytes[1] = (id >> 8) & 0xff;

  payload.slice(0, 16).forEach((value, index) => {
    bytes[2 + index] = value;
  });

  const crc = crc16_ccitt(bytes.slice(0, 18));
  bytes[18] = crc & 0xff;
  bytes[19] = (crc >> 8) & 0xff;

  return bytes;
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

async function probeMTUPayloadSize(
  otaFirmwareCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<number> {
  if (!supportsWriteWithoutResponse(otaFirmwareCharacteristic)) {
    console.warn("OTA compat mode: using write-with-response because write-without-response is not exposed");
    return FIRMWARE_PAYLOAD_SIZE;
  }

  const candidates = [510, 247, 185, 122, 23];
  for (const size of candidates) {
    try {
      await otaFirmwareCharacteristic.writeValueWithoutResponse(new Uint8Array(size));
      return size - 3;
    } catch {
      // Try the next smaller candidate.
    }
  }

  return 20;
}

function resetCommandState(commandId: number): void {
  commandStatus = 0;
  commandErrorMessage = "";
  expectedCommand = commandId;
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
    return;
  }

  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(data);
    return;
  }

  await characteristic.writeValue(data);
}

function supportsWriteWithoutResponse(characteristic: BluetoothRemoteGATTCharacteristic): boolean {
  return Boolean(characteristic.properties?.writeWithoutResponse);
}

function toFirmwareBytes(firmware: FirmwareSource): Uint8Array<ArrayBuffer> {
  if (firmware instanceof Uint8Array) {
    return firmware;
  }

  return new Uint8Array(firmware);
}

function dispatchProgress(
  progress: UploadProgress,
  onProgress: OtaUploadOptions["onProgress"]
): void {
  onProgress?.(progress);

  const uploadProgressEvent = new CustomEvent(THYMIO_FIRMWARE_UPLOAD_PROGRESS_EVENT_ID, {
    detail: progress
  });
  document.dispatchEvent(uploadProgressEvent);
}

function getCharacteristicValue(event: Event): DataView | undefined {
  return (event.target as BluetoothRemoteGATTCharacteristic | null)?.value;
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
