/**
 * Evidence Vault storage: SHA-256 fingerprints computed in the browser (Web Crypto)
 * and kept in this browser's IndexedDB, separately for each signed-in account.
 * Files and fingerprints are never uploaded.
 */
const DB = 'solace-vault';
const STORE = 'records';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'id' });
      s.createIndex('userId', 'userId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(out?.result ?? out); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function sha256Hex(buffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const istStamp = (ms) => `${new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`;

export async function listRecords(userId) {
  const rows = await run('readonly', (s) => s.index('userId').getAll(userId));
  return (rows || []).sort((a, b) => b.sealedAt - a.sealedAt);
}

/** Hash a File and store its fingerprint (not the file). */
export async function sealFile(userId, file) {
  const hash = await sha256Hex(await file.arrayBuffer());
  const rec = {
    id: `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId, name: file.name, size: file.size, type: file.type || 'unknown',
    lastModified: file.lastModified || null, hash, sealedAt: Date.now(),
  };
  await run('readwrite', (s) => s.put(rec));
  return rec;
}

/** Re-hash a file and say whether it matches a saved fingerprint. */
export async function verifyFile(rec, file) {
  return (await sha256Hex(await file.arrayBuffer())) === rec.hash;
}

export async function deleteRecord(id) { await run('readwrite', (s) => s.delete(id)); }

export async function clearUser(userId) {
  const rows = await listRecords(userId);
  await run('readwrite', (s) => { rows.forEach((r) => s.delete(r.id)); });
}

export function exportJson(records, user) {
  return JSON.stringify({
    format: 'solace-evidence-vault', version: 1, exportedAt: new Date().toISOString(),
    account: user ? { name: user.name, email: user.email } : undefined,
    note: 'SHA-256 fingerprints computed locally in the browser. Re-hash the original files to show they are unchanged.',
    records: records.map(({ userId: _u, ...r }) => ({ ...r, sealedAtIST: istStamp(r.sealedAt) })),
  }, null, 2);
}
