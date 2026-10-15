/**
 * Tiny durable JSON store.
 *
 * Why not a database server: Solace has to run on a hackathon laptop with `npm install`
 * and nothing else. The whole DB is one JSON file; every change is written to a temp
 * file and atomically renamed over the old one, and writes are serialised through one
 * promise chain, so a crash never leaves a half-written file. Swap this module for a
 * real database (Postgres, SQLite) before running Solace for many users — the rest of
 * the server only uses the functions exported here.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const EMPTY = () => ({ version: 1, users: [], sessions: [], deviceTokens: [], linkCodes: [], settings: {} });

export async function openStore(file) {
  await mkdir(path.dirname(file), { recursive: true });
  let db = EMPTY();
  if (existsSync(file)) {
    const raw = await readFile(file, 'utf8');
    if (raw.trim()) db = { ...EMPTY(), ...JSON.parse(raw) };
  }
  let chain = Promise.resolve();

  const persist = () => {
    const snapshot = JSON.stringify(db, null, 2);
    chain = chain.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, file);
    });
    return chain;
  };

  /** Run a mutation and persist it. The callback gets the live db object. */
  async function tx(fn) {
    const result = fn(db);
    await persist();
    return result;
  }

  /** Drop expired sessions, tokens and codes. */
  function sweep(now = Date.now()) {
    db.sessions = db.sessions.filter((s) => s.expiresAt > now);
    db.deviceTokens = db.deviceTokens.filter((t) => t.expiresAt > now && !t.revokedAt);
    db.linkCodes = db.linkCodes.filter((c) => c.expiresAt > now && !c.usedAt);
  }

  return { get db() { return db; }, tx, sweep, flush: () => chain };
}
