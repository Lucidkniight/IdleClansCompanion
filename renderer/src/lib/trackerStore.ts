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

const PLAYERS_KEY = 'icc-tracker-players';
const snapKey = (n: string) => `icc-tracker-snap-${n.toLowerCase()}`;
const MAX_SNAPS  = 168;            // 7 days × 24 hourly points
const POLL_MS    = 5 * 60 * 1000; // check every 5 min
const REFRESH_MS = 55 * 60 * 1000; // re-fetch after 55 min

export const trackedPlayers = writable<TrackedPlayer[]>([]);
export const snapshots      = writable<Record<string, PlayerSnapshot[]>>({});
export const fetchingSet    = writable<Set<string>>(new Set());
export const errorSet       = writable<Set<string>>(new Set());

function loadStorage() {
  try {
    const players: TrackedPlayer[] = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? '[]');
    trackedPlayers.set(players);
    const snaps: Record<string, PlayerSnapshot[]> = {};
    for (const p of players) {
      try {
        snaps[p.username.toLowerCase()] = JSON.parse(localStorage.getItem(snapKey(p.username)) ?? '[]');
      } catch {
        snaps[p.username.toLowerCase()] = [];
      }
    }
    snapshots.set(snaps);
  } catch {
    trackedPlayers.set([]);
    snapshots.set({});
  }
}

function persistPlayers() {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(get(trackedPlayers)));
}

function persistSnaps(username: string) {
  const snaps = get(snapshots);
  localStorage.setItem(snapKey(username), JSON.stringify(snaps[username.toLowerCase()] ?? []));
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

    snapshots.update(all => {
      const key  = username.toLowerCase();
      const prev = all[key] ?? [];
      return { ...all, [key]: [...prev, snap].slice(-MAX_SNAPS) };
    });
    persistSnaps(username);
    return true;
  } catch {
    return false;
  }
}

async function pollAll() {
  const players = get(trackedPlayers);
  const snaps   = get(snapshots);
  for (const p of players) {
    const key    = p.username.toLowerCase();
    const pSnaps = snaps[key] ?? [];
    const lastTs = pSnaps.length > 0 ? pSnaps[pSnaps.length - 1].timestamp : 0;
    if (Date.now() - lastTs < REFRESH_MS) continue;
    fetchingSet.update(s => new Set([...s, key]));
    const ok = await doFetch(p.username);
    fetchingSet.update(s => { const n = new Set(s); n.delete(key); return n; });
    errorSet.update(s => { const n = new Set(s); ok ? n.delete(key) : n.add(key); return n; });
  }
}

export async function addTrackedPlayer(username: string): Promise<'added' | 'duplicate' | 'error'> {
  const players = get(trackedPlayers);
  if (players.some(p => p.username.toLowerCase() === username.toLowerCase())) return 'duplicate';

  trackedPlayers.update(list => [...list, { username, addedAt: Date.now() }]);
  snapshots.update(all => ({ ...all, [username.toLowerCase()]: [] }));

  fetchingSet.update(s => new Set([...s, username.toLowerCase()]));
  const ok = await doFetch(username);
  fetchingSet.update(s => { const n = new Set(s); n.delete(username.toLowerCase()); return n; });

  if (!ok) {
    trackedPlayers.update(list =>
      list.filter(p => p.username.toLowerCase() !== username.toLowerCase())
    );
    snapshots.update(all => {
      const n = { ...all };
      delete n[username.toLowerCase()];
      return n;
    });
    return 'error';
  }

  persistPlayers();
  return 'added';
}

export function removeTrackedPlayer(username: string) {
  const key = username.toLowerCase();
  trackedPlayers.update(list => list.filter(p => p.username.toLowerCase() !== key));
  snapshots.update(all => { const n = { ...all }; delete n[key]; return n; });
  localStorage.removeItem(snapKey(username));
  persistPlayers();
}

export async function forceRefresh(username: string) {
  const key = username.toLowerCase();
  fetchingSet.update(s => new Set([...s, key]));
  const ok = await doFetch(username);
  fetchingSet.update(s => { const n = new Set(s); n.delete(key); return n; });
  errorSet.update(s => { const n = new Set(s); ok ? n.delete(key) : n.add(key); return n; });
}

// Self-start: runs for the entire app session once this module is first imported.
if (typeof window !== 'undefined') {
  loadStorage();
  pollAll();
  setInterval(pollAll, POLL_MS);
}
