<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Profit Calculator',
    desc: 'Profit per hour for any task',
    icon: '/itemicons/gold.png',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import {
  profitTasks, profitSkills, priceCache, clients,
  loadGameConfig, GATHERING_SKILLS, formatItemName, formatGold, navigate, xpToLevel,
  type Task, type ClientCard,
} from '../lib/store';
import CustomSelect from '../lib/CustomSelect.svelte';

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
  const _ = [modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modGloves, modSellSpeed, modBuySpeed, currentLevel, modFishermanTier, modLumberjackTier, modPowerForagerTier, modFarmingTrickeryTier, modPlankBargainTier, modSmeltingMagicTier, modArrowCrafter, modDelicateManufacturing];
  return $profitTasks
    .filter(t => t.skill === selectedSkill && t.hasProfitValue)
    .sort((a, b) => {
      const aLocked = a.level > currentLevel ? 1 : 0;
      const bLocked = b.level > currentLevel ? 1 : 0;
      if (aLocked !== bLocked) return aLocked - bLocked;
      return calcProfit(b).profitPerHr - calcProfit(a).profitPerHr;
    });
})();

$: hasSkillSpecific = ['Fishing', 'Woodcutting', 'Foraging', 'Farming', 'Carpentry', 'Smithing', 'Crafting'].includes(selectedSkill);

$: clientsWithSkill = $clients.filter(c => c.playerName && c.profile?.skillExperiences);

function fillFromClient(client: ClientCard) {
  const xp = client.profile?.skillExperiences?.[selectedSkill.toLowerCase()] ?? 0;
  currentLevel = xpToLevel(xp);
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

let _tipText = '';
let _tipX = 0;
let _tipY = 0;
let _tipVisible = false;
function showTip(e: MouseEvent, text: string) { _tipText = text; _tipX = e.clientX; _tipY = e.clientY; _tipVisible = true; }
function moveTip(e: MouseEvent) { _tipX = e.clientX; _tipY = e.clientY; }
function hideTip() { _tipVisible = false; }
</script>

{#if loading}
  <div class="status">Loading tasks…</div>
{:else}

  <div class="field">
    <label class="label">Skill</label>
    <CustomSelect bind:value={selectedSkill} options={$profitSkills.map(s => ({ label: s, value: s, icon: `/skilltaskicons/${s}.png` }))} on:change={() => selectedTask = null} />
  </div>

  <div class="field">
    <label class="label">Current Level</label>
    {#if clientsWithSkill.length}
      <div class="clients-row">
        {#each clientsWithSkill as client}
          <button class="client-chip" on:click={() => fillFromClient(client)}>
            {client.playerName}
          </button>
        {/each}
      </div>
    {/if}
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
        <CustomSelect bind:value={modTool} options={TOOL_TIERS} />
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Skill-specific gear pieces worn. Each piece reduces task time by 2%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gear pieces</span>
        <CustomSelect bind:value={modGearPieces} options={GEAR_PIECES_OPTIONS} />
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Jewelry slots. Each piece reduces task time — Common 1.5%, Rare 3.5%, Exceptional 5%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Jewelry</span>
        <div class="jewelry-slots">
          <CustomSelect bind:value={modJewelry0} options={JEWELRY_TYPES} compact />
          <CustomSelect bind:value={modJewelry1} options={JEWELRY_TYPES} compact />
          <CustomSelect bind:value={modJewelry2} options={JEWELRY_TYPES} compact />
          <CustomSelect bind:value={modJewelry3} options={JEWELRY_TYPES} compact />
        </div>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Mastery cape tier. Reduces task completion time.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Mastery cape</span>
        <CustomSelect bind:value={modCapeTier} options={CAPE_TIERS} />
      </div>

      {#if selectedSkill !== 'Agility'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Increases resource output by 5% for most skilling tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Skilling gloves</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modGloves} on:click={() => modGloves = false}>No</button>
            <button class="boost-btn" class:active={modGloves} on:click={() => modGloves = true}>Yes</button>
          </div>
        </div>
      {/if}

      {#if GATHERING_SKILLS.includes(selectedSkill)}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Clan upgrade that reduces task time by 5% for gathering skills.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gatherers upgrade</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modGatherers} on:click={() => modGatherers = false}>No</button>
            <button class="boost-btn" class:active={modGatherers} on:click={() => modGatherers = true}>Yes</button>
          </div>
        </div>
      {/if}

      <div class="mod-gap"></div>

      {#if selectedSkill === 'Fishing'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to catch double fish, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>The Fisherman</span>
          <CustomSelect bind:value={modFishermanTier} options={FISHERMAN_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Woodcutting'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to chop double logs, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>The Lumberjack</span>
          <CustomSelect bind:value={modLumberjackTier} options={LUMBERJACK_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Foraging'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier increases the chance to forage double loot, boosting output per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Power Forager</span>
          <CustomSelect bind:value={modPowerForagerTier} options={POWER_FORAGER_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Farming'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Each tier gives a chance to save your seeds, reducing effective input cost per hour.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Farming Trickery</span>
          <CustomSelect bind:value={modFarmingTrickeryTier} options={FARMING_TRICKERY_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Carpentry'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Reduces the gold cost of all Carpentry tasks. T3 makes all tasks free.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Plank Bargain</span>
          <CustomSelect bind:value={modPlankBargainTier} options={PLANK_BARGAIN_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Smithing'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Market upgrade. Gives a chance to save ore when smelting bars, reducing input cost. Does not apply to Astronomical or Otherworldly ore.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Smelting Magic</span>
          <CustomSelect bind:value={modSmeltingMagicTier} options={SMELTING_MAGIC_TIERS} />
        </div>
      {/if}

      {#if selectedSkill === 'Crafting'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Item unlock. Increases crafted arrow quantities by 10%. Only enable when viewing arrow tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Arrow Crafter</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modArrowCrafter} on:click={() => modArrowCrafter = false}>No</button>
            <button class="boost-btn" class:active={modArrowCrafter} on:click={() => modArrowCrafter = true}>Yes</button>
          </div>
        </div>
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Item unlock. Use 20% less flax when crafting non-astronomical fabrics. Only enable when viewing fabric tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Delicate Mfg.</span>
          <div class="boost-btns">
            <button class="boost-btn" class:active={!modDelicateManufacturing} on:click={() => modDelicateManufacturing = false}>No</button>
            <button class="boost-btn" class:active={modDelicateManufacturing} on:click={() => modDelicateManufacturing = true}>Yes</button>
          </div>
        </div>
      {/if}

      {#if hasSkillSpecific}<div class="mod-gap"></div>{/if}

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
            src="/tasks/{task.name}.png"
            on:error={(e) => {
              const img = e.target as HTMLImageElement;
              if (img.src.includes('/tasks/')) img.src = `/itemicons/${TASK_IMAGE_OVERRIDE[task.name] ?? task.name}.png`;
              else img.src = '/image_placeholder.png';
            }}
            alt=""
          />
          <div class="task-left">
            <span class="task-name">{formatItemName(task.name)}</span>
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

  .clients-row { display: flex; flex-wrap: wrap; gap: 3px; }
  .client-chip {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 10px; font-weight: 600; padding: 2px 7px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .client-chip:hover { border-color: var(--accent-md); color: var(--accent); }

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
  .task-name { font-size: 11px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
</style>
