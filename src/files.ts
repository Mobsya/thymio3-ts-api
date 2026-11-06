import { THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID, THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID } from "./constants";
import { queueBluetoothCall } from "./bluetooth-queue";
import { createPayloadPackets, type UploadProgress } from "./utils";
import { getMTU } from "./mtu";

const FILE_UPLOAD_ACK_TIMEOUT_MS = 15_000;

type FileUploadLog = {
  timestamp: number,
  elapsedMs: number,
  level: "info" | "warn" | "error",
  stage: "reading" | "preparing" | "sending" | "waiting" | "complete" | "failed",
  message: string,
  fileName: string,
  fileSize: number,
  uploadedPackets: number,
  totalPackets: number,
  uploadedBytes: number
};

export type FileListing = {
  name: string,
  size: number
};

export async function uploadFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  file: File
): Promise<void> {
  const startedAt = Date.now();
  let stage: FileUploadLog["stage"] = "reading";
  let uploadedPackets = 0;
  let totalPackets = 0;
  let uploadedBytes = 0;

  const log = (level: FileUploadLog["level"], message: string) => {
    const timestamp = Date.now();
    const detail: FileUploadLog = {
      timestamp, elapsedMs: timestamp - startedAt, level, stage, message,
      fileName: file.name, fileSize: file.size, uploadedPackets, totalPackets, uploadedBytes
    };
    console.debug(
      `[File upload: ${JSON.stringify(file.name)} +${detail.elapsedMs}ms] ${message}`,
      detail
    );
  };

  return new Promise<void>((resolve, reject) => {
    const device = fileCharacteristic?.service?.device;
    let settled = false;
    let acknowledged = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      fileCharacteristic?.removeEventListener("characteristicvaluechanged", onResponse);
      device?.removeEventListener("gattserverdisconnected", onDisconnected);
      clearTimeout(timeoutId);
    };

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const failedStage = stage;
      stage = "failed";
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      log("error", `Upload failed during ${failedStage} after ${uploadedPackets}/${totalPackets} packets (${uploadedBytes}/${file.size} file bytes): ${message}`);
      reject(error);
    };

    const complete = () => {
      if (settled) return;
      settled = true;
      cleanup();
      stage = "complete";
      log("info", `Upload complete: robot confirmed ${uploadedBytes} bytes in RAM. Use Save file to keep it in storage.`);
      resolve();
    };

    const onDisconnected = () => fail(new Error("File upload: Bluetooth disconnected. Reconnect to the robot and try again."));

    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (settled) return;
      if (!value || value.byteLength === 0) {
        log("warn", "Received an empty notification; still waiting for the upload acknowledgement.");
        return;
      }

      const id = value.getUint8(0);
      if (id !== 0x01) {
        log("info", `Ignoring notification 0x${id.toString(16).padStart(2, "0")} (${value.byteLength} bytes); upload acknowledgement uses 0x01.`);
        return;
      }
      if (value.byteLength < 2) {
        fail(new Error("File upload: Malformed acknowledgement (missing response code)"));
        return;
      }

      const responseCode = value.getUint8(1);
      const responses: Record<number, string> = {
        0x00: "Success",
        0x01: "CRC Mismatch",
        0x02: "Partial upload",
        0x03: "Wrong sequence",
        0x04: "File too big"
      };
      const response = responses[responseCode] ?? "Unknown response code";
      log(responseCode === 0 ? "info" : "error", `Robot acknowledgement 0x${responseCode.toString(16).padStart(2, "0")}: ${response}.`);
      if (responseCode !== 0) {
        fail(`File upload: ${response}`);
        return;
      }

      // Notifications can arrive before the last GATT write promise resolves.
      acknowledged = true;
      if (totalPackets > 0 && uploadedPackets === totalPackets) complete();
    };

    const send = async () => {
      log("info", `Starting upload of ${JSON.stringify(file.name)} (${file.size} bytes, type ${file.type || "unspecified"}).`);
      if (!fileCharacteristic || device?.gatt?.connected === false) {
        throw new Error("File upload: Bluetooth is not connected. Connect to the robot and try again.");
      }
      fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);
      device?.addEventListener("gattserverdisconnected", onDisconnected);
      log("info", "Listening for robot acknowledgements. Reading the local file.");

      const buffer = await file.arrayBuffer();
      if (settled) return;
      const payload = new Uint8Array(buffer);
      stage = "preparing";
      log("info", `Read ${payload.byteLength} bytes. Calculating CRC32 and preparing Bluetooth packets.`);
      const packets = createPayloadPackets(payload, true);
      totalPackets = packets.length;
      const crc = new DataView(packets[0].buffer).getUint32(5);
      log("info", `Prepared ${totalPackets} packets; BLE write limit ${getMTU()} bytes; CRC32 0x${crc.toString(16).padStart(8, "0")}.`);

      stage = "sending";
      for (const [index, packet] of packets.entries()) {
        if (settled) return;
        const packetBytes = packet.byteLength - (index === 0 ? 11 : 2);
        log("info", `Queueing packet ${index + 1}/${totalPackets} (sequence ${index}, ${packet.byteLength} Bluetooth bytes, ${packetBytes} file bytes).`);
        await queueBluetoothCall(() => {
          if (settled) return;
          log("info", `Writing packet ${index + 1}/${totalPackets}; waiting for Bluetooth write response.`);
          return fileCharacteristic.writeValueWithResponse(packet);
        });
        if (settled) return;

        uploadedPackets++;
        uploadedBytes += packetBytes;
        const uploadProgressData: UploadProgress = {
          uploadedPackets,
          totalPackets,
          percentage: (uploadedPackets / totalPackets) * 100
        };
        document.dispatchEvent(new CustomEvent(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, {
          detail: uploadProgressData
        }));
        log("info", `Sent packet ${uploadedPackets}/${totalPackets}: ${uploadedBytes}/${payload.byteLength} file bytes (${uploadProgressData.percentage.toFixed(1)}%).`);
      }

      if (acknowledged) {
        complete();
        return;
      }
      stage = "waiting";
      log("info", `All packets sent. Waiting up to ${FILE_UPLOAD_ACK_TIMEOUT_MS / 1000} seconds for the robot to confirm the upload; 100% sent does not yet mean success.`);
      timeoutId = setTimeout(() => {
        fail(new Error(`File upload: No acknowledgement from the robot within ${FILE_UPLOAD_ACK_TIMEOUT_MS / 1000} seconds. The upload could not be confirmed; reconnect and try again.`));
      }, FILE_UPLOAD_ACK_TIMEOUT_MS);
    };

    void send().catch(fail);
  });
}

export async function saveFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      if (id !== 0x02) return;

      const responseCode = view.getUint8(1);

      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

      switch(responseCode) {
        case 0x00:
          resolve();
          break;
        case 0x01:
          reject(`File save: File not found`);
          break;
        case 0x02:
          reject('File save: File too big');
          break;
        case 0x03:
          reject('File save: Unknown error');
          break;
        default:
          reject('File save: Unknown response code')
      }
    };

    fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      const id = 0x02;

      const encoder = new TextEncoder();
      const nullTerminatedFilename = filename + String.fromCharCode(0);
      const array = encoder.encode(nullTerminatedFilename);

      if(array.byteLength > 30) {
        throw new Error("File name too long.");
      }

      const body = new Uint8Array(30);
      body.set(array.slice(0, 30));
      const payload = new Uint8Array([id, ...body]);

      await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
    } catch (err) {
      console.error(err);
      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}

export async function deleteFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      if (id !== 0x03) return;

      const responseCode = view.getUint8(1);

      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

      switch(responseCode) {
        case 0x00:
          resolve();
          break;
        case 0x01:
          reject(`File delete: File not found`);
          break;
        case 0x02:
          reject('File delete: Unknown error');
          break;
        default:
          reject('File delete: Unknown response code')
      }
    };

    fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      const id = 0x03;

      const encoder = new TextEncoder();
      const nullTerminatedFilename = filename + String.fromCharCode(0);
      const array = encoder.encode(nullTerminatedFilename);

      if(array.byteLength > 30) {
        throw new Error("File name too long.");
      }

      const body = new Uint8Array(30);
      body.set(array.slice(0, 30));
      const payload = new Uint8Array([id, ...body]);

      await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
    } catch (err) {
        console.error(err);
        fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
        reject(err);
    }
  });
}

export async function listFiles(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<FileListing[]> {
  return new Promise<FileListing[]>((resolve, reject) => {
    let totalLength = 0;
    let receivedLength = 0;
    let expectedCrc = 0;
    let chunks: Uint8Array[] = [];
    let messageData: Uint8Array | null = null;

    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      if (id === 0x05) {
        fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
        reject("File list: could not generate file listing");
      }

      // We only care about the file list response (0x04)
      if (id !== 0x04 && receivedLength === 0) return;

      let offset = 0;
      if (receivedLength === 0) {
        // First packet
        offset = 1; // skip ID
        totalLength = view.getUint16(offset, true); offset += 2;
        expectedCrc = view.getUint32(offset, true); offset += 4;
      }

      const seqId = view.getUint16(offset, true); offset += 2;
      const data = new Uint8Array(value.buffer, offset);
      chunks.push(data);
      receivedLength += data.length;

      // Check if we got everything
      if (receivedLength >= totalLength) {
        // Concatenate all chunks
        messageData = new Uint8Array(totalLength);
        let pos = 0;
        for (const chunk of chunks) {
          messageData.set(chunk, pos);
          pos += chunk.length;
        }

        // Optional: validate CRC if you have a CRC32 function
        // const actualCrc = crc32(messageData);
        // if (actualCrc !== expectedCrc) return reject(new Error('CRC mismatch'));

        fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

        // Parse file listings from the payload
        const decoder = new TextDecoder();
        const listingString = decoder.decode(messageData);
        const fileListings = JSON.parse(listingString) as FileListing[];
        resolve(fileListings);
      }
    };

    fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    // Send the "list files" request to the device
    const id = 0x04;
    const payload = new Uint8Array([id]);
    queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload)).catch(err => {
      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    });
  });
}

export async function eraseAllFiles(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
): Promise<void> {
  const id = 0x05;

  const payload = new Uint8Array([id]);

  return await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
}

export async function downloadFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string
): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise<Uint8Array<ArrayBuffer>>(async (resolve, reject) => {
    let totalLength = 0;
    let receivedLength = 0;
    let expectedCrc = 0;
    let receivedChunks: Uint8Array[] = [];
    let fileArray: Uint8Array | null = null;

    const onResponse = async (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      console.log(`id : ${id}`)

      // We only care about the file download response 0x07
      if (id !== 0x07 && receivedLength === 0) return;

      let offset = 0;
      if (receivedLength === 0) {
        console.log('first response')
        // First packet
        offset = 1; // skip ID
        totalLength = view.getUint32(offset, true); offset += 4;
        expectedCrc = view.getUint32(offset, true); offset += 4;
      }

      const seqId = view.getUint16(offset, true); offset += 2;
      const data = new Uint8Array(value.buffer, offset);
      receivedChunks.push(data);
      receivedLength += data.length;
      console.log(receivedLength)

      // TODO put in a separate function
      const downloadProgressData: UploadProgress = {
        uploadedPackets: receivedLength,
        totalPackets: totalLength,
        percentage: (receivedLength / totalLength) * 100
      };
      const downloadProgressEvent = new CustomEvent(THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID, {
        detail: downloadProgressData
      });
      document.dispatchEvent(downloadProgressEvent);

      // Check if we got everything
      if (receivedLength >= totalLength) {
        // Concatenate all chunks
        fileArray = new Uint8Array(totalLength);
        let pos = 0;
        for (const chunk of receivedChunks) {
          fileArray.set(chunk, pos);
          pos += chunk.length;
        }

        // Optional: validate CRC if you have a CRC32 function
        // const actualCrc = crc32(messageData);
        // if (actualCrc !== expectedCrc) return reject(new Error('CRC mismatch'));

        fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

        resolve(fileArray as Uint8Array<ArrayBuffer>);
      }

      // Send the file download ack after each chunk reception
      await sendFileDownloadAck(fileCharacteristic);
    };

    fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      console.log('sending dw request')
      await sendFileDownloadRequest(fileCharacteristic, filename);
      console.log('keeping on')
    } catch (err) {
      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  });
}

export async function freeMemory(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<void> {
  const id = 0x08;
  const payload = new Uint8Array([id]);
  return await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
}

async function sendFileDownloadRequest(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string,
): Promise<void> {
  return new Promise<void>(async (resolve, reject) => {
    const onResponse = (event: Event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;

      const view = new DataView(value.buffer);
      const id = view.getUint8(0);

      if (id !== 0x08) return;

      const responseCode = view.getUint8(1);

      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);

      switch(responseCode) {
        case 0x00:
          resolve();
          break;
        case 0x01:
          reject(`File download: file not found: ${filename}`);
          break;
        case 0x02:
          reject(`File download: unknown error`);
          break;
        default:
          reject('File upload: Unknown response code')
      }
    };

    fileCharacteristic.addEventListener("characteristicvaluechanged", onResponse);

    try {
      const id = 0x06;
      const encoder = new TextEncoder();
      const nullTerminatedFilename = filename + String.fromCharCode(0);
      const array = encoder.encode(nullTerminatedFilename);

      if(array.byteLength > 30) {
        throw new Error("File name too long.");
      }

      const body = new Uint8Array(30);
      body.set(array.slice(0, 30));
      const payload = new Uint8Array([id, ...body]);

      await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
    } catch (err) {
      console.error(err);
      fileCharacteristic.removeEventListener("characteristicvaluechanged", onResponse);
      reject(err);
    }
  })
}

async function sendFileDownloadAck(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic
): Promise<void> {
  const id = 0x07;
  const payload = new Uint8Array([id]);
  return await queueBluetoothCall(() => fileCharacteristic.writeValueWithResponse(payload));
}
