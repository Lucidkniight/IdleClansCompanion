<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Completionist Calculator',
    desc: 'XP needed for completionist capes',
    icon: '🎖️',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import { clients, xpToLevel, XP_TABLE, formatGold, formatTime, createNavListener, navigate, profitTasks, loadGameConfig, GATHERING_SKILLS, type Task } from '../lib/store';

const STAGES = [
  { level: 90,  label: 'All 90'  },
  { level: 100, label: 'All 100' },
  { level: 110, label: 'All 110' },
  { level: 120, label: 'All 120' },
];

const ALL_SKILLS = [
  'attack', 'strength', 'defence', 'archery', 'magic', 'health',
  'woodcutting', 'fishing', 'mining', 'foraging', 'farming',
  'cooking', 'smithing', 'crafting', 'carpentry', 'brewing', 'enchanting',
  'agility', 'plundering', 'exterminating',
];

const TOOL_TIERS = [
  { label: 'None', value: 0 }, { label: 'Normal', value: 0.04 }, { label: 'Refined', value: 0.06 },
  { label: 'Great', value: 0.08 }, { label: 'Elite', value: 0.10 }, { label: 'Superior', value: 0.12 },
  { label: 'Outstanding', value: 0.15 }, { label: 'Godlike', value: 0.20 }, { label: 'Otherworldly', value: 0.25 },
];
const CAPE_TIERS = [
  { label: 'None', value: 0 }, { label: 'Tier 1', value: 0.05 }, { label: 'Tier 2', value: 0.10 },
  { label: 'Tier 3', value: 0.15 }, { label: 'Tier 4', value: 0.20 },
];
const JEWELRY_TYPES = [
  { label: 'None', value: 0 }, { label: 'Common', value: 0.015 },
  { label: 'Rare', value: 0.035 }, { label: 'Exceptional', value: 0.05 },
];
const HOUSING_TIERS = [
  { label: 'None', value: 0 }, { label: 'Tent (5%)', value: 0.05 }, { label: 'Barn (10%)', value: 0.10 },
  { label: 'Windmill (15%)', value: 0.15 }, { label: 'House (20%)', value: 0.20 },
  { label: 'Manor (25%)', value: 0.25 }, { label: 'Castle (30%)', value: 0.30 },
];

let nameInput = '';
let nameAutoFilled = false;
let skillXpMap: Record<string, number> = {};
let username = '';
let loading = false;
let notFound = false;
let hasError = false;

let modTool = 0;
let modGearPieces = 0;
let modJewelryType = 0;
let modJewelryPieces = 0;
let modCapeTier = 0;
let modGatherers = false;
let modHousing = 0;

const incomingNav = createNavListener('Completionist Calculator');
$: if ($incomingNav !== null) { nameInput = $incomingNav; nameAutoFilled = true; lookup(); }

onMount(async () => {
  if ($profitTasks.length === 0) await loadGameConfig();
});

$: clientNames = $clients.filter(c => c.playerName).map(c => c.playerName as string);

$: stages = STAGES.map(({ level, label }) => {
  const needing = ALL_SKILLS
    .map(skill => {
      const xp = skillXpMap[skill] ?? 0;
      const curLevel = xpToLevel(xp);
      if (curLevel >= level) return null;
      return { skill, curLevel, currentXp: xp, xpNeeded: XP_TABLE[level - 1] - xp };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.xpNeeded - a.xpNeeded);

  return {
    level,
    label,
    needing,
    complete: needing.length === 0,
    totalXp: needing.reduce((sum, s) => sum + s.xpNeeded, 0),
  };
});

$: activeIdx = username ? stages.findIndex(s => !s.complete) : -1;
$: allDone = username !== '' && activeIdx === -1;

async function lookup() {
  const name = nameInput.trim();
  if (!name) return;
  loading = true;
  hasError = false;
  notFound = false;
  skillXpMap = {};
  username = '';
  try {
    const res = await fetch(
      `https://query.idleclans.com/api/Player/profile/${encodeURIComponent(name)}`
    );
    if (res.status === 404) { notFound = true; return; }
    if (!res.ok) throw new Error();
    const p = await res.json();
    skillXpMap = p.skillExperiences ?? {};
    username = p.username ?? name;
  } catch {
    hasError = true;
  } finally {
    loading = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') lookup();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function calcTaskXpPerHr(task: Task): number {
  const totalSpeedBoost = modGearPieces * 0.02 + modJewelryPieces * modJewelryType + modTool + modCapeTier;
  const gathererBoost = (modGatherers && GATHERING_SKILLS.includes(task.skill)) ? 0.05 : 0;
  const secs = Math.max(task.baseTime * (1 - gathererBoost) * (1 - totalSpeedBoost), 100) / 1000;
  return task.exp * (1 + modHousing) / secs * 3600;
}

$: stageEta = (() => {
  const _ = [modTool, modGearPieces, modJewelryType, modJewelryPieces, modCapeTier, modGatherers, modHousing];
  if (!username || activeIdx === -1 || $profitTasks.length === 0) return null;
  const stage = stages[activeIdx];
  let total = 0;
  let partial = false;
  for (const s of stage.needing) {
    const tasks = $profitTasks.filter(t => t.skill === cap(s.skill) && t.level <= s.curLevel);
    if (tasks.length === 0) { partial = true; continue; }
    const bestXpPerHr = Math.max(...tasks.map(calcTaskXpPerHr));
    if (bestXpPerHr <= 0) { partial = true; continue; }
    total += s.xpNeeded / bestXpPerHr * 3600;
  }
  return { time: total > 0 ? total : 0, partial };
})();
</script>

<div class="search-wrap">
  <input
    class="search-input"
    class:field-auto={nameAutoFilled}
    placeholder="Enter player name…"
    bind:value={nameInput}
    on:input={() => nameAutoFilled = false}
    on:keydown={onKeydown}
  />
  <button class="search-btn" on:click={lookup} disabled={loading}>
    {loading ? '…' : '→'}
  </button>
</div>

{#if clientNames.length}
  <div class="clients-row">
    {#each clientNames as name}
      <button class="client-chip" on:click={() => { nameInput = name; nameAutoFilled = true; lookup(); }}>
        {name}
      </button>
    {/each}
  </div>
{/if}

{#if loading}
  <div class="status">Loading…</div>
{:else if notFound}
  <div class="status error">Player not found</div>
{:else if hasError}
  <div class="status error">Failed to load profile</div>
{:else if username}

  <div class="player-row">
    <span class="player-name">{username}</span>
    {#if allDone}
      <span class="max-badge">Max Cape ✓</span>
    {:else}
      <span class="next-hint">Next: <strong>{stages[activeIdx].label}</strong></span>
    {/if}
  </div>

  <div class="stages">
    {#each stages as stage, i}
      <div class="stage-card" class:active={i === activeIdx} class:complete={stage.complete}>
        <div class="stage-header">
          <span class="stage-label">{stage.label}</span>
          {#if stage.complete}
            <span class="badge complete-badge">✓ Complete</span>
          {:else}
            <span class="badge remaining-badge" class:active-badge={i === activeIdx}>
              {stage.needing.length} / 20 · {formatGold(stage.totalXp)}
            </span>
          {/if}
        </div>

        {#if !stage.complete && i === activeIdx}
          <div class="skill-list">
            {#each stage.needing as s}
              <button class="skill-row" on:click={() => navigate('XP Calculator', `${cap(s.skill)},${s.currentXp},${stage.level}`)}>

                <span class="s-name">{cap(s.skill)}</span>
                <span class="s-lvl">Lv.{s.curLevel}</span>
                <span class="s-xp">{formatGold(s.xpNeeded)}</span>
              </button>
            {/each}
            <div class="total-row">
              <span>Total XP needed</span>
              <span class="total-val">{formatGold(stage.totalXp)}</span>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if activeIdx !== -1}
    <div class="eta-section">
      <div class="eta-section-label">ETA Modifiers <span class="manual-tag">manual</span></div>
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
      <div class="mod-row">
        <span class="mod-label">Gatherers upgrade</span>
        <button class="toggle" class:active={modGatherers} on:click={() => modGatherers = !modGatherers}>
          {modGatherers ? 'Yes' : 'No'}
        </button>
      </div>
      <div class="eta-result">
        <span class="eta-label">Time to {stages[activeIdx].label}</span>
        <span class="eta-val">
          {#if stageEta !== null}
            {formatTime(stageEta.time)}{stageEta.partial ? '*' : ''}
          {:else}—{/if}
        </span>
      </div>
      {#if stageEta?.partial}
        <p class="eta-note">* Excludes skills with no available tasks (e.g. combat)</p>
      {/if}
    </div>
  {/if}

{/if}

<style>
  .search-wrap {
    display: flex;
    gap: 6px;
    margin-bottom: 6px;
  }

  .search-input {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
  }
  .search-input:focus { outline: none; border-color: var(--accent-md); }

  .search-btn {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--accent);
    font-size: 13px;
    padding: 0 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    font-family: 'Nunito', sans-serif;
    flex-shrink: 0;
  }
  .search-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent-md); }
  .search-btn:disabled { opacity: 0.4; cursor: default; }

  .clients-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }

  .client-chip {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-sub);
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    cursor: pointer;
    font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s;
    width: auto;
  }
  .client-chip:hover { border-color: var(--accent-md); color: var(--accent); }

  .status {
    text-align: center;
    font-size: 11px;
    color: var(--text-faint);
    padding: 16px 0;
  }
  .status.error { color: #7a3a3a; }

  .player-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
  }

  .player-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .next-hint {
    font-size: 10px;
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .next-hint strong { color: var(--accent); }

  .max-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--pos);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .stages {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stage-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 7px;
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .stage-card.active {
    border-color: var(--accent-hi);
  }

  .stage-card.complete {
    opacity: 0.55;
  }

  .stage-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    gap: 6px;
  }

  .stage-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-hi);
  }

  .badge {
    font-size: 9px;
    font-weight: 700;
    border-radius: 4px;
    padding: 2px 6px;
    white-space: nowrap;
    flex-shrink: 0;
    letter-spacing: 0.3px;
  }

  .complete-badge {
    color: var(--pos);
    background: color-mix(in srgb, var(--pos) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--pos) 30%, transparent);
  }

  .remaining-badge {
    color: var(--text-dim);
    background: var(--bg-raised);
    border: 1px solid var(--border);
  }

  .remaining-badge.active-badge {
    color: var(--accent);
    background: var(--accent-lo);
    border-color: var(--accent-md);
  }

  .skill-list {
    border-top: 1px solid var(--border);
    padding: 6px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .skill-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px;
    align-items: center;
    padding: 4px 6px;
    border-bottom: 1px solid var(--divider);
    background: none;
    border-left: none;
    border-right: none;
    border-top: none;
    border-radius: 4px;
    width: 100%;
    text-align: left;
    cursor: pointer;
    font-family: 'Nunito', sans-serif;
    transition: background 0.1s;
    margin: 0 -6px;
    width: calc(100% + 12px);
  }
  .skill-row:last-of-type { border-bottom: none; }
  .skill-row:hover { background: var(--bg-hover); }
  .skill-row:hover .s-name { color: var(--accent); }

  .s-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .s-lvl {
    font-size: 10px;
    color: var(--text-dim);
    text-align: right;
    white-space: nowrap;
  }

  .s-xp {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    text-align: right;
    white-space: nowrap;
    min-width: 44px;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 5px;
    margin-top: 2px;
    border-top: 1px solid var(--border);
    font-size: 10px;
    font-weight: 700;
    color: var(--text-sub);
  }

  .total-val {
    color: var(--accent);
    font-size: 11px;
  }

  .field-auto {
    border-color: var(--accent-md) !important;
    background: color-mix(in srgb, var(--accent) 7%, var(--bg-card)) !important;
  }

  .eta-section {
    margin-top: 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .eta-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-faint);
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 2px;
  }

  .manual-tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    color: var(--text-dim);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
  }

  .mod-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mod-label { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

  .select {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); font-size: 11px; padding: 4px 6px;
    cursor: pointer; flex: 1; min-width: 0; font-family: 'Nunito', sans-serif;
  }
  .select:focus { outline: none; border-color: var(--accent-md); }

  .jewelry-row { display: flex; gap: 4px; flex: 1; }

  .toggle {
    background: var(--bg-raised); border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; padding: 4px 12px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .toggle.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-card); }

  .eta-result {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 6px;
    margin-top: 2px;
    border-top: 1px solid var(--border);
  }

  .eta-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-sub);
  }

  .eta-val {
    font-size: 13px;
    font-weight: 700;
    color: var(--accent);
  }

  .eta-note {
    font-size: 9px;
    color: var(--text-dim);
    margin: 0;
  }
</style>
