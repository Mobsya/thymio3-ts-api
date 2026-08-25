import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';

declare const __THYMIO_HARDWARE__: boolean;

const hardwareEnabled = __THYMIO_HARDWARE__;

describe.skipIf(!hardwareEnabled)('Thymio hardware smoke tests', () => {
  it('connects, reads device info, toggles streaming, and disconnects', async () => {
    expectWebBluetoothRuntime();

    const thymio = await import('../../src/thymio');

    const connectButton = document.createElement('button');
    connectButton.textContent = 'Connect Thymio';
    document.body.append(connectButton);

    let connectionPromise: Promise<void> | undefined;
    connectButton.addEventListener('click', () => {
      connectionPromise = thymio.requestAndConnect();
    });

    await userEvent.click(connectButton);

    expect(connectionPromise).toBeDefined();
    await connectionPromise;

    expect(thymio.isConnected()).toBe(true);
    const firmwareInfo = await thymio.getFirmwareInfo();
    expect(firmwareInfo).toEqual(
      expect.objectContaining({
        esp32_ver: expect.any(String),
      })
    );
    expect(['number', 'string']).toContain(typeof firmwareInfo.stm32_ver);

    await expect(thymio.getMemoryInfo()).resolves.toEqual(
      expect.objectContaining({
        flash_bytes_free: expect.any(Number),
        ram_bytes_free: expect.any(Number),
      })
    );
    await thymio.startMainSensorStreaming();
    await thymio.stopSensorStreaming();
    await thymio.disconnect();

    expect(thymio.isConnected()).toBe(false);
  });
});

function expectWebBluetoothRuntime(): void {
  if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
    return;
  }

  throw new Error(
    'Hardware tests were enabled with THYMIO_HARDWARE=1, but this test runtime does not expose navigator.bluetooth. ' +
    'Run the hardware suite in a Web Bluetooth-capable Chrome runtime.'
  );
}
