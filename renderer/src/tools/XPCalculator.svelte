<script context="module" lang="ts">
  export const toolMeta = {
    name: 'XP Calculator',
    desc: 'Time to goal for any task',
    icon: '✨',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import {
  profitTasks, profitSkills,
  loadGameConfig, GATHERING_SKILLS, XP_TABLE, xpToLevel, formatGold, formatTime,
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

const HOUSING_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Tent (5%)', value: 0.05 },
  { label: 'Barn (10%)', value: 0.10 },
  { label: 'Windmill (15%)', value: 0.15 },
  { label: 'House (20%)', value: 0.20 },
  { label: 'Manor (25%)', value: 0.25 },
  { label: 'Castle (30%)', value: 0.30 },
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
let modHousing = 0;

let xpCurrentXp = 0;
let xpGoalLevel = 99;

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

function calcXp(task: Task) {
  const actionsPerHr = 3600 / calcTaskTime(task);
  const xpPerAction = task.exp * (1 + modHousing);
  const xpPerHr = xpPerAction * actionsPerHr;
  const goalXp = xpGoalLevel >= 1 && xpGoalLevel <= 120 ? XP_TABLE[xpGoalLevel - 1] : null;
  const xpNeeded = goalXp !== null ? Math.max(goalXp - xpCurrentXp, 0) : null;
  const timeToGoal = xpNeeded !== null ? xpNeeded / xpPerHr * 3600 : null;
  const actionsToGoal = xpNeeded !== null ? Math.ceil(xpNeeded / xpPerAction) : null;
  return { xpPerHr, timeToGoal, actionsToGoal };
}

$: xpTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelryType, modJewelryPieces, modCapeTier, modGatherers, modHousing, xpGoalLevel, xpCurrentXp];
  return $profitTasks
    .filter(t => t.skill === selectedSkill)
    .sort((a, b) => calcXp(b).xpPerHr - calcXp(a).xpPerHr);
})();

$: xpCurrentLevel = xpToLevel(xpCurrentXp);
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
    <label class="label">Goal</label>
    <div class="goal-row">
      <div class="goal-field">
        <span class="mod-label">Current XP</span>
        <input class="select" type="number" min="0" bind:value={xpCurrentXp} placeholder="0" />
      </div>
      <div class="goal-field">
        <span class="mod-label">Goal level</span>
        <input class="select" type="number" min="1" max="120" bind:value={xpGoalLevel} placeholder="99" />
      </div>
    </div>
    {#if xpCurrentXp > 0}
      <span class="current-level">
        Current level: {xpCurrentLevel}
        · Goal XP: {formatGold(XP_TABLE[Math.min(xpGoalLevel, 120) - 1])}
      </span>
    {/if}
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

      <div class="mod-row">
        <span class="mod-label">Clan housing</span>
        <select class="select" bind:value={modHousing}>
          {#each HOUSING_TIERS as h}<option value={h.value}>{h.label}</option>{/each}
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

    </div>
  </div>

  <div class="field">
    <label class="label">Tasks</label>
    <div class="task-list">
      {#each xpTasks as task}
        {@const x = calcXp(task)}
        <button
          class="task-row"
          class:active={selectedTask?.name === task.name}
          on:click={() => selectedTask = selectedTask?.name === task.name ? null : task}
        >
          <div class="task-left">
            <span class="task-name">{task.name.replace(/_/g, ' ')}</span>
            <span class="task-level" class:req-fail={task.level > xpCurrentLevel}>Lv. {task.level}</span>
          </div>
          <span class="task-phr pos">{formatGold(x.xpPerHr)} xp/hr</span>
        </button>

        {#if selectedTask?.name === task.name}
          <div class="detail">
            <div class="detail-row"><span>Task time</span><span>{calcTaskTime(task).toFixed(2)}s</span></div>
            <div class="detail-row"><span>XP per action</span><span>{(task.exp * (1 + modHousing)).toFixed(1)}</span></div>
            <div class="detail-row"><span>Actions/hr</span><span>{Math.round(3600 / calcTaskTime(task)).toLocaleString()}</span></div>
            <div class="detail-row total"><span>XP/hr</span><span class="pos">{formatGold(x.xpPerHr)}</span></div>
            {#if x.timeToGoal !== null}
              <div class="detail-row total"><span>Time to goal</span><span>{formatTime(x.timeToGoal)}</span></div>
              <div class="detail-row"><span>Actions needed</span><span>{x.actionsToGoal?.toLocaleString()}</span></div>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
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

  .goal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .goal-field { display: flex; flex-direction: column; gap: 4px; }
  .current-level { font-size: 10px; color: var(--text-faint); }

  .modifiers { display: flex; flex-direction: column; gap: 6px; }
  .mod-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mod-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

  .select {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); font-size: 11px; padding: 4px 6px;
    cursor: pointer; flex: 1; min-width: 0; font-family: 'Nunito', sans-serif;
  }
  .select:focus { outline: none; border-color: var(--accent-md); }

  .jewelry-row { display: flex; gap: 4px; flex: 1; }

  .toggle {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .toggle.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .task-list { display: flex; flex-direction: column; gap: 3px; }
  .task-row {
    display: flex; justify-content: space-between; align-items: center;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 10px; cursor: pointer; transition: all 0.15s;
    width: 100%; text-align: left;
  }
  .task-row:hover { background: var(--bg-hover); }
  .task-row.active { background: var(--bg-hover); border-color: var(--accent-lo); }

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

  .pos { color: var(--pos); }
  .req-fail { color: #863131; }
</style>
