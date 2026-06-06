<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Profit Calculator',
    desc: 'Profit per hour for any task',
    icon: '💸',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import {
  profitTasks, profitSkills, priceCache,
  loadGameConfig, GATHERING_SKILLS, formatItemName, formatGold,
  type Task,
} from '../lib/store';

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
  { label: '—', value: 0 },
  { label: 'Cmn', value: 0.015 },
  { label: 'Rare', value: 0.035 },
  { label: 'Exc', value: 0.05 },
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
let modSellSpeed: 'instant' | 'slow' = 'instant';

const _PROFIT_MODS_KEY = 'icc-profit-mods';
const _profitSkillMods: Record<string, { modTool: number; modGearPieces: number; modJewelry: number[]; modCapeTier: number; modGatherers: boolean; modGloves: boolean; modSellSpeed: 'instant' | 'slow' }> = (() => {
  try { return JSON.parse(localStorage.getItem(_PROFIT_MODS_KEY) ?? '{}'); } catch { return {}; }
})();
const _defaultProfitMods = () => ({ modTool: 0, modGearPieces: 0, modJewelry: [0, 0, 0, 0], modCapeTier: 0, modGatherers: false, modGloves: false, modSellSpeed: 'instant' as const });

$: if (selectedSkill) {
  const _m = _profitSkillMods[selectedSkill] ?? _defaultProfitMods();
  modTool = _m.modTool; modGearPieces = _m.modGearPieces;
  modCapeTier = _m.modCapeTier; modGatherers = _m.modGatherers;
  modGloves = _m.modGloves; modSellSpeed = _m.modSellSpeed;
  const _j: number[] = (_m as any).modJewelry ?? (() => {
    const t = (_m as any).modJewelryType ?? 0;
    const p = Math.min((_m as any).modJewelryPieces ?? 0, 4);
    return [p > 0 ? t : 0, p > 1 ? t : 0, p > 2 ? t : 0, p > 3 ? t : 0];
  })();
  modJewelry0 = _j[0] ?? 0; modJewelry1 = _j[1] ?? 0;
  modJewelry2 = _j[2] ?? 0; modJewelry3 = _j[3] ?? 0;
}

$: if (selectedSkill) {
  _profitSkillMods[selectedSkill] = { modTool, modGearPieces, modJewelry: [modJewelry0, modJewelry1, modJewelry2, modJewelry3], modCapeTier, modGatherers, modGloves, modSellSpeed };
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
  const getPrice = (id: number) => {
    const p = cache[id];
    return p ? (modSellSpeed === 'instant' ? p.highestBuy : p.lowestSell) : 0;
  };
  const glovesMult = (modGloves && selectedSkill !== 'Agility') ? 1.05 : 1;
  const outputValue = task.itemReward !== -1 ? getPrice(task.itemReward) * task.itemAmount * actionsPerHr * glovesMult : 0;
  const inputCost = task.costs.reduce((s, c) => s + (cache[c.Item]?.lowestSell ?? 0) * c.Amount * actionsPerHr, 0);
  return { outputValue, inputCost, profitPerHr: outputValue - inputCost, actionsPerHr };
}

$: skillTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modGloves, modSellSpeed];
  return $profitTasks
    .filter(t => t.skill === selectedSkill && t.hasProfitValue)
    .sort((a, b) => calcProfit(b).profitPerHr - calcProfit(a).profitPerHr);
})();

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
    <div class="skill-grid">
      {#each $profitSkills as skill}
        <button
          class="skill-btn"
          class:active={selectedSkill === skill}
          on:click={() => { selectedSkill = skill; selectedTask = null; }}
        >{skill}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="label">Modifiers</label>
    <div class="modifiers">

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Your equipped tool tier. Higher tiers reduce task completion time.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Tool</span>
        <select class="select" bind:value={modTool}>
          {#each TOOL_TIERS as t}<option value={t.value}>{t.label} ({t.value * 100}%)</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Skill-specific gear pieces worn. Each piece reduces task time by 2%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gear pieces</span>
        <select class="select" bind:value={modGearPieces}>
          {#each [0,1,2,3] as n}<option value={n}>{n} piece{n !== 1 ? 's' : ''} ({n * 2}%)</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Jewelry slots. Each piece reduces task time — Cmn 1.5%, Rare 3.5%, Exc 5%.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Jewelry</span>
        <div class="jewelry-slots">
          <select class="select jewelry-select" bind:value={modJewelry0}>
            {#each JEWELRY_TYPES as j}<option value={j.value}>{j.label}</option>{/each}
          </select>
          <select class="select jewelry-select" bind:value={modJewelry1}>
            {#each JEWELRY_TYPES as j}<option value={j.value}>{j.label}</option>{/each}
          </select>
          <select class="select jewelry-select" bind:value={modJewelry2}>
            {#each JEWELRY_TYPES as j}<option value={j.value}>{j.label}</option>{/each}
          </select>
          <select class="select jewelry-select" bind:value={modJewelry3}>
            {#each JEWELRY_TYPES as j}<option value={j.value}>{j.label}</option>{/each}
          </select>
        </div>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Mastery cape tier. Reduces task completion time.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Mastery cape</span>
        <select class="select" bind:value={modCapeTier}>
          {#each CAPE_TIERS as c}<option value={c.value}>{c.label} ({c.value * 100}%)</option>{/each}
        </select>
      </div>

      {#if selectedSkill !== 'Agility'}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Increases resource output by 5% for most skilling tasks.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Skilling gloves</span>
          <button class="toggle" class:active={modGloves} on:click={() => modGloves = !modGloves}>
            {modGloves ? 'Yes' : 'No'}
          </button>
        </div>
      {/if}

      {#if GATHERING_SKILLS.includes(selectedSkill)}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Clan upgrade that reduces task time by 5% for gathering skills.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gatherers upgrade</span>
          <button class="toggle" class:active={modGatherers} on:click={() => modGatherers = !modGatherers}>
            {modGatherers ? 'Yes' : 'No'}
          </button>
        </div>
      {/if}

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Instant uses buy orders (highest buyer). Slow uses list prices (lowest seller).')} on:mousemove={moveTip} on:mouseleave={hideTip}>Sell speed</span>
        <div class="speed-row">
          <button class="speed-btn" class:active={modSellSpeed === 'instant'} on:click={() => modSellSpeed = 'instant'}>Instant</button>
          <button class="speed-btn" class:active={modSellSpeed === 'slow'} on:click={() => modSellSpeed = 'slow'}>Slow</button>
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
          class:profit={p.profitPerHr >= 0}
          class:loss={p.profitPerHr < 0}
          on:click={() => selectedTask = selectedTask?.name === task.name ? null : task}
        >
          <div class="task-left">
            <span class="task-name">{formatItemName(task.name)}</span>
            <span class="task-level">Lv. {task.level}</span>
          </div>
          <span class="task-phr" class:pos={p.profitPerHr >= 0} class:neg={p.profitPerHr < 0}>
            {p.profitPerHr >= 0 ? '+' : ''}{formatGold(p.profitPerHr)}/hr
          </span>
        </button>

        {#if selectedTask?.name === task.name}
          <div class="detail">
            <div class="detail-row"><span>Actions/hr</span><span>{Math.round(p.actionsPerHr).toLocaleString()}</span></div>
            <div class="detail-row"><span>Task time</span><span>{calcTaskTime(task).toFixed(2)}s</span></div>
            <div class="detail-row"><span>Output value/hr</span><span class="pos">+{formatGold(p.outputValue)}</span></div>
            <div class="detail-row"><span>Input cost/hr</span><span class="neg">-{formatGold(p.inputCost)}</span></div>
            <div class="detail-row total">
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

{#if _tipVisible}
  <div class="tooltip" style="left:{Math.min(_tipX + 14, window.innerWidth - 185)}px; top:{_tipY + 18}px;">
    {_tipText}
  </div>
{/if}

<style>
  .status { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--text-faint); }

  .skill-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .skill-btn {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .skill-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .skill-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .modifiers { display: flex; flex-direction: column; gap: 6px; }
  .mod-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mod-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

  .select {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); font-size: 11px; padding: 4px 6px;
    cursor: pointer; flex: 1; min-width: 0; font-family: 'Nunito', sans-serif;
  }
  .select:focus { outline: none; border-color: var(--accent-md); }

  .jewelry-slots { display: flex; gap: 3px; flex: 1; }
  .jewelry-select { flex: 1; min-width: 0; padding-left: 4px; padding-right: 2px; font-size: 10px; }

  .toggle {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .toggle.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .speed-row { display: flex; gap: 4px; flex: 1; }
  .speed-btn {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .speed-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .speed-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .task-list { display: flex; flex-direction: column; gap: 3px; }
  .task-row {
    display: flex; justify-content: space-between; align-items: center;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 10px; cursor: pointer; transition: all 0.15s;
    width: 100%; text-align: left; border-left: 2px solid transparent;
  }
  .task-row:hover { background: var(--bg-hover); }
  .task-row.active { background: var(--bg-hover); border-color: var(--accent-lo); }
  .task-row.profit { border-left-color: var(--pos); }
  .task-row.loss { border-left-color: var(--neg); }

  .task-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
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
</style>
