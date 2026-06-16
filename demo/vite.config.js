import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { viteStaticCopy } from "vite-plugin-static-copy";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const PYODIDE_EXCLUDE = [
  "!**/*.{md,html}",
  "!**/*.d.ts",
  "!**/*.whl",
  "!**/node_modules",
];

export function viteStaticCopyPyodide() {
  const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));
  return viteStaticCopy({
    targets: [
      {
        src: [join(pyodideDir, "*")].concat(PYODIDE_EXCLUDE),
        dest: "assets",
      },
    ],
  });
}

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  optimizeDeps: {
    exclude: ["pyodide"]
  },
  plugins: [
    react(),
    viteSingleFile(),
    viteStaticCopyPyodide(),
    viteStaticCopy({
      targets: [
        {
          src: resolve(__dirname, "../dist/thymio.iife.js"),
          dest: "libs"
        }
      ]
    })
  ],
  build: {
    assetsInlineLimit: 100000000, // inline everything
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
})
