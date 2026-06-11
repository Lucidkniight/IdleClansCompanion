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

// ── Writable stores ───────────────────────────────────────────────────────────
export const clients      = writable<ClientCard[]>([]);
export const activeId     = writable<number | null>(null);
export const previews     = writable<Record<number, string>>({});
export const scanning     = writable<boolean>(false);
export const updateReady  = writable<boolean>(false);
export const apiError     = writable<boolean>(false);
export const apiErrorLog  = writable<ApiErrorEntry[]>([]);
export const allItems     = writable<MarketItem[]>([]);
export const priceCache   = writable<Record<number, PriceData>>({});
export const profitTasks  = writable<Task[]>([]);
export const profitSkills = writable<string[]>([]);
export const allEquipment    = writable<EquipmentItem[]>([]);
export const allMonsters     = writable<Monster[]>([]);
export const enchantedToBase = writable<Record<number, number>>({});

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

export async function fetchClanProfile(clanName: string): Promise<ClanProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/Clan/recruitment/${encodeURIComponent(clanName)}`);
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
    priceCache.set(cache);
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
          if (t.Disabled || t.Hidden || !t.EnemyHealth) continue;
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
          });
        }
      }
    }
    allMonsters.set(monsters);

    await refreshPrices();
  } catch (e) {
    console.error('Failed to load game config:', e);
  }
}