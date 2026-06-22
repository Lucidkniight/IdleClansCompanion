<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Profit Calculator',
    desc: 'Profit per hour for any task',
    icon: './itemicons/gold.png',
    author: 'Lucid',
  };
</script>

<script lang="ts">
import { onMount, tick } from 'svelte';
import {
  profitTasks, profitSkills, priceCache, clients, allEquipment, allItems,
  loadGameConfig, GATHERING_SKILLS, formatItemName, formatGold, navigate, xpToLevel,
  fetchProfile, fetchClanProfile,
  type Task, type ClientCard, type PlayerProfile, type ClanProfile,
} from '../lib/store';
import CustomSelect from '../lib/CustomSelect.svelte';
import DevPanel from '../lib/DevPanel.svelte';

function focusOnMount(node: HTMLElement) {
  tick().then(() => node.focus());
}

const TOOL_TIERS = [
  { label: 'None',               value: 0 },
  { label: 'Normal (4%)',        value: 0.04 },
  { label: 'Refined (6%)',       value: 0.06 },
  { label: 'Great (8%)',         value: 0.08 },
  { label: 'Elite (10%)',        value: 0.10 },
  { label: 'Superior (12%)',     value: 0.12 },
  { label: 'Outstanding (15%)',  value: 0.15 },
  { label: 'Godlike (20%)',      value: 0.20 },
  { label: 'Otherworldly (25%)', value: 0.25 },
];

const CAPE_TIERS = [
  { label: 'None',     value: 0 },
  { label: 'T1 (5%)',  value: 0.05 },
  { label: 'T2 (10%)', value: 0.10 },
  { label: 'T3 (15%)', value: 0.15 },
  { label: 'T4 (20%)', value: 0.20 },
];

const GEAR_PIECES_OPTIONS = [0,1,2,3].map(n => ({ label: `${n} piece${n !== 1 ? 's' : ''} (${n * 2}%)`, value: n }));

const JEWELRY_TYPES = [
  { short: '—', label: 'None',         value: 0 },
  { short: 'C', label: 'Common',       value: 0.015 },
  { short: 'R', label: 'Rare',         value: 0.035 },
  { short: 'E', label: 'Exceptional',  value: 0.05 },
];

const FISHERMAN_TIERS = [
  { label: 'None',      value: 0 },
  { label: 'T1 — 20%', value: 0.20 },
  { label: 'T2 — 40%', value: 0.40 },
  { label: 'T3 — 60%', value: 0.60 },
  { label: 'T4 — 80%', value: 0.80 },
  { label: 'T5 — 100%',value: 1.00 },
];

const LUMBERJACK_TIERS = [
  { label: 'None',      value: 0 },
  { label: 'T1 — 20%', value: 0.20 },
  { label: 'T2 — 40%', value: 0.40 },
  { label: 'T3 — 60%', value: 0.60 },
  { label: 'T4 — 80%', value: 0.80 },
  { label: 'T5 — 100%',value: 1.00 },
];

const POWER_FORAGER_TIERS = [
  { label: 'None',      value: 0 },
  { label: 'T1 — 10%', value: 0.10 },
  { label: 'T2 — 20%', value: 0.20 },
  { label: 'T3 — 30%', value: 0.30 },
  { label: 'T4 — 40%', value: 0.40 },
  { label: 'T5 — 50%', value: 0.50 },
];

const FARMING_TRICKERY_TIERS = [
  { label: 'None',      value: 0 },
  { label: 'T1 — 10%', value: 0.10 },
  { label: 'T2 — 20%', value: 0.20 },
  { label: 'T3 — 30%', value: 0.30 },
  { label: 'T4 — 40%', value: 0.40 },
  { label: 'T5 — 50%', value: 0.50 },
];

const PLANK_BARGAIN_TIERS = [
  { label: 'None',       value: 0 },
  { label: 'T1 — 30%',  value: 0.30 },
  { label: 'T2 — 60%',  value: 0.60 },
  { label: 'T3 — 100%', value: 1.00 },
];

const SMELTING_MAGIC_TIERS = [
  { label: 'None',      value: 0 },
  { label: 'T1 — 10%', value: 0.10 },
  { label: 'T2 — 20%', value: 0.20 },
  { label: 'T3 — 30%', value: 0.30 },
];

let loading = false;
let selectedSkill = '';
let selectedTask: Task | null = null;

let modTool = 0;
let modGearPieces = 0;
let modJewelry0 = 0;
let modJewelry1 = 0;
let modJewelry2 = 0;
let modJewelry3 = 0;
let modCapeTier = 0;
let modGatherers = false;
let modGloves = false;
let modFishermanTier = 0;
let modLumberjackTier = 0;
let modPowerForagerTier = 0;
let modFarmingTrickeryTier = 0;
let modPlankBargainTier = 0;
let modSmeltingMagicTier = 0;
let modArrowCrafter = false;
let modDelicateManufacturing = false;
type Speed = 'instant' | 'slow';
let modSellSpeed: Speed = 'instant';
let modBuySpeed: Speed = 'instant';
let currentLevel = 120;

let showFilterMenu = false;
let filterHideLocked = false;
let filterHideUnprofitable = false;
let filterHideGear = false;
let filterHideNoMarketData = false;
let filterHideInputRequired = false;
let filterHideUnrealistic = false;

$: activeFilterCount = [filterHideLocked, filterHideUnprofitable, filterHideGear, filterHideNoMarketData, filterHideInputRequired, filterHideUnrealistic].filter(Boolean).length;

const _PROFIT_MODS_KEY = 'icc-profit-mods';
const _profitSkillMods: Record<string, { modTool: number; modGearPieces: number; modJewelry: number[]; modCapeTier: number; modGatherers: boolean; modGloves: boolean; modSellSpeed: Speed; modBuySpeed: Speed; currentLevel: number; modFishermanTier?: number; modLumberjackTier?: number; modPowerForagerTier?: number; modFarmingTrickeryTier?: number; modPlankBargainTier?: number; modSmeltingMagicTier?: number; modArrowCrafter?: boolean; modDelicateManufacturing?: boolean }> = (() => {
  try { return JSON.parse(localStorage.getItem(_PROFIT_MODS_KEY) ?? '{}'); } catch { return {}; }
})();
const _defaultProfitMods = () => ({ modTool: 0, modGearPieces: 0, modJewelry: [0, 0, 0, 0], modCapeTier: 0, modGatherers: false, modGloves: false, modSellSpeed: 'instant' as Speed, modBuySpeed: 'instant' as Speed, currentLevel: 120, modFishermanTier: 0, modLumberjackTier: 0, modPowerForagerTier: 0, modFarmingTrickeryTier: 0, modPlankBargainTier: 0, modSmeltingMagicTier: 0, modArrowCrafter: false, modDelicateManufacturing: false });

$: if (selectedSkill) {
  const _m = _profitSkillMods[selectedSkill] ?? _defaultProfitMods();
  modTool = _m.modTool; modGearPieces = _m.modGearPieces;
  modCapeTier = _m.modCapeTier; modGatherers = _m.modGatherers;
  modGloves = _m.modGloves;
  modFishermanTier = _m.modFishermanTier ?? 0;
  modLumberjackTier = _m.modLumberjackTier ?? 0;
  modPowerForagerTier = _m.modPowerForagerTier ?? 0;
  modFarmingTrickeryTier = _m.modFarmingTrickeryTier ?? 0;
  modPlankBargainTier = _m.modPlankBargainTier ?? 0;
  modSmeltingMagicTier = _m.modSmeltingMagicTier ?? 0;
  modArrowCrafter = _m.modArrowCrafter ?? false;
  modDelicateManufacturing = _m.modDelicateManufacturing ?? false;
  modSellSpeed = _m.modSellSpeed === 'slow' ? 'slow' : 'instant';
  modBuySpeed = _m.modBuySpeed === 'slow' ? 'slow' : 'instant';
  currentLevel = _m.currentLevel ?? 120;
  const _j: number[] = (_m as any).modJewelry ?? (() => {
    const t = (_m as any).modJewelryType ?? 0;
    const p = Math.min((_m as any).modJewelryPieces ?? 0, 4);
    return [p > 0 ? t : 0, p > 1 ? t : 0, p > 2 ? t : 0, p > 3 ? t : 0];
  })();
  modJewelry0 = _j[0] ?? 0; modJewelry1 = _j[1] ?? 0;
  modJewelry2 = _j[2] ?? 0; modJewelry3 = _j[3] ?? 0;
}

$: if (selectedSkill) {
  _profitSkillMods[selectedSkill] = { modTool, modGearPieces, modJewelry: [modJewelry0, modJewelry1, modJewelry2, modJewelry3], modCapeTier, modGatherers, modGloves, modSellSpeed, modBuySpeed, currentLevel, modFishermanTier, modLumberjackTier, modPowerForagerTier, modFarmingTrickeryTier, modPlankBargainTier, modSmeltingMagicTier, modArrowCrafter, modDelicateManufacturing };
  try { localStorage.setItem(_PROFIT_MODS_KEY, JSON.stringify(_profitSkillMods)); } catch {}
}

$: if (selectedSkill && lastImportedProfile) _applyProfile(lastImportedProfile, selectedSkill.toLowerCase(), lastImportedClanProfile);

onMount(async () => {
  if ($profitTasks.length === 0) {
    loading = true;
    await loadGameConfig();
    loading = false;
  }
  if (!selectedSkill) selectedSkill = $profitSkills[0] ?? '';
});

function calcTaskTime(task: Task): number {
  const totalSpeedBoost = modGearPieces * 0.02 + modJewelry0 + modJewelry1 + modJewelry2 + modJewelry3 + modTool + modCapeTier;
  const gathererBoost = (modGatherers && GATHERING_SKILLS.includes(task.skill)) ? 0.05 : 0;
  return Math.max(task.baseTime * (1 - gathererBoost) * (1 - totalSpeedBoost), 100) / 1000;
}

function calcProfit(task: Task) {
  const actionsPerHr = 3600 / calcTaskTime(task);
  const cache = $priceCache;
  const glovesMult = (modGloves && selectedSkill !== 'Agility') ? 1.05 : 1;
  const fishermanMult = (selectedSkill === 'Fishing' && modFishermanTier > 0) ? 1 + modFishermanTier : 1;
  const lumberjackMult = (selectedSkill === 'Woodcutting' && modLumberjackTier > 0) ? 1 + modLumberjackTier : 1;
  const powerForagerMult = (selectedSkill === 'Foraging' && modPowerForagerTier > 0) ? 1 + modPowerForagerTier : 1;
  const farmingTrickerySaveMult = (selectedSkill === 'Farming' && modFarmingTrickeryTier > 0) ? 1 - modFarmingTrickeryTier : 1;
  const plankBargainSaveMult = (selectedSkill === 'Carpentry' && modPlankBargainTier > 0) ? 1 - modPlankBargainTier : 1;
  const smeltingMagicSaveMult = (selectedSkill === 'Smithing' && modSmeltingMagicTier > 0) ? 1 - modSmeltingMagicTier : 1;
  const arrowCrafterMult = (selectedSkill === 'Crafting' && modArrowCrafter) ? 1.10 : 1;
  const delicateMfgSaveMult = (selectedSkill === 'Crafting' && modDelicateManufacturing) ? 0.80 : 1;
  const sellPrice = (id: number) => modSellSpeed === 'instant' ? (cache[id]?.highestBuy ?? 0) : (cache[id]?.lowestSell ?? 0);
  const buyPrice  = (id: number) => modBuySpeed  === 'instant' ? (cache[id]?.lowestSell  ?? 0) : (cache[id]?.highestBuy ?? 0);
  const outputValue = task.itemReward !== -1
    ? sellPrice(task.itemReward) * task.itemAmount * actionsPerHr * glovesMult * fishermanMult * lumberjackMult * powerForagerMult * arrowCrafterMult
    : 0;
  const inputCost = task.costs.reduce((s, c) => s + buyPrice(c.Item) * c.Amount * actionsPerHr, 0) * farmingTrickerySaveMult * plankBargainSaveMult * smeltingMagicSaveMult * delicateMfgSaveMult;
  return { outputValue, inputCost, profitPerHr: outputValue - inputCost, actionsPerHr };
}

$: skillTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modGloves, modSellSpeed, modBuySpeed, currentLevel, modFishermanTier, modLumberjackTier, modPowerForagerTier, modFarmingTrickeryTier, modPlankBargainTier, modSmeltingMagicTier, modArrowCrafter, modDelicateManufacturing, filterHideLocked, filterHideUnprofitable, filterHideGear, filterHideNoMarketData, filterHideInputRequired, filterHideUnrealistic, equipmentItemIds];
  const cache = $priceCache;
  return $profitTasks
    .filter(t => t.skill === selectedSkill && t.hasProfitValue)
    .filter(t => {
      if (filterHideLocked && t.level > currentLevel) return false;
      if (filterHideGear && equipmentItemIds.has(t.itemReward)) return false;
      if (filterHideNoMarketData && (t.itemReward === -1 || !cache[t.itemReward] || (cache[t.itemReward].highestBuy === 0 && cache[t.itemReward].lowestSell === 0))) return false;
      if (filterHideInputRequired && t.costs.length > 0) return false;
      return true;
    })
    .sort((a, b) => {
      const aLocked = a.level > currentLevel ? 1 : 0;
      const bLocked = b.level > currentLevel ? 1 : 0;
      if (aLocked !== bLocked) return aLocked - bLocked;
      return calcProfit(b).profitPerHr - calcProfit(a).profitPerHr;
    })
    .filter(t => {
      const profit = calcProfit(t).profitPerHr;
      if (filterHideUnprofitable && profit < 0) return false;
      if (filterHideUnrealistic && profit > 1_000_000) return false;
      return true;
    });
})();

$: hasSkillSpecific = ['Fishing', 'Woodcutting', 'Foraging', 'Farming', 'Carpentry', 'Smithing', 'Crafting'].includes(selectedSkill);

$: clientsWithProfile = $clients.filter(c => c.playerName && c.profile?.skillExperiences);

let importModalOpen = false;
let importLevel = true;
let importUpgrades = true;
let importEquipment = true;
let importSearch = '';
let importLoading = false;
let importError = '';
let importFilledFields = new Set<string>();
let _importFillTimer: ReturnType<typeof setTimeout>;
let lastImportedProfile: PlayerProfile | null = null;
let lastImportedClanProfile: ClanProfile | null = null;
let importedPlayerName: string | null = null;
let refreshCooldown = false;
let _refreshTimer: ReturnType<typeof setTimeout>;

function openImportModal() { importModalOpen = true; importSearch = ''; importError = ''; }
function closeImportModal() { importModalOpen = false; importSearch = ''; importLoading = false; }
function clearImport() {
  lastImportedProfile = null; lastImportedClanProfile = null; importedPlayerName = null;
  clearTimeout(_refreshTimer); refreshCooldown = false;
}

async function refreshImport() {
  if (!importedPlayerName || refreshCooldown) return;
  refreshCooldown = true;
  clearTimeout(_refreshTimer);
  _refreshTimer = setTimeout(() => { refreshCooldown = false; }, 30000);
  try {
    const profile = await fetchProfile(importedPlayerName);
    if (!profile) return;
    const clanProfile = profile.guildName ? await fetchClanProfile(profile.guildName) : null;
    doImport(profile, clanProfile);
  } catch {}
}

const PLANK_BARGAIN_MAP = [0, 0.30, 0.60, 1.00];

const _TIER_MAP: [string, string, number][] = [
  ['normal_','Normal',0.04],['refined_','Refined',0.06],['great_','Great',0.08],
  ['elite_','Elite',0.10],['superior_','Superior',0.12],['outstanding_','Outstanding',0.15],
  ['godlike_','Godlike',0.20],['otherworldly_','Otherworldly',0.25],
];
const _SKILL_TOOL: Record<string, string> = {
  cooking: 'cooking_pan', crafting: 'crafting_needle', fishing: 'fishing_rod',
  smithing: 'hammer', woodcutting: 'hatchet', agility: 'jumping_rope',
  plundering: 'lockpicks', brewing: 'philosopher_stone', mining: 'pickaxe',
  farming: 'rake', carpentry: 'saw', foraging: 'secateurs', invocation: 'brush',
};
const _JEWELRY_SLOTS: [string, string, number][] = [
  ['jewellery','Ring',0],['amulet','Amulet',1],['bracelet','Bracelet',2],['earrings','Earrings',3],
];

function _applyProfile(profile: PlayerProfile, skillLower: string, clanProfile?: ClanProfile | null) {
  if (importLevel) {
    currentLevel = xpToLevel(profile.skillExperiences?.[skillLower] ?? 0);
  }
  if (importUpgrades) {
    const upgs = profile.upgrades ?? {};
    modFishermanTier = Math.min(upgs['theFisherman'] ?? 0, 5) * 0.20;
    modLumberjackTier = Math.min(upgs['theLumberjack'] ?? 0, 5) * 0.20;
    modPowerForagerTier = Math.min(upgs['powerForager'] ?? 0, 5) * 0.10;
    modFarmingTrickeryTier = Math.min(upgs['farmingTrickery'] ?? 0, 5) * 0.10;
    modPlankBargainTier = PLANK_BARGAIN_MAP[Math.min(upgs['plankBargain'] ?? 0, 3)] ?? 0;
    modSmeltingMagicTier = Math.min(upgs['smeltingMagic'] ?? 0, 3) * 0.10;
    modArrowCrafter = (upgs['arrowCrafter'] ?? 0) > 0;
    modDelicateManufacturing = (upgs['delicateManufacturing'] ?? 0) > 0;
    try {
      const clanUpgIds: number[] = clanProfile?.serializedUpgrades ? JSON.parse(clanProfile.serializedUpgrades) : [];
      modGatherers = clanUpgIds.includes(23);
    } catch { modGatherers = false; }
  }
  if (importEquipment) {
    modTool = 0; modGearPieces = 0; modCapeTier = 0;
    modJewelry0 = 0; modJewelry1 = 0; modJewelry2 = 0; modJewelry3 = 0;
    const rawBoost = profile.enchantmentBoosts?.[skillLower] ?? 0;
    const totalJewelryPct = rawBoost > 1 ? rawBoost / 100 : rawBoost;
    const jSlots = [0, 0, 0, 0];
    if (totalJewelryPct > 0.001) {
      const _JTIERS = [0.05, 0.035, 0.015] as const;
      let jDone = false;
      for (const jt of _JTIERS) {
        const n = Math.round(totalJewelryPct / jt);
        if (n > 0 && n <= 4 && Math.abs(n * jt - totalJewelryPct) < 0.003) {
          for (let i = 0; i < n; i++) jSlots[i] = jt;
          jDone = true; break;
        }
      }
      if (!jDone) {
        let rem = totalJewelryPct;
        for (let i = 0; i < 4 && rem > 0.003; i++) {
          for (const jt of _JTIERS) {
            if (rem >= jt - 0.003) { jSlots[i] = jt; rem = Math.round((rem - jt) * 1000) / 1000; break; }
          }
        }
      }
    }
    [modJewelry0, modJewelry1, modJewelry2, modJewelry3] = jSlots;
    if (profile.equipment) {
      const equip = profile.equipment;
      const items = $allItems;
      const eqData = $allEquipment;
      const cleanName = (id: number) => {
        const n = items.find(i => i.id === id)?.name ?? '';
        return n.endsWith('_enchanted') ? n.slice(0, -10) : n;
      };
      const getEq = (id: number) => { const n = cleanName(id); return eqData.find(e => e.name === n) ?? null; };
      const toolSuffix = _SKILL_TOOL[skillLower];
      let detectedSkillId: number | null = null;
      outer: for (const id of Object.values(equip)) {
        const n = cleanName(id);
        if (!toolSuffix) continue;
        for (const [pfx, , tier] of _TIER_MAP) {
          if (n === pfx + toolSuffix) {
            modTool = tier;
            const eq = getEq(id);
            if (eq && eq.skillBoostPct > 0) detectedSkillId = eq.skillBoostSkill;
            break outer;
          }
        }
      }
      const matchesSkill = (id: number) => {
        const eq = getEq(id);
        if (!eq || eq.skillBoostPct === 0) return false;
        return detectedSkillId !== null ? eq.skillBoostSkill === detectedSkillId : cleanName(id).includes(skillLower);
      };
      const capeId = equip['cape'];
      if (capeId) {
        const n = cleanName(capeId);
        if (n.includes(skillLower) && n.includes('_cape_tier_')) {
          modCapeTier = n.includes('_tier_4') ? 0.20 : n.includes('_tier_3') ? 0.15 : n.includes('_tier_2') ? 0.10 : 0.05;
        }
      }
      let gear = 0;
      for (const slot of ['head','body','legs']) {
        const id = equip[slot];
        if (id && matchesSkill(id)) gear++;
      }
      modGearPieces = Math.min(gear, 3);
    }
  }
}

function doImport(profile: PlayerProfile, clanProfile: ClanProfile | null = null) {
  _applyProfile(profile, selectedSkill.toLowerCase(), clanProfile);
  const filled = new Set<string>();
  if (importUpgrades) {
    if (modFishermanTier > 0) filled.add('fisherman');
    if (modLumberjackTier > 0) filled.add('lumberjack');
    if (modPowerForagerTier > 0) filled.add('powerForager');
    if (modFarmingTrickeryTier > 0) filled.add('farmingTrickery');
    if (modPlankBargainTier > 0) filled.add('plankBargain');
    if (modSmeltingMagicTier > 0) filled.add('smeltingMagic');
    if (modArrowCrafter) filled.add('arrowCrafter');
    if (modDelicateManufacturing) filled.add('delicateManufacturing');
    if (modGatherers) filled.add('gatherers');
  }
  if (importEquipment) {
    if (modTool > 0) filled.add('tool');
    if (modGearPieces > 0) filled.add('gear');
    if (modJewelry0 > 0) filled.add('jewelry0');
    if (modJewelry1 > 0) filled.add('jewelry1');
    if (modJewelry2 > 0) filled.add('jewelry2');
    if (modJewelry3 > 0) filled.add('jewelry3');
    if (modCapeTier > 0) filled.add('cape');
  }
  lastImportedProfile = profile;
  lastImportedClanProfile = clanProfile;
  importedPlayerName = profile.username ?? null;
  importFilledFields = filled;
  clearTimeout(_importFillTimer);
  _importFillTimer = setTimeout(() => { importFilledFields = new Set(); }, 2000);
  closeImportModal();
}

async function doImportBySearch(name: string) {
  const n = name.trim();
  if (!n || importLoading) return;
  importLoading = true;
  importError = '';
  try {
    const profile = await fetchProfile(n);
    if (!profile) { importError = 'Player not found'; return; }
    const clanProfile = profile.guildName ? await fetchClanProfile(profile.guildName) : null;
    doImport(profile, clanProfile);
  } catch {
    importError = 'Failed to load';
  } finally {
    importLoading = false;
  }
}

async function doImportFromClient(client: ClientCard) {
  if (!client.profile) return;
  const clanProfile = client.profile.guildName ? await fetchClanProfile(client.profile.guildName) : null;
  doImport(client.profile, clanProfile);
}

const TASK_IMAGE_OVERRIDE: Record<string, string> = {
  // Fishing → raw fish
  piranha: 'raw_piranha', perch: 'raw_perch', mackerel: 'raw_mackerel',
  cod: 'raw_cod', trout: 'raw_trout', salmon: 'raw_salmon',
  carp: 'raw_carp', zander: 'raw_zander', pufferfish: 'raw_pufferfish',
  anglerfish: 'raw_anglerfish', tuna: 'raw_tuna', sea_serpent: 'raw_sea_serpent',
  // Woodcutting → logs
  spruce: 'spruce_log', pine: 'pine_log', oak: 'oak_log', maple: 'maple_log',
  teak: 'teak_log', chestnut: 'chestnut_log', mahogany: 'mahogany_log',
  yew: 'yew_log', redwood: 'redwood_log', magical: 'magical_log', ignis: 'ignis_log',
  // Crafting weapons → gemstones
  refined_weapon: 'refined_gemstone', great_weapon: 'great_gemstone',
  elite_weapon: 'elite_gemstone', superior_weapon: 'superior_gemstone',
  outstanding_weapon: 'outstanding_gemstone', godlike_weapon: 'godlike_gemstone',
  otherworldly_item: 'otherworldly_ore',
  // Enchanting → woodcutting scrolls
  common_enchantment: 'common_scroll_of_woodcutting',
  rare_enchantment: 'rare_scroll_of_woodcutting',
  exceptional_enchantment: 'exceptional_scroll_of_woodcutting',
};

$: equipmentItemIds = new Set($allEquipment.map(e => e.id));

let _tipText = '';
let _tipX = 0;
let _tipY = 0;
let _tipVisible = false;
function showTip(e: MouseEvent, text: string) { _tipText = text; _tipX = e.clientX; _tipY = e.clientY; _tipVisible = true; }
function moveTip(e: MouseEvent) { _tipX = e.clientX; _tipY = e.clientY; }
function hideTip() { _tipVisible = false; }
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Tasks loaded</span><span class="dev-val">{$profitTasks.length}</span></div>
  <div class="dev-row"><span class="dev-key">Cache size</span><span class="dev-val">{Object.keys($priceCache).length} items</span></div>
  <div class="dev-row"><span class="dev-key">Selected skill</span><span class="dev-val">{selectedSkill || '—'}</span></div>
  <div class="dev-row"><span class="dev-key">Storage key</span><span class="dev-val">icc-profit-mods</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Config API</span><span class="dev-val">/Configuration/game-data</span></div>
  <div class="dev-row"><span class="dev-key">Prices API</span><span class="dev-val">/PlayerMarket/items/prices/latest</span></div>
</DevPanel>

{#if loading}
  <div class="status">Loading tasks…</div>
{:else}

  {#if importedPlayerName}
    <div class="import-active">
      <span class="import-name">{importedPlayerName}</span>
      <button class="import-refresh" on:click={refreshImport} disabled={refreshCooldown} title="Refresh player data">↺</button>
      <button class="import-clear" on:click={clearImport}>×</button>
    </div>
  {:else}
    <button class="top-import-btn" on:click={openImportModal}>Import Player Data</button>
  {/if}

  <div class="field">
    <label class="label">Skill</label>
    <CustomSelect bind:value={selectedSkill} options={$profitSkills.map(s => ({ label: s, value: s, icon: `./skilltaskicons/${s}.png` }))} on:change={() => selectedTask = null} />
  </div>

  <div class="field">
    <label class="label">Current Level</label>
    <div class="mod-row">
      <span class="mod-label">Level</span>
      <input class="select" type="number" min="1" max="120" bind:value={currentLevel} />
    </div>
  </div>

  <div class="field">
    <label class="label">Modifiers</label>
    <div class="modifiers">

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Your equipped tool tier. Higher tiers reduce task completion time.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Tool</span>
        <CustomSelect bind:value={modTool} options={TOOL_TIERS} autofill={importFilledFields.has('tool')} />
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Skill-specific gear pieces worn. Each piece reduces task time by 2%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gear pieces</span>
        <CustomSelect bind:value={modGearPieces} options={GEAR_PIECES_OPTIONS} autofill={importFilledFields.has('gear')} />
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Jewelry slots. Each piece reduces task time — Common 1.5%, Rare 3.5%, Exceptional 5%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Jewelry</span>
        <div class="jewelry-slots">
          <CustomSelect bind:value={modJewelry0} options={JEWELRY_TYPES} compact autofill={importFilledFields.has('jewelry0')} />
          <CustomSelect bind:value={modJewelry1} options={JEWELRY_TYPES} compact autofill={importFilledFields.has('jewelry1')} />
          <CustomSelect bind:value={modJewelry2} options={JEWELRY_TYPES} compact autofill={importFilledFields.has('jewelry2')} />
          <CustomSelect bind:value={modJewelry3} options={JEWELRY_TYPES} compact autofill={importFilledFields.has('jewelry3')} />
        </div>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Mastery cape tier. Reduces task completion time.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Mastery cape</span>
        <CustomSelect bind:value={modCapeTier} options={CAPE_TIERS} autofill={importFilledFields.has('cape')} />
      </div>

      {#if GATHERING_SKILLS.includes(selectedSkill)}
        <div class="mod-row" class:row-auto={importFilledFields.has('gatherers')}>
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Clan upgrade that reduces task time by 5% for gathering skills.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gatherers upgrade</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modGatherers} on:click={() => modGatherers = false}>No</button>
            <button class="boost-btn" class:active={modGatherers} on:click={() => modGatherers = true}>Yes</button>
          </div>
        </div>
      {/if}

      {#if selectedSkill === 'Fishing'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to catch double fish, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>The Fisherman</span>
          <CustomSelect bind:value={modFishermanTier} options={FISHERMAN_TIERS} autofill={importFilledFields.has('fisherman')} />
        </div>
      {/if}

      {#if selectedSkill === 'Woodcutting'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to chop double logs, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>The Lumberjack</span>
          <CustomSelect bind:value={modLumberjackTier} options={LUMBERJACK_TIERS} autofill={importFilledFields.has('lumberjack')} />
        </div>
      {/if}

      {#if selectedSkill === 'Foraging'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to forage double loot, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Power Forager</span>
          <CustomSelect bind:value={modPowerForagerTier} options={POWER_FORAGER_TIERS} autofill={importFilledFields.has('powerForager')} />
        </div>
      {/if}

      {#if selectedSkill === 'Farming'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier gives a chance to save your seeds, reducing effective input cost per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Farming Trickery</span>
          <CustomSelect bind:value={modFarmingTrickeryTier} options={FARMING_TRICKERY_TIERS} autofill={importFilledFields.has('farmingTrickery')} />
        </div>
      {/if}

      {#if selectedSkill === 'Carpentry'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Reduces the gold cost of all Carpentry tasks. T3 makes all tasks free.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Plank Bargain</span>
          <CustomSelect bind:value={modPlankBargainTier} options={PLANK_BARGAIN_TIERS} autofill={importFilledFields.has('plankBargain')} />
        </div>
      {/if}

      {#if selectedSkill === 'Smithing'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Gives a chance to save ore when smelting bars, reducing input cost. Does not apply to Astronomical or Otherworldly ore.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Smelting Magic</span>
          <CustomSelect bind:value={modSmeltingMagicTier} options={SMELTING_MAGIC_TIERS} autofill={importFilledFields.has('smeltingMagic')} />
        </div>
      {/if}

      {#if selectedSkill === 'Crafting'}
        <div class="mod-row" class:row-auto={importFilledFields.has('arrowCrafter')}>
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Item unlock. Increases crafted arrow quantities by 10%. Only enable when viewing arrow tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Arrow Crafter</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modArrowCrafter} on:click={() => modArrowCrafter = false}>No</button>
            <button class="boost-btn" class:active={modArrowCrafter} on:click={() => modArrowCrafter = true}>Yes</button>
          </div>
        </div>
        <div class="mod-row" class:row-auto={importFilledFields.has('delicateManufacturing')}>
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Item unlock. Use 20% less flax when crafting non-astronomical fabrics. Only enable when viewing fabric tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Delicate Mfg.</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modDelicateManufacturing} on:click={() => modDelicateManufacturing = false}>No</button>
            <button class="boost-btn" class:active={modDelicateManufacturing} on:click={() => modDelicateManufacturing = true}>Yes</button>
          </div>
        </div>
      {/if}

      <div class="mod-gap"></div>

      {#if selectedSkill !== 'Agility'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Increases resource output by 5% for most skilling tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Skilling gloves</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modGloves} on:click={() => modGloves = false}>No</button>
            <button class="boost-btn" class:active={modGloves} on:click={() => modGloves = true}>Yes</button>
          </div>
        </div>
      {/if}

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'How you buy inputs. Instant buys from the lowest seller. Slow places a buy order at the highest buyer price.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Buy speed</span>
        <div class="boost-btns">
          <button class="boost-btn" class:active={modBuySpeed === 'instant'} on:click={() => modBuySpeed = 'instant'}>Instant</button>
          <button class="boost-btn" class:active={modBuySpeed === 'slow'} on:click={() => modBuySpeed = 'slow'}>Slow</button>
        </div>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'How you sell outputs. Instant sells to the highest buyer. Slow lists at the lowest current seller price.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Sell speed</span>
        <div class="boost-btns">
          <button class="boost-btn" class:active={modSellSpeed === 'instant'} on:click={() => modSellSpeed = 'instant'}>Instant</button>
          <button class="boost-btn" class:active={modSellSpeed === 'slow'} on:click={() => modSellSpeed = 'slow'}>Slow</button>
        </div>
      </div>

    </div>
  </div>

  <div class="field">
    <label class="label">Tasks</label>
    <div class="task-list">
      <div class="filter-wrap">
        <button class="filter-btn" class:active={activeFilterCount > 0} on:click={() => showFilterMenu = !showFilterMenu} aria-label="Toggle task filters">
          <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M0.5 1.5h9l-3.5 4v3l-2-1v-2z"/>
          </svg>
          Filters
          {#if activeFilterCount > 0}<span class="filter-badge">{activeFilterCount}</span>{/if}
        </button>
        {#if showFilterMenu}
          <div class="filter-backdrop" on:click={() => showFilterMenu = false} role="none"></div>
          <div class="filter-menu">
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideLocked} /><span>Hide locked tasks (level req)</span></label>
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideUnprofitable} /><span>Hide unprofitable tasks</span></label>
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideGear} /><span>Hide gear tasks</span></label>
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideNoMarketData} /><span>Hide tasks with no market data</span></label>
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideInputRequired} /><span>Hide tasks requiring inputs</span></label>
            <label class="filter-item"><input type="checkbox" bind:checked={filterHideUnrealistic} /><span>Hide unrealistic tasks (&gt;1M gold/hr)</span></label>
          </div>
        {/if}
      </div>
      {#each skillTasks as task}
        {@const p = calcProfit(task)}
        <button
          class="task-row"
          class:active={selectedTask?.name === task.name}
          class:profit={p.profitPerHr > 0}
          class:loss={p.profitPerHr < 0}
          on:click={() => selectedTask = selectedTask?.name === task.name ? null : task}
        >
          <img
            class="task-icon"
            src="./tasks/{task.name}.png"
            on:error={(e) => {
              const img = e.target as HTMLImageElement;
              if (img.src.includes('/tasks/')) img.src = `./itemicons/${TASK_IMAGE_OVERRIDE[task.name] ?? task.name}.png`;
              else img.src = './image_placeholder.png';
            }}
            alt=""
          />
          <div class="task-left">
            <div class="task-name-row">
              <span class="task-name">{formatItemName(task.name)}</span>
              {#if p.profitPerHr > 1_000_000}
                <span class="task-flag" on:mouseenter={e => showTip(e, 'Exceeds 1M gold/hr — market supply likely cannot sustain this method at scale.')} on:mousemove={moveTip} on:mouseleave={hideTip}>⚠️</span>
              {/if}
            </div>
            <span class="task-level" class:req-fail={task.level > currentLevel}>Lv. {task.level}</span>
          </div>
          <span class="task-phr" class:pos={p.profitPerHr > 0} class:neg={p.profitPerHr < 0}>
            {p.profitPerHr > 0 ? '+' : ''}{formatGold(p.profitPerHr)}/hr
          </span>
        </button>

        {#if selectedTask?.name === task.name}
          <div class="detail">
            <div class="detail-row"><span>Actions/hr</span><span>{Math.round(p.actionsPerHr).toLocaleString()}</span></div>
            <div class="detail-row"><span>Task time</span><span>{calcTaskTime(task).toFixed(2)}s</span></div>
            <div class="detail-row"><span>Output value/hr</span><span class="pos">{p.outputValue > 0 ? '+' : ''}{formatGold(p.outputValue)}</span></div>
            <div class="detail-row"><span>Input cost/hr</span><span class="neg">{p.inputCost > 0 ? '-' : ''}{formatGold(p.inputCost)}</span></div>
            <div class="detail-row total">
              <span>Net profit/hr</span>
              <span class:pos={p.profitPerHr > 0} class:neg={p.profitPerHr < 0}>
                {p.profitPerHr > 0 ? '+' : ''}{formatGold(p.profitPerHr)}
              </span>
            </div>
            {#if task.itemReward !== -1}
              <button class="market-btn" on:click={() => navigate('Market', String(task.itemReward))}>
                Go to market
              </button>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  </div>

{/if}

{#if importModalOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="picker-backdrop" on:click={closeImportModal}></div>
  <div class="import-panel">
    <div class="picker-header">
      <span class="picker-title">Import Player</span>
      <button class="picker-close" on:click={closeImportModal}>×</button>
    </div>
    <div class="import-toggles">
      <button class="import-toggle" class:active={importLevel} on:click={() => importLevel = !importLevel}>Level</button>
      <button class="import-toggle" class:active={importUpgrades} on:click={() => importUpgrades = !importUpgrades}>Upgrades</button>
      <button class="import-toggle" class:active={importEquipment} on:click={() => importEquipment = !importEquipment}>Equipment</button>
    </div>
    {#if clientsWithProfile.length > 0}
      <div class="import-chips">
        {#each clientsWithProfile as client}
          <button class="chip" on:click={() => doImportFromClient(client)}>{client.playerName}</button>
        {/each}
      </div>
    {/if}
    <div class="import-search">
      <div class="search-row">
        <input
          class="search-input"
          placeholder="Search player…"
          bind:value={importSearch}
          on:keydown={(e) => e.key === 'Enter' && doImportBySearch(importSearch)}
          disabled={importLoading}
          use:focusOnMount
        />
        <button class="search-btn" on:click={() => doImportBySearch(importSearch)} disabled={importLoading}>
          {importLoading ? '…' : 'Load'}
        </button>
      </div>
      {#if importError}
        <div class="search-error">{importError}</div>
      {/if}
    </div>
  </div>
{/if}

{#if _tipVisible}
  <div class="tooltip" style="left:{Math.min(_tipX + 14, window.innerWidth - 185)}px; top:{_tipY + 18}px;">
    {_tipText}
  </div>
{/if}

<style>
  .status { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
  .label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .label::before, .label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .filter-wrap { position: relative; }

  .filter-btn {
    width: 100%; display: flex; align-items: center; justify-content: center; gap: 5px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text-muted); font-size: 10px; font-weight: 600;
    padding: 5px 10px; cursor: pointer; transition: all 0.15s;
    font-family: 'Nunito', sans-serif;
  }
  .filter-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .filter-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .filter-badge {
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--accent); color: var(--bg-deep);
    border-radius: 8px; font-size: 9px; font-weight: 800;
    min-width: 14px; height: 14px; padding: 0 3px; line-height: 1;
  }

  .filter-backdrop { position: fixed; inset: 0; z-index: 99; }

  .filter-menu {
    position: absolute; top: calc(100% + 3px); left: 0; right: 0; z-index: 100;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; padding: 6px 0; display: flex; flex-direction: column;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .filter-item {
    display: flex; align-items: center; gap: 8px;
    padding: 5px 10px; cursor: pointer; transition: background 0.1s;
  }
  .filter-item:hover { background: var(--bg-hover); }
  .filter-item input[type="checkbox"] {
    appearance: none; -webkit-appearance: none;
    width: 13px; height: 13px; flex-shrink: 0;
    border: 1px solid var(--border); border-radius: 3px;
    background: var(--bg-raised); cursor: pointer;
    position: relative; transition: all 0.15s;
  }
  .filter-item input[type="checkbox"]:checked {
    background: var(--accent); border-color: var(--accent-hi);
  }
  .filter-item input[type="checkbox"]:checked::after {
    content: ''; position: absolute;
    left: 3px; top: 0px; width: 4px; height: 8px;
    border: 2px solid var(--bg-deep); border-top: none; border-left: none;
    transform: rotate(45deg);
  }
  .filter-item span { font-size: 11px; color: var(--text-muted); }


  .modifiers { display: flex; flex-direction: column; gap: 5px; }

  .mod-gap { height: 4px; }

  .mod-row { display: flex; align-items: center; gap: 8px; }
  .mod-label { font-size: 11px; color: var(--text-muted); flex: 1; }

  .mod-row > .select,
  .mod-row > .boost-btns,
  .mod-row > .jewelry-slots,
  .mod-row > :global(.cs-wrap) { flex: 0 0 155px; }

  .select {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); font-size: 11px; padding: 4px 6px;
    cursor: pointer; min-width: 0; width: 100%; font-family: 'Nunito', sans-serif;
  }
  .select:focus { outline: none; border-color: var(--accent-md); }

  .jewelry-slots { display: flex; gap: 3px; width: 100%; }
  .jewelry-slots :global(.cs-wrap) { flex: 1; }

  .boost-btns { display: flex; gap: 3px; width: 100%; }
  .boost-btn {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 10px; font-weight: 700; padding: 4px 4px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; white-space: nowrap;
    font-family: 'Nunito', sans-serif;
  }
  .boost-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .boost-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .task-list { display: flex; flex-direction: column; gap: 3px; }
  .task-row {
    display: flex; justify-content: space-between; align-items: center; gap: 9px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 10px; cursor: pointer; transition: all 0.15s;
    width: 100%; text-align: left; border-left: 2px solid transparent;
  }
  .task-row:hover { background: var(--bg-hover); }
  .task-row.active { background: var(--bg-hover); border-color: var(--accent-lo); }
  .task-row.profit { border-left-color: var(--pos); }
  .task-row.loss { border-left-color: var(--neg); }

  .task-icon { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }

  .task-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .task-name-row { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .task-name { font-size: 11px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-flag { font-size: 10px; flex-shrink: 0; cursor: help; line-height: 1; }
  .task-level { font-size: 9px; color: var(--text-faint); }
  .task-phr { font-size: 11px; font-weight: 700; flex-shrink: 0; }

  .detail {
    background: var(--bg-deep); border: 1px solid var(--border); border-radius: 6px;
    padding: 8px 10px; margin-top: -1px; display: flex; flex-direction: column; gap: 5px;
  }
  .detail-row { display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); }
  .detail-row.total {
    border-top: 1px solid var(--border); padding-top: 5px; margin-top: 2px;
    font-weight: 700; color: var(--text-sub);
  }

  .market-btn {
    width: 100%; margin-top: 4px;
    background: var(--bg-raised); border: 1px solid var(--accent-hi);
    color: var(--accent); font-size: 11px; font-weight: 700;
    padding: 6px 0; border-radius: 5px; cursor: pointer;
    transition: background 0.15s; font-family: 'Nunito', sans-serif;
  }
  .market-btn:hover { background: var(--accent-lo); }

  .tip-label { cursor: help; }

  .tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 5px; padding: 5px 8px;
    font-size: 10px; color: var(--text-muted); line-height: 1.5;
    max-width: 180px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }

  .pos { color: var(--pos); }
  .neg { color: var(--neg); }
  .req-fail { color: #863131; }

  .top-import-btn {
    width: 100%; background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text-sub); font-size: 10px; font-weight: 700;
    letter-spacing: 0.3px; padding: 5px 0; cursor: pointer;
    transition: border-color 0.15s, color 0.15s; font-family: 'Nunito', sans-serif;
    margin-bottom: 14px;
  }
  .top-import-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .import-active {
    display: flex; align-items: center; gap: 6px;
    background: var(--bg-raised); border: 1px solid var(--accent-lo);
    border-radius: 5px; padding: 5px 10px; margin-bottom: 14px;
  }
  .import-name {
    flex: 1; font-size: 10px; font-weight: 700; color: var(--accent); letter-spacing: 0.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .import-refresh {
    background: none; border: none; color: var(--text-faint);
    font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px; transition: color 0.15s;
  }
  .import-refresh:hover:not(:disabled) { color: var(--text); }
  .import-refresh:disabled { opacity: 0.3; cursor: default; }
  .import-clear {
    background: none; border: none; color: var(--text-faint);
    font-size: 14px; line-height: 1; cursor: pointer; padding: 0 2px; transition: color 0.15s;
  }
  .import-clear:hover { color: var(--text); }

  .picker-backdrop { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.55); }

  .import-panel {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 51; width: 260px; background: var(--bg-card);
    border: 1px solid var(--accent-lo); border-radius: 8px;
    display: flex; flex-direction: column; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  }

  .picker-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px 7px; border-bottom: 1px solid var(--divider); flex-shrink: 0;
  }
  .picker-title {
    font-size: 10px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: var(--text-faint);
  }
  .picker-close {
    background: none; border: none; color: var(--text-faint);
    font-size: 16px; line-height: 1; cursor: pointer; padding: 0 2px; transition: color 0.15s;
  }
  .picker-close:hover { color: var(--text); }

  .import-toggles { display: flex; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--divider); }
  .import-toggle {
    flex: 1; font-family: 'Nunito', sans-serif; font-size: 10px; font-weight: 700;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-muted); padding: 4px 0; cursor: pointer; transition: all 0.15s; text-align: center;
  }
  .import-toggle:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .import-toggle.active { border-color: var(--accent-md); background: var(--bg-raised); color: var(--accent); }

  .import-chips {
    display: flex; flex-wrap: wrap; gap: 5px;
    padding: 8px 10px; border-bottom: 1px solid var(--divider);
  }
  .chip {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 20px;
    color: var(--text-muted); font-size: 10px; font-weight: 600; font-family: 'Nunito', sans-serif;
    padding: 3px 10px; cursor: pointer; transition: all 0.15s;
  }
  .chip:hover { border-color: var(--accent-lo); color: var(--text); }

  .import-search { padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; }
  .search-row { display: flex; gap: 6px; }
  .search-input {
    flex: 1; background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text); font-family: 'Nunito', sans-serif;
    font-size: 11px; padding: 5px 8px; outline: none; box-sizing: border-box;
    transition: border-color 0.15s; min-width: 0;
  }
  .search-input:focus { border-color: var(--accent-md); }
  .search-input::placeholder { color: var(--text-faint); }
  .search-input:disabled { opacity: 0.5; }
  .search-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-muted); font-size: 10px; font-weight: 700; font-family: 'Nunito', sans-serif;
    padding: 5px 10px; cursor: pointer; transition: all 0.15s; flex-shrink: 0; width: auto;
  }
  .search-btn:hover:not(:disabled) { border-color: var(--accent-md); color: var(--accent); }
  .search-btn:disabled { opacity: 0.5; cursor: default; }
  .search-error { font-size: 10px; color: var(--neg); font-weight: 600; }

  .import-done {
    padding: 20px 14px 22px; display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .done-check { font-size: 22px; color: var(--pos); line-height: 1; }
  .done-fields { font-size: 11px; color: var(--text-sub); text-align: center; line-height: 1.7; }

  @keyframes row-autofill-glow {
    0%   { background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 4px; }
    60%  { background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 4px; }
    100% { background: transparent; }
  }
  .mod-row.row-auto { animation: row-autofill-glow 2s ease-out forwards; }
</style>
