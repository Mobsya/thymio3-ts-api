import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  FakeBluetoothDevice,
  FakeBluetoothServer,
  bytesOf,
  collectDocumentEventDetails,
  createDeferred,
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
      { uploadedPackets: 1, totalPackets: 1, percentage: 100 },
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

describe('file upload diagnostics', () => {
  const uploadLogs = () => vi.mocked(console.debug).mock.calls.map(([, detail]) => detail);

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    expect(console.debug).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it('describes preparation, packet writes, waiting and confirmed success without logging contents', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const file = new File(['private file contents'.repeat(50)], 'report.txt');
    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), file);

    await vi.waitFor(() => expect(uploadLogs().at(-1)?.stage).toBe('waiting'));
    expect(uploadLogs().at(-1)).toMatchObject({
      fileName: 'report.txt', fileSize: file.size, uploadedBytes: file.size,
      uploadedPackets: characteristic.writesWithResponse.length,
      totalPackets: characteristic.writesWithResponse.length,
    });
    expect(uploadLogs().some(({ stage }) => stage === 'complete')).toBe(false);
    expect(uploadLogs().some(({ message }) => message.includes('CRC32 0x'))).toBe(true);
    expect(uploadLogs().filter(({ message }) => message.startsWith('Writing packet')))
      .toHaveLength(characteristic.writesWithResponse.length);
    expect(uploadLogs().some(({ message }) => message.includes('private file contents'))).toBe(false);
    expect(uploadLogs().every(({ timestamp, elapsedMs }) => timestamp > 0 && elapsedMs >= 0)).toBe(true);

    characteristic.emitValue([0x01, 0x00]);
    await upload;
    expect(uploadLogs().at(-1)).toMatchObject({ stage: 'complete', level: 'info' });
    const logCount = uploadLogs().length;
    characteristic.emitValue([0x01, 0x03]);
    expect(uploadLogs()).toHaveLength(logCount);
  });

  it.each([
    [0x01, 'CRC Mismatch'], [0x02, 'Partial upload'], [0x03, 'Wrong sequence'],
    [0x04, 'File too big'], [0xff, 'Unknown response code'],
  ])('logs robot error code %i and stops sending after rejection', async (code, message) => {
    const characteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (_, target) => target.emitValue([0x01, code as number]),
    });
    await expect(uploadFile(characteristic.asBluetoothCharacteristic(), new File([new Uint8Array(1500)], 'demo.bin')))
      .rejects.toBe(`File upload: ${message}`);
    await flushMicrotasks();
    expect(characteristic.writesWithResponse).toHaveLength(1);
    expect(uploadLogs().some(({ message: text }) => text.includes(`0x${(code as number).toString(16).padStart(2, '0')}: ${message}`)))
      .toBe(true);
    expect(uploadLogs().at(-1)).toMatchObject({ stage: 'failed', level: 'error' });
    expect(uploadLogs().some(({ stage }) => stage === 'complete')).toBe(false);
  });

  it('retains an ACK received during the final write and reports the final packet before success', async () => {
    vi.useFakeTimers();
    const characteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: (_, target) => target.emitValue([0x01, 0x00]),
    });
    await uploadFile(characteristic.asBluetoothCharacteristic(), new File(['abc'], 'demo.txt'));
    expect(uploadLogs().at(-1)).toMatchObject({
      stage: 'complete', uploadedPackets: 1, totalPackets: 1, uploadedBytes: 3,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs a failed Bluetooth write with the packet and original error, without claiming success', async () => {
    const error = new DOMException('Connection lost', 'NetworkError');
    const characteristic = new FakeBluetoothCharacteristic({
      onWriteWithResponse: () => { throw error; },
    });
    await expect(uploadFile(characteristic.asBluetoothCharacteristic(), new File(['abc'], 'demo.txt')))
      .rejects.toBe(error);
    expect(uploadLogs().some(({ message }) => message.includes('Writing packet 1/1'))).toBe(true);
    expect(uploadLogs().at(-1)).toMatchObject({ stage: 'failed', uploadedPackets: 0, uploadedBytes: 0 });
    expect(uploadLogs().at(-1)?.message).toContain('NetworkError: Connection lost');
    const logCount = uploadLogs().length;
    characteristic.emitValue([0x01, 0x00]);
    expect(uploadLogs()).toHaveLength(logCount);
  });

  it('logs local file read failures and preserves the original rejection', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const file = new File([], 'unreadable.bin');
    const error = new Error('File could not be read');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(error);
    await expect(uploadFile(characteristic.asBluetoothCharacteristic(), file)).rejects.toBe(error);
    expect(uploadLogs().at(-1)?.message).toContain('failed during reading');
    expect(uploadLogs().at(-1)?.message).toContain(error.message);
    expect(characteristic.writesWithResponse).toHaveLength(0);
  });

  it('rejects and cleans up when the robot never acknowledges the upload', async () => {
    vi.useFakeTimers();
    const characteristic = new FakeBluetoothCharacteristic();
    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), new File(['abc'], 'demo.txt'));
    const rejected = expect(upload).rejects.toThrow('No acknowledgement from the robot within 15 seconds');
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(uploadLogs().at(-1)).toMatchObject({ stage: 'failed', uploadedPackets: 1, uploadedBytes: 3 });
    expect(uploadLogs().at(-1)?.message).toContain('failed during waiting');
    expect(vi.getTimerCount()).toBe(0);
    const logCount = uploadLogs().length;
    characteristic.emitValue([0x01, 0x00]);
    expect(uploadLogs()).toHaveLength(logCount);
  });

  it('reports a disconnect during a pending write and never sends remaining packets', async () => {
    const pendingWrite = createDeferred();
    const server = new FakeBluetoothServer(new Map());
    const device = new FakeBluetoothDevice('THYMIO', server);
    const characteristic = new FakeBluetoothCharacteristic({ onWriteWithResponse: () => pendingWrite.promise });
    Object.assign(characteristic, { service: { device } });
    const removeListener = vi.spyOn(device, 'removeEventListener');
    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), new File([new Uint8Array(1500)], 'demo.bin'));
    const rejected = expect(upload).rejects.toThrow('Bluetooth disconnected');
    await flushMicrotasks();
    server.disconnect();
    device.dispatchEvent(new Event('gattserverdisconnected'));
    await rejected;
    const logCount = uploadLogs().length;
    pendingWrite.resolve();
    await flushMicrotasks();
    expect(characteristic.writesWithResponse).toHaveLength(1);
    expect(uploadLogs()).toHaveLength(logCount);
    expect(removeListener).toHaveBeenCalledWith('gattserverdisconnected', expect.any(Function));
    expect(uploadLogs().at(-1)?.message).toContain('Bluetooth disconnected');
  });

  it('explains attempts to upload without a connection', async () => {
    await expect(uploadFile(undefined as unknown as BluetoothRemoteGATTCharacteristic, new File(['abc'], 'demo.txt')))
      .rejects.toThrow('Bluetooth is not connected');
    expect(uploadLogs().at(-1)).toMatchObject({ stage: 'failed', level: 'error' });
  });

  it('ignores unrelated notifications and reads an ACK at its DataView offset', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), new File(['abc'], 'demo.txt'));
    await vi.waitFor(() => expect(uploadLogs().at(-1)?.stage).toBe('waiting'));
    characteristic.emitValue([]);
    characteristic.emitValue([0x02, 0x00]);
    expect(uploadLogs().some(({ level }) => level === 'warn')).toBe(true);
    expect(uploadLogs().at(-1)?.message).toContain('Ignoring notification 0x02');
    characteristic.value = new DataView(new Uint8Array([0xff, 0x01, 0x00, 0xff]).buffer, 1, 2);
    characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
    await upload;
    expect(uploadLogs().at(-1)?.stage).toBe('complete');
  });

  it('reports malformed upload acknowledgements', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const upload = uploadFile(characteristic.asBluetoothCharacteristic(), new File(['abc'], 'demo.txt'));
    const rejected = expect(upload).rejects.toThrow('Malformed acknowledgement');
    await flushMicrotasks();
    characteristic.emitValue([0x01]);
    await rejected;
    expect(uploadLogs().at(-1)?.stage).toBe('failed');
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
