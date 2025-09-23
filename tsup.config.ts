import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['thymio.ts'], // adjust to your entry file
  format: ['esm', 'cjs', 'iife'],  // output both ESM and CommonJS
  globalName: 'thymio',
  dts: true,               // generate .d.ts files
  sourcemap: true,         // helpful for debugging
  clean: true,             // clean dist folder before build
//  external: ['rxjs'],      // don't bundle rxjs
  target: 'es2020',        // or whatever target you prefer
});
