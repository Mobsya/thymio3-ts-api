import type { DiagnosticsStart, FirmwareSnapshot } from '../src/upload-diagnostics';

export type DiagnosticAttempt = {
  number: number; size: number; outcome: string; expectedCrc?: number; preparation?: string; lastProgressAt?: string;
};
export type DiagnosticFinding = { attempt: number; classification: string; explanation: string };
export type DiagnosticCapture = {
  status: 'disabled' | 'preparing' | 'capturing' | 'observing' | 'pending' | 'collected' | 'error';
  start?: DiagnosticsStart; error?: string; collectionStartedAt?: string; collectionFinishedAt?: string;
  observationUntil?: string; snapshot?: FirmwareSnapshot; analysis?: DiagnosticFinding[];
};
export function analyzeDiagnostics(attempts: DiagnosticAttempt[], capture?: DiagnosticCapture): DiagnosticFinding[] {
  const snapshot = capture?.snapshot;
  const start = capture?.start;
  return attempts.map(a => {
    const finding = (classification: string, explanation: string): DiagnosticFinding => ({ attempt: a.number, classification, explanation });
    if (!snapshot || !start) return finding('inconclusive', 'No matched firmware capture available.');
    if (snapshot.bootId !== start.bootId || snapshot.runId !== start.runId || snapshot.snapshotId !== start.snapshotId)
      return finding('inconclusive', 'Firmware capture identity does not match this run.');
    const u = snapshot.uploads.find(u => u.ordinal === a.number);
    const crcText = a.preparation?.match(/CRC32 0x([0-9a-f]+)/i)?.[1];
    const crc = a.expectedCrc ?? (crcText ? parseInt(crcText, 16) : undefined);
    if (!u || u.expectedLen !== a.size || crc === undefined || u.expectedCrc !== crc)
      return finding('inconclusive', 'Upload ordinal, length, or CRC cannot be matched.');
    if (u.flags & 4) return finding('inconclusive', 'Overlapping indications make confirmation correlation ambiguous.');
    if (u.copyErrors || u.result > 0 || ((u.flags & 1) && u.calculatedCrc !== u.expectedCrc) || u.receivedLen !== u.expectedLen)
      return finding('reception-error', `Firmware received ${u.receivedLen}/${u.expectedLen} bytes; result=${u.result}, copyErrors=${u.copyErrors}.`);
    if (u.allocationOk === 0) return finding('allocation-failed', `Result packet allocation failed; free MSYS buffers before allocation=${u.freeBefore}.`);
    if (!(u.flags & 2)) return finding('inconclusive', 'No recorded result submission.');
    if (u.sendRc !== 0) return finding('submission-failed', `NimBLE rejected result: rc=${u.sendRc}, free MSYS before allocation=${u.freeBefore}. This does not identify which resource failed.`);
    if (!u.confirmedUs) {
      const state = u.flags & 8 ? 'disconnected' : u.gapStatus === 13 ? 'stack-timeout' : 'pending-at-cutoff';
      return finding('unconfirmed', `Result submitted but not confirmed: ${state}; GAP status=${u.gapStatus}.`);
    }
    if (a.outcome === 'passed') return finding('confirmed', 'Robot and browser both confirmed the upload.');
    const deadline = a.lastProgressAt ? Date.parse(a.lastProgressAt) + 15000 : NaN;
    const earliest = start.before + (u.confirmedUs - snapshot.startedUs) / 1000;
    const latest = start.after + (u.confirmedUs - snapshot.startedUs) / 1000;
    if (latest <= deadline) return finding('client-delivery-gap', 'Peer BLE confirmation preceded the browser deadline; inspect OS/browser delivery and client handling.');
    if (earliest > deadline) return finding('late-confirmation', 'Peer BLE confirmation arrived after the browser acknowledgement deadline.');
    return finding('inconclusive', 'Confirmation timing overlaps the browser deadline or the deadline is unavailable.');
  });
}
export const DIAGNOSTIC_STORAGE_KEY: string = 'thymio-upload-diagnostic-report-v6';
export function saveDiagnosticReport(report: unknown, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try { storage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(report)); return true; } catch { return false; }
}
export function loadDiagnosticReport(storage: Pick<Storage, 'getItem'> = localStorage): unknown {
  try { return JSON.parse(storage.getItem(DIAGNOSTIC_STORAGE_KEY) ?? 'null'); } catch { return null; }
}
