/** Minimal promise wrapper around IndexedDB (works in extension pages, the service worker and the landing page). */

export const DB_NAME = 'trustlens';
export const DB_VERSION = 1;
export type StoreName = 'evidence' | 'patterns' | 'history' | 'refs';

const KEYS: Record<StoreName, string> = { evidence: 'id', patterns: 'senderKey', history: 'id', refs: 'id' };

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Local database (IndexedDB) is not available here.')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(KEYS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('Could not open local database.')); };
  });
  return dbPromise;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    let result: T;
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error ?? new Error('Database operation failed.'));
    t.onabort = () => reject(t.error ?? new Error('Database operation aborted (storage full?).'));
  }));
}

export const idb = {
  put: <T>(store: StoreName, value: T) => tx<IDBValidKey>(store, 'readwrite', (s) => s.put(value)),
  get: <T>(store: StoreName, key: IDBValidKey) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  getAll: <T>(store: StoreName) => tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
  delete: (store: StoreName, key: IDBValidKey) => tx<undefined>(store, 'readwrite', (s) => s.delete(key)),
  deleteMany: (store: StoreName, keys: IDBValidKey[]) => tx<undefined>(store, 'readwrite', (s) => { for (const k of keys) s.delete(k); }),
  clear: (store: StoreName) => tx<undefined>(store, 'readwrite', (s) => s.clear()),
};
