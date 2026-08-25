import { describe, expect, it } from 'vitest';
import { computeCRC32, createPayloadPackets, crc16_ccitt, numberToBytes } from '../src/utils';
import { bytesOf } from './helpers/fake-bluetooth';

describe('protocol utility functions', () => {
  it('encodes integers as big-endian byte arrays for payload headers', () => {
    expect(bytesOf(numberToBytes(0x12345678, 4))).toEqual([0x12, 0x34, 0x56, 0x78]);
    expect(bytesOf(numberToBytes(0x0203, 2))).toEqual([0x02, 0x03]);
  });

  it('matches known CRC vectors used by protocol packets', () => {
    const input = new TextEncoder().encode('123456789');

    expect(crc16_ccitt(input)).toBe(0x31c3);
    expect(computeCRC32(input)).toBe(0x0376e6e7);
  });

  it('creates current non-audio payload packets with 2-byte length and CRC32', () => {
    const packets = createPayloadPackets(new Uint8Array([0x68, 0x69]));

    expect(packets).toHaveLength(1);
    expect(bytesOf(packets[0]!)).toEqual([
      0x01,
      0x00, 0x02,
      0x65, 0x76, 0x4b, 0xdd,
      0x00, 0x00,
      0x68, 0x69,
    ]);
  });

  it('creates current audio/file payload packets with 4-byte length and CRC32', () => {
    const packets = createPayloadPackets(new Uint8Array([0x01, 0x02, 0x03]), true);

    expect(packets).toHaveLength(1);
    expect(bytesOf(packets[0]!)).toEqual([
      0x01,
      0x00, 0x00, 0x00, 0x03,
      0x1b, 0x0d, 0x69, 0x51,
      0x00, 0x00,
      0x01, 0x02, 0x03,
    ]);
  });
});
