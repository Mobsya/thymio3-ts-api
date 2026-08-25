import { describe, expect, it, vi } from 'vitest';
import {
  handleAudioResponse,
  playAudioFile,
  playFrequency,
  recordAudio,
  stopAudioFile,
  uploadAudioFile,
} from '../src/audio';
import { THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID } from '../src/constants';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  collectDocumentEventDetails,
} from './helpers/fake-bluetooth';

class PassingAudioContext {
  constructor(_options?: AudioContextOptions) {}

  async decodeAudioData(_audioData: ArrayBuffer): Promise<Pick<AudioBuffer, 'numberOfChannels' | 'sampleRate'>> {
    return {
      numberOfChannels: 1,
      sampleRate: 12_000,
    };
  }
}

describe('audio characteristic', () => {
  it('uploads a valid WAV file with current packet header and progress event', async () => {
    vi.stubGlobal('AudioContext', PassingAudioContext);
    const characteristic = new FakeBluetoothCharacteristic();
    const progressEvents = collectDocumentEventDetails(THYMIO_AUDIO_UPLOAD_PROGRESS_EVENT_ID);
    const file = new File(
      [wavBytes([0x01, 0x02, 0x03]).buffer],
      'sound.wav',
      { type: 'audio/wav' }
    );

    await uploadAudioFile(characteristic.asBluetoothCharacteristic(), file);

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [
        0x01,
        0x00, 0x00, 0x00, 0x0f,
        0xf0, 0x28, 0x8b, 0x86,
        0x00, 0x00,
        0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00,
        0x57, 0x41, 0x56, 0x45,
        0x01, 0x02, 0x03,
      ],
    ]);
    expect(progressEvents.details).toEqual([
      { uploadedPackets: 0, totalPackets: 1, percentage: 0 },
    ]);
  });

  it('rejects files that do not have a current WAV or MP3 signature', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const file = new File([new Uint8Array([0x00, 0x01, 0x02])], 'sound.raw');

    await expect(
      uploadAudioFile(characteristic.asBluetoothCharacteristic(), file)
    ).rejects.toThrow('The audio file must be in WAV or MP3 format');
  });

  it('writes play, stop, record, and frequency command bytes', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await playAudioFile(characteristic.asBluetoothCharacteristic());
    await stopAudioFile(characteristic.asBluetoothCharacteristic());
    await recordAudio(characteristic.asBluetoothCharacteristic(), 10);
    await playFrequency(characteristic.asBluetoothCharacteristic(), 440, 25);

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [0x02, ...new Array(20).fill(0x00)],
      [0x03],
      [0x05, 0x0a],
      [0x06, 0x01, 0xb8, 0x00, 0x19],
    ]);
  });

  it('rejects recording durations above the current 10-second limit', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await expect(
      recordAudio(characteristic.asBluetoothCharacteristic(), 11)
    ).rejects.toThrow('Can not record more than 10 seconds.');
  });

  it('logs current audio response mappings and throws on unknown command result IDs', () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    characteristic.setValue([0x01, 0x00]);
    handleAudioResponse({ target: characteristic } as unknown as Event);
    expect(log).toHaveBeenCalledWith('Audio loaded correctly');

    characteristic.setValue([0x02, 0x09]);
    expect(() => handleAudioResponse({ target: characteristic } as unknown as Event))
      .toThrow('Command ID unknown');
  });
});

function wavBytes(tail: number[]): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46,
    0x00, 0x00, 0x00, 0x00,
    0x57, 0x41, 0x56, 0x45,
    ...tail,
  ]);
}
