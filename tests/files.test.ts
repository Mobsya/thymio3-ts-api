import { describe, expect, it, vi } from 'vitest';
import {
  deleteFile,
  downloadFile,
  eraseAllFiles,
  freeMemory,
  listFiles,
  saveFile,
  uploadFile,
} from '../src/files';
import {
  THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID,
  THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID,
} from '../src/constants';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  collectDocumentEventDetails,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

describe('file characteristic', () => {
  it('uploads a file using the current 4-byte length payload packet and resolves on ACK', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const progressEvents = collectDocumentEventDetails(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID);
    const file = new File([new Uint8Array([0x01, 0x02, 0x03])], 'demo.bin');

    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), file);
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [
        0x01,
        0x00, 0x00, 0x00, 0x03,
        0x1b, 0x0d, 0x69, 0x51,
        0x00, 0x00,
        0x01, 0x02, 0x03,
      ],
    ]);
    await flushMicrotasks();
    expect(progressEvents.details).toEqual([
      { uploadedPackets: 0, totalPackets: 1, percentage: 0 },
    ]);

    characteristic.emitValue([0x01, 0x00]);

    await expect(upload).resolves.toBeUndefined();
  });

  it('maps file upload ACK errors to current rejection strings', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const file = new File([new Uint8Array([0x01])], 'demo.bin');

    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), file);
    await flushMicrotasks();
    characteristic.emitValue([0x01, 0x03]);

    await expect(upload).rejects.toBe('File upload: Wrong sequence');
  });

  it('writes save and delete filename packets with 30-byte null-terminated names', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    const save = saveFile(characteristic.asBluetoothCharacteristic(), 'main.py');
    await flushMicrotasks();
    expect(bytesOf(characteristic.writesWithResponse[0]!)).toEqual([
      0x02,
      0x6d, 0x61, 0x69, 0x6e, 0x2e, 0x70, 0x79, 0x00,
      ...new Array(22).fill(0x00),
    ]);
    characteristic.emitValue([0x02, 0x00]);
    await expect(save).resolves.toBeUndefined();

    const remove = deleteFile(characteristic.asBluetoothCharacteristic(), 'main.py');
    await flushMicrotasks();
    expect(bytesOf(characteristic.writesWithResponse[1]!)).toEqual([
      0x03,
      0x6d, 0x61, 0x69, 0x6e, 0x2e, 0x70, 0x79, 0x00,
      ...new Array(22).fill(0x00),
    ]);
    characteristic.emitValue([0x03, 0x00]);
    await expect(remove).resolves.toBeUndefined();
  });

  it('keeps current filename length validation behavior', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await expect(
      saveFile(characteristic.asBluetoothCharacteristic(), 'x'.repeat(30))
    ).rejects.toThrow('File name too long.');

    await expect(
      deleteFile(characteristic.asBluetoothCharacteristic(), 'x'.repeat(30))
    ).rejects.toThrow('File name too long.');
  });

  it('requests and parses a JSON file listing response', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const listing = [
      { name: 'main.py', size: 1204 },
      { name: 'hello.mp3', size: 8900 },
    ];

    const request = listFiles(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[0x04]]);
    characteristic.emitValue(listingPacket(listing));

    await expect(request).resolves.toEqual(listing);
  });

  it('rejects file listing when the current list error indication is received', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    const request = listFiles(characteristic.asBluetoothCharacteristic());
    await flushMicrotasks();
    characteristic.emitValue([0x05]);

    await expect(request).rejects.toBe('File list: could not generate file listing');
  });

  it('downloads a file with request ACK, content packets, progress, and per-packet ACK', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const characteristic = new FakeBluetoothCharacteristic();
    const progressEvents = collectDocumentEventDetails(THYMIO_FILE_DOWNLOAD_PROGRESS_EVENT_ID);

    const download = downloadFile(characteristic.asBluetoothCharacteristic(), 'main.py');
    await flushMicrotasks();

    expect(bytesOf(characteristic.writesWithResponse[0]!)).toEqual([
      0x06,
      0x6d, 0x61, 0x69, 0x6e, 0x2e, 0x70, 0x79, 0x00,
      ...new Array(22).fill(0x00),
    ]);

    characteristic.emitValue([0x08, 0x00]);
    await flushMicrotasks();
    characteristic.emitValue(downloadPacket(new Uint8Array([0xaa, 0xbb, 0xcc])));

    await expect(download).resolves.toEqual(new Uint8Array([0xaa, 0xbb, 0xcc]));
    await flushMicrotasks();

    expect(progressEvents.details).toEqual([
      { uploadedPackets: 3, totalPackets: 3, percentage: 100 },
    ]);
    expect(bytesOf(characteristic.writesWithResponse.at(-1)!)).toEqual([0x07]);
  });

  it('writes erase-all and free-memory command IDs', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await eraseAllFiles(characteristic.asBluetoothCharacteristic());
    await freeMemory(characteristic.asBluetoothCharacteristic());

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([[0x05], [0x08]]);
  });
});

function listingPacket(value: unknown): Uint8Array {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const packet = new Uint8Array(1 + 2 + 4 + 2 + data.byteLength);
  const view = new DataView(packet.buffer);
  let offset = 0;

  view.setUint8(offset, 0x04); offset += 1;
  view.setUint16(offset, data.byteLength, true); offset += 2;
  view.setUint32(offset, 0, true); offset += 4;
  view.setUint16(offset, 0, true); offset += 2;
  packet.set(data, offset);

  return packet;
}

function downloadPacket(data: Uint8Array): Uint8Array {
  const packet = new Uint8Array(1 + 4 + 4 + 2 + data.byteLength);
  const view = new DataView(packet.buffer);
  let offset = 0;

  view.setUint8(offset, 0x07); offset += 1;
  view.setUint32(offset, data.byteLength, true); offset += 4;
  view.setUint32(offset, 0, true); offset += 4;
  view.setUint16(offset, 0, true); offset += 2;
  packet.set(data, offset);

  return packet;
}
