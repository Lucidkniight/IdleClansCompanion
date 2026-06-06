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
  profitTasks, profitSkills, clients, toolNavigation,
  loadGameConfig, GATHERING_SKILLS, XP_TABLE, xpToLevel, formatGold, formatTime,
  type Task, type ClientCard,
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

const HOUSING_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Tent (5%)', value: 0.05 },
  { label: 'Barn (10%)', value: 0.10 },
  { label: 'Windmill (15%)', value: 0.15 },
  { label: 'House (20%)', value: 0.20 },
  { label: 'Manor (25%)', value: 0.25 },
  { label: 'Castle (30%)', value: 0.30 },
];

const PLAYER_HOUSING_TIERS = [
  { label: 'None', value: 0 },
  { label: 'Cardboard Box (5%)', value: 0.05 },
  { label: 'Tent (10%)', value: 0.10 },
  { label: 'Van Down by the River (15%)', value: 0.15 },
  { label: 'Small Cabin (20%)', value: 0.20 },
  { label: 'House (25%)', value: 0.25 },
];

let loading = false;
let selectedSkill = '';
let selectedTask: Task | null = null;

let modTool = 0;
let modGearPieces = 0;
let modJewelry0 = 0; // Jewellery
let modJewelry1 = 0; // Amulet
let modJewelry2 = 0; // Bracelet
let modJewelry3 = 0; // Earrings
let modCapeTier = 0;
let modGatherers = false;
let modHousing = 0;
let modPlayerHousing = 0;
let modDailyBoost: 'off' | 'avg' | 'full' = 'avg';

const _XP_MODS_KEY = 'icc-xp-mods';
const _xpSkillMods: Record<string, { modTool: number; modGearPieces: number; modJewelry: number[]; modCapeTier: number; modGatherers: boolean; modHousing: number; modPlayerHousing: number; modDailyBoost: 'off' | 'avg' | 'full'; xpCurrentXp: number; xpGoalLevel: number }> = (() => {
  try { return JSON.parse(localStorage.getItem(_XP_MODS_KEY) ?? '{}'); } catch { return {}; }
})();
const _defaultXpMods = () => ({ modTool: 0, modGearPieces: 0, modJewelry: [0, 0, 0, 0], modCapeTier: 0, modGatherers: false, modHousing: 0, modPlayerHousing: 0, modDailyBoost: 'avg' as const, xpCurrentXp: 0, xpGoalLevel: 120 });

$: if (selectedSkill) {
  const _m = _xpSkillMods[selectedSkill] ?? _defaultXpMods();
  modTool = _m.modTool; modGearPieces = _m.modGearPieces;
  modCapeTier = _m.modCapeTier; modGatherers = _m.modGatherers;
  const _j: number[] = (_m as any).modJewelry ?? (() => {
    const t = (_m as any).modJewelryType ?? 0;
    const p = Math.min((_m as any).modJewelryPieces ?? 0, 4);
    return [p > 0 ? t : 0, p > 1 ? t : 0, p > 2 ? t : 0, p > 3 ? t : 0];
  })();
  modJewelry0 = _j[0] ?? 0; modJewelry1 = _j[1] ?? 0;
  modJewelry2 = _j[2] ?? 0; modJewelry3 = _j[3] ?? 0;
  modHousing = _m.modHousing;
  modPlayerHousing = _m.modPlayerHousing ?? 0;
  const _raw = _m.modDailyBoost as any;
  modDailyBoost = _raw === true ? 'full' : _raw === false ? 'off' : (_raw ?? 'avg');
  xpCurrentXp = _m.xpCurrentXp ?? 0;
  xpGoalLevel = _m.xpGoalLevel ?? 99;
  xpFieldAuto = false;
  goalFieldAuto = false;
}

$: if (selectedSkill) {
  _xpSkillMods[selectedSkill] = { modTool, modGearPieces, modJewelry: [modJewelry0, modJewelry1, modJewelry2, modJewelry3], modCapeTier, modGatherers, modHousing, modPlayerHousing, modDailyBoost, xpCurrentXp, xpGoalLevel };
  try { localStorage.setItem(_XP_MODS_KEY, JSON.stringify(_xpSkillMods)); } catch {}
}

let xpCurrentXp = 0;
let xpGoalLevel = 120;
let xpFieldAuto = false;
let goalFieldAuto = false;

let autoFilledFields = new Set<string>();
let autoFillTimer: ReturnType<typeof setTimeout>;
let _xpNavId = -1;

$: {
  const _nav = $toolNavigation;
  if (_nav?.tool === 'XP Calculator' && _nav.id !== _xpNavId) {
    _xpNavId = _nav.id;
    applyNav(_nav.param);
  }
}

async function applyNav(param: string) {
  const [skill, rawXp, rawGoal] = param.split(',');
  if ($profitTasks.length === 0) {
    loading = true;
    await loadGameConfig();
    loading = false;
  }
  const filled = new Set<string>();
  if (skill && $profitSkills.includes(skill)) { selectedSkill = skill; filled.add('skill'); }
  if (rawXp) { xpCurrentXp = parseInt(rawXp, 10); filled.add('xp'); xpFieldAuto = true; }
  if (rawGoal) { xpGoalLevel = parseInt(rawGoal, 10); filled.add('goal'); goalFieldAuto = true; }
  selectedTask = null;
  autoFilledFields = filled;
  clearTimeout(autoFillTimer);
  autoFillTimer = setTimeout(() => { autoFilledFields = new Set(); }, 2000);
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

function calcXp(task: Task) {
  const actionsPerHr = 3600 / calcTaskTime(task);
  const dailyMult = modDailyBoost === 'full' ? 1.30 : modDailyBoost === 'avg' ? (1 + 0.30 * 8 / 24) : 1;
  const xpPerAction = task.exp * (1 + modHousing) * (1 + modPlayerHousing) * dailyMult;
  const xpPerHr = xpPerAction * actionsPerHr;
  const goalXp = xpGoalLevel >= 1 && xpGoalLevel <= 120 ? XP_TABLE[xpGoalLevel - 1] : null;
  const xpNeeded = goalXp !== null ? Math.max(goalXp - xpCurrentXp, 0) : null;
  const timeToGoal = xpNeeded !== null ? xpNeeded / xpPerHr * 3600 : null;
  const actionsToGoal = xpNeeded !== null ? Math.ceil(xpNeeded / xpPerAction) : null;
  return { xpPerHr, xpPerAction, timeToGoal, actionsToGoal };
}

$: xpTasks = (() => {
  const _ = [modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modHousing, modPlayerHousing, modDailyBoost, xpGoalLevel, xpCurrentXp];
  return $profitTasks
    .filter(t => t.skill === selectedSkill)
    .sort((a, b) => calcXp(b).xpPerHr - calcXp(a).xpPerHr);
})();

$: xpCurrentLevel = xpToLevel(xpCurrentXp);
$: clientsWithProfile = $clients.filter(c => c.playerName && c.profile?.skillExperiences);

let _tipText = '';
let _tipX = 0;
let _tipY = 0;
let _tipVisible = false;
function showTip(e: MouseEvent, text: string) { _tipText = text; _tipX = e.clientX; _tipY = e.clientY; _tipVisible = true; }
function moveTip(e: MouseEvent) { _tipX = e.clientX; _tipY = e.clientY; }
function hideTip() { _tipVisible = false; }

function fillFromClient(client: ClientCard) {
  const xp = client.profile?.skillExperiences?.[selectedSkill.toLowerCase()] ?? 0;
  xpCurrentXp = xp;
  xpFieldAuto = true;
  autoFilledFields = new Set(['xp']);
  clearTimeout(autoFillTimer);
  autoFillTimer = setTimeout(() => { autoFilledFields = new Set(); }, 2000);
}
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
          class:autofill={autoFilledFields.has('skill') && selectedSkill === skill}
          on:click={() => { selectedSkill = skill; selectedTask = null; }}
        >{skill}</button>
      {/each}
    </div>
    {#if clientsWithProfile.length}
      <div class="clients-row">
        {#each clientsWithProfile as client}
          <button class="client-chip" on:click={() => fillFromClient(client)}>
            {client.playerName}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="field">
    <label class="label">Goal</label>
    <div class="goal-row">
      <div class="goal-field">
        <span class="mod-label">Current XP</span>
        <input class="select" class:autofill={autoFilledFields.has('xp')} class:field-auto={xpFieldAuto} type="number" min="0" bind:value={xpCurrentXp} placeholder="0" on:input={() => xpFieldAuto = false} />
      </div>
      <div class="goal-field">
        <span class="mod-label">Goal level</span>
        <input class="select" class:autofill={autoFilledFields.has('goal')} class:field-auto={goalFieldAuto} type="number" min="1" max="120" bind:value={xpGoalLevel} placeholder="120" on:input={() => goalFieldAuto = false} />
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

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, "Your clan's housing upgrade level. Increases XP earned per action.")} on:mousemove={moveTip} on:mouseleave={hideTip}>Clan housing</span>
        <select class="select" bind:value={modHousing}>
          {#each HOUSING_TIERS as h}<option value={h.value}>{h.label}</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Your personal house tier. Increases XP earned per action.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Player house</span>
        <select class="select" bind:value={modPlayerHousing}>
          {#each PLAYER_HOUSING_TIERS as h}<option value={h.value}>{h.label}</option>{/each}
        </select>
      </div>

      <div class="mod-row">
        <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'A 30% XP boost active for 8 hrs/day. Avg applies the effective 24h average (+10%). Full shows the rate while the boost is active.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Daily XP boost</span>
        <div class="boost-btns">
          <button class="boost-btn" class:active={modDailyBoost === 'off'} on:click={() => modDailyBoost = 'off'}>Off</button>
          <button class="boost-btn" class:active={modDailyBoost === 'avg'} on:click={() => modDailyBoost = 'avg'}>Avg +10%</button>
          <button class="boost-btn" class:active={modDailyBoost === 'full'} on:click={() => modDailyBoost = 'full'}>Full +30%</button>
        </div>
      </div>

      {#if GATHERING_SKILLS.includes(selectedSkill)}
        <div class="mod-row">
          <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Clan upgrade that reduces task time by 5% for gathering skills.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gatherers upgrade</span>
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
            <div class="detail-row"><span>XP per action</span><span>{x.xpPerAction.toFixed(1)}</span></div>
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

  .clients-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .client-chip {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 10px; font-weight: 600; padding: 3px 8px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .client-chip:hover { border-color: var(--accent-md); color: var(--accent); }

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

  .jewelry-slots { display: flex; gap: 3px; flex: 1; }
  .jewelry-select { flex: 1; min-width: 0; padding-left: 4px; padding-right: 2px; font-size: 10px; }

  .toggle {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .toggle.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

  .boost-btns { display: flex; gap: 3px; }
  .boost-btn {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 10px; font-weight: 700; padding: 4px 6px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; white-space: nowrap; width: auto;
    font-family: 'Nunito', sans-serif;
  }
  .boost-btn:hover { border-color: var(--accent-lo); color: var(--text-sub); }
  .boost-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); }

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

  .tip-label { cursor: help; }

  .tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 5px; padding: 5px 8px;
    font-size: 10px; color: var(--text-muted); line-height: 1.5;
    max-width: 180px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }

  .pos { color: var(--pos); }
  .req-fail { color: #863131; }
  .field-auto { border-color: var(--accent-md) !important; background: color-mix(in srgb, var(--accent) 7%, var(--bg-card)) !important; }

  @keyframes autofill-glow {
    0%   { border-color: var(--accent-md); box-shadow: 0 0 0 2px var(--accent-lo); }
    60%  { border-color: var(--accent-md); box-shadow: 0 0 0 2px var(--accent-lo); }
    100% { border-color: var(--border);    box-shadow: none; }
  }
  .autofill { animation: autofill-glow 2s ease-out forwards; }
</style>
