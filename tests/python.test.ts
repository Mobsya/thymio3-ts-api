import { describe, expect, it, vi } from 'vitest';
import {
  executeLoadedScript,
  handlePythonResponse,
  saveScriptToPartition,
  sendPythonScript,
  softResetPythonInterpreter,
  stopScriptExecution,
} from '../src/python';
import {
  THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID,
  THYMIO_PYTHON_LOAD_RESULT_EVENT_ID,
} from '../src/constants';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  collectDocumentEventDetails,
  flushMicrotasks,
} from './helpers/fake-bluetooth';

describe('Python characteristic', () => {
  it('uploads a script packet and resolves on load success indication', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const loadEvents = collectDocumentEventDetails(THYMIO_PYTHON_LOAD_RESULT_EVENT_ID);
    const executionEvents = collectDocumentEventDetails<boolean>(THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID);

    const upload = sendPythonScript(characteristic.asBluetoothCharacteristic(), 'hi');
    await flushMicrotasks();

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [
        0x01,
        0x00, 0x02,
        0x65, 0x76, 0x4b, 0xdd,
        0x00, 0x00,
        0x68, 0x69,
      ],
    ]);

    characteristic.emitValue([0x01, 0x00]);

    await expect(upload).resolves.toBeUndefined();
    expect(loadEvents.details).toEqual([
      { success: true, code: 0, message: 'Script loaded successfully' },
    ]);
    expect(executionEvents.details).toEqual([true]);
  });

  it('rejects uploads on current load error response mapping', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const loadEvents = collectDocumentEventDetails(THYMIO_PYTHON_LOAD_RESULT_EVENT_ID);

    const upload = sendPythonScript(characteristic.asBluetoothCharacteristic(), 'hi');
    await flushMicrotasks();

    characteristic.emitValue([0x01, 0x03]);

    await expect(upload).rejects.toThrow('[Python upload]: Wrong sequence');
    expect(loadEvents.details).toEqual([
      { success: false, code: 3, message: 'Wrong sequence' },
    ]);
  });

  it('times out when a load acknowledgment never arrives', async () => {
    vi.useFakeTimers();
    const characteristic = new FakeBluetoothCharacteristic();

    const upload = sendPythonScript(characteristic.asBluetoothCharacteristic(), 'hi');
    await flushMicrotasks();

    const uploadExpectation = expect(upload).rejects.toThrow(
      '[Python upload]: Timed out waiting for load ACK'
    );
    await vi.advanceTimersByTimeAsync(10_000);

    await uploadExpectation;
  });

  it('writes execute, stop, save, and soft-reset command IDs', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await executeLoadedScript(characteristic.asBluetoothCharacteristic());
    await stopScriptExecution(characteristic.asBluetoothCharacteristic());

    const save = saveScriptToPartition(characteristic.asBluetoothCharacteristic(), 2);
    await flushMicrotasks();
    characteristic.emitValue([0x05, 0x00]);
    await expect(save).resolves.toBeUndefined();

    await softResetPythonInterpreter(characteristic.asBluetoothCharacteristic());

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [0x02],
      [0x03],
      [0x04, 0x02],
      [0x05],
    ]);
  });

  it('keeps the current script id 0 rejection behavior', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await expect(
      saveScriptToPartition(characteristic.asBluetoothCharacteristic(), 0)
    ).rejects.toThrow('Script ID must not be empty');
  });

  it('maps save-to-partition error indications to current rejection strings', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    const save = saveScriptToPartition(characteristic.asBluetoothCharacteristic(), 2);
    await flushMicrotasks();
    characteristic.emitValue([0x05, 0x01]);

    await expect(save).rejects.toBe('[Python save file to partition]: 2 not found');
  });

  it('dispatches execution stopped status from execution result notifications', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const executionEvents = collectDocumentEventDetails<boolean>(THYMIO_PYTHON_EXECUTION_STATUS_EVENT_ID);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    characteristic.setValue([0x02, 0x00]);
    handlePythonResponse({ target: characteristic } as unknown as Event);

    expect(executionEvents.details).toEqual([false]);
  });

  it('warns and ignores unknown notification IDs', () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    characteristic.setValue([0x99]);
    handlePythonResponse({ target: characteristic } as unknown as Event);

    expect(warn).toHaveBeenCalledWith('[Notification] Unknown ID: 0x99');
  });
});
