import { queueBluetoothCall } from './bluetooth-queue';

export const UPLOAD_DIAGNOSTICS_UUID: string = '0000abf8-0000-1000-8000-00805f9b34fb';
const MAGIC = 0x31474442;
const SNAPSHOT_SIZE = 8416;
export type DiagnosticsInfo = {
  bootId: number; runId: number; snapshotId: number; version: number; state: number; bytes: number;
};
export type DiagnosticsStart = DiagnosticsInfo & { before: number; after: number };
export type FirmwareUpload = {
  ordinal: number; expectedLen: number; expectedCrc: number; receivedLen: number; calculatedCrc: number;
  packets: number; copyErrors: number; flags: number; lastSeq: number; conn: number; attr: number;
  result: number; allocationOk: number; freeBefore: number; sendRc: number; gapStatus: number;
  startedUs: number; lastPacketUs: number; resultUs: number; confirmedUs: number; gapUs: number;
};
export type FirmwareEvent = {
  timeUs: number; ordinal: number; kind: number; conn: number; attr: number; status: number; msysFree: number;
};
export type FirmwareSnapshot = {
  version: number; bootId: number; runId: number; snapshotId: number; flags: number;
  startedUs: number; frozenUs: number; uploadCount: number; uploadDropped: number;
  eventCount: number; eventDropped: number; minMsysFree: number; msysCount: number; aclCount: number;
  conn: number; mtu: number; interval: number; latency: number; supervision: number; disconnectReason: number;
  sensors: { attempts: number; allocationFailures: number; sendErrors: number; lastError: number }[];
  firmware: string; appVersion: string; idfVersion: string; appSha256: string;
  uploads: FirmwareUpload[]; events: FirmwareEvent[];
};
export class DiagnosticsTimeout extends Error {
  constructor() { super('Diagnostic Bluetooth operation stalled; disconnect and reload before recovery.'); this.name = 'DiagnosticsTimeout'; }
}

// The deadline is outside the queue: timing out must not unlock an unresolved native call.
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([queueBluetoothCall(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DiagnosticsTimeout()), 30_000);
    })]);
  } finally { clearTimeout(timer); }
}
function command(op: number, ...values: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(1 + values.length * 4);
  bytes[0] = op;
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(1 + index * 4, value, true));
  return bytes;
}
function info(value: DataView): DiagnosticsInfo {
  if (value.byteLength !== 20 || value.getUint32(0, true) !== MAGIC || value.getUint8(16) !== 1) {
    throw new Error('Unsupported or malformed upload diagnostics capability response');
  }
  const result = { bootId: value.getUint32(4, true), runId: value.getUint32(8, true),
    snapshotId: value.getUint32(12, true), version: value.getUint8(16), state: value.getUint8(17), bytes: value.getUint16(18, true) };
  if (result.bytes !== SNAPSHOT_SIZE || result.state > 2) throw new Error('Invalid diagnostic snapshot size/state');
  return result;
}
export async function getDiagnosticsInfo(characteristic: BluetoothRemoteGATTCharacteristic): Promise<DiagnosticsInfo> {
  return bounded(async () => { await characteristic.writeValueWithResponse(command(0)); return info(await characteristic.readValue()); });
}
export async function startDiagnostics(characteristic: BluetoothRemoteGATTCharacteristic, runId: number): Promise<DiagnosticsStart> {
  if (!Number.isInteger(runId) || runId < 1 || runId > 0xffffffff) throw new Error('Invalid diagnostic run ID');
  return bounded(async () => {
    const before = Date.now();
    await characteristic.writeValueWithResponse(command(1, runId));
    const result = info(await characteristic.readValue());
    if (result.runId !== runId || result.state !== 1) throw new Error('Firmware did not start the requested capture');
    return { ...result, before, after: Date.now() };
  });
}
export async function readDiagnostics(characteristic: BluetoothRemoteGATTCharacteristic, expected: DiagnosticsInfo): Promise<FirmwareSnapshot> {
  return bounded(async () => {
    await characteristic.writeValueWithResponse(command(0));
    const previous = info(await characteristic.readValue());
    if (previous.bootId !== expected.bootId) throw new Error('Robot rebooted: firmware evidence was lost');
    if (previous.runId !== expected.runId || previous.snapshotId !== expected.snapshotId) throw new Error('Diagnostic capture belongs to another run');
    await characteristic.writeValueWithResponse(command(2));
    const frozen = info(await characteristic.readValue());
    if (frozen.state !== 2 || frozen.bootId !== previous.bootId || frozen.runId !== previous.runId || frozen.snapshotId !== previous.snapshotId)
      throw new Error('Diagnostic snapshot changed while freezing');
    const bytes = new Uint8Array(frozen.bytes);
    for (let offset = 0; offset < bytes.length;) {
      await characteristic.writeValueWithResponse(command(3, frozen.snapshotId, offset));
      const page = await characteristic.readValue();
      if (page.byteLength <= 20 || page.getUint32(0, true) !== frozen.bootId || page.getUint32(4, true) !== frozen.runId ||
          page.getUint32(8, true) !== frozen.snapshotId || page.getUint32(12, true) !== offset || page.getUint32(16, true) !== bytes.length ||
          offset + page.byteLength - 20 > bytes.length) throw new Error('Truncated or mismatched diagnostic page');
      const data = new Uint8Array(page.buffer, page.byteOffset + 20, page.byteLength - 20);
      bytes.set(data, offset); offset += data.length;
    }
    const snapshot = decodeDiagnostics(bytes);
    if (snapshot.bootId !== frozen.bootId || snapshot.runId !== frozen.runId || snapshot.snapshotId !== frozen.snapshotId)
      throw new Error('Snapshot identity mismatch');
    return snapshot;
  });
}

export function decodeDiagnostics(bytes: Uint8Array): FirmwareSnapshot {
  if (bytes.length !== SNAPSHOT_SIZE) throw new Error('Incomplete firmware snapshot');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o: number) => v.getUint16(o, true);
  const u32 = (o: number) => v.getUint32(o, true);
  const i32 = (o: number) => v.getInt32(o, true);
  const u64 = (o: number) => { const n = Number(v.getBigUint64(o, true)); if (!Number.isSafeInteger(n)) throw new Error('Unsafe firmware timestamp'); return n; };
  const str = (o: number, n: number) => new TextDecoder().decode(bytes.subarray(o, o + n)).split('\0')[0];
  if (u32(0) !== MAGIC || u16(4) !== 1 || u16(6) !== 224 || u32(20) !== 2) throw new Error('Unsupported or unfrozen firmware snapshot');
  const uploads: FirmwareUpload[] = [];
  for (let index = 0; index < Math.min(u32(40), 64); index++) {
    const o = 224 + index * 100;
    uploads.push({ ordinal: u32(o), expectedLen: u32(o+4), expectedCrc: u32(o+8), receivedLen: u32(o+12), calculatedCrc: u32(o+16),
      packets: u32(o+20), copyErrors: u32(o+24), flags: u32(o+28), lastSeq: u16(o+32), conn: u16(o+34), attr: u16(o+36),
      result: i32(o+40), allocationOk: i32(o+44), freeBefore: i32(o+48), sendRc: i32(o+52), gapStatus: i32(o+56),
      startedUs: u64(o+60), lastPacketUs: u64(o+68), resultUs: u64(o+76), confirmedUs: u64(o+84), gapUs: u64(o+92) });
  }
  const events: FirmwareEvent[] = [];
  for (let index = Math.max(0, u32(48) - 64); index < u32(48); index++) {
    const o = 6624 + index % 64 * 28;
    events.push({ timeUs: u64(o), ordinal: u32(o+8), kind: u16(o+12), conn: u16(o+14), attr: u16(o+16), status: i32(o+20), msysFree: i32(o+24) });
  }
  return { version: u16(4), bootId: u32(8), runId: u32(12), snapshotId: u32(16), flags: u32(20),
    startedUs: u64(24), frozenUs: u64(32), uploadCount: u32(40), uploadDropped: u32(44), eventCount: u32(48), eventDropped: u32(52),
    minMsysFree: i32(56), msysCount: u16(60), aclCount: u16(62), conn: u16(64), mtu: u16(66), interval: u16(68), latency: u16(70),
    supervision: u16(72), disconnectReason: i32(76), sensors: [80, 96].map(o => ({ attempts: u32(o), allocationFailures: u32(o+4), sendErrors: u32(o+8), lastError: i32(o+12) })),
    firmware: str(112,16), appVersion: str(128,32), idfVersion: str(160,32),
    appSha256: Array.from(bytes.subarray(192,224), n => n.toString(16).padStart(2,'0')).join(''), uploads, events };
}
