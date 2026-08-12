import { getMTU } from "./mtu";

export type UploadProgress = {
  uploadedPackets: number,
  totalPackets: number,
  percentage: number
};

/**
 * Creates BLE packets based on the byte array content
 * @param {Uint8Array} payload
 * @returns {Uint8Array[]} Array of packet Uint8Arrays
 */
export function createPayloadPackets(payload: Uint8Array, isAudio = false) {
  let FIRST_PACKET_HEADER_SIZE = 1 + 2 + 4 + 2; // 9 bytes
  if (isAudio) {
    FIRST_PACKET_HEADER_SIZE = 1 + 4 + 4 + 2; // 11 bytes
  }
  const SUBSEQUENT_PACKET_HEADER_SIZE = 2; // 2 bytes
  const PAYLOAD_ID = 0x01;

  const packets = [];
  const payloadLength = payload.length;
  const crc = computeCRC32(payload);
  let seqId = 0;

  // --- First Packet ---
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

  const firstChunkSize = getMTU() - FIRST_PACKET_HEADER_SIZE;
  const firstChunk = payload.slice(0, firstChunkSize);

  const firstPacket = new Uint8Array(header.length + firstChunk.length);
  firstPacket.set(header, 0);
  firstPacket.set(firstChunk, header.length);

  packets.push(firstPacket);
  seqId++;

  // --- Subsequent Packets ---
  let offset = firstChunkSize;
  while (offset < payload.length) {
    const chunkSize = Math.min(getMTU() - SUBSEQUENT_PACKET_HEADER_SIZE, payloadLength - offset);
    const packet = new Uint8Array(SUBSEQUENT_PACKET_HEADER_SIZE + chunkSize);

    packet.set(numberToBytes(seqId, 2), 0);
    packet.set(payload.slice(offset, offset + chunkSize), SUBSEQUENT_PACKET_HEADER_SIZE);

    packets.push(packet);
    offset += chunkSize;
    seqId++;
  }

  return packets;
}

/**
 * Converts a number to a big-endian byte array
 */
export function numberToBytes(value: number, byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[byteLength - 1 - i] = value & 0xff;
    value >>= 8;
  }
  return bytes;
}

export function crc16_ccitt(buffer: Uint8Array, init = 0x0000): number {
  let crc = init;
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
export function computeCRC32(buf: Uint8Array, crc = 0xFFFFFFFF) {
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

export function delay(timeout: number) {
  return new Promise<void>(resolve => {
    setTimeout(() => resolve(), timeout);
  });
}
