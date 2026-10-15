import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

const cfg = JSON.parse(readFileSync(new URL('./solace.config.json', import.meta.url), 'utf8'))
const api = `http://127.0.0.1:${cfg.apiPort || 8787}`

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: api, changeOrigin: false } } },
  preview: { port: 4173, proxy: { '/api': { target: api, changeOrigin: false } } },
})
