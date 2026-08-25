import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

const chromeChannel = process.env.PLAYWRIGHT_CHROME_CHANNEL;

export default defineConfig({
  define: {
    __THYMIO_HARDWARE__: JSON.stringify(process.env.THYMIO_HARDWARE === '1'),
  },
  test: {
    include: ['tests/hardware/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          ...(chromeChannel ? { channel: chromeChannel } : {}),
          args: ['--enable-experimental-web-platform-features'],
        },
      }),
      instances: [
        { browser: 'chromium' },
      ],
      headless: process.env.THYMIO_HARDWARE_HEADLESS === '1',
    },
  },
});
