import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'tsdown';

const root = fileURLToPath(new URL('../', import.meta.url));
await build({
  cwd: root,
  config: false,
  entry: ['tools/upload-stress-runner.ts'],
  format: 'iife',
  globalName: 'uploadStressRunner',
  platform: 'browser',
  target: 'esnext',
  outDir: 'dist',
  clean: false,
  dts: false,
  sourcemap: false,
});

const [template, api, runner] = await Promise.all([
  readFile(new URL('../tools/file-upload-stress-test.html', import.meta.url), 'utf8'),
  readFile(new URL('../dist/thymio.iife.js', import.meta.url), 'utf8'),
  readFile(new URL('../dist/upload-stress-runner.iife.js', import.meta.url), 'utf8'),
]);
const inline = (code) => code
  .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
  .replace(/<\/script/gi, '<\\/script');
const html = template
  .replace('/* EMBED_THYMIO_API */', () => inline(api))
  .replace('/* EMBED_UPLOAD_RUNNER */', () => inline(runner));
const output = new URL('../dist/file-upload-stress-test.html', import.meta.url);
await writeFile(output, html);
console.log(`Standalone upload tester: ${fileURLToPath(output)}`);
