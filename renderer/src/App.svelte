<script context="module" lang="ts">
  declare const __APP_VERSION__: string;
</script>

<script lang="ts">
import { onMount, onDestroy } from 'svelte';

let updateReady = false;
let previews: Record<number, string> = {};
let previewInterval: ReturnType<typeof setInterval>;
let scanning = false;

interface GameWindow {
  id: number;
  title: string;
}

interface PlayerProfile {
  username: string | null;
  gameMode: string | null;
  guildName: string | null;
  skillExperiences: Record<string, number> | null;
  hoursOffline: number;
  activeServerId: string | null;
}

interface ClientCard {
  win: GameWindow;
  playerName: string | null;
  profile: PlayerProfile | null;
  loading: boolean;
  error: boolean;
}

type Tab = 'clients' | 'calculators' | 'market' | 'profit' | 'xp';

let clients: ClientCard[] = [];
let activeId: number | null = null;
let activeTab: Tab = 'clients';
let refreshInterval: ReturnType<typeof setInterval>;

const API_BASE = 'https://query.idleclans.com';

function extractPlayerName(title: string): string | null {
  const match = title.match(/^Idle Clans(?:\s+\[([^\]]+)\])?$/i);
  return match?.[1] ?? null;
}

const XP_TABLE = [
  0, 75, 151, 227, 303, 380, 531, 683, 836, 988,
  1141, 1294, 1447, 1751, 2054, 2358, 2663, 2967, 3272, 3577,
  4182, 4788, 5393, 5999, 6606, 7212, 7819, 9026, 10233, 11441,
  12648, 13856, 15065, 16273, 18682, 21091, 23500, 25910, 28319, 30729,
  33140, 37950, 42761, 47572, 52383, 57195, 62006, 66818, 76431, 86043,
  95656, 105269, 114882, 124496, 134109, 153323, 172538, 191752, 210967, 230182,
  249397, 268613, 307028, 345444, 383861, 422277, 460694, 499111, 537528, 614346,
  691163, 767981, 844800, 921618, 998437, 1075256, 1228875, 1382495, 1536114, 1689734,
  1843355, 1996975, 2150596, 2457817, 2765038, 3072260, 3379481, 3686703, 3993926, 4301148,
  4915571, 5529994, 6144417, 6758841, 7373264, 7987688, 8602113, 9830937, 11059762, 12288587,
  13517412, 14746238, 15975063, 17203889, 19661516, 22119142, 24576769, 27034396, 29492023, 31949651,
  34407278, 39322506, 44237735, 49152963, 54068192, 58983421, 63898650, 68813880, 78644309, 88474739
];

function xpToLevel(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_TABLE.length; i++) {
    if (xp >= XP_TABLE[i]) level = i + 1;
    else break;
  }
  return Math.min(level, 120);
}

function getTotalLevel(profile: PlayerProfile): number {
  if (!profile.skillExperiences) return 0;
  return Object.values(profile.skillExperiences)
    .reduce((sum, xp) => sum + xpToLevel(xp), 0);
}

function getOnlineStatus(profile: PlayerProfile): { online: boolean } {
  if (profile.activeServerId) {
    return { online: true };
  } else {
    return { online: false };
  }
}

async function fetchProfile(playerName: string): Promise<PlayerProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/Player/profile/${playerName}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function scan() {
  if (scanning) return;

  scanning = true;

  try {
    const found: GameWindow[] = await (window as any).electronAPI.getGameWindows();

    clients = found
      .map(win => {
        const existing = clients.find(c => c.win.id === win.id);
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

    await refreshProfiles();

  } finally {
    scanning = false;
  }
}

async function refreshProfiles() {
  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
  
    if (!client.playerName) continue;
  
    const profile = await fetchProfile(client.playerName);
  
    clients[i] = {
      ...clients[i],
      profile,
      loading: false,
      error: profile === null,
    };
  
    clients = clients;
  
    await new Promise(r => setTimeout(r, 250));
  }
}

async function focus(client: ClientCard) {
  if (activeId === client.win.id) {
    activeId = null;
    await (window as any).electronAPI.focusWindow(null);
  } else {
    activeId = client.win.id;
    await (window as any).electronAPI.focusWindow(client.win.id);
  }
}

onMount(async () => {
  await loadItems();
  await scan();

  refreshInterval = setInterval(scan, 10000);
  previewInterval = setInterval(refreshPreviews, 1000);

  (window as any).electronAPI.onUpdateReady(() => {
    updateReady = true;
  });

});

onDestroy(() => {
  clearInterval(refreshInterval);
  clearInterval(previewInterval);
});

async function refreshPreviews() {
  if (clients.length === 0) return;
  const ids = clients.map(c => c.win.id);
  previews = await (window as any).electronAPI.getWindowPreviews(ids);
}

interface MarketItem { id: number; name: string; }

interface ComprehensivePrice {
  itemId: number;
  lowestSellPricesWithVolume: { key: number; value: number }[];
  highestBuyPricesWithVolume: { key: number; value: number }[];
  averagePrice1Day: number;
  averagePrice7Days: number;
  averagePrice30Days: number;
  tradeVolume1Day: number;
}

let ALL_ITEMS: MarketItem[] = [];

async function loadItems() {
  try {
    const res = await fetch('https://query.idleclans.com/api/Configuration/game-data');
    const text = await res.text();
    const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
    const data = JSON.parse(cleaned);
    
    if (data?.Items?.Items && Array.isArray(data.Items.Items)) {
      ALL_ITEMS = data.Items.Items.map((item: any) => ({
        id: item.ItemId,
        name: item.Name,
      })).filter((i: MarketItem) => i.name && i.id >= 0);
    }
  } catch (e) {
    console.error('Failed to load items:', e);
  }
}

let marketSearch = '';
let marketDropdownOpen = false;
let selectedMarketItem: MarketItem | null = null;
let marketData: ComprehensivePrice | null = null;
let marketLoading = false;
let marketError = false;

$: marketSuggestions = marketSearch.trim().length >= 2
  ? ALL_ITEMS
      .filter(i =>
        i.name
          .replace(/_/g, ' ')
          .toLowerCase()
          .includes(marketSearch.toLowerCase())
      )
      .slice(0, 50)
  : [];

function formatItemName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function normalizeItem(raw: any): MarketItem {
  return {
    id: raw.id ?? raw.ItemId ?? raw.TaskId ?? -1,
    name: raw.name ?? raw.Name ?? raw.ItemName ?? 'unknown'
  };
}
function formatGold(n: number): string {
  if (n === 0) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}
async function selectMarketItem(item: MarketItem) {
  selectedMarketItem = item;
  marketSearch = formatItemName(item.name);
  marketDropdownOpen = false;
  marketData = null;
  marketLoading = true;
  marketError = false;
  try {
    const res = await fetch(`${API_BASE}/api/PlayerMarket/items/prices/latest/comprehensive/${item.id}`);
    if (!res.ok) throw new Error();
    marketData = await res.json();
  } catch {
    marketError = true;
  } finally {
    marketLoading = false;
  }
}

function onMarketInput() {
  selectedMarketItem = null;
  marketData = null;

  marketDropdownOpen = marketSearch.trim().length >= 2;
}

function closeDropdown() {
  setTimeout(() => {
    marketDropdownOpen = false;
  }, 500);
}

interface TaskCost { Item: number; Amount: number; }
interface Task {
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

const GATHERING_SKILLS = ['Woodcutting', 'Fishing', 'Mining', 'Foraging'];

const TOOL_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Normal', value: 0.04 },
  { label: 'Refined', value: 0.06 },
  { label: 'Great', value: 0.08 },
  { label: 'Elite', value: 0.10 },
  { label: 'Superior', value: 0.12 },
  { label: 'Outstanding', value: 0.15 },
  { label: 'Godlike', value: 0.20 },
  { label: 'Otherworldly', value: 0.25 },
];

const CAPE_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Tier 1', value: 0.05 },
  { label: 'Tier 2', value: 0.10 },
  { label: 'Tier 3', value: 0.15 },
  { label: 'Tier 4', value: 0.20 },
];

const JEWELRY_TYPES = [
  { label: 'None', value: 0 },
  { label: 'Common', value: 0.015 },
  { label: 'Rare', value: 0.035 },
  { label: 'Exceptional', value: 0.05 },
];

let profitTasks: Task[] = [];
let profitSkills: string[] = [];
let selectedProfitSkill: string = '';
let selectedTask: Task | null = null;
let profitLoading = false;

let modTool = 0;
let modGearPieces = 0;
let modJewelryType = 0;
let modJewelryPieces = 0;
let modCapeTier = 0;
let modGatherers = false;
let modSellSpeed: 'instant' | 'slow' = 'instant';

let priceCache: Record<number, { lowestSell: number; highestBuy: number }> = {};

async function loadProfitData() {
  profitLoading = true;
  try {
    const res = await fetch('https://query.idleclans.com/api/Configuration/game-data');
    const text = await res.text();
    const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
    const data = JSON.parse(cleaned);

    const SKILL_MAP: Record<string, string> = {
      Woodcutting: 'Woodcutting', Mining: 'Mining', Fishing: 'Fishing',
      Foraging: 'Foraging', Farming: 'Farming', Cooking: 'Cooking',
      Smithing: 'Smithing', Carpentry: 'Carpentry', Crafting: 'Crafting',
      Brewing: 'Brewing', Agility: 'Agility', Enchanting: 'Enchanting',
      Plundering: 'Plundering',
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
            hasProfitValue
          });
        }
      }
    }

    profitTasks = tasks;
    profitSkills = [...new Set(tasks.map(t => t.skill))].sort();
    selectedProfitSkill = profitSkills[0] ?? '';

    const priceRes = await fetch('https://query.idleclans.com/api/PlayerMarket/items/prices/latest?includeAveragePrice=false');
    const prices = await priceRes.json();
    priceCache = {};
    for (const p of prices) {
      priceCache[p.itemId] = {
        lowestSell: p.lowestSellPrice ?? 0,
        highestBuy: p.highestBuyPrice ?? 0,
      };
    }
  } catch (e) {
    console.error('Failed to load profit data:', e);
  } finally {
    profitLoading = false;
  }
}

$: skillTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelryType, modJewelryPieces, modCapeTier, modGatherers, modSellSpeed];
  return profitTasks
    .filter(t => t.skill === selectedProfitSkill && t.hasProfitValue)
    .sort((a, b) => calcProfit(b).profitPerHr - calcProfit(a).profitPerHr);
})();

$: xpTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelryType, modJewelryPieces, modCapeTier, modGatherers, modHousing, xpGoalLevel, xpCurrentXp];
  return profitTasks
    .filter(t => t.skill === xpSelectedSkill) // no hasProfitValue filter
    .sort((a, b) => calcXp(b).xpPerHr - calcXp(a).xpPerHr);
})();


function calcTaskTime(task: Task): number {
  const gearBoost = modGearPieces * 0.02;
  const jewelryBoost = modJewelryPieces * modJewelryType;
  const toolBoost = modTool;
  const capeBoost = modCapeTier;
  const gathererBoost = (modGatherers && GATHERING_SKILLS.includes(task.skill)) ? 0.05 : 0;

  const totalSpeedBoost = gearBoost + jewelryBoost + toolBoost + capeBoost;
  const timeMs = task.baseTime * (1 - gathererBoost) * (1 - totalSpeedBoost);
  return Math.max(timeMs, 100) / 1000;
}

function calcProfit(task: Task): { inputCost: number; outputValue: number; profitPerHr: number; actionsPerHr: number } {
  const timeSec = calcTaskTime(task);
  const actionsPerHr = 3600 / timeSec;

  const getOutputPrice = (itemId: number) => {
    const p = priceCache[itemId];
    if (!p) return 0;
    return modSellSpeed === 'instant' ? p.highestBuy : p.lowestSell;
  };

  const outputValue = task.itemReward !== -1
    ? getOutputPrice(task.itemReward) * task.itemAmount * actionsPerHr
    : 0;

  const inputCost = task.costs.reduce((sum, c) => {
    const p = priceCache[c.Item];
    return sum + (p?.lowestSell ?? 0) * c.Amount * actionsPerHr;
  }, 0);

  return { inputCost, outputValue, profitPerHr: outputValue - inputCost, actionsPerHr };
}

let xpCurrentXp: number = 0;
let xpGoalLevel: number = 99;
let xpSelectedSkill: string = '';
let xpSelectedTask: Task | null = null;

const HOUSING_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Tent (5%)', value: 0.05 },
  { label: 'Barn (10%)', value: 0.10 },
  { label: 'Windmill (15%)', value: 0.15 },
  { label: 'House (20%)', value: 0.20 },
  { label: 'Manor (25%)', value: 0.25 },
  { label: 'Castle (30%)', value: 0.30 },
];

let modHousing = 0;

function calcXp(task: Task): { xpPerHr: number; timeToGoal: number | null; actionsToGoal: number | null } {
  const timeSec = calcTaskTime(task);
  const actionsPerHr = 3600 / timeSec;
  const xpPerAction = task.exp * (1 + modHousing);
  const xpPerHr = xpPerAction * actionsPerHr;

  const goalXp = xpGoalLevel >= 1 && xpGoalLevel <= 120 ? XP_TABLE[xpGoalLevel - 1] : null;
  const xpNeeded = goalXp !== null ? Math.max(goalXp - xpCurrentXp, 0) : null;
  const timeToGoal = xpNeeded !== null ? xpNeeded / xpPerHr * 3600 : null;
  const actionsToGoal = xpNeeded !== null ? Math.ceil(xpNeeded / xpPerAction) : null;

  return { xpPerHr, timeToGoal, actionsToGoal };
}



function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

$: xpCurrentLevel = xpToLevel(xpCurrentXp);
</script>

<div class="sidebar">


  <div class="header">
    <div class="logo">
      <img src="./logo.png" alt="Logo" class="logo-image" />
      <span class="logo-text">Idle Clans Companion</span>
    </div>
  </div>
  {#if updateReady}
    <div class="update-banner">
      <span>Update ready</span>
      <button class="restart-btn" on:click={() => (window as any).electronAPI.restartAndUpdate()}>
        Restart
      </button>
    </div>
  {/if}

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'clients'} on:click={() => activeTab = 'clients'}>
      Clients
    </button>
    <button class="tab" class:active={activeTab === 'calculators'} on:click={() => activeTab = 'calculators'}>
      Calc
    </button>
    <button class="tab" class:active={activeTab === 'market'} on:click={() => activeTab = 'market'}>
      Market
    </button>
  </div>

  <div class="content">

    {#if activeTab === 'clients'}
      <div class="section-header">
        <span>Accounts</span>
        <button class="scan-btn" on:click={scan} title="Rescan">↺</button>
      </div>

      {#if clients.length === 0}
        <div class="empty">
          <div class="empty-icon">⚔</div>
          <p>No clients found</p>
          <span>Open Idle Clans and click ↺</span>
        </div>
      {:else}
        <div class="cards">
          {#each clients as client (client.win.id)}
            <button
              class="card"
              class:active={client.win.id === activeId}
              on:click={() => focus(client)}
            >
              {#if !client.playerName}
                <!-- Not logged in -->
                <div class="card-top">
                  <div class="avatar ghost">?</div>
                  <div class="card-info">
                    <span class="card-name muted">Not logged in</span>
                    <span class="card-clan">Idle Clans</span>
                  </div>
                  <div class="status-dot offline"></div>
                </div>

              {:else if client.loading}
                <!-- Loading -->
                <div class="card-top">
                  <div class="avatar ghost">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan loading-text">Loading...</span>
                  </div>
                  <div class="status-dot offline"></div>
                </div>

              {:else if client.error || !client.profile}
                <!-- Error -->
                <div class="card-top">
                  <div class="avatar ghost">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan error-text">Could not load profile</span>
                  </div>
                  <div class="status-dot offline"></div>
                  
                </div>
                <div class="card-preview">
                  {#if previews[client.win.id]}
                    <img src={previews[client.win.id]} alt={client.playerName} />
                  {:else}
                    <div class="preview-placeholder">No preview</div>
                  {/if}
                </div>
              {:else}
                <!-- Loaded -->
                {@const status = getOnlineStatus(client.profile)}
                {@const totalLevel = getTotalLevel(client.profile)}
                <div class="card-top">
                  <div class="avatar">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan">{client.profile.guildName ?? 'No clan'}</span>
                  </div>
                  <div class="status-dot" class:offline={!status.online}></div>
                </div>
                <div class="card-preview">
                  {#if previews[client.win.id]}
                    <img src={previews[client.win.id]} alt={client.playerName} />
                  {:else}
                    <div class="preview-placeholder">No preview</div>
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}


  {#if activeTab === 'calculators'}
    <div class="section-header"><span>Calculators</span></div>
    <div class="calc-list">

      <button class="calc-item" on:click={() => { activeTab = 'profit'; loadProfitData(); }}>
        <span class="calc-item-icon">💸</span>
        <div class="calc-item-info">
          <span class="calc-item-name">Profit Calculator</span>
          <span class="calc-item-desc">Profit per hour for any task</span>
        </div>
        <span class="calc-item-arrow">›</span>
      </button>

      <button class="calc-item" on:click={() => { activeTab = 'xp'; loadProfitData(); }}>
        <span class="calc-item-icon">✨</span>
        <div class="calc-item-info">
          <span class="calc-item-name">XP Calculator</span>
          <span class="calc-item-desc">Time to goal for any task</span>
        </div>
        <span class="calc-item-arrow">›</span>
      </button>
    </div>
  {/if}


  {#if activeTab === 'market'}
    <div class="section-header"><span>Market</span></div>

    <!-- Search -->
    <div class="market-search-wrap">
      <input
        class="market-input"
        placeholder="Search items…"
        bind:value={marketSearch}
        on:input={onMarketInput}
        on:focus={() => { if (marketSearch.length >= 2) marketDropdownOpen = true; }}
        on:blur={closeDropdown}
      />
      {#if marketSearch.length > 0}
        <button class="market-clear" on:click={() => {
          marketSearch = '';
          marketDropdownOpen = false;
          selectedMarketItem = null;
          marketData = null;
        }}>✕</button>
      {/if}
      {#if marketDropdownOpen && marketSuggestions.length > 0}
        <div class="market-dropdown">
          {#each marketSuggestions as item}
            <button class="market-suggestion" on:click={() => selectMarketItem(item)}>
              {formatItemName(item.name)}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Results -->
    {#if marketLoading}
      <div class="market-status">Loading…</div>
    {:else if marketError}
      <div class="market-status error">Could not load market data</div>
    {:else if marketData}
      <!-- Averages -->
      <div class="market-section-label">Price Averages</div>
      <div class="market-avg-row">
        <div class="market-avg-box">
          <span class="market-avg-label">1 Day</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice1Day)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">7 Days</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice7Days)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">30 Days</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice30Days)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">Volume 24h</span>
          <span class="market-avg-val">{marketData.tradeVolume1Day.toLocaleString()}</span>
        </div>
      </div>

 
  <div class="market-books">
    <div class="market-book">
      <div class="market-section-label buy-label">Buy Orders</div>
      <div class="market-table-head">
        <span>Price</span>
        <span>Volume</span>
      </div>
      {#each marketData.highestBuyPricesWithVolume as row}
        <div class="market-table-row buy">
          <span>{formatGold(row.key)}</span>
          <span>{Math.round(row.value).toLocaleString()}</span>
        </div>
      {/each}
    </div>

    <div class="market-book">
      <div class="market-section-label sell-label">Sell Orders</div>
      <div class="market-table-head">
        <span>Price</span>
        <span>Volume</span>
      </div>
      {#each marketData.lowestSellPricesWithVolume as row}
        <div class="market-table-row sell">
          <span>{formatGold(row.key)}</span>
          <span>{Math.round(row.value).toLocaleString()}</span>
        </div>
      {/each}
    </div>


  </div>
    {/if}
  {/if}


{#if activeTab === 'profit'}
  <div class="section-header">
    <button class="back-btn" on:click={() => { activeTab = 'calculators'; selectedTask = null; }}>← Back</button>
    <span>Profit Calculator</span>
  </div>

  {#if profitLoading}
    <div class="market-status">Loading tasks…</div>
  {:else}

    <!-- Skill selector -->
    <div class="profit-field">
      <label class="profit-label">Skill</label>
      <div class="profit-skill-grid">
        {#each profitSkills as skill}
          <button
            class="profit-skill-btn"
            class:active={selectedProfitSkill === skill}
            on:click={() => { selectedProfitSkill = skill; selectedTask = null; }}
          >
            {skill}
          </button>
        {/each}
      </div>
    </div>

    <!-- Modifiers -->
    <div class="profit-field">
      <label class="profit-label">Modifiers</label>
      <div class="profit-modifiers">

        <div class="profit-mod-row">
          <span class="profit-mod-label">Tool</span>
          <select class="profit-select" bind:value={modTool}>
            {#each TOOL_TIERS as t}
              <option value={t.value}>{t.label} ({t.value * 100}%)</option>
            {/each}
          </select>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Gear pieces</span>
          <select class="profit-select" bind:value={modGearPieces}>
            {#each [0,1,2,3] as n}
              <option value={n}>{n} piece{n !== 1 ? 's' : ''} ({n * 2}%)</option>
            {/each}
          </select>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Jewelry</span>
          <div class="profit-jewelry-row">
            <select class="profit-select" bind:value={modJewelryType}>
              {#each JEWELRY_TYPES as j}
                <option value={j.value}>{j.label}</option>
              {/each}
            </select>
            <select class="profit-select" bind:value={modJewelryPieces} disabled={modJewelryType === 0}>
              {#each [0,1,2,3,4] as n}
                <option value={n}>{n}pc</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Mastery cape</span>
          <select class="profit-select" bind:value={modCapeTier}>
            {#each CAPE_TIERS as c}
              <option value={c.value}>{c.label} ({c.value * 100}%)</option>
            {/each}
          </select>
        </div>

        {#if GATHERING_SKILLS.includes(selectedProfitSkill)}
          <div class="profit-mod-row">
            <span class="profit-mod-label">Gatherers upgrade</span>
            <button
              class="profit-toggle"
              class:active={modGatherers}
              on:click={() => modGatherers = !modGatherers}
            >
              {modGatherers ? 'Yes' : 'No'}
            </button>
          </div>
        {/if}

        <div class="profit-mod-row">
  <span class="profit-mod-label">Sell speed</span>
  <div class="profit-speed-row">
    <button
      class="profit-speed-btn"
      class:active={modSellSpeed === 'instant'}
      on:click={() => modSellSpeed = 'instant'}
    >
      Instant
    </button>
    <button
      class="profit-speed-btn"
      class:active={modSellSpeed === 'slow'}
      on:click={() => modSellSpeed = 'slow'}
    >
      Slow
    </button>
  </div>
</div>

      </div>
    </div>

    <!-- Task list -->
    <div class="profit-field">
      <label class="profit-label">Tasks</label>
      <div class="profit-task-list">
        {#each skillTasks as task}
          {@const p = calcProfit(task)}
          <button
            class="profit-task-row"
            class:active={selectedTask?.name === task.name}
            class:profit={p.profitPerHr >= 0}
            class:loss={p.profitPerHr < 0}
            on:click={() => selectedTask = selectedTask?.name === task.name ? null : task}
          >
            <div class="profit-task-left">
              <span class="profit-task-name">{formatItemName(task.name)}</span>
              <span class="profit-task-level">Lv. {task.level}</span>
            </div>
            <div class="profit-task-right">
              <span class="profit-task-phr" class:pos={p.profitPerHr >= 0} class:neg={p.profitPerHr < 0}>
                {p.profitPerHr >= 0 ? '+' : ''}{formatGold(p.profitPerHr)}/hr
              </span>
            </div>
          </button>

          {#if selectedTask?.name === task.name}
            <div class="profit-detail">
              <div class="profit-detail-row">
                <span>Actions/hr</span>
                <span>{Math.round(p.actionsPerHr).toLocaleString()}</span>
              </div>
              <div class="profit-detail-row">
                <span>Task time</span>
                <span>{calcTaskTime(task).toFixed(2)}s</span>
              </div>
              <div class="profit-detail-row">
                <span>Output value/hr</span>
                <span class="pos">+{formatGold(p.outputValue)}</span>
              </div>
              <div class="profit-detail-row">
                <span>Input cost/hr</span>
                <span class="neg">-{formatGold(p.inputCost)}</span>
              </div>
              <div class="profit-detail-row total">
                <span>Net profit/hr</span>
                <span class:pos={p.profitPerHr >= 0} class:neg={p.profitPerHr < 0}>
                  {p.profitPerHr >= 0 ? '+' : ''}{formatGold(p.profitPerHr)}
                </span>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>

  {/if}
{/if}


{#if activeTab === 'xp'}
  <div class="section-header">
    <button class="back-btn" on:click={() => { activeTab = 'calculators'; xpSelectedTask = null; }}>← Back</button>
    <span>XP Calculator</span>
  </div>

  {#if profitLoading}
    <div class="market-status">Loading tasks…</div>
  {:else}

    <!-- Skill selector -->
    <div class="profit-field">
      <label class="profit-label">Skill</label>
      <div class="profit-skill-grid">
        {#each profitSkills as skill}
          <button
            class="profit-skill-btn"
            class:active={xpSelectedSkill === skill}
            on:click={() => { xpSelectedSkill = skill; xpSelectedTask = null; }}
          >
            {skill}
          </button>
        {/each}
      </div>
    </div>

    <!-- Current XP and goal -->
    <div class="profit-field">
      <label class="profit-label">Goal</label>
      <div class="xp-goal-row">
        <div class="xp-goal-field">
          <span class="profit-mod-label">Current XP</span>
          <input
            class="profit-select"
            type="number"
            min="0"
            bind:value={xpCurrentXp}
            placeholder="0"
          />
        </div>
        <div class="xp-goal-field">
          <span class="profit-mod-label">Goal level</span>
          <input
            class="profit-select"
            type="number"
            min="1"
            max="120"
            bind:value={xpGoalLevel}
            placeholder="99"
          />
        </div>
      </div>
      {#if xpCurrentXp > 0}
        <span class="xp-current-level">
          Current level: {xpToLevel(xpCurrentXp)}
          · Goal XP: {formatGold(XP_TABLE[Math.min(xpGoalLevel, 120) - 1])}
        </span>
      {/if}
    </div>

    <!-- Modifiers -->
    <div class="profit-field">
      <label class="profit-label">Modifiers</label>
      <div class="profit-modifiers">

        <div class="profit-mod-row">
          <span class="profit-mod-label">Tool</span>
          <select class="profit-select" bind:value={modTool}>
            {#each TOOL_TIERS as t}
              <option value={t.value}>{t.label} ({t.value * 100}%)</option>
            {/each}
          </select>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Gear pieces</span>
          <select class="profit-select" bind:value={modGearPieces}>
            {#each [0,1,2,3] as n}
              <option value={n}>{n} piece{n !== 1 ? 's' : ''} ({n * 2}%)</option>
            {/each}
          </select>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Jewelry</span>
          <div class="profit-jewelry-row">
            <select class="profit-select" bind:value={modJewelryType}>
              {#each JEWELRY_TYPES as j}
                <option value={j.value}>{j.label}</option>
              {/each}
            </select>
            <select class="profit-select" bind:value={modJewelryPieces} disabled={modJewelryType === 0}>
              {#each [0,1,2,3,4] as n}
                <option value={n}>{n}pc</option>
              {/each}
            </select>
          </div>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Mastery cape</span>
          <select class="profit-select" bind:value={modCapeTier}>
            {#each CAPE_TIERS as c}
              <option value={c.value}>{c.label} ({c.value * 100}%)</option>
            {/each}
          </select>
        </div>

        <div class="profit-mod-row">
          <span class="profit-mod-label">Clan housing</span>
          <select class="profit-select" bind:value={modHousing}>
            {#each HOUSING_TIERS as h}
              <option value={h.value}>{h.label}</option>
            {/each}
          </select>
        </div>

        {#if GATHERING_SKILLS.includes(xpSelectedSkill)}
          <div class="profit-mod-row">
            <span class="profit-mod-label">Gatherers upgrade</span>
            <button
              class="profit-toggle"
              class:active={modGatherers}
              on:click={() => modGatherers = !modGatherers}
            >
              {modGatherers ? 'Yes' : 'No'}
            </button>
          </div>
        {/if}

      </div>
    </div>

    <!-- Task list -->
    <div class="profit-field">
      <label class="profit-label">Tasks</label>
      <div class="profit-task-list">
        {#each xpTasks as task}
          {@const x = calcXp(task)}
          <button
            class="profit-task-row"
            class:active={xpSelectedTask?.name === task.name}
            on:click={() => xpSelectedTask = xpSelectedTask?.name === task.name ? null : task}
          >
            <div class="profit-task-left">
              <span class="profit-task-name">{formatItemName(task.name)}</span>
              <span class="profit-task-level" class:req-fail={task.level > xpCurrentLevel}>Lv. {task.level}</span>
            </div>
            <div class="profit-task-right">
              <span class="profit-task-phr pos">{formatGold(x.xpPerHr)} xp/hr</span>
            </div>
          </button>

          {#if xpSelectedTask?.name === task.name}
            <div class="profit-detail">
              <div class="profit-detail-row">
                <span>Task time</span>
                <span>{calcTaskTime(task).toFixed(2)}s</span>
              </div>
              <div class="profit-detail-row">
                <span>XP per action</span>
                <span>{(task.exp * (1 + modHousing)).toFixed(1)}</span>
              </div>
              <div class="profit-detail-row">
                <span>Actions/hr</span>
                <span>{Math.round(3600 / calcTaskTime(task)).toLocaleString()}</span>
              </div>
              <div class="profit-detail-row total">
                <span>XP/hr</span>
                <span class="pos">{formatGold(x.xpPerHr)}</span>
              </div>
              {#if x.timeToGoal !== null}
                <div class="profit-detail-row total">
                  <span>Time to goal</span>
                  <span>{formatTime(x.timeToGoal)}</span>
                </div>
                <div class="profit-detail-row">
                  <span>Actions needed</span>
                  <span>{x.actionsToGoal?.toLocaleString()}</span>
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}
{/if}

  </div>


  <div class="footer">
    <span class="version">v{__APP_VERSION__}</span>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Nunito:wght@400;600;700&display=swap');

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
  :global(body) { background: #0e0f15; color: #c8cad4; font-family: 'Nunito', sans-serif; }
  :global(#app) { width: 100%; height: 100%; display: flex; justify-content: flex-start; padding: 0; margin: 0; }

  .sidebar {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0e0f15;
    overflow: hidden;
  }

  .header { padding: 16px 14px 12px; border-bottom: 1px solid #1a1c28; }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo-text { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 600; color: #e8b84b; letter-spacing: 0.5px;}

  .tabs { display: flex; padding: 8px 8px 0; gap: 2px; border-bottom: 1px solid #1a1c28; }
  .tab {
    flex: 1; background: none; border: none; border-bottom: 2px solid transparent;
    color: #555870; font-family: 'Nunito', sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.5px; padding: 6px 4px 8px; cursor: pointer;
    transition: color 0.15s, border-color 0.15s; text-transform: uppercase;
  }
  .tab:hover { color: #9098b8; }
  .tab.active { color: #e8b84b; border-bottom-color: #e8b84b; }

  .content { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px; scrollbar-width: thin; scrollbar-color: #1e2030 transparent; }

  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; font-size: 10px; font-weight: 700;
    letter-spacing: 1.2px; text-transform: uppercase; color: #3a3f58;
  }

  .scan-btn {
    background: none; border: 1px solid #1e2030; color: #3a3f58;
    width: 22px; height: 22px; border-radius: 4px; cursor: pointer;
    font-size: 13px; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; padding: 0;
  }
  .scan-btn:hover { border-color: #e8b84b55; color: #e8b84b; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 12px; text-align: center; }
  .empty-icon { font-size: 28px; opacity: 0.3; }
  .empty p { font-size: 13px; color: #4a5070; font-weight: 600; }
  .empty span { font-size: 11px; color: #474d6d; }

  .cards { display: flex; flex-direction: column; gap: 8px; }

  .card {
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 8px; padding: 10px; cursor: pointer; text-align: left;
    transition: border-color 0.15s, background 0.15s;
    display: flex; flex-direction: column; gap: 8px;
  }
  .card:hover { border-color: #e8b84b44; background: #161824; }
  .card.active { border-color: #e8b84b88; background: #161824; box-shadow: 0 0 12px #e8b84b11; }

  .card-top { display: flex; align-items: center; gap: 8px; }

  .avatar {
    width: 32px; height: 32px; border-radius: 6px;
    background: linear-gradient(135deg, #2a2d3e, #1a1c28);
    border: 1px solid #2a2d3e; display: flex; align-items: center; justify-content: center;
    font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; color: #e8b84b; flex-shrink: 0;
  }
  .avatar.ghost { color: #474d6d; border-color: #1e2030; }

  .card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-size: 13px; font-weight: 700; color: #d0d4e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-name.muted { color: #3a3f58; }
  .card-clan { font-size: 10px; color: #3a3f58; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loading-text { color: #474d6d; font-style: italic; }
  .error-text { color: #7a3a3a; }

  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; box-shadow: 0 0 6px #4ade8088; }
  .status-dot.offline { background: #555870; box-shadow: none; }

  .card-stats { display: flex; align-items: center; background: #0c0d13; border-radius: 5px; padding: 6px 8px; }
  .stat { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .stat-label { font-size: 8px; font-weight: 700; letter-spacing: 0.8px; color: #474d6d; text-transform: uppercase; }
  .stat-value { font-size: 11px; font-weight: 700; color: #8890b0; }
  .stat-value.activity { color: #e8b84b; font-size: 10px; }
  .stat-divider { width: 1px; height: 20px; background: #1e2030; flex-shrink: 0; }

  .placeholder-list { display: flex; flex-direction: column; gap: 4px; }
  .placeholder-item { display: flex; align-items: center; gap: 10px; padding: 10px; background: #13151f; border: 1px solid #1e2030; border-radius: 7px; font-size: 12px; font-weight: 600; color: #3a3f58; }
  .placeholder-icon { font-size: 14px; }
  .coming-soon { text-align: center; font-size: 10px; color: #2a2d3e; letter-spacing: 1px; text-transform: uppercase; padding: 8px 0 4px; }

  .footer { padding: 8px 14px; border-top: 1px solid #1a1c28; display: flex; justify-content: flex-end; }
  .version { font-size: 10px; color: #2a2d3e; letter-spacing: 0.5px; }

  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    background: #1a2a1a;
    border-bottom: 1px solid #2a4a2a;
    font-size: 12px;
    color: #4ade80;
    font-weight: 600;
  }

  .restart-btn {
    background: #2a4a2a;
    border: 1px solid #4ade8044;
    color: #4ade80;
    padding: 3px 10px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    width: auto;
  }
  .restart-btn:hover {
    background: #3a5a3a;
    border-color: #4ade80;
  }

  .card-preview {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 4px;
    overflow: hidden;
    background: #0c0d13;
  }
  .card-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .preview-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #474d6d;
  }
  .logo-image {
    width: 22px;
    height: 22px;
    object-fit: contain;
  }
  .market-search-wrap { position: relative; margin-bottom: 8px; }

  .market-input {
    width: 100%;
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 6px;
    color: #c8cad4;
    font-size: 12px;
    padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
    padding-right: 28px;
  }
  .market-input:focus { outline: none; border-color: #e8b84b55; }

  .market-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0; right: 0;
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 6px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
    scrollbar-width: thin;
    scrollbar-color: #1e2030 transparent;
  }

  .market-suggestion {
    width: 100%;
    background: none;
    border: none;
    border-bottom: 1px solid #1a1c28;
    color: #8890b0;
    font-size: 11px;
    padding: 7px 10px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    border-radius: 0;
    font-family: 'Nunito', sans-serif;
  }
  .market-suggestion:last-child { border-bottom: none; }
  .market-suggestion:hover { background: #1a1c28; color: #e8b84b; }

  .market-status { text-align: center; font-size: 11px; color: #3a3f58; padding: 16px 0; }
  .market-status.error { color: #7a3a3a; }

  .market-section-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: #3a3f58;
    margin: 10px 0 5px;
  }

  .market-avg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 4px; }
  .market-avg-box {
    background: #13151f; border: 1px solid #1e2030;
    border-radius: 6px; padding: 7px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .market-avg-label { font-size: 8px; color: #474d6d; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
  .market-avg-val { font-size: 12px; font-weight: 700; color: #e8b84b; }

  .market-table { display: flex; flex-direction: column; gap: 2px; margin-bottom: 4px; }
  .market-table-head {
    display: flex; justify-content: space-between;
    font-size: 8px; font-weight: 700; letter-spacing: 0.5px;
    color: #474d6d; text-transform: uppercase;
    padding: 0 8px; margin-bottom: 2px;
  }
  .market-table-row {
    display: flex; justify-content: space-between;
    background: #13151f; border: 1px solid #1e2030;
    border-radius: 5px; padding: 5px 8px;
    font-size: 11px; font-weight: 600;
  }
  .market-table-row.buy { color: #e05555; border-left: 2px solid #e0555544; }
  .market-table-row.sell { color: #4ade80; border-left: 2px solid #4ade8044; }

  :global(::-webkit-scrollbar) {
    width: 4px;
  }
  :global(::-webkit-scrollbar-track) {
    background: transparent;
  }
  :global(::-webkit-scrollbar-thumb) {
    background: #1e2030;
    border-radius: 4px;
  }
  :global(::-webkit-scrollbar-thumb:hover) {
    background: #2a2d3e;
  }
  .market-search-wrap { position: relative; margin-bottom: 8px; }

  .market-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #3a3f58;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.15s;
    width: auto;
  }
  .market-clear:hover { color: #e8b84b; }

  .market-books {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .market-book {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .market-book .market-section-label {
    text-align: center;
  }
  .sell-label { color: #4ade80; }
  .buy-label { color: #e05555; }

  .calc-list { display: flex; flex-direction: column; gap: 6px; }

  .calc-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 8px; padding: 10px 12px; cursor: pointer;
    text-align: left; transition: border-color 0.15s, background 0.15s;
  }
  .calc-item:hover { border-color: #e8b84b44; background: #161824; }

  .calc-item-icon { font-size: 18px; flex-shrink: 0; }
  .calc-item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .calc-item-name { font-size: 12px; font-weight: 700; color: #d0d4e8; }
  .calc-item-desc { font-size: 10px; color: #3a3f58; }
  .calc-item-arrow { font-size: 18px; color: #3a3f58; }

  .back-btn {
    background: none;
    border: 1px solid #1e2030;
    color: #555870;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
    width: auto;
  }
  .back-btn:hover { border-color: #e8b84b55; color: #e8b84b; }

  .profit-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .profit-label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #3a3f58; }

  .profit-skill-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .profit-skill-btn {
    background: #13151f; border: 1px solid #1e2030; color: #555870;
    font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .profit-skill-btn:hover { border-color: #e8b84b44; color: #9098b8; }
  .profit-skill-btn.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .profit-modifiers { display: flex; flex-direction: column; gap: 6px; }
  .profit-mod-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .profit-mod-label { font-size: 11px; color: #555870; flex-shrink: 0; }

  .profit-select {
    background: #13151f; border: 1px solid #1e2030; border-radius: 5px;
    color: #c8cad4; font-size: 11px; padding: 4px 6px;
    cursor: pointer; flex: 1; min-width: 0;
    font-family: 'Nunito', sans-serif;
  }
  .profit-select:focus { outline: none; border-color: #e8b84b55; }

  .profit-jewelry-row { display: flex; gap: 4px; flex: 1; }

  .profit-toggle {
    background: #13151f; border: 1px solid #1e2030; color: #555870;
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .profit-toggle.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .profit-task-list { display: flex; flex-direction: column; gap: 3px; }
  .profit-task-row {
    display: flex; justify-content: space-between; align-items: center;
    background: #13151f; border: 1px solid #1e2030; border-radius: 6px;
    padding: 7px 10px; cursor: pointer; transition: all 0.15s;
    width: 100%; text-align: left; border-left: 2px solid transparent;
  }
  .profit-task-row:hover { background: #161824; }
  .profit-task-row.active { background: #161824; border-color: #e8b84b44; }
  .profit-task-row.profit { border-left-color: #4ade8044; }
  .profit-task-row.loss { border-left-color: #e0555544; }

  .profit-task-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .profit-task-name { font-size: 11px; font-weight: 700; color: #d0d4e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .profit-task-level { font-size: 9px; color: #3a3f58; }
  .profit-task-right { flex-shrink: 0; }
  .profit-task-phr { font-size: 11px; font-weight: 700; }
  .profit-task-phr.pos { color: #4ade80; }
  .profit-task-phr.neg { color: #e05555; }

  .profit-detail {
    background: #0c0d13; border: 1px solid #1e2030; border-radius: 6px;
    padding: 8px 10px; margin-top: -1px; display: flex; flex-direction: column; gap: 5px;
  }
  .profit-detail-row {
    display: flex; justify-content: space-between;
    font-size: 11px; color: #555870;
  }
  .profit-detail-row.total {
    border-top: 1px solid #1e2030; padding-top: 5px; margin-top: 2px;
    font-weight: 700; color: #8890b0;
  }
  .pos { color: #4ade80; }
  .neg { color: #e05555; }

  .profit-speed-row { display: flex; gap: 4px; flex: 1; }
  .profit-speed-btn {
    flex: 1; background: #13151f; border: 1px solid #1e2030;
    color: #555870; font-size: 11px; font-weight: 600;
    padding: 4px 8px; border-radius: 5px; cursor: pointer;
    transition: all 0.15s; width: auto;
  }
  .profit-speed-btn:hover { border-color: #e8b84b44; color: #9098b8; }
  .profit-speed-btn.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .xp-goal-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .xp-goal-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .xp-current-level {
    font-size: 10px;
    color: #3a3f58;
  }
  .req-fail { color: #863131; }
</style>