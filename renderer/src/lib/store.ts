import { writable, derived, get, type Readable } from 'svelte/store';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GameWindow {
  id: number;
  title: string;
}

export interface PlayerProfile {
  username: string | null;
  gameMode: string | null;
  guildName: string | null;
  skillExperiences: Record<string, number> | null;
  equipment: Record<string, number> | null;
  enchantmentBoosts: Record<string, number> | null;
  upgrades: Record<string, number> | null;
  hoursOffline: number;
  activeServerId: string | null;
}

export interface ClientCard {
  win: GameWindow;
  playerName: string | null;
  profile: PlayerProfile | null;
  loading: boolean;
  error: boolean;
}

export interface MarketItem {
  id: number;
  name: string;
  baseValue: number;
  ritualPowerModifier: number;
}

export interface TaskCost {
  Item: number;
  Amount: number;
}

export interface TaskSkillAdvantage {
  skillKey: string;
  levelCap: number;
}

export interface Task {
  name: string;
  level: number;
  baseTime: number;
  exp: number;
  itemReward: number;
  itemAmount: number;
  costs: TaskCost[];
  skill: string;
  hasProfitValue: boolean;
  loot?: MonsterLootEntry[];
  baseSuccessChance?: number;
  skillAdvantages?: TaskSkillAdvantage[];
}

export const PLUNDERING_SKILL_ID_MAP: Record<number, string> = {
  7: 'crafting', 8: 'woodcutting', 9: 'carpentry', 10: 'fishing',
  11: 'cooking', 12: 'mining', 13: 'smithing', 14: 'foraging',
  15: 'farming', 16: 'agility', 17: 'plundering', 18: 'enchanting',
  19: 'brewing', 21: 'invocation',
};

export interface PriceData {
  lowestSell: number;
  highestBuy: number;
}

export interface PriceAlert {
  id: string;
  itemId: number;
  itemName: string;
  field: 'sell' | 'buy';
  direction: 'below' | 'above';
  threshold: number;
}

export interface TriggeredAlert {
  id: string;
  itemId: number;
  itemName: string;
  field: 'sell' | 'buy';
  direction: 'below' | 'above';
  threshold: number;
  triggeredPrice: number;
  triggeredAt: string;
}

export interface ChatAlertRule {
  id: string;
  phrase: string;
}

export interface ChatAlertCandidate {
  channel: string;
  sender: string;
  text: string;
  timestamp: string;
}

export interface TriggeredChatAlert {
  id: string;
  ruleId: string;
  phrase: string;
  channel: string;
  sender: string;
  text: string;
  timestamp: string;
  triggeredAt: string;
}

export interface NewsItem {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string;
  publishedAt: string;
}

export interface TriggeredNewsAlert {
  id: string;
  title: string;
  linkUrl: string;
  publishedAt: string;
  triggeredAt: string;
}

export interface EquipmentItem {
  id: number;
  name: string;
  slot: number;
  style: number;
  strengthBonus: number;
  accuracyBonus: number;
  archeryAccuracyBonus: number;
  archeryStrengthBonus: number;
  magicAccuracyBonus: number;
  magicStrengthBonus: number;
  defenceBonus: number;
  archeryDefenceBonus: number;
  magicDefenceBonus: number;
  attackInterval: number;
  twoHanded: boolean;
  weaponType: number;
  extraBoostAgainstWeak: number;
  skillBoostSkill: number;
  skillBoostPct: number;
}

export interface MonsterLootEntry {
  itemId: number;
  dropRate: number;
  avgAmount: number;
}

export interface Monster {
  name: string;
  attackLevel: number;
  strengthLevel: number;
  defenceLevel: number;
  archeryLevel: number;
  magicLevel: number;
  health: number;
  baseTime: number;
  respawnTime: number;
  meleeDefenceBonus: number;
  archeryDefenceBonus: number;
  magicDefenceBonus: number;
  weaknessType: number | null;
  isBoss: boolean;
  bossType: number;
  loot: MonsterLootEntry[];
}

export interface ApiErrorEntry {
  url: string;
  status: number | null;
  time: Date;
  note?: string;
  detail?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────
export const XP_TABLE = [
  0,75,151,227,303,380,531,683,836,988,
  1141,1294,1447,1751,2054,2358,2663,2967,3272,3577,
  4182,4788,5393,5999,6606,7212,7819,9026,10233,11441,
  12648,13856,15065,16273,18682,21091,23500,25910,28319,30729,
  33140,37950,42761,47572,52383,57195,62006,66818,76431,86043,
  95656,105269,114882,124496,134109,153323,172538,191752,210967,230182,
  249397,268613,307028,345444,383861,422277,460694,499111,537528,614346,
  691163,767981,844800,921618,998437,1075256,1228875,1382495,1536114,1689734,
  1843355,1996975,2150596,2457817,2765038,3072260,3379481,3686703,3993926,4301148,
  4915571,5529994,6144417,6758841,7373264,7987688,8602113,9830937,11059762,12288587,
  13517412,14746238,15975063,17203889,19661516,22119142,24576769,27034396,29492023,31949651,
  34407278,39322506,44237735,49152963,54068192,58983421,63898650,68813880,78644309,88474739
];

const API_BASE = 'https://query.idleclans.com';
const GATHERING_SKILLS = ['Woodcutting', 'Fishing', 'Mining', 'Foraging'];

// ── Utility functions ─────────────────────────────────────────────────────────
export function xpToLevel(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_TABLE.length; i++) {
    if (xp >= XP_TABLE[i]) level = i + 1;
    else break;
  }
  return Math.min(level, 120);
}

export function formatItemName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function formatGold(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

export { GATHERING_SKILLS };

// True only on the browser-hosted "Try it out" demo page (see try-main.ts / demoPlatform.ts).
// The packaged Electron app never sets window.__ICC_DEMO__.
export const isDemoMode = typeof window !== 'undefined' && (window as any).__ICC_DEMO__ === true;

// Hardcoded display order for the demo page's 3 mock accounts (not alphabetical).
export const DEMO_ACCOUNTS = ['LucidKniight', 'LucidTwo', 'LucidThree'] as const;

// ── Writable stores ───────────────────────────────────────────────────────────
export const devMode = writable<boolean>(localStorage.getItem('s-dev-mode') === 'true');

export const clients      = writable<ClientCard[]>([]);
export const activeId     = writable<number | null>(null);
export const previews     = writable<Record<number, string>>({});
export const scanning     = writable<boolean>(false);
export const updateReady  = writable<boolean>(false);
export const apiError     = writable<boolean>(false);
export const apiErrorLog  = writable<ApiErrorEntry[]>([]);
export const allItems     = writable<MarketItem[]>([]);
export const priceCache        = writable<Record<number, PriceData>>({});
export const lastPriceRefresh  = writable<Date | null>(null);
export const priceRefreshCount = writable<number>(0);
export const profitTasks  = writable<Task[]>([]);
export const profitSkills = writable<string[]>([]);
export const allEquipment    = writable<EquipmentItem[]>([]);
export const allMonsters     = writable<Monster[]>([]);
export const enchantedToBase = writable<Record<number, number>>({});

const _ALERTS_KEY = 'icc-price-alerts';
export const priceAlerts = writable<PriceAlert[]>((() => {
  try { return JSON.parse(localStorage.getItem(_ALERTS_KEY) ?? '[]'); } catch { return []; }
})());
priceAlerts.subscribe(v => { try { localStorage.setItem(_ALERTS_KEY, JSON.stringify(v)); } catch {} });

export function addPriceAlert(alert: Omit<PriceAlert, 'id'>): void {
  priceAlerts.update(list => {
    // Replace only if same item + same field + same direction (avoids exact-duplicate conditions)
    const filtered = list.filter(a => !(a.itemId === alert.itemId && a.field === alert.field && a.direction === alert.direction));
    return [...filtered, { ...alert, id: String(Date.now()) }];
  });
  // Check immediately so alerts that are already true fire without waiting for the next refresh cycle
  _checkPriceAlerts(get(priceCache));
}

export function removePriceAlert(id: string): void {
  priceAlerts.update(list => list.filter(a => a.id !== id));
}

const _TRIGGERED_KEY = 'icc-triggered-alerts';
export const triggeredAlerts = writable<TriggeredAlert[]>((() => {
  try { return JSON.parse(localStorage.getItem(_TRIGGERED_KEY) ?? '[]'); } catch { return []; }
})());
triggeredAlerts.subscribe(v => { try { localStorage.setItem(_TRIGGERED_KEY, JSON.stringify(v)); } catch {} });

export function dismissTriggeredAlert(id: string): void {
  triggeredAlerts.update(list => list.filter(a => a.id !== id));
}

const _CHAT_ALERTS_KEY = 'icc-chat-alerts';
export const chatAlerts = writable<ChatAlertRule[]>((() => {
  try { return JSON.parse(localStorage.getItem(_CHAT_ALERTS_KEY) ?? '[]'); } catch { return []; }
})());
chatAlerts.subscribe(v => { try { localStorage.setItem(_CHAT_ALERTS_KEY, JSON.stringify(v)); } catch {} });

export function addChatAlert(phrase: string): void {
  const trimmed = phrase.trim();
  if (!trimmed) return;
  chatAlerts.update(list => {
    if (list.some(a => a.phrase.toLowerCase() === trimmed.toLowerCase())) return list;
    return [...list, { id: String(Date.now()), phrase: trimmed }];
  });
}

export function removeChatAlert(id: string): void {
  chatAlerts.update(list => list.filter(a => a.id !== id));
}

const _CHAT_TRIGGERED_KEY = 'icc-chat-triggered';
const _CHAT_TRIGGERED_MAX = 100;
export const triggeredChatAlerts = writable<TriggeredChatAlert[]>((() => {
  try { return JSON.parse(localStorage.getItem(_CHAT_TRIGGERED_KEY) ?? '[]'); } catch { return []; }
})());
triggeredChatAlerts.subscribe(v => { try { localStorage.setItem(_CHAT_TRIGGERED_KEY, JSON.stringify(v)); } catch {} });

export function dismissTriggeredChatAlert(id: string): void {
  triggeredChatAlerts.update(list => list.filter(a => a.id !== id));
}

// Chat word alerts stay active indefinitely (unlike price alerts, which fire once and
// clear) — the same phrase should keep matching every time it reappears in chat.
export function checkChatAlerts(newMessages: ChatAlertCandidate[]): void {
  const rules = get(chatAlerts);
  if (rules.length === 0 || newMessages.length === 0) return;
  const fired: TriggeredChatAlert[] = [];
  for (const msg of newMessages) {
    const haystack = msg.text.toLowerCase();
    for (const rule of rules) {
      if (!haystack.includes(rule.phrase.toLowerCase())) continue;
      fired.push({
        id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ruleId: rule.id,
        phrase: rule.phrase,
        channel: msg.channel,
        sender: msg.sender,
        text: msg.text,
        timestamp: msg.timestamp,
        triggeredAt: new Date().toISOString(),
      });
    }
  }
  if (fired.length > 0) {
    triggeredChatAlerts.update(list => [...list, ...fired].slice(-_CHAT_TRIGGERED_MAX));
    playAlertSound();
  }
}

// ── Chat feed ─────────────────────────────────────────────────────────────────
// Lives at store level (not inside the Chat tool component) so polling and alert
// checking keep running in the background even if the user never opens the tool.
export interface ChatChannelDef { id: string; label: string; param: string; }

export const CHAT_CHANNELS: ChatChannelDef[] = [
  { id: 'General',   label: 'General',    param: 'generalDisabled' },
  { id: 'Trade',     label: 'Trade',      param: 'tradeDisabled' },
  { id: 'Help',      label: 'Help',       param: 'helpDisabled' },
  { id: 'ClanHub',   label: 'Clan Hub',   param: 'clanHubDisabled' },
  { id: 'CombatLFG', label: 'Combat LFG', param: 'combatLFGDisabled' },
  { id: 'RaidLFG',   label: 'Raid LFG',   param: 'raidLFGDisabled' },
];
export const CHAT_CHANNEL_LABEL: Record<string, string> = Object.fromEntries(CHAT_CHANNELS.map(c => [c.id, c.label]));

export interface ChatMessage {
  channel: string;
  sender: string;
  clanTag: string | null;
  text: string;
  timestamp: string;
  isModerator: boolean;
  gilded: boolean;
  premium: boolean;
}

export const CHAT_POLL_MS = 15_000;
const CHAT_HISTORY_HOURS = 4;
const CHAT_SAFETY_MAX_MESSAGES = 3000;
const _CHAT_CHANNELS_KEY = 'icc-chat-channels';
const _CHAT_MESSAGES_KEY = 'icc-chat-messages';

export const chatEnabledChannels = writable<Set<string>>((() => {
  try {
    const saved = JSON.parse(localStorage.getItem(_CHAT_CHANNELS_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length > 0) return new Set(saved);
  } catch {}
  return new Set(CHAT_CHANNELS.map(c => c.id));
})());
chatEnabledChannels.subscribe(v => { try { localStorage.setItem(_CHAT_CHANNELS_KEY, JSON.stringify([...v])); } catch {} });

export function toggleChatChannel(id: string): void {
  chatEnabledChannels.update(set => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
}

function isChatMessageFresh(m: ChatMessage): boolean {
  return Date.now() - new Date(m.timestamp).getTime() < CHAT_HISTORY_HOURS * 3_600_000;
}

const _chatSeenKeys = new Set<string>();

function loadStoredChatMessages(): ChatMessage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(_CHAT_MESSAGES_KEY) ?? '[]') as ChatMessage[];
    const fresh = raw.filter(isChatMessageFresh);
    for (const m of fresh) _chatSeenKeys.add(`${m.channel}|${m.sender}|${m.timestamp}`);
    return fresh;
  } catch { return []; }
}

export const chatMessages = writable<ChatMessage[]>(loadStoredChatMessages());
export const chatLoading = writable<boolean>(get(chatMessages).length === 0);
export const chatRefreshing = writable<boolean>(false);
export const chatError = writable<boolean>(false);

// Raw Message field looks like "[HH:MM:SS] [ClanTag] Sender: text" (clan tag optional).
// Sender/timestamp are already separate fields, so strip the redundant prefix for display.
function parseChatMessage(raw: string, sender: string): { clanTag: string | null; text: string } {
  let s = raw.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
  let clanTag: string | null = null;
  const tagMatch = s.match(/^\[([^\]]+)\]\s*/);
  if (tagMatch) { clanTag = tagMatch[1]; s = s.slice(tagMatch[0].length); }
  const esc = sender.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  s = s.replace(new RegExp(`^${esc}:\\s*`), '');
  return { clanTag, text: s };
}

let _chatFetchInFlight = false;

export async function refreshChat(): Promise<void> {
  if (_chatFetchInFlight) return;
  _chatFetchInFlight = true;
  chatRefreshing.set(true);
  chatError.set(false);
  try {
    const enabled = get(chatEnabledChannels);
    const params = new URLSearchParams();
    for (const ch of CHAT_CHANNELS) {
      if (!enabled.has(ch.id)) params.set(ch.param, 'true');
    }
    const res = await fetch(`https://query.idleclans.com/api/Chat/recent?${params.toString()}`);
    if (!res.ok) throw new Error();
    const data: Record<string, any[]> = await res.json();
    const incoming: ChatMessage[] = [];
    for (const ch of CHAT_CHANNELS) {
      if (!enabled.has(ch.id)) continue;
      for (const m of data[ch.id] ?? []) {
        const key = `${ch.id}|${m.Sender}|${m.Timestamp}`;
        if (_chatSeenKeys.has(key)) continue;
        _chatSeenKeys.add(key);
        const parsed = parseChatMessage(m.Message ?? '', m.Sender ?? '');
        incoming.push({
          channel: ch.id,
          sender: m.Sender ?? '',
          clanTag: parsed.clanTag,
          text: parsed.text,
          timestamp: m.Timestamp,
          isModerator: !!m.IsModerator,
          gilded: !!m.Gilded,
          premium: !!m.Premium,
        });
      }
    }
    checkChatAlerts(incoming);
    const current = get(chatMessages);
    const merged = [...incoming, ...current].filter(isChatMessageFresh);
    if (incoming.length > 0 || merged.length !== current.length) {
      const next = merged
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, CHAT_SAFETY_MAX_MESSAGES);
      chatMessages.set(next);
      try { localStorage.setItem(_CHAT_MESSAGES_KEY, JSON.stringify(next)); } catch {}
    }
  } catch {
    if (get(chatMessages).length === 0) chatError.set(true);
  } finally {
    chatLoading.set(false);
    chatRefreshing.set(false);
    _chatFetchInFlight = false;
  }
}

// ── News feed ─────────────────────────────────────────────────────────────────
// Lives at store level (not inside the News tool component) so new-post detection
// keeps running in the background every NEWS_POLL_MS even if the user never opens
// the tool, same pattern as the chat feed above.
export const NEWS_POLL_MS = 5 * 60_000;
const _NEWS_NOTIFY_KEY = 'icc-news-notify';
const _NEWS_LAST_SEEN_KEY = 'icc-news-last-seen';
const _NEWS_TRIGGERED_KEY = 'icc-news-triggered';
const _NEWS_TRIGGERED_MAX = 50;

export const newsNotifyEnabled = writable<boolean>(localStorage.getItem(_NEWS_NOTIFY_KEY) !== 'false');
newsNotifyEnabled.subscribe(v => { try { localStorage.setItem(_NEWS_NOTIFY_KEY, String(v)); } catch {} });

export const triggeredNewsAlerts = writable<TriggeredNewsAlert[]>((() => {
  try { return JSON.parse(localStorage.getItem(_NEWS_TRIGGERED_KEY) ?? '[]'); } catch { return []; }
})());
triggeredNewsAlerts.subscribe(v => { try { localStorage.setItem(_NEWS_TRIGGERED_KEY, JSON.stringify(v)); } catch {} });

export function dismissTriggeredNewsAlert(id: string): void {
  triggeredNewsAlerts.update(list => list.filter(a => a.id !== id));
}

export const newsItems = writable<NewsItem[]>([]);
export const newsLoading = writable<boolean>(true);
export const newsError = writable<boolean>(false);

// The API returns posts newest-first with no unique id, so `publishedAt` of the
// newest post is used as the watermark for "have I already notified about this?".
// On the very first run there's no watermark yet — seed it without notifying so
// installing the app doesn't fire alerts for 25 pre-existing posts.
function checkNewsAlerts(items: NewsItem[]): void {
  if (items.length === 0) return;
  const newest = items[0].publishedAt;
  const lastSeen = localStorage.getItem(_NEWS_LAST_SEEN_KEY);
  if (lastSeen === null) {
    try { localStorage.setItem(_NEWS_LAST_SEEN_KEY, newest); } catch {}
    return;
  }
  const lastSeenMs = new Date(lastSeen).getTime();
  const fresh = items.filter(i => new Date(i.publishedAt).getTime() > lastSeenMs);
  if (fresh.length === 0) return;
  try { localStorage.setItem(_NEWS_LAST_SEEN_KEY, newest); } catch {}
  if (!get(newsNotifyEnabled)) return;
  const triggered: TriggeredNewsAlert[] = fresh.map(i => ({
    id: `tn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: i.title,
    linkUrl: i.linkUrl,
    publishedAt: i.publishedAt,
    triggeredAt: new Date().toISOString(),
  }));
  triggeredNewsAlerts.update(list => [...list, ...triggered].slice(-_NEWS_TRIGGERED_MAX));
  playAlertSound();
}

let _newsFetchInFlight = false;

export async function refreshNews(): Promise<void> {
  if (_newsFetchInFlight) return;
  _newsFetchInFlight = true;
  newsError.set(false);
  try {
    const res = await fetch('https://query.idleclans.com/api/news/latest?count=25');
    if (!res.ok) throw new Error();
    const items: NewsItem[] = await res.json();
    newsItems.set(items);
    checkNewsAlerts(items);
  } catch {
    if (get(newsItems).length === 0) newsError.set(true);
  } finally {
    newsLoading.set(false);
    _newsFetchInFlight = false;
  }
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url, options);
  } catch (e) {
    apiError.set(true);
    apiErrorLog.update(log => [...log, { url, status: null, time: new Date() }]);
    throw e;
  }

  if (!r.ok) {
    if (r.status === 429) {
      apiError.set(true);
      const retryAfter = parseInt(r.headers.get('Retry-After') ?? '0', 10);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 5000;
      const detail = retryAfter > 0 ? undefined : '(no Retry-After header)';
      apiErrorLog.update(log => [...log, { url, status: 429, time: new Date(), note: `Retrying in ${waitMs / 1000}s…`, detail }]);
      await new Promise(res => setTimeout(res, waitMs));
      let retry: Response;
      try {
        retry = await fetch(url, options);
      } catch (e) {
        apiErrorLog.update(log => [...log, { url, status: null, time: new Date(), note: 'Retry failed' }]);
        throw e;
      }
      if (retry.ok) {
        apiErrorLog.update(log => [...log, { url, status: retry.status, time: new Date(), note: 'Retry OK' }]);
      } else {
        apiErrorLog.update(log => [...log, { url, status: retry.status, time: new Date(), note: 'Retry failed' }]);
      }
      return retry;
    }
    apiError.set(true);
    apiErrorLog.update(log => [...log, { url, status: r.status, time: new Date() }]);
  }

  return r;
}

export interface ToolNav { tool: string; param: string; id: number; }
export const toolNavigation = writable<ToolNav | null>(null);
let _navId = 0;
export function navigate(tool: string, param: string) {
  toolNavigation.set({ tool, param, id: ++_navId });
}
export function createNavListener(toolName: string): Readable<string | null> {
  let lastSeen = -1;
  return derived(toolNavigation, ($nav): string | null => {
    if ($nav?.tool === toolName && $nav.id !== lastSeen) {
      lastSeen = $nav.id;
      return $nav.param;
    }
    return null;
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────
function extractPlayerName(title: string): string | null {
  const match = title.match(/^Idle Clans(?:\s+\[([^\]]+)\])?$/i);
  return match?.[1] ?? null;
}

export interface ClanProfile {
  serializedUpgrades: string | null;
  repeatableUpgradeCounts: Record<string, number> | null;
  houseId?: number;
}

export async function fetchProfile(playerName: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/Player/profile/${playerName}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const FETCH_PROFILES_MAX_BATCH = 20;

/** Bulk profile lookup — up to FETCH_PROFILES_MAX_BATCH usernames per call. Players
 *  that don't exist are simply omitted from the response array (no null placeholder),
 *  so callers must match returned profiles back to requested usernames themselves. */
export async function fetchProfiles(usernames: string[]): Promise<PlayerProfile[]> {
  if (usernames.length === 0) return [];
  try {
    const params = usernames.map(u => `usernames=${encodeURIComponent(u)}`).join('&');
    const res = await fetch(`${API_BASE}/api/Player/profiles?${params}`);
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchClanProfile(clanName: string): Promise<ClanProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/Clan/recruitment/${encodeURIComponent(clanName)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Changelog ─────────────────────────────────────────────────────────────────
const GITHUB_REPO = 'Lucidkniight/IdleClansCompanion';

export async function fetchReleaseChangelog(version: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/tags/v${version}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.body === 'string' && data.body.trim() ? data.body : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMarkdown(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Lightweight renderer for GitHub release notes: bold-only lines become headings,
// '- ' lines become list items (indentation depth preserved for nesting, soft-wrapped
// continuation lines are folded into the preceding item), rest are paragraphs.
export function renderChangelogMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inList = false;
  let currentLi: { level: number; parts: string[] } | null = null;

  const flushLi = () => {
    if (!currentLi) return;
    const style = currentLi.level > 0 ? ` style="margin-left:${currentLi.level * 10}px" class="changelog-li-nested"` : '';
    html += `<li${style}>${currentLi.parts.join(' ')}</li>`;
    currentLi = null;
  };
  const closeList = () => {
    flushLi();
    if (inList) { html += '</ul>'; inList = false; }
  };

  for (const line of lines) {
    if (line.trim() === '') { closeList(); continue; }

    const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bulletMatch) {
      if (!inList) { html += '<ul>'; inList = true; }
      flushLi();
      const level = Math.min(3, Math.floor(bulletMatch[1].length / 2));
      currentLi = { level, parts: [inlineMarkdown(bulletMatch[2])] };
      continue;
    }

    if (inList && currentLi) {
      // Soft-wrapped continuation of the current bullet
      currentLi.parts.push(inlineMarkdown(line.trim()));
      continue;
    }

    closeList();
    const headingMatch = line.match(/^\*\*(.+)\*\*$/);
    if (headingMatch) {
      html += `<div class="changelog-heading">${escapeHtml(headingMatch[1])}</div>`;
    } else {
      html += `<p>${inlineMarkdown(line)}</p>`;
    }
  }
  closeList();
  return html;
}

async function refreshProfiles() {
  const current = get(clients);
  for (let i = 0; i < current.length; i++) {
    const client = current[i];
    // Skip clients we already have a profile for — logging out is already caught for
    // free by the window-title check in scan(), so there's no need to re-hit the API
    // every 10s just to keep guildName/gameMode/activeServerId fresh. A null profile
    // (never fetched, or a prior fetch failed) still retries here.
    if (!client.playerName || client.profile) continue;
    const profile = await fetchProfile(client.playerName);
    clients.update(list => {
      list[i] = { ...list[i], profile, loading: false, error: profile === null };
      return [...list];
    });
    await new Promise(r => setTimeout(r, 250));
  }
}

export async function scan() {
  if (get(scanning)) return;
  scanning.set(true);
  try {
    const found: GameWindow[] = await (window as any).electronAPI.getGameWindows();
    const current = get(clients);
    const sorted = found
      .map(win => {
        const existing = current.find(c => c.win.id === win.id);
        const playerName = extractPlayerName(win.title);
        return {
          win,
          playerName,
          profile: existing?.profile ?? null,
          loading: existing ? false : !!playerName,
          error: false,
        };
      })
      .sort((a, b) => {
        if (isDemoMode) {
          const order: readonly string[] = DEMO_ACCOUNTS;
          return order.indexOf(a.playerName ?? '') - order.indexOf(b.playerName ?? '');
        }
        if (!a.playerName && b.playerName) return 1;
        if (a.playerName && !b.playerName) return -1;
        return (a.playerName ?? '').localeCompare(b.playerName ?? '');
      });
    clients.set(sorted);
    await refreshProfiles();
  } finally {
    scanning.set(false);
  }
}

export async function focusClient(id: number | null) {
  activeId.set(id);
  await (window as any).electronAPI.focusWindow(id);
}

let _previewsRefreshing = false;
export async function refreshPreviews() {
  if (_previewsRefreshing) return;
  _previewsRefreshing = true;
  try {
    const current = get(clients);
    if (current.length === 0) { previews.set({}); return; }
    const ids = current.map(c => c.win.id);
    const idSet = new Set(ids);
    const result = await (window as any).electronAPI.getWindowPreviews(ids);
    previews.update(prev => {
      const cleaned = Object.fromEntries(Object.entries(prev).filter(([k]) => idSet.has(Number(k))));
      return { ...cleaned, ...result };
    });
  } finally {
    _previewsRefreshing = false;
  }
}

export function playAlertSound(): void {
  try {
    const vol = parseInt(localStorage.getItem('s-alert-volume') ?? '50') / 100;
    const snd = localStorage.getItem('s-alert-sound') ?? 'mixkit-software-interface-start-2574.wav';
    if (snd !== 'none') {
      const audio = new Audio(`./sounds/${snd}`);
      audio.volume = Math.max(0, Math.min(1, vol));
      audio.play().catch(() => {});
    }
  } catch {}
}

export function checkPriceAlerts(): void {
  _checkPriceAlerts(get(priceCache));
}

function _checkPriceAlerts(cache: Record<number, PriceData>): void {
  const alerts = get(priceAlerts);
  if (alerts.length === 0) return;
  const triggered: string[] = [];
  for (const alert of alerts) {
    const data = cache[alert.itemId];
    if (!data) continue;
    const price = alert.field === 'sell' ? data.lowestSell : data.highestBuy;
    if (price === 0) continue;
    const hit = alert.direction === 'below' ? price < alert.threshold : price > alert.threshold;
    if (!hit) continue;
    const fieldLabel = alert.field === 'sell' ? 'Sell' : 'Buy';
    const dirLabel = alert.direction === 'below' ? 'dropped below' : 'risen above';
    playAlertSound();
    triggeredAlerts.update(list => [...list, {
      id: `t-${Date.now()}-${alert.id}`,
      itemId: alert.itemId,
      itemName: alert.itemName,
      field: alert.field,
      direction: alert.direction,
      threshold: alert.threshold,
      triggeredPrice: price,
      triggeredAt: new Date().toISOString(),
    }]);
    triggered.push(alert.id);
  }
  if (triggered.length > 0) {
    priceAlerts.update(list => list.filter(a => !triggered.includes(a.id)));
  }
}

export async function refreshPrices() {
  try {
    const res = await apiFetch(`${API_BASE}/api/PlayerMarket/items/prices/latest?includeAveragePrice=false`);
    if (!res.ok) return;
    const prices = await res.json();
    const cache: Record<number, PriceData> = {};
    for (const p of prices) {
      cache[p.itemId] = {
        lowestSell: p.lowestSellPrice ?? 0,
        highestBuy: p.highestBuyPrice ?? 0,
      };
    }

    // Bulk endpoint is server-side cached (~5 min). For items with active alerts,
    // fetch the comprehensive endpoint (live order book) so alerts fire within 60s.
    const alertItemIds = [...new Set(get(priceAlerts).map(a => a.itemId))];
    if (alertItemIds.length > 0) {
      await Promise.all(alertItemIds.map(async (id) => {
        try {
          const r = await fetch(`${API_BASE}/api/PlayerMarket/items/prices/latest/comprehensive/${id}`);
          if (r.ok) {
            const d = await r.json();
            cache[id] = {
              lowestSell: d.lowestSellPricesWithVolume?.[0]?.key ?? cache[id]?.lowestSell ?? 0,
              highestBuy: d.highestBuyPricesWithVolume?.[0]?.key ?? cache[id]?.highestBuy ?? 0,
            };
          }
        } catch {}
      }));
    }

    priceCache.set(cache);
    lastPriceRefresh.set(new Date());
    priceRefreshCount.update(n => n + 1);
    _checkPriceAlerts(cache);
  } catch (e) {
    console.error('Failed to refresh prices:', e);
  }
}

export async function loadGameConfig() {
  if (get(allItems).length > 0) return;
  try {
    const res = await apiFetch('https://query.idleclans.com/api/Configuration/game-data');
    if (!res.ok) return;
    const text = await res.text();
    const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
    const data = JSON.parse(cleaned);

    if (data?.Items?.Items && Array.isArray(data.Items.Items)) {
      allItems.set(data.Items.Items.map((item: any) => ({
        id: item.ItemId,
        name: item.Name,
        baseValue: item.BaseValue ?? 0,
        ritualPowerModifier: item.InvocationData?.SacrificialPowerModifier ?? 0,
      })).filter((i: MarketItem) => i.name && i.id >= 0));
    }

    const SKILL_MAP: Record<string, string> = {
      Woodcutting: 'Woodcutting', Mining: 'Mining', Fishing: 'Fishing',
      Foraging: 'Foraging', Farming: 'Farming', Cooking: 'Cooking',
      Smithing: 'Smithing', Carpentry: 'Carpentry', Crafting: 'Crafting',
      Brewing: 'Brewing', Agility: 'Agility', Enchanting: 'Enchanting',
      Plundering: 'Plundering', Exterminating: 'Exterminating', Invocation: 'Invocation',
    };

    const tasks: Task[] = [];
    for (const [skillKey, skillName] of Object.entries(SKILL_MAP)) {
      const groups = data.Tasks[skillKey];
      if (!groups) continue;
      for (const group of groups) {
        for (const t of group.Items) {
          if (t.Disabled || t.Hidden) continue;
          const rawPlunderLoot: any[] = t.PlunderingLoot ?? [];
          const plunderTotal = rawPlunderLoot.reduce((s: number, l: any) => s + (l.Weight ?? 0), 0);
          const loot: MonsterLootEntry[] = plunderTotal > 0
            ? rawPlunderLoot.map((l: any) => ({
                itemId: l.ItemId,
                dropRate: l.Weight / plunderTotal,
                avgAmount: Math.max(1, ((l.ItemAmountMin ?? 0) + (l.ItemAmountMax ?? 0)) / 2),
              }))
            : [];
          const skillAdvantages: TaskSkillAdvantage[] = loot.length > 0
            ? (t.SkillAdvantages ?? []).map((a: any) => ({
                skillKey: PLUNDERING_SKILL_ID_MAP[a.Skill] ?? null,
                levelCap: a.LevelCap,
              })).filter((a: TaskSkillAdvantage) => a.skillKey !== null)
            : [];
          const hasProfitValue = t.ItemReward !== -1 || (t.Costs && t.Costs.length > 0) || loot.length > 0;
          tasks.push({
            name: t.Name,
            level: t.LevelRequirement,
            baseTime: t.BaseTime,
            exp: t.ExpReward,
            itemReward: t.ItemReward ?? -1,
            itemAmount: t.ItemAmount ?? 0,
            costs: t.Costs ?? [],
            skill: skillName,
            hasProfitValue,
            loot: loot.length > 0 ? loot : undefined,
            baseSuccessChance: loot.length > 0 ? (t.BaseSuccessChancePercentage ?? 0) / 100 : undefined,
            skillAdvantages: skillAdvantages.length > 0 ? skillAdvantages : undefined,
          });
        }
      }
    }

    profitTasks.set(tasks);
    profitSkills.set([...new Set(tasks.map(t => t.skill))].sort());

    // Parse equipment items
    if (data?.Items?.Items && Array.isArray(data.Items.Items)) {
      const allEq: EquipmentItem[] = data.Items.Items
        .filter((item: any) => (item.EquipmentSlot ?? 0) > 0 && !item.Discontinued)
        .map((item: any): EquipmentItem => ({
          id: item.ItemId,
          name: item.Name,
          slot: item.EquipmentSlot,
          style: item.Style ?? 0,
          strengthBonus: item.StrengthBonus ?? 0,
          accuracyBonus: item.AccuracyBonus ?? 0,
          archeryAccuracyBonus: item.ArcheryAccuracyBonus ?? 0,
          archeryStrengthBonus: item.ArcheryStrengthBonus ?? 0,
          magicAccuracyBonus: item.MagicAccuracyBonus ?? 0,
          magicStrengthBonus: item.MagicStrengthBonus ?? 0,
          defenceBonus: item.DefenceBonus ?? 0,
          archeryDefenceBonus: item.ArcheryDefenceBonus ?? 0,
          magicDefenceBonus: item.MagicDefenceBonus ?? 0,
          attackInterval: item.AttackInterval ?? 0,
          twoHanded: item.TwoHanded ?? false,
          weaponType: item.WeaponType ?? 0,
          extraBoostAgainstWeak: item.ExtraBoostAgainstWeakEnemiesPercentage ?? 0,
          skillBoostSkill: item.SkillBoost?.Skill ?? 0,
          skillBoostPct: item.SkillBoost?.BoostPercentage ?? 0,
        }));

      // Build enchanted → base ID mapping and filter enchanted variants out
      const nameToId = new Map(allEq.map(e => [e.name, e.id]));
      const mapping: Record<number, number> = {};
      for (const item of allEq) {
        if (item.name.endsWith('_enchanted')) {
          const baseName = item.name.slice(0, -'_enchanted'.length);
          const baseId = nameToId.get(baseName);
          if (baseId !== undefined) mapping[item.id] = baseId;
        }
      }
      enchantedToBase.set(mapping);
      allEquipment.set(allEq.filter(e => !e.name.endsWith('_enchanted')));
    }

    // Parse monsters from combat skill tasks
    const monsters: Monster[] = [];
    for (const skillKey of ['Combat', 'Invocation']) {
      const groups = data.Tasks?.[skillKey];
      if (!groups) continue;
      for (const group of groups) {
        for (const t of group.Items) {
          if (t.Disabled || !t.EnemyHealth) continue;
          const rawLoot: any[] = t.Loot ?? [];
          const totalWeight = rawLoot.reduce((s: number, l: any) => s + (l.Weight ?? 0), 0);
          const loot: MonsterLootEntry[] = totalWeight > 0
            ? rawLoot.map((l: any) => ({
                itemId: l.ItemId,
                dropRate: l.Weight / totalWeight,
                avgAmount: Math.max(1, ((l.ItemAmountMin ?? 0) + (l.ItemAmountMax ?? 0)) / 2),
              }))
            : [];
          monsters.push({
            name: t.Name,
            attackLevel: t.EnemyRigourLevel ?? 0,
            strengthLevel: t.EnemyStrengthLevel ?? 0,
            defenceLevel: t.EnemyDefenceLevel ?? 0,
            archeryLevel: t.EnemyArcheryLevel ?? 0,
            magicLevel: t.EnemyMagicLevel ?? 0,
            health: t.EnemyHealth,
            baseTime: t.BaseTime ?? 0,
            respawnTime: t.EnemyRespawnTime ?? 0,
            meleeDefenceBonus: t.EnemyDefenceBonus ?? 0,
            archeryDefenceBonus: t.EnemyArcheryDefenceBonus ?? 0,
            magicDefenceBonus: t.EnemyMagicDefenceBonus ?? 0,
            weaknessType: t.AttackStyleWeakness ?? null,
            isBoss: t.IsBoss ?? false,
            bossType: t.BossType ?? 0,
            loot,
          });
        }
      }
    }
    // Parse clan bosses from top-level ClanBossInfos
    if (Array.isArray(data.ClanBossInfos)) {
      for (const c of data.ClanBossInfos) {
        if (!c.EnemyHealth) continue;
        const rawLoot: any[] = c.LootTable ?? [];
        const totalWeight = rawLoot.reduce((s: number, l: any) => s + (l.Weight ?? 0), 0);
        const loot: MonsterLootEntry[] = totalWeight > 0
          ? rawLoot.map((l: any) => ({
              itemId: l.ItemId,
              dropRate: l.Weight / totalWeight,
              avgAmount: Math.max(1, ((l.ItemAmountMin ?? 0) + (l.ItemAmountMax ?? 0)) / 2),
            }))
          : [];
        monsters.push({
          name: c.BossNameLocalizationKey,
          attackLevel: c.EnemyRigourLevel ?? 0,
          strengthLevel: c.EnemyStrengthLevel ?? 0,
          defenceLevel: c.EnemyDefenceLevel ?? 0,
          archeryLevel: c.EnemyArcheryLevel ?? 0,
          magicLevel: c.EnemyMagicLevel ?? 0,
          health: c.EnemyHealth,
          baseTime: 0,
          respawnTime: c.EnemyRespawnTime ?? 0,
          meleeDefenceBonus: c.EnemyDefenceBonus ?? 0,
          archeryDefenceBonus: c.EnemyArcheryDefenceBonus ?? 0,
          magicDefenceBonus: c.EnemyMagicDefenceBonus ?? 0,
          weaknessType: c.AttackStyleWeakness ?? null,
          isBoss: false,
          bossType: c.BossType ?? 1,
          loot,
        });
      }
    }

    allMonsters.set(monsters);

    await refreshPrices();
  } catch (e) {
    console.error('Failed to load game config:', e);
  }
}