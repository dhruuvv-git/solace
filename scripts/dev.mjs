#!/usr/bin/env node
/** `npm run dev`: start the Solace API (port 8787) and the website dev server (port 5173) together. */
import { spawn } from 'node:child_process';

const isWin = process.platform === 'win32';
const procs = [
  ['api', process.execPath, ['--watch-path=server', 'server/index.mjs']],
  ['web', isWin ? 'npx.cmd' : 'npx', ['vite']],
].map(([name, cmd, args]) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: isWin });
  const tag = name === 'api' ? '\x1b[35m[api]\x1b[0m ' : '\x1b[36m[web]\x1b[0m ';
  for (const s of [p.stdout, p.stderr]) s.on('data', (d) => process.stdout.write(String(d).replace(/^(?=.)/gm, tag)));
  p.on('exit', (code) => { console.log(`${tag}exited (${code})`); shutdown(code ?? 0); });
  return p;
});
let done = false;
function shutdown(code) { if (done) return; done = true; for (const p of procs) p.kill(); process.exit(code); }
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
