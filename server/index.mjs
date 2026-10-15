#!/usr/bin/env node
/**
 * Start the Solace API.
 *   node server/index.mjs            → API on http://localhost:8787 (website dev server proxies /api here)
 *   node server/index.mjs --production → also serves the built website from dist/
 *
 * Environment (all optional):
 *   PORT                    default solace.config.json apiPort (8787)
 *   HOST                    default 127.0.0.1 (use 0.0.0.0 behind a reverse proxy)
 *   SOLACE_DB_FILE          default server/data/solace-db.json
 *   SOLACE_APP_ORIGINS      comma-separated exact website origins (required in production)
 *   SOLACE_EXTENSION_IDS    comma-separated extension IDs (default: solace.config.json extensionId)
 *   SOLACE_COOKIE_SECURE=1  mark the session cookie Secure (automatic behind HTTPS with X-Forwarded-Proto)
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(path.join(here, '..', 'solace.config.json'), 'utf8'));
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
const production = process.env.NODE_ENV === 'production' || process.argv.includes('--production');

const appOrigins = list(process.env.SOLACE_APP_ORIGINS) ?? cfg.apiAllowedOrigins ?? [];
if (production && !appOrigins.length) {
  console.warn('[solace-api] SOLACE_APP_ORIGINS is not set: only http://localhost and http://127.0.0.1 pages may call the API. Set it to your domain before deploying.');
}

const { server } = await createApp({
  dbFile: process.env.SOLACE_DB_FILE || path.join(here, 'data', 'solace-db.json'),
  extensionIds: list(process.env.SOLACE_EXTENSION_IDS) ?? [cfg.extensionId],
  appOrigins,
  secureCookies: process.env.SOLACE_COOKIE_SECURE === '1',
  staticDir: production ? path.join(here, '..', 'dist') : undefined,
});

const port = Number(process.env.PORT || cfg.apiPort || 8787);
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, () => {
  console.log(`[solace-api] listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}${production ? ' (serving dist/)' : ''}`);
});
