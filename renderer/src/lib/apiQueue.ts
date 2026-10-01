import { writable } from 'svelte/store';
import { logApiCall } from './apiLogStore';

export interface ApiErrorEntry {
  url: string;
  status: number | null;
  time: Date;
  note?: string;
  detail?: string;
}

export const apiError    = writable<boolean>(false);
export const apiErrorLog = writable<ApiErrorEntry[]>([]);

export type ApiPriority = 'high' | 'low';

export interface QueuedCall {
  url: string;
  priority: ApiPriority;
}

export interface QueueStats {
  queued: number;      // requests waiting for a token right now
  tokensUsed: number;   // how much of the 35-token bucket is currently drawn down
  limit: number;
  waiting: QueuedCall[];   // snapshot of everything currently queued, high priority first
  pausedMs: number;        // ms remaining on the current server-told 429 pause (0 = none)
  pausedBy: string | null; // URL whose 429 triggered it, null once the pause expires
}
export const queueStats = writable<QueueStats>({
  queued: 0, tokensUsed: 0, limit: 35, waiting: [], pausedMs: 0, pausedBy: null,
});

// Self-imposed client-side rate limit for all query.idleclans.com traffic — every call
// in the app goes through idleClansFetch() below instead of a raw fetch(). 35/min is a
// known-safe ceiling on our OWN total volume. Modeled as a continuously-refilling token
// bucket rather than a fixed per-calendar-minute counter, since a fixed window lets ~2x
// the limit through in a couple of real seconds right at the 0:59 -> 0:00 edge — the
// bucket instead drains overflow smoothly at roughly one request/1.7s.
//
// Two priority lanes share the same bucket: 'high' for anything the user is actively
// waiting on (a search, an import button, a freshly opened tool) and 'low' for passive
// background polling (chat/news/price refresh, the per-client profile recheck). High
// always drains before low, so an interactive click never waits behind a chat poll.
const RATE_LIMIT    = 35;
const WINDOW_MS     = 60_000;
const TOKENS_PER_MS = RATE_LIMIT / WINDOW_MS;
const TICK_MS       = 500;

let tokens = RATE_LIMIT;
let lastRefill = Date.now();

// One shared, account/IP-wide 429 budget across (at least) Chat/Player/Market/Clan/News/
// Configuration — confirmed with the API Probe tool: tripping any one of them immediately
// 429'd 4-5 of the other 5 endpoints in the very next request, well before any of THEM had
// been hit on their own. An earlier version of this file scoped the pause per-endpoint
// (by URL path) based on a real-world pattern where chat alone seemed to be the one
// getting rate-limited — that pattern turned out to be a symptom of this file's OWN prior
// bug (one global pause plus a missing in-flight guard on refreshPrices stacking up
// duplicate requests), not evidence the server actually separates endpoints. Reverted back
// to one global pause/backoff state to match what the server is actually doing.
//
// High-priority ('user-initiated') calls bypass this pause — see tick() — since freezing
// an explicit user action for minutes because some background poller tripped the shared
// limit is worse than occasionally letting a user action hit the same 429 directly (which
// still correctly feeds back into and extends this same pause).
let blockedUntil = 0;
let consecutive429s = 0;
let last429At = 0;
let lastPauseCause: string | null = null;
const STREAK_RESET_MS = 3 * 60_000;
const MAX_BACKOFF_MS  = 5 * 60_000;

interface QueueItem {
  url: string;
  options?: RequestInit;
  priority: ApiPriority;
  attempt: number;
  resolve: (r: Response) => void;
  reject: (e: unknown) => void;
}

const highQueue: QueueItem[] = [];
const lowQueue: QueueItem[] = [];

function refill(): void {
  const now = Date.now();
  tokens = Math.min(RATE_LIMIT, tokens + (now - lastRefill) * TOKENS_PER_MS);
  lastRefill = now;
}

function publishStats(): void {
  const pausedMs = Math.max(0, blockedUntil - Date.now());
  queueStats.set({
    queued: highQueue.length + lowQueue.length,
    tokensUsed: Math.round(RATE_LIMIT - tokens),
    limit: RATE_LIMIT,
    waiting: [...highQueue, ...lowQueue].map(i => ({ url: i.url, priority: i.priority })),
    pausedMs,
    pausedBy: pausedMs > 0 ? lastPauseCause : null,
  });
}

async function dispatch(item: QueueItem): Promise<void> {
  const start = performance.now();
  let res: Response;
  try {
    res = await fetch(item.url, item.options);
  } catch (e) {
    logApiCall({
      time: Date.now(), url: item.url, status: null, priority: item.priority,
      elapsedMs: Math.round(performance.now() - start), success: false, note: 'network error',
    });
    apiError.set(true);
    apiErrorLog.update(log => [...log, { url: item.url, status: null, time: new Date() }]);
    item.reject(e);
    return;
  }

  logApiCall({
    time: Date.now(), url: item.url, status: res.status, priority: item.priority,
    elapsedMs: Math.round(performance.now() - start), success: res.ok,
    note: res.status === 429 ? '429 rate-limited' : res.ok ? undefined : `HTTP ${res.status}`,
  });

  // A 429 pauses the whole queue (see the comment above blockedUntil — the server's budget
  // really is shared across endpoints), with escalating backoff. Each item still gets at
  // most one forced retry itself; once that retry ALSO 429s, we stop retrying this
  // particular item (resolve with the failing response, caller's existing error handling
  // applies) but the streak/pause keep growing regardless, since that's queue-wide state.
  if (res.status === 429) {
    const now = Date.now();
    if (now - last429At > STREAK_RESET_MS) consecutive429s = 0;
    consecutive429s++;
    last429At = now;
    lastPauseCause = item.url;

    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10);
    const baseWaitMs = retryAfter > 0 ? retryAfter * 1000 : 10_000;
    const waitMs = Math.min(MAX_BACKOFF_MS, baseWaitMs * 2 ** (consecutive429s - 1));
    blockedUntil = now + waitMs;

    apiError.set(true);
    apiErrorLog.update(log => [...log, {
      url: item.url, status: 429, time: new Date(),
      note: `Rate-limited (${consecutive429s}x in a row, shared across endpoints) — pausing ${Math.round(waitMs / 1000)}s`,
    }]);

    if (item.attempt < 1) {
      item.attempt++;
      (item.priority === 'high' ? highQueue : lowQueue).unshift(item);
      return;
    }
    // Already retried once and still 429 — give up on this item (already logged above,
    // don't double-log via the generic !res.ok branch below).
    item.resolve(res);
    return;
  }

  if (!res.ok) {
    apiError.set(true);
    apiErrorLog.update(log => [...log, { url: item.url, status: res.status, time: new Date() }]);
  }
  item.resolve(res);
}

function tick(): void {
  refill();
  const paused = Date.now() < blockedUntil;
  // High priority always tries (bypasses the pause — a user-initiated call shouldn't
  // silently freeze for minutes because background polling tripped the shared limit).
  // Low priority fully respects the pause once one is active.
  while (tokens >= 1 && highQueue.length > 0) {
    const item = highQueue.shift()!;
    tokens -= 1;
    dispatch(item);
  }
  while (!paused && tokens >= 1 && lowQueue.length > 0) {
    const item = lowQueue.shift()!;
    tokens -= 1;
    dispatch(item);
  }
  publishStats();
}
setInterval(tick, TICK_MS);

export function idleClansFetch(url: string, options?: RequestInit, priority: ApiPriority = 'low'): Promise<Response> {
  return new Promise((resolve, reject) => {
    (priority === 'high' ? highQueue : lowQueue).push({ url, options, priority, attempt: 0, resolve, reject });
    publishStats();
  });
}
