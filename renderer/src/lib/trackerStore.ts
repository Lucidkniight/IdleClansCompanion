import { writable, get } from 'svelte/store';
import { xpToLevel } from './store';

export interface TrackedPlayer {
  username: string;
  addedAt: number;
}

export interface PlayerSnapshot {
  username: string;
  canonicalName: string;
  timestamp: number;
  totalLevel: number;
  totalXp: number;
  skills: Record<string, number>;
  pvmStats: Record<string, number>;
  task: string | null;
  gameMode: string | null;
  guildName: string | null;
}

export interface SnapshotSummary {
  first: PlayerSnapshot;
  last: PlayerSnapshot;
  count: number;
}

const PLAYERS_KEY    = 'icc-tracker-players';
const MIGRATION_FLAG = 'icc-tracker-migrated';
const LEGACY_PREFIX  = 'icc-tracker-snap-';
const POLL_MS    = 5 * 60 * 1000;  // check every 5 min
const REFRESH_MS = 55 * 60 * 1000; // re-fetch after 55 min

export const trackedPlayers     = writable<TrackedPlayer[]>([]);
export const snapshotSummaries  = writable<Record<string, SnapshotSummary | null>>({});
export const fetchingSet        = writable<Set<string>>(new Set());
export const errorSet           = writable<Set<string>>(new Set());

// ── IndexedDB storage layer ──────────────────────────────────────────────────
// One row per snapshot, out-of-line key [usernameLower, timestamp]. Array keys
// compare lexicographically, so a bound range on [user, fromTs]..[user, toTs]
// directly yields "this user's snapshots in this time window, in order" with
// no secondary index needed.

const DB_NAME    = 'icc-tracker';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  return dbPromise;
}

function userRange(userLower: string, fromTs = 0, toTs = Number.MAX_SAFE_INTEGER): IDBKeyRange {
  return IDBKeyRange.bound([userLower, fromTs], [userLower, toTs]);
}

async function putSnapshot(userLower: string, snap: PlayerSnapshot): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(snap, [userLower, snap.timestamp]);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function deleteUserSnapshots(userLower: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(userRange(userLower));
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function getSnapshotsInRange(userLower: string, fromTs: number, toTs: number): Promise<PlayerSnapshot[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll(userRange(userLower, fromTs, toTs));
    req.onsuccess = () => resolve(req.result as PlayerSnapshot[]);
    req.onerror   = () => reject(req.error);
  });
}

async function getUserSummary(userLower: string): Promise<SnapshotSummary | null> {
  const db    = await openDB();
  const range = userRange(userLower);
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    let first: PlayerSnapshot | null = null;
    let last:  PlayerSnapshot | null = null;
    let count = 0;

    store.count(range).onsuccess = function (this: IDBRequest<number>) { count = this.result; };
    store.openCursor(range, 'next').onsuccess = function (this: IDBRequest<IDBCursorWithValue | null>) {
      if (this.result) first = this.result.value as PlayerSnapshot;
    };
    store.openCursor(range, 'prev').onsuccess = function (this: IDBRequest<IDBCursorWithValue | null>) {
      if (this.result) last = this.result.value as PlayerSnapshot;
    };

    tx.oncomplete = () => resolve(first && last ? { first, last, count } : null);
    tx.onerror    = () => reject(tx.error);
  });
}

// ── One-time migration from the old localStorage-blob-per-player scheme ─────
async function migrateLegacySnapshots(): Promise<void> {
  if (localStorage.getItem(MIGRATION_FLAG)) return;

  const legacyKeys = Object.keys(localStorage).filter(k => k.startsWith(LEGACY_PREFIX));
  for (const storageKey of legacyKeys) {
    const userLower = storageKey.slice(LEGACY_PREFIX.length);
    try {
      const arr: PlayerSnapshot[] = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (Array.isArray(arr) && arr.length > 0) {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx    = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          for (const snap of arr) store.put(snap, [userLower, snap.timestamp]);
          tx.oncomplete = () => resolve();
          tx.onerror    = () => reject(tx.error);
        });
        const summary = await getUserSummary(userLower);
        snapshotSummaries.update(all => ({ ...all, [userLower]: summary }));
      }
    } catch (e) {
      console.warn('Failed to migrate legacy tracker snapshots for', userLower, e);
    }
    localStorage.removeItem(storageKey);
  }

  localStorage.setItem(MIGRATION_FLAG, '1');
}

// ── Player list + startup ─────────────────────────────────────────────────────
function persistPlayers() {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(get(trackedPlayers)));
}

async function loadStorage() {
  try {
    trackedPlayers.set(JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? '[]'));
  } catch {
    trackedPlayers.set([]);
  }

  await migrateLegacySnapshots();

  const players = get(trackedPlayers);
  const entries = await Promise.all(
    players.map(async p => [p.username.toLowerCase(), await getUserSummary(p.username.toLowerCase())] as const)
  );
  snapshotSummaries.set(Object.fromEntries(entries));
}

async function doFetch(username: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://query.idleclans.com/api/Player/profile/${encodeURIComponent(username)}`
    );
    if (!res.ok) return false;
    const data = await res.json();

    const skills: Record<string, number> = data.skillExperiences ?? {};
    const xpValues = Object.values(skills) as number[];
    const totalXp    = xpValues.reduce((s, v) => s + v, 0);
    const totalLevel = xpValues.reduce((s, xp) => s + xpToLevel(xp), 0);

    const snap: PlayerSnapshot = {
      username,
      canonicalName: data.username ?? username,
      timestamp: Date.now(),
      totalLevel,
      totalXp,
      skills,
      pvmStats: data.pvmStats ?? {},
      task: data.taskNameOnLogout ?? null,
      gameMode: data.gameMode ?? null,
      guildName: data.guildName ?? null,
    };

    const key = username.toLowerCase();
    await putSnapshot(key, snap);
    snapshotSummaries.update(all => {
      const prev = all[key];
      return { ...all, [key]: { first: prev?.first ?? snap, last: snap, count: (prev?.count ?? 0) + 1 } };
    });
    return true;
  } catch {
    return false;
  }
}

async function pollAll() {
  const players   = get(trackedPlayers);
  const summaries = get(snapshotSummaries);
  for (const p of players) {
    const key    = p.username.toLowerCase();
    const lastTs = summaries[key]?.last.timestamp ?? 0;
    if (Date.now() - lastTs < REFRESH_MS) continue;
    fetchingSet.update(s => new Set([...s, key]));
    const ok = await doFetch(p.username);
    fetchingSet.update(s => { const n = new Set(s); n.delete(key); return n; });
    errorSet.update(s => { const n = new Set(s); ok ? n.delete(key) : n.add(key); return n; });
  }
}

/** Deletes the entire snapshot database. Used by Settings > Wipe Data — that
 *  UI only clears specific localStorage keys per category, so the Progress
 *  Tracker category needs this to actually clear IndexedDB history too. */
export async function deleteAllSnapshotData(): Promise<void> {
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  snapshotSummaries.set({});
}

export async function addTrackedPlayer(username: string): Promise<'added' | 'duplicate' | 'error'> {
  const players = get(trackedPlayers);
  if (players.some(p => p.username.toLowerCase() === username.toLowerCase())) return 'duplicate';

  trackedPlayers.update(list => [...list, { username, addedAt: Date.now() }]);

  fetchingSet.update(s => new Set([...s, username.toLowerCase()]));
  const ok = await doFetch(username);
  fetchingSet.update(s => { const n = new Set(s); n.delete(username.toLowerCase()); return n; });

  if (!ok) {
    trackedPlayers.update(list =>
      list.filter(p => p.username.toLowerCase() !== username.toLowerCase())
    );
    return 'error';
  }

  persistPlayers();
  return 'added';
}

export async function removeTrackedPlayer(username: string) {
  const key = username.toLowerCase();
  trackedPlayers.update(list => list.filter(p => p.username.toLowerCase() !== key));
  snapshotSummaries.update(all => { const n = { ...all }; delete n[key]; return n; });
  persistPlayers();
  await deleteUserSnapshots(key);
}

export async function forceRefresh(username: string) {
  const key = username.toLowerCase();
  fetchingSet.update(s => new Set([...s, key]));
  const ok = await doFetch(username);
  fetchingSet.update(s => { const n = new Set(s); n.delete(key); return n; });
  errorSet.update(s => { const n = new Set(s); ok ? n.delete(key) : n.add(key); return n; });
}

/** Fetches a player's snapshots directly from IndexedDB for the given window.
 *  Pass `sinceTs: null` for full history. */
export async function loadSnapshotsInRange(username: string, sinceTs: number | null): Promise<PlayerSnapshot[]> {
  return getSnapshotsInRange(username.toLowerCase(), sinceTs ?? 0, Number.MAX_SAFE_INTEGER);
}

// Self-start: runs for the entire app session once this module is first imported.
if (typeof window !== 'undefined') {
  loadStorage().then(() => pollAll());
  setInterval(pollAll, POLL_MS);
}
