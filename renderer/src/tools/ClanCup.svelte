<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Clan Cup',
    desc: 'Cup leaderboards and clan standings',
    icon: './skilltaskicons/ClanCup.png',
  };
</script>

<script lang="ts">
import { onMount } from 'svelte';
import { formatTime, formatGold, navigate } from '../lib/store';

const API = 'https://query.idleclans.com';

interface ScoreEntry  { objective: string; score: number; rank: number; }
interface SpeedEntry  { objective: string; bestTime: { time: number; achievedAt: string }; rank: number; }
type StandingEntry = ScoreEntry | SpeedEntry;

interface LbRow { clanName: string; display: string; rank: number; }

const SKILL_SET   = new Set(['Agility','Brewing','Carpentry','Cooking','Crafting','Enchanting','Farming','Fishing','Foraging','Invocation','Mining','Plundering','Smithing','Woodcutting']);
const BOSS_SET    = new Set(['ChimeraKills','DevilKills','GriffinKills','HadesKills','KronosKills','MalignantSpiderKills','MedusaKills','MesinesKills','OtherworldlyGolemKills','SobekKills','ZeusKills']);
const SPECIAL_SET = new Set(['BloodmoonMassacre','Exterminating','GuardiansOfTheCitadelCompletions','ReckoningOfTheGodsCompletions']);

const LABEL: Record<string, string> = {
  ChimeraKills:'Chimera Kills', DevilKills:'Devil Kills', GriffinKills:'Griffin Kills',
  HadesKills:'Hades Kills', KronosKills:'Kronos Kills', MalignantSpiderKills:'Malignant Spider',
  MedusaKills:'Medusa Kills', MesinesKills:'Mesines Kills', OtherworldlyGolemKills:'Golem Kills',
  SobekKills:'Sobek Kills', ZeusKills:'Zeus Kills',
  BloodmoonMassacre:'Bloodmoon', Exterminating:'Exterminating',
  GuardiansOfTheCitadelCompletions:'Citadel Comps', ReckoningOfTheGodsCompletions:'Reckoning Comps',
  ChimeraSpeed:'Chimera', DevilSpeed:'Devil', GriffinSpeed:'Griffin',
  GuardiansOfTheCitadelSpeed:'Citadel', HadesSpeed:'Hades', KronosSpeed:'Kronos',
  MalignantSpiderSpeed:'Malignant Spider', MedusaSpeed:'Medusa', MesinesSpeed:'Mesines',
  OtherworldlyGolemSpeed:'Golem', ReckoningOfTheGodsSpeed:'Reckoning',
  SkeletonWarriorSpeed:'Skeleton Warrior', SobekSpeed:'Sobek', ZeusSpeed:'Zeus',
};
function lbl(k: string) { return LABEL[k] ?? k; }

function isSpeed(e: StandingEntry): e is SpeedEntry { return 'bestTime' in e; }
function formatSpeed(ms: number): string {
  const frac = String(ms % 1000).padStart(3, '0');
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return mins > 0 ? `${mins}m ${secs}.${frac}s` : `${secs}.${frac}s`;
}
function scoreDisplay(e: StandingEntry): string {
  return isSpeed(e) ? formatSpeed(e.bestTime.time) : formatGold(e.score);
}
function rankCls(r: number) {
  if (r <= 10)  return 'rk-gold';
  if (r <= 50)  return 'rk-silver';
  if (r <= 100) return 'rk-bronze';
  return 'rk-plain';
}

const CATEGORY_GROUPS = [
  { label: null,         items: [{ value: 'totalPoints', label: 'All Time' }] },
  { label: 'Skills',     items: [
    'Agility','Brewing','Carpentry','Cooking','Crafting','Enchanting',
    'Farming','Fishing','Foraging','Invocation','Mining','Plundering','Smithing','Woodcutting',
  ].map(s => ({ value: s, label: s })) },
  { label: 'Boss Kills', items: [
    { value: 'ChimeraKills',          label: 'Chimera Kills' },
    { value: 'DevilKills',            label: 'Devil Kills' },
    { value: 'GriffinKills',          label: 'Griffin Kills' },
    { value: 'HadesKills',            label: 'Hades Kills' },
    { value: 'KronosKills',           label: 'Kronos Kills' },
    { value: 'MalignantSpiderKills',  label: 'Malignant Spider Kills' },
    { value: 'MedusaKills',           label: 'Medusa Kills' },
    { value: 'MesinesKills',          label: 'Mesines Kills' },
    { value: 'OtherworldlyGolemKills',label: 'Golem Kills' },
    { value: 'SobekKills',            label: 'Sobek Kills' },
    { value: 'ZeusKills',             label: 'Zeus Kills' },
  ] },
  { label: 'Special',    items: [
    { value: 'BloodmoonMassacre',                  label: 'Bloodmoon Massacre' },
    { value: 'Exterminating',                      label: 'Exterminating' },
    { value: 'GuardiansOfTheCitadelCompletions',   label: 'Citadel Completions' },
    { value: 'ReckoningOfTheGodsCompletions',      label: 'Reckoning Completions' },
  ] },
  { label: 'Speed Runs', items: [
    { value: 'ChimeraSpeed',               label: 'Chimera' },
    { value: 'DevilSpeed',                 label: 'Devil' },
    { value: 'GriffinSpeed',               label: 'Griffin' },
    { value: 'GuardiansOfTheCitadelSpeed', label: 'Citadel' },
    { value: 'HadesSpeed',                 label: 'Hades' },
    { value: 'KronosSpeed',                label: 'Kronos' },
    { value: 'MalignantSpiderSpeed',       label: 'Malignant Spider' },
    { value: 'MedusaSpeed',                label: 'Medusa' },
    { value: 'MesinesSpeed',               label: 'Mesines' },
    { value: 'OtherworldlyGolemSpeed',     label: 'Golem' },
    { value: 'ReckoningOfTheGodsSpeed',    label: 'Reckoning' },
    { value: 'SkeletonWarriorSpeed',       label: 'Skeleton Warrior' },
    { value: 'SobekSpeed',                 label: 'Sobek' },
    { value: 'ZeusSpeed',                  label: 'Zeus' },
  ] },
];
const ALL_CATS = CATEGORY_GROUPS.flatMap(g => g.items);

let searchInput = '';
let selectedCat   = 'totalPoints';
let catDropOpen   = false;

$: selectedLabel = ALL_CATS.find(c => c.value === selectedCat)?.label ?? selectedCat;

// Leaderboard data — fetched once, filtered client-side per category
let overallLb: { clanName: string; points: number }[] = [];
let topClans: { topScoreClans: any[]; topTimeClans: any[] } | null = null;
let lbLoading = false;
let lbError   = false;

let standings: StandingEntry[] = [];
let clanLoading = false;
let clanError   = false;

$: isLookup = searchInput.trim().length > 0;
$: skillRows   = standings.filter(e => SKILL_SET.has(e.objective));
$: bossRows    = standings.filter(e => BOSS_SET.has(e.objective));
$: specialRows = standings.filter(e => SPECIAL_SET.has(e.objective));
$: speedRows   = standings.filter(e => isSpeed(e));

$: colHeader = selectedCat === 'totalPoints' ? 'All Time Pts'
  : selectedCat.endsWith('Speed') ? 'Best Time'
  : 'Score';

$: lbRows = ((): LbRow[] => {
  if (selectedCat === 'totalPoints') {
    return overallLb.map((e, i) => ({ clanName: e.clanName, display: e.points.toLocaleString(), rank: i + 1 }));
  }
  if (!topClans) return [];
  if (selectedCat.endsWith('Speed')) {
    const obj = topClans.topTimeClans.find((o: any) => o.objective === selectedCat);
    if (!obj) return [];
    return obj.standings.map((e: any) => ({
      clanName: e.clanName,
      display: formatSpeed(e.bestTime.time),
      rank: e.rank,
    }));
  }
  const obj = topClans.topScoreClans.find((o: any) => o.objective === selectedCat);
  if (!obj) return [];
  return obj.standings.map((e: any) => ({
    clanName: e.clanName,
    display: formatGold(e.score),
    rank: e.rank,
  }));
})();

async function loadLeaderboard() {
  lbLoading = true; lbError = false;
  try {
    const [overallRes, topRes] = await Promise.all([
      fetch(`${API}/api/ClanCup/leaderboard/Default/totalPoints?limit=25`),
      fetch(`${API}/api/ClanCup/top-clans/current?gameMode=Default`),
    ]);
    if (!overallRes.ok || !topRes.ok) throw new Error();
    overallLb = await overallRes.json();
    topClans  = await topRes.json();
  } catch { lbError = true; }
  finally { lbLoading = false; }
}

async function loadClan(name: string) {
  clanLoading = true; clanError = false; standings = [];
  try {
    const res = await fetch(`${API}/api/ClanCup/standings/${encodeURIComponent(name)}?gameMode=Default`);
    if (!res.ok) throw new Error();
    standings = await res.json();
    if (!standings.length) clanError = true;
  } catch { clanError = true; }
  finally { clanLoading = false; }
}

let debounce: ReturnType<typeof setTimeout>;
function onInput() {
  clearTimeout(debounce);
  if (!searchInput.trim()) {
    standings = []; clanError = false; return;
  }
  debounce = setTimeout(() => loadClan(searchInput.trim()), 500);
}

function clearSearch() {
  searchInput = ''; standings = []; clanError = false;
}

onMount(loadLeaderboard);
</script>

<svelte:window on:click={() => (catDropOpen = false)} />

<div class="cup-search-wrap">
  <input
    class="cup-input"
    placeholder="Search clan…"
    bind:value={searchInput}
    on:input={onInput}
  />
  {#if searchInput.length > 0}
    <button class="cup-clear" on:click={clearSearch}>✕</button>
  {/if}
</div>

{#if !isLookup}
  <!-- Leaderboard mode -->
  <div class="cat-dropdown" on:click|stopPropagation={() => (catDropOpen = !catDropOpen)}>
    <button class="cat-trigger" class:open={catDropOpen}>
      <span>{selectedLabel}</span>
      <svg width="8" height="5" viewBox="0 0 8 5" class="chevron" class:flipped={catDropOpen}>
        <path d="M0 0l4 5 4-5z" fill="currentColor" />
      </svg>
    </button>
    {#if catDropOpen}
      <div class="cat-menu">
        {#each CATEGORY_GROUPS as group}
          {#if group.label}
            <div class="cat-group-label">{group.label}</div>
          {/if}
          {#each group.items as item}
            <button
              class="cat-item"
              class:active={selectedCat === item.value}
              on:click|stopPropagation={() => { selectedCat = item.value; catDropOpen = false; }}
            >{item.label}</button>
          {/each}
        {/each}
      </div>
    {/if}
  </div>

  {#if lbLoading}
    <div class="cup-status">Loading…</div>
  {:else if lbError}
    <div class="cup-status error">Could not load leaderboard</div>
  {:else}
    <div class="cup-table-head">
      <span>#</span>
      <span>Clan</span>
      <span>{colHeader}</span>
    </div>
    {#each lbRows as row}
      <div class="cup-lb-row cup-lb-link" on:click={() => navigate('Clan', row.clanName)}>
        <span class="cup-pos {rankCls(row.rank)}">{row.rank}</span>
        <span class="cup-name">{row.clanName}</span>
        <span class="cup-pts">{row.display}</span>
      </div>
    {/each}
  {/if}

{:else}
  <!-- Clan lookup mode -->
  {#if clanLoading}
    <div class="cup-status">Loading…</div>
  {:else if clanError}
    <div class="cup-status error">Clan not found</div>
  {:else if standings.length}
    {#if skillRows.length}
      <div class="cup-section-label">Skills</div>
      {#each skillRows as e}
        <div class="cup-std-row">
          <span class="cup-obj">{e.objective}</span>
          <span class="cup-score">{scoreDisplay(e)}</span>
          <span class="cup-rnk {rankCls(e.rank)}">#{e.rank}</span>
        </div>
      {/each}
    {/if}
    {#if bossRows.length}
      <div class="cup-section-label">Boss Kills</div>
      {#each bossRows as e}
        <div class="cup-std-row">
          <span class="cup-obj">{lbl(e.objective)}</span>
          <span class="cup-score">{scoreDisplay(e)}</span>
          <span class="cup-rnk {rankCls(e.rank)}">#{e.rank}</span>
        </div>
      {/each}
    {/if}
    {#if specialRows.length}
      <div class="cup-section-label">Special</div>
      {#each specialRows as e}
        <div class="cup-std-row">
          <span class="cup-obj">{lbl(e.objective)}</span>
          <span class="cup-score">{scoreDisplay(e)}</span>
          <span class="cup-rnk {rankCls(e.rank)}">#{e.rank}</span>
        </div>
      {/each}
    {/if}
    {#if speedRows.length}
      <div class="cup-section-label">Speed Runs</div>
      {#each speedRows as e}
        <div class="cup-std-row">
          <span class="cup-obj">{lbl(e.objective)}</span>
          <span class="cup-score">{scoreDisplay(e)}</span>
          <span class="cup-rnk {rankCls(e.rank)}">#{e.rank}</span>
        </div>
      {/each}
    {/if}
  {/if}
{/if}

<style>
  .cup-search-wrap {
    position: relative;
    margin-bottom: 8px;
  }

  .cup-input {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 12px;
    padding: 7px 10px; font-family: 'Nunito', sans-serif; padding-right: 28px;
    box-sizing: border-box;
  }
  .cup-input:focus { outline: none; border-color: var(--accent-md); }

  .cup-clear {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: var(--text-faint); font-size: 11px;
    cursor: pointer; padding: 2px 4px; line-height: 1; transition: color 0.15s; width: auto;
  }
  .cup-clear:hover { color: var(--accent); }

  .cat-dropdown {
    position: relative;
    margin-bottom: 8px;
    user-select: none;
  }

  .cat-trigger {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); font-size: 11px; font-weight: 600;
    padding: 6px 8px; font-family: 'Nunito', sans-serif;
    cursor: pointer; transition: border-color 0.1s;
  }
  .cat-trigger:hover, .cat-trigger.open { border-color: var(--accent-md); }

  .chevron { flex-shrink: 0; color: var(--text-dim); transition: transform 0.15s; }
  .chevron.flipped { transform: rotate(180deg); }

  .cat-menu {
    position: absolute; top: calc(100% + 3px); left: 0; right: 0;
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px;
    z-index: 20; max-height: 220px; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
    padding: 3px;
  }

  .cat-group-label {
    font-size: 8px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
    color: var(--text-dim); padding: 6px 8px 3px; pointer-events: none;
  }

  .cat-item {
    display: block; width: 100%; text-align: left;
    background: none; border: none; border-radius: 4px;
    color: var(--text-sub); font-size: 11px; font-weight: 600;
    padding: 5px 8px; font-family: 'Nunito', sans-serif;
    cursor: pointer; transition: background 0.1s, color 0.1s;
  }
  .cat-item:hover { background: var(--bg-card); color: var(--text); }
  .cat-item.active { color: var(--accent); }

  .cup-status { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }
  .cup-status.error { color: #7a3a3a; }

  .cup-table-head {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 6px;
    padding: 0 6px 4px;
    font-size: 8px; font-weight: 700; letter-spacing: 0.8px;
    text-transform: uppercase; color: var(--text-dim);
  }
  .cup-table-head span:last-child { text-align: right; }

  .cup-lb-row {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: 6px;
    align-items: center;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 6px;
    margin-bottom: 2px;
    font-size: 11px;
  }
  .cup-lb-link { cursor: pointer; transition: border-color 0.1s; }
  .cup-lb-link:hover { border-color: var(--accent-md); }

  .cup-pos {
    font-size: 10px; font-weight: 700; text-align: center;
  }
  .cup-name { color: var(--text-hi); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cup-pts  { color: var(--text-sub); font-size: 10px; font-weight: 600; text-align: right; }

  .cup-section-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: var(--text-faint);
    margin: 10px 0 4px;
  }

  .cup-std-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px;
    align-items: center;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 6px;
    margin-bottom: 2px;
    font-size: 11px;
  }

  .cup-obj   { color: var(--text-hi); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cup-score { color: var(--text-sub); font-size: 10px; font-weight: 600; text-align: right; }
  .cup-rnk   { font-size: 10px; font-weight: 700; text-align: right; min-width: 36px; }

  /* Rank colours */
  .rk-gold   { color: var(--accent); }
  .rk-silver { color: var(--text-hi); }
  .rk-bronze { color: var(--text-sub); }
  .rk-plain  { color: var(--text-faint); }
</style>
