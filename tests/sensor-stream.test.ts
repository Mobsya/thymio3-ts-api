import { describe, expect, it } from 'vitest';
import {
  handleStreamResponse,
  startAllSensorStreaming,
  startMainSensorStreaming,
  startSecondarySensorStreaming,
  stopSensorStreaming,
} from '../src/sensor-stream';
import {
  THYMIO_OTHER_SENSOR_VALUES_EVENT_ID,
  THYMIO_SENSOR_VALUES_EVENT_ID,
} from '../src/constants';
import {
  FakeBluetoothCharacteristic,
  bytesOf,
  collectDocumentEventDetails,
} from './helpers/fake-bluetooth';

describe('sensor stream characteristic', () => {
  it('writes stream selection command bytes', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await startMainSensorStreaming(characteristic.asBluetoothCharacteristic());
    await startSecondarySensorStreaming(characteristic.asBluetoothCharacteristic());
    await startAllSensorStreaming(characteristic.asBluetoothCharacteristic());
    await stopSensorStreaming(characteristic.asBluetoothCharacteristic());

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [0x01, 0x01],
      [0x01, 0x02],
      [0x01, 0x03],
      [0x01, 0x00],
    ]);
  });

  it('parses current 38-byte main sensor notifications into public event detail', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const sensorEvents = collectDocumentEventDetails(THYMIO_SENSOR_VALUES_EVENT_ID);
    const payload = new Uint8Array(38);
    const view = new DataView(payload.buffer);
    let offset = 0;

    view.setUint16(offset, 0x1234, true); offset += 2;
    view.setUint8(offset, 56); offset += 1;
    view.setUint8(offset, 78); offset += 1;
    view.setUint16(offset, 1000, true); offset += 2;
    view.setUint16(offset, 1001, true); offset += 2;
    view.setInt16(offset, -1, true); offset += 2;
    view.setInt16(offset, -2, true); offset += 2;
    view.setInt16(offset, -3, true); offset += 2;
    view.setInt16(offset, 1, true); offset += 2;
    view.setInt16(offset, 2, true); offset += 2;
    view.setInt16(offset, 3, true); offset += 2;
    view.setUint8(offset, 0b00010101); offset += 1;
    view.setUint16(offset, 321, true); offset += 2;
    for (const value of [10, 11, 12, 13, 14, 15, 16]) {
      view.setUint16(offset, value, true);
      offset += 2;
    }
    view.setUint8(offset, 0xaa);

    characteristic.setValue(new Uint8Array([0x01, ...payload]));
    await handleStreamResponse({ target: characteristic } as unknown as Event);

    expect(sensorEvents.details).toEqual([
      {
        colorSensor: { h: 0x1234, s: 56, v: 78 },
        groundSensors: { left: 1000, right: 1001 },
        accelerationRaw: { x: -1, y: -2, z: -3 },
        gyroRaw: { x: 1, y: 2, z: 3 },
        buttons: {
          back: true,
          left: false,
          center: true,
          forward: false,
          right: true,
        },
        microphoneVolume: 321,
        proximitySensors: {
          left: 10,
          frontLeft: 11,
          center: 12,
          frontRight: 13,
          right: 14,
          backLeft: 15,
          backRight: 16,
        },
        tvRemote: 0xaa,
      },
    ]);
  });

  it('parses current 30-byte secondary sensor notifications into public event detail', async () => {
    const characteristic = new FakeBluetoothCharacteristic();
    const sensorEvents = collectDocumentEventDetails(THYMIO_OTHER_SENSOR_VALUES_EVENT_ID);
    const payload = new Uint8Array(30);
    const view = new DataView(payload.buffer);
    let offset = 0;

    for (const value of [1, 2, 3, 4]) {
      view.setUint16(offset, value, true);
      offset += 2;
    }
    view.setUint8(offset, 7); offset += 1;
    for (const value of [100, 101, 200, 201]) {
      view.setUint16(offset, value, true);
      offset += 2;
    }
    view.setInt16(offset, -45, true); offset += 2;
    view.setUint8(offset, 0b00000101); offset += 1;
    for (const value of [-100, 100, -200, 200]) {
      view.setInt16(offset, value, true);
      offset += 2;
    }
    view.setUint16(offset, 7400, true);

    characteristic.setValue(new Uint8Array([0x02, ...payload]));
    await handleStreamResponse({ target: characteristic } as unknown as Event);

    expect(sensorEvents.details).toEqual([
      {
        colorRaw: { red: 1, green: 2, blue: 3, clear: 4 },
        colorDetected: 7,
        groundAmbient: { left: 100, right: 101 },
        groundReflected: { left: 200, right: 201 },
        angleDegrees: -45,
        eventFlags: {
          tapDetected: true,
          freefallDetected: false,
          clapDetected: true,
        },
        motor: {
          leftSpeed: -100,
          rightSpeed: 100,
          leftPwmDuty: -200,
          rightPwmDuty: 200,
        },
        batteryVoltage: 7400,
      },
    ]);
  });

  it('throws on current fixed-packet sensor length mismatches', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    characteristic.setValue([0x01, 0x00]);

    await expect(
      handleStreamResponse({ target: characteristic } as unknown as Event)
    ).rejects.toThrow('Invalid byte array length. Expected 38 bytes.');
  });
});
