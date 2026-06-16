import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { viteStaticCopy } from "vite-plugin-static-copy";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const PYODIDE_RUNTIME_FILES = [
  "pyodide-lock.json",
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
];

export function viteStaticCopyPyodide() {
  const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));
  return viteStaticCopy({
    targets: [
      {
        src: PYODIDE_RUNTIME_FILES.map((file) => join(pyodideDir, file)),
        dest: "assets",
        rename: { stripBase: true },
      },
    ],
  });
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    viteSingleFile(),
    viteStaticCopyPyodide(),
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "../dist/thymio.iife.js"),
          dest: "libs",
          rename: { stripBase: true },
        }
      ]
    })
  ],
  build: {
    assetsInlineLimit: 100000000, // inline everything
    cssCodeSplit: false,
  }
})
