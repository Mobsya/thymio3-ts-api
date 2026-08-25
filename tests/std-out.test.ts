import { describe, expect, it } from 'vitest';
import { THYMIO_STD_OUT_EVENT_ID } from '../src/constants';
import { handleStdOutResponse } from '../src/std-out';
import {
  FakeBluetoothCharacteristic,
  collectDocumentEventDetails,
} from './helpers/fake-bluetooth';

describe('stdout characteristic', () => {
  it('dispatches decoded stdout text', () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const stdoutEvents = collectDocumentEventDetails<string>(THYMIO_STD_OUT_EVENT_ID);

    characteristic.setValue(new TextEncoder().encode('hello\n'));
    handleStdOutResponse({ target: characteristic } as unknown as Event);

    expect(stdoutEvents.details).toEqual(['hello\n']);
  });
});
