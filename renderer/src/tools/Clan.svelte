<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Clan Leaderboard',
    desc: 'Clan XP leaderboard',
    icon: '🏆',
  };
</script>

<script lang="ts">
import { formatGold, xpToLevel, fetchProfile } from '../lib/store';

interface PlayerEntry {
  username: string;
  totalXp: number;
  skills: Record<string, number>;
}

const RANK_COLORS: Record<number, string> = { 0: '#e8b84b', 1: '#8890b0', 2: '#c87941' };

let clanInput = '';
let clanName = '';
let players: PlayerEntry[] = [];
let clanLoading = false;
let clanError = false;
let selectedSkill = 'Total';
let dropdownOpen = false;

$: skills = players.length
  ? ['Total', ...[...new Set(players.flatMap(p => Object.keys(p.skills)))].sort()]
  : [];

$: rankedPlayers = [...players].sort((a, b) => {
  if (selectedSkill === 'Total') return b.totalXp - a.totalXp;
  return (b.skills[selectedSkill] ?? 0) - (a.skills[selectedSkill] ?? 0);
});

async function fetchClan() {
  const name = clanInput.trim();
  if (!name) return;
  clanLoading = true;
  clanError = false;
  players = [];
  clanName = '';
  try {
    const res = await fetch(
      `https://query.idleclans.com/api/Clan/${encodeURIComponent(name)}/experience`
    );
    if (!res.ok) throw new Error();
    const clanData = await res.json();
    clanName = clanData.clanName;

    const usernames: string[] = clanData.playerContributions.map((p: any) => p.username);
    const profiles = await Promise.all(usernames.map((u: string) => fetchProfile(u)));

    players = profiles
      .filter((p): p is NonNullable<typeof p> => p !== null && p.skillExperiences !== null)
      .map(p => ({
        username: p.username ?? '',
        totalXp: Object.values(p.skillExperiences!).reduce((a, b) => a + b, 0),
        skills: p.skillExperiences!,
      }));

    selectedSkill = 'Total';
  } catch {
    clanError = true;
  } finally {
    clanLoading = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') fetchClan();
}

function selectSkill(skill: string) {
  selectedSkill = skill;
  dropdownOpen = false;
}
</script>

<svelte:window on:click={() => (dropdownOpen = false)} />

<div class="clan-input-wrap">
  <input
    class="clan-input"
    placeholder="Enter clan name…"
    bind:value={clanInput}
    on:keydown={onKeydown}
  />
  <button class="clan-search-btn" on:click={fetchClan} disabled={clanLoading}>
    {clanLoading ? '…' : '→'}
  </button>
</div>

{#if clanLoading}
  <div class="clan-status">Loading…</div>
{:else if clanError}
  <div class="clan-status error">Clan not found</div>
{:else if players.length}
  <div class="clan-header">
    <span class="clan-name">{clanName}</span>
    <span class="clan-meta">{players.length} members</span>
  </div>

  <div class="skill-dropdown" on:click|stopPropagation={() => (dropdownOpen = !dropdownOpen)}>
    <button class="skill-dropdown-trigger" class:open={dropdownOpen}>
      <span>{selectedSkill}</span>
      <svg width="8" height="5" viewBox="0 0 8 5" class="chevron" class:flipped={dropdownOpen}>
        <path d="M0 0l4 5 4-5z" fill="#474d6d" />
      </svg>
    </button>
    {#if dropdownOpen}
      <div class="skill-dropdown-menu">
        {#each skills as skill}
          <button
            class="skill-dropdown-item"
            class:active={selectedSkill === skill}
            on:click|stopPropagation={() => selectSkill(skill)}
          >
            {skill}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="leaderboard">
    {#each rankedPlayers as player, i}
      {@const xp = selectedSkill === 'Total' ? player.totalXp : (player.skills[selectedSkill] ?? 0)}
      {@const level = selectedSkill !== 'Total' ? xpToLevel(xp) : null}
      <div class="lb-row" class:lb-no-data={xp === 0}>
        <span class="lb-rank" style="color: {RANK_COLORS[i] ?? '#474d6d'}">{i + 1}</span>
        <span class="lb-name">{player.username}</span>
        <div class="lb-right">
          {#if level !== null}
            <span class="lb-level">Lv.{level}</span>
          {/if}
          <span class="lb-xp">{xp > 0 ? formatGold(xp) : '—'}</span>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .clan-input-wrap {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .clan-input {
    flex: 1;
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 6px;
    color: #c8cad4;
    font-size: 12px;
    padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
  }
  .clan-input:focus { outline: none; border-color: #e8b84b55; }

  .clan-search-btn {
    background: #1a1c2e;
    border: 1px solid #1e2030;
    border-radius: 6px;
    color: #e8b84b;
    font-size: 13px;
    padding: 0 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    font-family: 'Nunito', sans-serif;
    flex-shrink: 0;
  }
  .clan-search-btn:hover:not(:disabled) { background: #22253a; border-color: #e8b84b55; }
  .clan-search-btn:disabled { opacity: 0.4; cursor: default; }

  .clan-status {
    text-align: center;
    font-size: 11px;
    color: #3a3f58;
    padding: 16px 0;
  }
  .clan-status.error { color: #7a3a3a; }

  .clan-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 8px;
    gap: 6px;
  }
  .clan-name {
    font-size: 13px;
    font-weight: 700;
    color: #c8cad4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .clan-meta {
    font-size: 9px;
    color: #474d6d;
    white-space: nowrap;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .skill-dropdown {
    position: relative;
    margin-bottom: 8px;
    user-select: none;
  }

  .skill-dropdown-trigger {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 6px;
    color: #c8cad4;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 8px;
    font-family: 'Nunito', sans-serif;
    cursor: pointer;
    transition: border-color 0.1s;
  }
  .skill-dropdown-trigger:hover,
  .skill-dropdown-trigger.open { border-color: #e8b84b55; }

  .chevron {
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .chevron.flipped { transform: rotate(180deg); }

  .skill-dropdown-menu {
    position: absolute;
    top: calc(100% + 3px);
    left: 0;
    right: 0;
    background: #1a1c2e;
    border: 1px solid #1e2030;
    border-radius: 6px;
    z-index: 20;
    max-height: 160px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e2030 transparent;
    padding: 3px;
  }

  .skill-dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 4px;
    color: #8890b0;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
    font-family: 'Nunito', sans-serif;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .skill-dropdown-item:hover { background: #13151f; color: #c8cad4; }
  .skill-dropdown-item.active { color: #e8b84b; }

  .leaderboard {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lb-row {
    display: flex;
    align-items: center;
    gap: 7px;
    background: #13151f;
    border: 1px solid #1e2030;
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
  }
  .lb-row.lb-no-data { opacity: 0.35; }

  .lb-rank {
    font-size: 10px;
    font-weight: 700;
    width: 14px;
    text-align: right;
    flex-shrink: 0;
  }
  .lb-name {
    flex: 1;
    color: #c8cad4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
  }
  .lb-right {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }
  .lb-level {
    font-size: 9px;
    color: #474d6d;
    font-weight: 700;
  }
  .lb-xp {
    font-size: 11px;
    color: #e8b84b;
    font-weight: 700;
    min-width: 38px;
    text-align: right;
  }
</style>
