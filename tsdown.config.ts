import { defineConfig } from 'tsdown';

const sharedConfig = {
  entry: ['src/thymio.ts'],
  sourcemap: true,
  target: 'esnext',
};

export default defineConfig([
  {
    ...sharedConfig,
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    deps: {
      neverBundle: ['rxjs'],
    },
  },
  {
    ...sharedConfig,
    format: 'iife',
    globalName: 'thymio',
    clean: false,
    deps: {
      alwaysBundle: ['rxjs'],
      onlyBundle: ['rxjs'],
    },
  },
]);
