/**
 * Builds the extension pages (side panel, popup). The service worker and
 * content scripts are bundled separately by scripts/build.mjs (esbuild, IIFE)
 * because content scripts cannot use ES module imports.
 */
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        popup: resolve(__dirname, 'popup.html'),
      },
    },
  },
  worker: { format: 'es' },
});
