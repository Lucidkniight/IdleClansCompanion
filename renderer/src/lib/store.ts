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
}

export interface TaskCost {
  Item: number;
  Amount: number;
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
}

export interface PriceData {
  lowestSell: number;
  highestBuy: number;
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

// ── Writable stores ───────────────────────────────────────────────────────────
export const clients      = writable<ClientCard[]>([]);
export const activeId     = writable<number | null>(null);
export const previews     = writable<Record<number, string>>({});
export const scanning     = writable<boolean>(false);
export const updateReady  = writable<boolean>(false);
export const allItems     = writable<MarketItem[]>([]);
export const priceCache   = writable<Record<number, PriceData>>({});
export const profitTasks  = writable<Task[]>([]);
export const profitSkills = writable<string[]>([]);

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

export async function fetchProfile(playerName: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/Player/profile/${playerName}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function refreshProfiles() {
  const current = get(clients);
  for (let i = 0; i < current.length; i++) {
    const client = current[i];
    if (!client.playerName) continue;
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

export async function refreshPreviews() {
  const current = get(clients);
  if (current.length === 0) { previews.set({}); return; }
  const ids = current.map(c => c.win.id);
  const idSet = new Set(ids);
  const result = await (window as any).electronAPI.getWindowPreviews(ids);
  previews.update(prev => {
    const cleaned = Object.fromEntries(Object.entries(prev).filter(([k]) => idSet.has(Number(k))));
    return { ...cleaned, ...result };
  });
}

export async function refreshPrices() {
  try {
    const res = await fetch(`${API_BASE}/api/PlayerMarket/items/prices/latest?includeAveragePrice=false`);
    const prices = await res.json();
    const cache: Record<number, PriceData> = {};
    for (const p of prices) {
      cache[p.itemId] = {
        lowestSell: p.lowestSellPrice ?? 0,
        highestBuy: p.highestBuyPrice ?? 0,
      };
    }
    priceCache.set(cache);
  } catch (e) {
    console.error('Failed to refresh prices:', e);
  }
}

export async function loadGameConfig() {
  if (get(allItems).length > 0) return;
  try {
    const res = await fetch('https://query.idleclans.com/api/Configuration/game-data');
    const text = await res.text();
    const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
    const data = JSON.parse(cleaned);

    if (data?.Items?.Items && Array.isArray(data.Items.Items)) {
      allItems.set(data.Items.Items.map((item: any) => ({
        id: item.ItemId,
        name: item.Name,
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
          const hasProfitValue = t.ItemReward !== -1 || (t.Costs && t.Costs.length > 0);
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
          });
        }
      }
    }

    profitTasks.set(tasks);
    profitSkills.set([...new Set(tasks.map(t => t.skill))].sort());

    await refreshPrices();
  } catch (e) {
    console.error('Failed to load game config:', e);
  }
}