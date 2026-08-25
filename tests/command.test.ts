import { describe, expect, it } from 'vitest';
import { setActuatorState, type ActuatorData } from '../src/command';
import { FakeBluetoothCharacteristic, bytesOf } from './helpers/fake-bluetooth';

const actuatorData: ActuatorData = {
  circleLEDs: [0, 1, 2, 3, 4, 5, 6, 7],
  frontLegoLEDs: [15, 14, 13, 12, 11, 10, 9, 8],
  rearLegoLEDs: [1, 1, 2, 2, 3, 3, 4, 4],
  flRGB: { r: 1, g: 2, b: 3 },
  frRGB: { r: 4, g: 5, b: 6 },
  blRGB: { r: 7, g: 8, b: 9 },
  brRGB: { r: 10, g: 11, b: 12 },
  motorLeft: -1000,
  motorRight: 1000,
  sound: 19,
  smallBottomRGB: { r: 1, g: 15, b: 2 },
  smallBackRGB: { r: 3, g: 4, b: 5 },
  buttonLEDs: [1, 2, 3, 4],
  receiverLED: 9,
  microphoneLED: true,
};

describe('actuator command packets', () => {
  it('writes the current primary and secondary actuator packet shapes', async () => {
    const characteristic = new FakeBluetoothCharacteristic();

    await setActuatorState(characteristic.asBluetoothCharacteristic(), actuatorData);

    expect(characteristic.writesWithResponse.map(bytesOf)).toEqual([
      [
        0x01,
        0x10, 0x32, 0x54, 0x76,
        0xef, 0xcd, 0xab, 0x89,
        0x11, 0x22, 0x33, 0x44,
        0x21, 0x03,
        0x54, 0x06,
        0x87, 0x09,
        0xba, 0x0c,
        0x18, 0xfc,
        0xe8, 0x03,
        0x13,
      ],
      [
        0x02,
        0xf1, 0x02,
        0x43, 0x05,
        0x21, 0x43,
        0x19,
      ],
    ]);
  });
});
