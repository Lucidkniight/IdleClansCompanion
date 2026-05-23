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
  { label: 'None', value: 0 },
  { label: 'Common', value: 0.015 },
  { label: 'Rare', value: 0.035 },
  { label: 'Exceptional', value: 0.05 },
];

let loading = false;
let selectedSkill = '';
let selectedTask: Task | null = null;

let modTool = 0;
let modGearPieces = 0;
let modJewelryType = 0;
let modJewelryPieces = 0;
let modCapeTier = 0;
let modGatherers = false;
let modSellSpeed: 'instant' | 'slow' = 'instant';

onMount(async () => {
  if ($profitTasks.length === 0) {
    loading = true;
    await loadGameConfig();
    loading = false;
  }
  if (!selectedSkill) selectedSkill = $profitSkills[0] ?? '';
});

function calcTaskTime(task: Task): number {
  const totalSpeedBoost = modGearPieces * 0.02 + modJewelryPieces * modJewelryType + modTool + modCapeTier;
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
  const outputValue = task.itemReward !== -1 ? getPrice(task.itemReward) * task.itemAmount * actionsPerHr : 0;
  const inputCost = task.costs.reduce((s, c) => s + (cache[c.Item]?.lowestSell ?? 0) * c.Amount * actionsPerHr, 0);
  return { outputValue, inputCost, profitPerHr: outputValue - inputCost, actionsPerHr };
}

$: skillTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelryType, modJewelryPieces, modCapeTier, modGatherers, modSellSpeed];
  return $profitTasks
    .filter(t => t.skill === selectedSkill && t.hasProfitValue)
    .sort((a, b) => calcProfit(b).profitPerHr - calcProfit(a).profitPerHr);
})();
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
        <span class="mod-label">Tool</span>
        <select class="select" bind:value={modTool}>
          {#each TOOL_TIERS as t}<option value={t.value}>{t.label} ({t.value * 100}%)</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label">Gear pieces</span>
        <select class="select" bind:value={modGearPieces}>
          {#each [0,1,2,3] as n}<option value={n}>{n} piece{n !== 1 ? 's' : ''} ({n * 2}%)</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label">Jewelry</span>
        <div class="jewelry-row">
          <select class="select" bind:value={modJewelryType}>
            {#each JEWELRY_TYPES as j}<option value={j.value}>{j.label}</option>{/each}
          </select>
          <select class="select" bind:value={modJewelryPieces} disabled={modJewelryType === 0}>
            {#each [0,1,2,3,4] as n}<option value={n}>{n}pc</option>{/each}
          </select>
        </div>
      </div>

      <div class="mod-row">
        <span class="mod-label">Mastery cape</span>
        <select class="select" bind:value={modCapeTier}>
          {#each CAPE_TIERS as c}<option value={c.value}>{c.label} ({c.value * 100}%)</option>{/each}
        </select>
      </div>

      {#if GATHERING_SKILLS.includes(selectedSkill)}
        <div class="mod-row">
          <span class="mod-label">Gatherers upgrade</span>
          <button class="toggle" class:active={modGatherers} on:click={() => modGatherers = !modGatherers}>
            {modGatherers ? 'Yes' : 'No'}
          </button>
        </div>
      {/if}

      <div class="mod-row">
        <span class="mod-label">Sell speed</span>
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

<style>
  .status { text-align: center; font-size: 11px; color: #3a3f58; padding: 16px 0; }

  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .label { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #3a3f58; }

  .skill-grid { display: flex; flex-wrap: wrap; gap: 4px; }
  .skill-btn {
    background: #13151f; border: 1px solid #1e2030; color: #555870;
    font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .skill-btn:hover { border-color: #e8b84b44; color: #9098b8; }
  .skill-btn.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .modifiers { display: flex; flex-direction: column; gap: 6px; }
  .mod-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mod-label { font-size: 11px; color: #555870; flex-shrink: 0; }

  .select {
    background: #13151f; border: 1px solid #1e2030; border-radius: 5px;
    color: #c8cad4; font-size: 11px; padding: 4px 6px;
    cursor: pointer; flex: 1; min-width: 0; font-family: 'Nunito', sans-serif;
  }
  .select:focus { outline: none; border-color: #e8b84b55; }

  .jewelry-row { display: flex; gap: 4px; flex: 1; }

  .toggle {
    background: #13151f; border: 1px solid #1e2030; color: #555870;
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .toggle.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .speed-row { display: flex; gap: 4px; flex: 1; }
  .speed-btn {
    flex: 1; background: #13151f; border: 1px solid #1e2030; color: #555870;
    font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .speed-btn:hover { border-color: #e8b84b44; color: #9098b8; }
  .speed-btn.active { border-color: #e8b84b88; color: #e8b84b; background: #1a1c28; }

  .task-list { display: flex; flex-direction: column; gap: 3px; }
  .task-row {
    display: flex; justify-content: space-between; align-items: center;
    background: #13151f; border: 1px solid #1e2030; border-radius: 6px;
    padding: 7px 10px; cursor: pointer; transition: all 0.15s;
    width: 100%; text-align: left; border-left: 2px solid transparent;
  }
  .task-row:hover { background: #161824; }
  .task-row.active { background: #161824; border-color: #e8b84b44; }
  .task-row.profit { border-left-color: #4ade8044; }
  .task-row.loss { border-left-color: #e0555544; }

  .task-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .task-name { font-size: 11px; font-weight: 700; color: #d0d4e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .task-level { font-size: 9px; color: #3a3f58; }
  .task-phr { font-size: 11px; font-weight: 700; flex-shrink: 0; }

  .detail {
    background: #0c0d13; border: 1px solid #1e2030; border-radius: 6px;
    padding: 8px 10px; margin-top: -1px; display: flex; flex-direction: column; gap: 5px;
  }
  .detail-row { display: flex; justify-content: space-between; font-size: 11px; color: #555870; }
  .detail-row.total {
    border-top: 1px solid #1e2030; padding-top: 5px; margin-top: 2px;
    font-weight: 700; color: #8890b0;
  }

  .pos { color: #4ade80; }
  .neg { color: #e05555; }
</style>
