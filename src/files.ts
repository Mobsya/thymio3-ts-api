import { map, Observable, reduce, Subject, takeUntil } from "rxjs";
import { THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID } from "./constants";
import { createPayloadPackets, type UploadProgress } from "./utils";

export type FileListing = {
  name: string,
  size: number
};

/*
let listingFiles = false;
let listFilesResponse = new Subject<Uint8Array<ArrayBuffer>>();
let listFilesResponse$: Observable<FileListing[]>;
let listFilesMessageLength: number = 0;
const listFilesMessageComplete$ = new Subject<void>();
*/

export async function uploadFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  file: File
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const payload = new Uint8Array(buffer);

  const packets = createPayloadPackets(payload, true);

  const totalPackets = packets.length;
  let uploadedPackets = 0;

  for(const packet of packets) {
    await fileCharacteristic.writeValueWithResponse(packet);

    const uploadProgressData: UploadProgress = {
      uploadedPackets,
      totalPackets,
      percentage: (uploadedPackets / totalPackets) * 100
    };
    const uploadProgressEvent = new CustomEvent(THYMIO_FILE_UPLOAD_PROGRESS_EVENT_ID, {
      detail: uploadProgressData
    });
    document.dispatchEvent(uploadProgressEvent);
    uploadedPackets++;
  }
}

export async function saveFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string
): Promise<void> {
  const id = 0x02;

  const encoder = new TextEncoder();
  const array = encoder.encode(filename);

  if(array.byteLength > 30) {
    throw new Error("File name too long.");
  }

  const body = new Uint8Array(30);
  body.set(array.slice(0, 30));
  const payload = new Uint8Array([id, ...body]);

  return await fileCharacteristic.writeValueWithResponse(payload);
}

export async function deleteFile(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
  filename: string
): Promise<void> {
  const id = 0x03;

  const encoder = new TextEncoder();
  const array = encoder.encode(filename);

  if(array.byteLength > 30) {
    throw new Error("File name too long.");
  }

  const body = new Uint8Array(30);
  body.set(array.slice(0, 30));
  const payload = new Uint8Array([id, ...body]);

  return await fileCharacteristic.writeValueWithResponse(payload);
}


// TODO add the answer
/*
export async function listFiles(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
): Promise<FileListing[]> {
  const id = 0x04;

  const payload = new Uint8Array([id]);

  listFilesResponse$ = new Subject<Uint8Array<ArrayBuffer>>().pipe(
    reduce((acc, packet) => {
      const pack = new DataView(packet.buffer);

      // First packet: accumulate the data, and set the expected message length
      const id = pack.getUint8(0);
      let seqId: number;
      let message: Uint8Array<ArrayBuffer>;
      if(id === 0x04) {
        listingFiles = true;
        listFilesMessageLength = pack.getUint16(1, true);
        const crc = pack.getUint32(3, true);
        seqId = pack.getUint16(7, true);
        message = new Uint8Array(pack.buffer as ArrayBuffer, 9);
      } else {
        seqId = pack.getUint16(0, true);
        message = new Uint8Array(pack.buffer as ArrayBuffer, 2);
      }

      const newBuffer = new Uint8Array(acc.byteLength + message.byteLength);
      newBuffer.set(new Uint8Array(acc.buffer), 0);
      newBuffer.set(new Uint8Array(message.buffer), acc.byteLength);

      if(newBuffer.byteLength === listFilesMessageLength) {
        listFilesMessageComplete$.next();
      }
      return acc;
    }),
    map((array) => {
      const decoder = new TextDecoder();
      const messageString = decoder.decode(array);
      const message = JSON.parse(messageString) as FileListing[];
      return message;
    }),
    takeUntil(listFilesMessageComplete$)
  );

  fileCharacteristic.writeValueWithResponse(payload);

  let result: FileListing[];
  listFilesResponse$.subscribe({
    complete: (fileListings: FileListing[]) => {
      result = fileListings;
    }
  })
}
*/

export async function eraseAllPythonFiles(
  fileCharacteristic: BluetoothRemoteGATTCharacteristic,
): Promise<void> {
  const id = 0x05;

  const payload = new Uint8Array([id]);

  return await fileCharacteristic.writeValueWithResponse(payload);
}

export function handleFileResponse(event: Event) {
	const value = (event.target! as BluetoothRemoteGATTCharacteristic).value;

  if (value) {
    const buffer = value.buffer;
    const array = new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
    const view = new DataView(buffer);

    const id = view.getUint8(0);

    switch(id) {
      case 0x01:
        // TODO file loaded reply
        break;
      case 0x02:
        // TODO file save ack
        break;
      case 0x03:
        // TODO file delete ack
        break;
      case 0x04:
        // TODO file list response
        //listFilesResponse.next(array);
        break;
      default:
        throw new Error(`Unknown file response ID`);
    }
  }
}
