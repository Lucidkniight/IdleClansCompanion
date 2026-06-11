<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Completionist Calculator',
    desc: 'XP needed for completionist capes',
    icon: './itemicons/completionist_cape_tier_4.png',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import { clients, xpToLevel, XP_TABLE, formatGold, formatTime, createNavListener, navigate, profitTasks, loadGameConfig, GATHERING_SKILLS, type Task } from '../lib/store';
import CustomSelect from '../lib/CustomSelect.svelte';

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

const HOUSING_TIERS = [
  { label: 'None',            value: 0 },
  { label: 'Tent (5%)',       value: 0.05 },
  { label: 'Barn (10%)',      value: 0.10 },
  { label: 'Windmill (15%)',  value: 0.15 },
  { label: 'House (20%)',     value: 0.20 },
  { label: 'Manor (25%)',     value: 0.25 },
  { label: 'Castle (30%)',    value: 0.30 },
];

const PLAYER_HOUSING_TIERS = [
  { label: 'None',                        value: 0 },
  { label: 'Cardboard Box (5%)',          value: 0.05 },
  { label: 'Tent (10%)',                  value: 0.10 },
  { label: 'Van Down by the River (15%)', value: 0.15 },
  { label: 'Small Cabin (20%)',           value: 0.20 },
  { label: 'House (25%)',                 value: 0.25 },
];

const _MODS_KEY = 'icc-completion-mods';
const _saved = (() => { try { return JSON.parse(localStorage.getItem(_MODS_KEY) ?? '{}'); } catch { return {}; } })();

let modTool:          number                  = _saved.modTool          ?? 0;
let modGearPieces:    number                  = _saved.modGearPieces    ?? 0;
let modJewelry0:      number                  = _saved.modJewelry0      ?? 0;
let modJewelry1:      number                  = _saved.modJewelry1      ?? 0;
let modJewelry2:      number                  = _saved.modJewelry2      ?? 0;
let modJewelry3:      number                  = _saved.modJewelry3      ?? 0;
let modCapeTier:      number                  = _saved.modCapeTier      ?? 0;
let modGatherers:     boolean                 = _saved.modGatherers     ?? false;
let modHousing:       number                  = _saved.modHousing       ?? 0;
let modPlayerHousing: number                  = _saved.modPlayerHousing ?? 0;
let modDailyBoost:    'off' | 'avg' | 'full'  = _saved.modDailyBoost   ?? 'avg';

$: try {
  localStorage.setItem(_MODS_KEY, JSON.stringify({ modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modHousing, modPlayerHousing, modDailyBoost }));
} catch {}

let nameInput = '';
let nameAutoFilled = false;
let skillXpMap: Record<string, number> = {};
let username = '';
let loading = false;
let notFound = false;
let hasError = false;

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

$: hasResult = loading || notFound || hasError || username !== '';

function clear() {
  nameInput = '';
  username = '';
  skillXpMap = {};
  notFound = false;
  hasError = false;
  nameAutoFilled = false;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function calcTaskXpPerHr(task: Task): number {
  const totalSpeedBoost = modGearPieces * 0.02 + modJewelry0 + modJewelry1 + modJewelry2 + modJewelry3 + modTool + modCapeTier;
  const gathererBoost = (modGatherers && GATHERING_SKILLS.includes(task.skill)) ? 0.05 : 0;
  const secs = Math.max(task.baseTime * (1 - gathererBoost) * (1 - totalSpeedBoost), 100) / 1000;
  const dailyMult = modDailyBoost === 'full' ? 1.30 : modDailyBoost === 'avg' ? (1 + 0.30 * 8 / 24) : 1;
  return task.exp * (1 + modHousing) * (1 + modPlayerHousing) * dailyMult / secs * 3600;
}

const SKILL_ICON: Record<string, string> = {
  attack: 'Rigour', strength: 'Strength', defence: 'Defence',
  archery: 'Archery', magic: 'Magic', health: 'Health',
  woodcutting: 'Woodcutting', fishing: 'Fishing', mining: 'Mining',
  foraging: 'Foraging', farming: 'Farming',
  cooking: 'Cooking', smithing: 'Smithing', crafting: 'Crafting',
  carpentry: 'Carpentry', brewing: 'Brewing', enchanting: 'Enchanting',
  agility: 'Agility', plundering: 'Plundering', exterminating: 'Exterminating',
};

let _tipText = '';
let _tipX = 0;
let _tipY = 0;
let _tipVisible = false;
function showTip(e: MouseEvent, text: string) { _tipText = text; _tipX = e.clientX; _tipY = e.clientY; _tipVisible = true; }
function moveTip(e: MouseEvent) { _tipX = e.clientX; _tipY = e.clientY; }
function hideTip() { _tipVisible = false; }

$: stageEta = (() => {
  const _ = [modTool, modGearPieces, modJewelry0, modJewelry1, modJewelry2, modJewelry3, modCapeTier, modGatherers, modHousing, modPlayerHousing, modDailyBoost];
  if (!username || activeIdx === -1 || $profitTasks.length === 0) return null;
  const stage = stages[activeIdx];
  let total = 0;
  let partial = false;
  const skillTimes: Record<string, number | null> = {};
  for (const s of stage.needing) {
    const allTasks = $profitTasks.filter(t => t.skill === cap(s.skill) && t.level <= s.curLevel);
    const tasks = allTasks.filter(t => calcTaskXpPerHr(t) <= 1_000_000);
    if (tasks.length === 0) { partial = true; skillTimes[s.skill] = null; continue; }
    const bestXpPerHr = Math.max(...tasks.map(calcTaskXpPerHr));
    if (bestXpPerHr <= 0) { partial = true; skillTimes[s.skill] = null; continue; }
    const t = s.xpNeeded / bestXpPerHr * 3600;
    skillTimes[s.skill] = t;
    total += t;
  }
  return { time: total > 0 ? total : 0, partial, skillTimes };
})();
</script>

<div class="field">
  <label class="label">Player</label>
  <div class="search-wrap">
    <div class="input-wrap">
      <input
        class="search-input"
        class:field-auto={nameAutoFilled}
        placeholder="Enter player name…"
        bind:value={nameInput}
        on:input={() => nameAutoFilled = false}
        on:keydown={onKeydown}
      />
      {#if hasResult}
        <button class="clear-btn" on:click={clear}>✕</button>
      {/if}
    </div>
    <button class="search-btn" on:click={lookup} disabled={loading}>
      {loading ? '…' : '→'}
    </button>
  </div>
  {#if !hasResult && clientNames.length}
    <div class="clients-row">
      {#each clientNames as name}
        <button class="client-chip" on:click={() => { nameInput = name; nameAutoFilled = true; lookup(); }}>
          {name}
        </button>
      {/each}
    </div>
  {/if}
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

    <div class="mod-row">
      <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Clan upgrade that reduces task time by 5% for gathering skills.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Gatherers</span>
      <div class="boost-btns">
        <button class="boost-btn" class:active={!modGatherers} on:click={() => modGatherers = false}>No</button>
        <button class="boost-btn" class:active={modGatherers} on:click={() => modGatherers = true}>Yes</button>
      </div>
    </div>

    <div class="mod-gap"></div>

    <div class="mod-row">
      <span class="mod-label tip-label" on:mouseenter={e => showTip(e, "Your clan's housing upgrade level. Increases XP earned per action.")} on:mousemove={moveTip} on:mouseleave={hideTip}>Clan housing</span>
      <CustomSelect bind:value={modHousing} options={HOUSING_TIERS} />
    </div>

    <div class="mod-row">
      <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'Your personal house tier. Increases XP earned per action.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Player house</span>
      <CustomSelect bind:value={modPlayerHousing} options={PLAYER_HOUSING_TIERS} />
    </div>

    <div class="mod-row">
      <span class="mod-label tip-label" on:mouseenter={e => showTip(e, 'A 30% XP boost active for 8 hrs/day. Avg applies the effective 24h average (+10%). Full shows the rate while the boost is active.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Daily XP boost</span>
      <div class="boost-btns">
        <button class="boost-btn" class:active={modDailyBoost === 'off'} on:click={() => modDailyBoost = 'off'}>Off</button>
        <button class="boost-btn" class:active={modDailyBoost === 'avg'} on:click={() => modDailyBoost = 'avg'}>Avg</button>
        <button class="boost-btn" class:active={modDailyBoost === 'full'} on:click={() => modDailyBoost = 'full'}>Full</button>
      </div>
    </div>

  </div>
</div>

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
                <img class="s-icon" src="./skilltaskicons/{SKILL_ICON[s.skill]}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
                <span class="s-name">{cap(s.skill)}</span>
                <span class="s-lvl">Lv.{s.curLevel}</span>
                <span class="s-xp">{formatGold(s.xpNeeded)}</span>
                <span class="s-time">{stageEta?.skillTimes?.[s.skill] != null ? formatTime(stageEta.skillTimes[s.skill]!) : '—'}</span>
              </button>
            {/each}
            <div class="total-row">
              <span>Total XP needed</span>
              <span class="total-val">{formatGold(stage.totalXp)}</span>
            </div>
            {#if stageEta !== null}
              <div class="eta-row">
                <span class="eta-label">Estimated time</span>
                <span class="eta-val">{formatTime(stageEta.time)}{stageEta.partial ? '*' : ''}</span>
              </div>
              {#if stageEta.partial}
                <p class="eta-note">* Excludes skills with no available tasks (e.g. combat)</p>
              {/if}
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>

{/if}

{#if _tipVisible}
  <div class="tooltip" style="left:{Math.min(_tipX + 14, window.innerWidth - 185)}px; top:{_tipY + 18}px;">
    {_tipText}
  </div>
{/if}

<style>
  .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
  .label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .label::before, .label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .search-wrap { display: flex; gap: 6px; }

  .input-wrap { position: relative; flex: 1; }

  .search-input {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 12px; padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
  }
  .search-input:focus { outline: none; border-color: var(--accent-md); }

  .clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: var(--text-faint); font-size: 11px;
    cursor: pointer; padding: 2px 4px; line-height: 1; transition: color 0.15s; width: auto;
  }
  .clear-btn:hover { color: var(--accent); }

  .search-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px;
    color: var(--accent); font-size: 13px; padding: 0 12px; cursor: pointer;
    transition: background 0.15s, border-color 0.15s; font-family: 'Nunito', sans-serif;
    flex-shrink: 0;
  }
  .search-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent-md); }
  .search-btn:disabled { opacity: 0.4; cursor: default; }

  .clients-row { display: flex; flex-wrap: wrap; gap: 3px; }
  .client-chip {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 10px; font-weight: 600; padding: 2px 7px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .client-chip:hover { border-color: var(--accent-md); color: var(--accent); }

  .status { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }
  .status.error { color: #7a3a3a; }

  .modifiers { display: flex; flex-direction: column; gap: 5px; }

  .mod-gap { height: 4px; }

  .mod-row { display: flex; align-items: center; gap: 8px; }
  .mod-label { font-size: 11px; color: var(--text-muted); flex: 1; }

  .mod-row > .boost-btns,
  .mod-row > .jewelry-slots,
  .mod-row > :global(.cs-wrap) { flex: 0 0 155px; }

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

  .tip-label { cursor: help; }

  .player-row {
    display: flex; align-items: center; justify-content: space-between;
    gap: 6px; margin-bottom: 8px;
  }
  .player-name { font-size: 13px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next-hint { font-size: 10px; color: var(--text-dim); white-space: nowrap; flex-shrink: 0; }
  .next-hint strong { color: var(--accent); }
  .max-badge { font-size: 10px; font-weight: 700; color: var(--pos); white-space: nowrap; flex-shrink: 0; }

  .stages { display: flex; flex-direction: column; gap: 4px; }

  .stage-card {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 7px; overflow: hidden; transition: border-color 0.15s;
  }
  .stage-card.active { border-color: var(--accent-hi); }
  .stage-card.complete { opacity: 0.55; }

  .stage-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 7px 10px; gap: 6px;
  }
  .stage-label { font-size: 12px; font-weight: 700; color: var(--text-hi); }

  .badge {
    font-size: 9px; font-weight: 700; border-radius: 4px; padding: 2px 6px;
    white-space: nowrap; flex-shrink: 0; letter-spacing: 0.3px;
  }
  .complete-badge {
    color: var(--pos); background: color-mix(in srgb, var(--pos) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--pos) 30%, transparent);
  }
  .remaining-badge { color: var(--text-dim); background: var(--bg-raised); border: 1px solid var(--border); }
  .remaining-badge.active-badge { color: var(--accent); background: var(--accent-lo); border-color: var(--accent-md); }

  .skill-list {
    border-top: 1px solid var(--border); padding: 6px 10px;
    display: flex; flex-direction: column; gap: 2px;
  }

  .skill-row {
    display: grid; grid-template-columns: 16px 1fr auto auto auto;
    gap: 6px; align-items: center; padding: 4px 6px;
    border-bottom: 1px solid var(--divider);
    background: none; border-left: none; border-right: none; border-top: none;
    border-radius: 4px; width: calc(100% + 12px); text-align: left;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: background 0.1s; margin: 0 -6px;
  }
  .skill-row:last-of-type { border-bottom: none; }
  .skill-row:hover { background: var(--bg-hover); }
  .skill-row:hover .s-name { color: var(--accent); }

  .s-icon { width: 16px; height: 16px; object-fit: contain; }

  .s-name { font-size: 11px; font-weight: 600; color: var(--text); }
  .s-lvl { font-size: 10px; color: var(--text-dim); text-align: right; white-space: nowrap; }
  .s-xp { font-size: 11px; font-weight: 700; color: var(--accent); text-align: right; white-space: nowrap; min-width: 44px; }
  .s-time { font-size: 10px; color: var(--text-dim); text-align: right; white-space: nowrap; min-width: 52px; }

  .total-row {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 5px; margin-top: 2px; border-top: 1px solid var(--border);
    font-size: 10px; font-weight: 700; color: var(--text-sub);
  }
  .total-val { color: var(--accent); font-size: 11px; }

  .eta-row {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 5px; margin-top: 2px; border-top: 1px solid var(--border);
    font-size: 11px;
  }
  .eta-label { font-weight: 700; color: var(--text-sub); }
  .eta-val { font-size: 12px; font-weight: 700; color: var(--accent); }
  .eta-note { font-size: 9px; color: var(--text-dim); margin: 2px 0 0; }

  .field-auto {
    border-color: var(--accent-md) !important;
    background: color-mix(in srgb, var(--accent) 7%, var(--bg-card)) !important;
  }

  .tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 5px; padding: 5px 8px;
    font-size: 10px; color: var(--text-muted); line-height: 1.5;
    max-width: 180px; box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  }
</style>
