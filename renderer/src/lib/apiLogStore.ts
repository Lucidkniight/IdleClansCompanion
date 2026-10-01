import type { ApiPriority } from './apiQueue';

// Every query.idleclans.com call (success or failure) gets one record here, so a user
// having API trouble can export the last few hours of raw activity for diagnosis. Lives in
// IndexedDB rather than localStorage for the same reason Progress Tracker snapshots do (see
// trackerStore.ts): this writes on every single API call, and a growing JSON blob rewritten
// in full on every write doesn't scale — one record per call via put() is O(1) regardless
// of how much history has accumulated.
const DB_NAME = 'icc-api-log';
const STORE_NAME = 'calls';
const RETENTION_MS = 6 * 60 * 60 * 1000; // keep 6 hours, auto-prune anything older
const PRUNE_INTERVAL_MS = 10 * 60 * 1000; // pruning is cheap but no need to do it every call

export interface ApiLogEntry {
  id?: number;
  time: number; // epoch ms
  url: string;
  status: number | null; // null = network error
  priority: ApiPriority;
  elapsedMs: number;
  success: boolean;
  note?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('time', 'time');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

let lastPrune = 0;

async function pruneOldEntries(db: IDBDatabase): Promise<void> {
  const now = Date.now();
  if (now - lastPrune < PRUNE_INTERVAL_MS) return;
  lastPrune = now;
  const cutoff = now - RETENTION_MS;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const range = IDBKeyRange.upperBound(cutoff);
    const cursorReq = tx.objectStore(STORE_NAME).index('time').openCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) { cursor.delete(); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve(); // best-effort — never let a pruning failure surface
  });
}

// Best-effort, fire-and-forget — logging must never affect the actual API call it's
// recording, so every failure here is swallowed silently.
export function logApiCall(entry: Omit<ApiLogEntry, 'id'>): void {
  openDB().then(db => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(entry);
    pruneOldEntries(db);
  }).catch(() => {});
}

export async function getAllApiLogs(): Promise<ApiLogEntry[]> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).index('time').getAll();
      req.onsuccess = () => resolve(req.result as ApiLogEntry[]);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function clearApiLogs(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}
