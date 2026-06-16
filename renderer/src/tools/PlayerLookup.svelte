<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Player Lookup',
    desc: 'Skills, upgrades & profile info',
    icon: '🔎',
  };
</script>

<script lang="ts">
import { xpToLevel, XP_TABLE, formatGold, formatItemName, createNavListener, clients } from '../lib/store';
import DevPanel from '../lib/DevPanel.svelte';

interface RawProfile {
  username: string | null;
  gameMode: string | null;
  guildName: string | null;
  skillExperiences: Record<string, number> | null;
  upgrades: Record<string, number> | null;
  pvmStats: Record<string, number> | null;
  enchantmentBoosts: Record<string, number> | null;
  hoursOffline: number;
  activeServerId: string | null;
  taskNameOnLogout: string | null;
}

const SKILL_GROUPS: { label: string; keys: string[] }[] = [
  { label: 'Combat',     keys: ['attack', 'strength', 'defence', 'archery', 'magic', 'health'] },
  { label: 'Gathering',  keys: ['woodcutting', 'fishing', 'mining', 'foraging', 'farming'] },
  { label: 'Processing', keys: ['cooking', 'smithing', 'crafting', 'carpentry', 'brewing', 'enchanting'] },
  { label: 'Other',      keys: ['agility', 'plundering', 'exterminating', 'invocation'] },
];

let searchInput = '';
let profile: RawProfile | null = null;
let loading = false;
let notFound = false;
let hasError = false;

// ── Recent players ─────────────────────────────────────────────────────────
const _RECENT_KEY = 'icc-lookup-recent';
let recentPlayers: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(_RECENT_KEY) ?? '[]'); } catch { return []; }
})();

function addToRecent(name: string) {
  recentPlayers = [name, ...recentPlayers.filter(n => n.toLowerCase() !== name.toLowerCase())].slice(0, 20);
  try { localStorage.setItem(_RECENT_KEY, JSON.stringify(recentPlayers)); } catch {}
}

// ── Clan members ───────────────────────────────────────────────────────────
let clanMembers: string[] = [];
let clanMembersLoading = false;
let _clanFetchedKey = '';

$: {
  const clans = [...new Set(
    $clients
      .filter(c => c.playerName && c.profile?.guildName)
      .map(c => c.profile!.guildName!)
  )];
  const key = clans.sort().join('|');
  if (key && key !== _clanFetchedKey) {
    _clanFetchedKey = key;
    fetchClanMembers(clans);
  }
}

async function fetchClanMembers(clanNames: string[]) {
  clanMembersLoading = true;
  clanMembers = [];
  try {
    const clientSet = new Set($clients.map(c => c.playerName?.toLowerCase()).filter(Boolean) as string[]);
    const results = await Promise.all(
      clanNames.map(cn =>
        fetch(`https://query.idleclans.com/api/Clan/${encodeURIComponent(cn)}/experience`)
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    );
    const members = new Set<string>();
    for (const data of results) {
      if (!data?.playerContributions) continue;
      for (const p of data.playerContributions as { username?: string }[]) {
        if (p.username && !clientSet.has(p.username.toLowerCase())) {
          members.add(p.username);
        }
      }
    }
    clanMembers = [...members].sort();
  } finally {
    clanMembersLoading = false;
  }
}

const incomingNav = createNavListener('Player Lookup');
$: if ($incomingNav !== null) { searchInput = $incomingNav; lookup(); }

$: skillMap = profile?.skillExperiences ?? {};
$: allSkills = Object.entries(skillMap).map(([, xp]) => ({ xp, level: xpToLevel(xp) }));
$: totalLevel = allSkills.reduce((s, sk) => s + sk.level, 0);
$: totalXp    = allSkills.reduce((s, sk) => s + sk.xp, 0);

$: purchasedUpgrades = profile?.upgrades
  ? Object.entries(profile.upgrades).filter(([, v]) => v > 0)
  : [];

$: pvmEntries = profile?.pvmStats
  ? Object.entries(profile.pvmStats).filter(([, v]) => v > 0)
  : [];

$: enchantEntries = profile?.enchantmentBoosts
  ? Object.entries(profile.enchantmentBoosts).filter(([, v]) => v > 0)
  : [];

const SKILL_ICON: Record<string, string> = {
  attack: 'Rigour', strength: 'Strength', defence: 'Defence',
  archery: 'Archery', magic: 'Magic', health: 'Health',
  woodcutting: 'Woodcutting', fishing: 'Fishing', mining: 'Mining',
  foraging: 'Foraging', farming: 'Farming',
  cooking: 'Cooking', smithing: 'Smithing', crafting: 'Crafting',
  carpentry: 'Carpentry', brewing: 'Brewing', enchanting: 'Enchanting',
  agility: 'Agility', plundering: 'Plundering',
  exterminating: 'Exterminating', invocation: 'Invocation',
};

function skillXp(key: string): number { return skillMap[key] ?? 0; }
function skillLevel(key: string): number { return xpToLevel(skillXp(key)); }

function xpProgress(xp: number): number {
  const level = xpToLevel(xp);
  if (level >= 120) return 100;
  const curr = XP_TABLE[level - 1] ?? 0;
  const next = XP_TABLE[level] ?? curr;
  return next === curr ? 100 : Math.min(100, ((xp - curr) / (next - curr)) * 100);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatUpgradeName(key: string): string {
  return key
    .replace(/^upgrade_/, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatPvmKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatOffline(h: number): string {
  if (h < 0.017) return '< 1m ago';
  if (h < 1)     return `${Math.round(h * 60)}m ago`;
  if (h < 24)    return `${Math.floor(h)}h ago`;
  const d = Math.floor(h / 24);
  const r = Math.floor(h % 24);
  return r > 0 ? `${d}d ${r}h ago` : `${d}d ago`;
}

function getModeLogo(mode: string | null): string {
  const m = mode?.toLowerCase() ?? '';
  if (m === 'ironman' || m === 'ultimateironman') return './logos/Ironman.png';
  if (m === 'groupironmanprestige') return './logos/GroupIronmanPrestige.png';
  if (m === 'groupironman') return './logos/GroupIronman.png';
  return './logos/Default.png';
}

async function lookup() {
  const name = searchInput.trim();
  if (!name) return;
  loading = true;
  hasError = false;
  notFound = false;
  profile = null;
  try {
    const res = await fetch(
      `https://query.idleclans.com/api/Player/profile/${encodeURIComponent(name)}`
    );
    if (res.status === 404) { notFound = true; return; }
    if (!res.ok) throw new Error();
    profile = await res.json();
    if (profile?.username) addToRecent(profile.username);
  } catch {
    hasError = true;
  } finally {
    loading = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') lookup();
}

function clear() {
  searchInput = '';
  profile = null;
  notFound = false;
  hasError = false;
}

$: hasResult = loading || notFound || hasError || profile !== null;

$: displayRecent = (() => {
  const taken = new Set([
    ...$clients.map(c => c.playerName?.toLowerCase()).filter(Boolean) as string[],
    ...clanMembers.map(m => m.toLowerCase()),
  ]);
  return recentPlayers.filter(n => !taken.has(n.toLowerCase()));
})();
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Recent cache</span><span class="dev-val">{recentPlayers.length} players · icc-lookup-recent</span></div>
  <div class="dev-row"><span class="dev-key">Clan members</span><span class="dev-val">{clanMembers.length} loaded</span></div>
  <div class="dev-row"><span class="dev-key">Profile loaded</span><span class="dev-val">{profile ? (profile.username ?? '—') : 'none'}</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Profile API</span><span class="dev-val">/PlayerProfile/{'{name}'}</span></div>
  <div class="dev-row"><span class="dev-key">Clan API</span><span class="dev-val">/ClanProfile/{'{name}'}/members</span></div>
</DevPanel>

<div class="search-wrap">
  <div class="input-wrap">
    <input
      class="search-input"
      placeholder="Enter player name…"
      bind:value={searchInput}
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

{#if !hasResult}

{#if $clients.some(c => c.playerName)}
  <div class="chip-section">
    <div class="chip-label">Clients</div>
    <div class="chip-row">
      {#each $clients.filter(c => c.playerName) as client}
        <button class="chip" on:click={() => { searchInput = client.playerName!; lookup(); }}>
          {client.playerName}
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if clanMembersLoading || clanMembers.length}
  <div class="chip-section">
    <div class="chip-label">Clan</div>
    {#if clanMembersLoading}
      <span class="chip-hint">Loading…</span>
    {:else}
      <div class="chip-row">
        {#each clanMembers as name}
          <button class="chip" on:click={() => { searchInput = name; lookup(); }}>
            {name}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#if displayRecent.length}
  <div class="chip-section">
    <div class="chip-label">Recent</div>
    <div class="chip-row">
      {#each displayRecent as name}
        <button class="chip" on:click={() => { searchInput = name; lookup(); }}>
          {name}
        </button>
      {/each}
    </div>
  </div>
{/if}

{/if}

{#if loading}
  <div class="status">Loading…</div>
{:else if notFound}
  <div class="status error">Player not found</div>
{:else if hasError}
  <div class="status error">Failed to load profile</div>
{:else if profile}

  <!-- Profile header -->
  <div class="profile-card">
    <div class="avatar"><img class="avatar-logo" src={getModeLogo(profile.gameMode)} alt="" /></div>
    <div class="profile-info">
      <div class="name-row">
        <span class="profile-name">{profile.username}</span>
      </div>
      <span class="profile-clan">{profile.guildName ?? 'No clan'}</span>
    </div>
    <div class="online-pill" class:online={!!profile.activeServerId}>
      <span class="dot"></span>
      <span>{profile.activeServerId ? 'Online' : formatOffline(profile.hoursOffline)}</span>
    </div>
  </div>

  <!-- Summary stats -->
  <div class="stats-row">
    <div class="stat-box">
      <span class="stat-val">{totalLevel.toLocaleString()}</span>
      <span class="stat-lbl">Total Level</span>
    </div>
    <div class="stat-box">
      <span class="stat-val">{formatGold(totalXp)}</span>
      <span class="stat-lbl">Total XP</span>
    </div>
    <div class="stat-box stat-box-wide">
      <span class="activity-val">{profile.taskNameOnLogout ? formatItemName(profile.taskNameOnLogout) : '—'}</span>
      <span class="stat-lbl">Last Activity</span>
    </div>
  </div>

  <!-- Skills -->
  {#each SKILL_GROUPS as group}
    {@const groupSkills = group.keys.filter(k => k in skillMap)}
    {#if groupSkills.length}
      <div class="section-label">{group.label}</div>
      <div class="skills-list">
        {#each groupSkills as key}
          {@const xp = skillXp(key)}
          {@const level = skillLevel(key)}
          {@const pct = xpProgress(xp)}
          <div class="skill-row">
            {#if SKILL_ICON[key]}
              <img class="skill-icon" src="./skilltaskicons/{SKILL_ICON[key]}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
            {:else}
              <span class="skill-icon-placeholder"></span>
            {/if}
            <span class="skill-name">{cap(key)}</span>
            <span class="skill-level">Lv.{level}</span>
            <span class="skill-xp">{xp > 0 ? formatGold(xp) : '—'}</span>
            <div class="bar-wrap">
              <div class="bar-fill" style="width:{pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/each}

  <!-- Upgrades -->
  {#if purchasedUpgrades.length}
    <div class="section-label">Upgrades</div>
    <div class="upgrades-grid">
      {#each purchasedUpgrades as [key, val]}
        <div class="upgrade-tag">
          <span class="upgrade-name">{formatUpgradeName(key)}</span>
          {#if val > 1}
            <span class="upgrade-level">×{val}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Enchantment boosts -->
  {#if enchantEntries.length}
    <div class="section-label">Enchantments</div>
    <div class="upgrades-grid">
      {#each enchantEntries as [key, val]}
        <div class="upgrade-tag">
          <span class="upgrade-name">{formatUpgradeName(key)}</span>
          <span class="upgrade-level">{val}%</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- PvM stats -->
  {#if pvmEntries.length}
    <div class="section-label">PvM Stats</div>
    <div class="pvm-list">
      {#each pvmEntries as [key, val]}
        <div class="pvm-row">
          <span class="pvm-name">{formatPvmKey(key)}</span>
          <span class="pvm-val">{val.toLocaleString()}</span>
        </div>
      {/each}
    </div>
  {/if}

{/if}

<style>
  .search-wrap {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
  }

  .input-wrap { position: relative; flex: 1; }

  .search-input {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    padding: 7px 10px;
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

  .status {
    text-align: center;
    font-size: 11px;
    color: var(--text-faint);
    padding: 16px 0;
  }
  .status.error { color: #7a3a3a; }

  /* ── Profile card ── */
  .profile-card {
    display: flex;
    align-items: center;
    gap: 9px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 10px;
    margin-bottom: 7px;
  }

  .avatar {
    width: 34px; height: 34px;
    border-radius: 7px;
    background: linear-gradient(135deg, var(--border), var(--bg-raised));
    border: 1px solid var(--border);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .avatar-logo { width: 22px; height: 22px; object-fit: contain; }

  .profile-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .profile-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .profile-clan {
    font-size: 10px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .online-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 9px;
    font-weight: 700;
    color: var(--text-dim);
    white-space: nowrap;
    flex-shrink: 0;
  }
  .online-pill.online { color: #4ade80; }

  .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--text-muted);
    flex-shrink: 0;
  }
  .online-pill.online .dot { background: #4ade80; box-shadow: 0 0 5px #4ade8060; }

  /* ── Stats row ── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    margin-bottom: 10px;
  }

  .stat-box {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 5px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  .stat-box-wide {
    grid-column: span 1;
  }

  .stat-val {
    font-size: 12px;
    font-weight: 700;
    color: var(--accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .activity-val {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent);
    text-align: center;
    white-space: normal;
    line-height: 1.3;
    word-break: break-word;
    width: 100%;
  }

  .stat-lbl {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: var(--text-faint);
    text-transform: uppercase;
    white-space: nowrap;
    margin-top: auto;
  }

  /* ── Section label ── */
  .section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
    margin: 8px 0 4px;
  }
  .section-label::before, .section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* ── Skills ── */
  .skills-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 2px;
  }

  .skill-row {
    display: grid;
    grid-template-columns: 18px 1fr auto auto;
    grid-template-rows: auto 3px;
    column-gap: 6px;
    row-gap: 3px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px 4px;
    align-items: center;
  }

  .skill-icon {
    width: 18px; height: 18px;
    object-fit: contain;
    grid-row: 1;
    flex-shrink: 0;
  }

  .skill-icon-placeholder {
    width: 18px; height: 18px;
    grid-row: 1;
  }

  .skill-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
    grid-row: 1;
  }

  .skill-level {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-dim);
    grid-row: 1;
    white-space: nowrap;
  }

  .skill-xp {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    grid-row: 1;
    min-width: 36px;
    text-align: right;
    white-space: nowrap;
  }

  .bar-wrap {
    grid-column: 1 / -1;
    grid-row: 2;
    background: var(--bg-raised);
    border-radius: 2px;
    overflow: hidden;
    height: 3px;
  }

  .bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    opacity: 0.55;
    transition: width 0.3s ease;
  }

  /* ── Upgrades ── */
  .upgrades-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 2px;
  }

  .upgrade-tag {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 7px;
  }

  .upgrade-name {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-sub);
  }

  .upgrade-level {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent);
  }

  /* ── PvM stats ── */
  .pvm-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pvm-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px;
  }

  .pvm-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text);
  }

  .pvm-val {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
  }

  /* ── Quick-access chip sections ── */
  .chip-section { margin-bottom: 10px; display: flex; flex-direction: column; gap: 5px; }

  .chip-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
  }
  .chip-label::before, .chip-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .chip-row { display: flex; flex-wrap: wrap; gap: 3px; }

  .chip {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 10px; font-weight: 600; padding: 2px 7px;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .chip:hover { border-color: var(--accent-md); color: var(--accent); }

  .chip-hint { font-size: 10px; color: var(--text-faint); padding: 2px 0; }
</style>
