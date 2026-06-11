<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Clan',
    desc: 'Clan XP leaderboard & cup standings',
    icon: '/skilltaskicons/Clan.png',
  };
</script>

<script lang="ts">
import { formatGold, xpToLevel, fetchProfile, navigate, createNavListener, clients, type ClientCard } from '../lib/store';
import CustomSelect from '../lib/CustomSelect.svelte';

interface CupStanding {
  objective: string;
  score?: number;
  rank: number;
  bestTime?: { time: number; achievedAt: string };
}

interface PlayerEntry {
  username: string;
  totalXp: number;
  skills: Record<string, number>;
}

const RANK_COLORS: Record<number, string> = { 0: '#e8b84b', 1: '#8890b0', 2: '#c87941' };

let clanInput = '';
let clanAutoFilled = false;
let clanName = '';
let lifetimePlayers: PlayerEntry[] = [];
let contributedPlayers: PlayerEntry[] = [];
type ViewMode = 'lifetime' | 'contributed';
let viewMode: ViewMode = 'lifetime';
let clanLoading = false;
let clanError = false;
let selectedSkill = 'Total';
let cupStandings: CupStanding[] = [];
let _cupGen = 0;
type CupSection = 'skills' | 'kills' | 'speed' | 'points';
let cupSection: CupSection = 'skills';

const RANK_POINTS: Record<number, number> = {
  1: 5000, 2: 3500, 3: 3000, 4: 2500, 5: 2000,
  6: 1500, 7: 1000, 8: 750, 9: 500, 10: 250,
};

const incomingNav = createNavListener('Clan');
$: if ($incomingNav !== null) { clanInput = $incomingNav; fetchClan(); }

$: players = viewMode === 'lifetime' ? lifetimePlayers : contributedPlayers;

$: skills = players.length
  ? ['Total', ...[...new Set(players.flatMap(p => Object.keys(p.skills)))].sort()]
  : [];

$: rankedPlayers = [...players].sort((a, b) => {
  if (selectedSkill === 'Total') return b.totalXp - a.totalXp;
  return (b.skills[selectedSkill] ?? 0) - (a.skills[selectedSkill] ?? 0);
});

$: cupBySection = (() => {
  const bySection = { skills: [] as CupStanding[], kills: [] as CupStanding[], speed: [] as CupStanding[] };
  for (const s of cupStandings) {
    if (s.objective.endsWith('Speed')) bySection.speed.push(s);
    else if (s.objective.endsWith('Kills') || s.objective.endsWith('Completions') || s.objective === 'BloodmoonMassacre') bySection.kills.push(s);
    else bySection.skills.push(s);
  }
  bySection.skills.sort((a, b) => a.rank - b.rank);
  bySection.kills.sort((a, b) => a.rank - b.rank);
  bySection.speed.sort((a, b) => a.rank - b.rank);
  return bySection;
})();

$: activeCupRows = cupSection !== 'points' ? cupBySection[cupSection] : [];
$: totalCupPoints = cupStandings.reduce((sum, s) => sum + (RANK_POINTS[s.rank] ?? 0), 0);
$: pointsRows = cupStandings
  .filter(s => s.rank <= 10)
  .map(s => ({ ...s, pts: RANK_POINTS[s.rank] ?? 0 }))
  .sort((a, b) => b.pts - a.pts);
$: cupTimeRemaining = (() => {
  if (!cupStandings.length) return null;
  // Cup resets weekly on Sunday at 16:00 UTC
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysUntilSunday = day === 0 ? 0 : 7 - day;
  const end = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday, 16, 0, 0, 0
  ));
  if (end <= now) end.setUTCDate(end.getUTCDate() + 7);
  const ms = end.getTime() - now.getTime();
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hrs = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
})();

function formatObjective(s: string): string {
  return s.replace(/Completions$/, '').replace(/Kills$/, '').replace(/Speed$/, '').replace(/([A-Z])/g, ' $1').trim();
}

function formatTimePrecise(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) return `${totalSec.toFixed(2)}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = (totalSec % 60).toFixed(2);
  if (totalSec < 3600) return `${mins}m ${secs}s`;
  const hrs = Math.floor(totalSec / 3600);
  const remMins = Math.floor((totalSec % 3600) / 60);
  const remSecs = (totalSec % 60).toFixed(2);
  return `${hrs}h ${remMins}m ${remSecs}s`;
}

function formatCupScore(s: CupStanding): string {
  if (s.bestTime) return formatTimePrecise(s.bestTime.time);
  return s.score != null ? formatGold(s.score) : '—';
}

async function fetchClan() {
  const name = clanInput.trim();
  if (!name) return;
  clanLoading = true;
  clanError = false;
  lifetimePlayers = [];
  contributedPlayers = [];
  clanName = '';
  cupStandings = [];
  try {
    const res = await fetch(
      `https://query.idleclans.com/api/Clan/${encodeURIComponent(name)}/experience`
    );
    if (!res.ok) throw new Error();
    const clanData = await res.json();
    clanName = clanData.clanName;

    contributedPlayers = (clanData.playerContributions as any[])
      .filter(p => p.username)
      .map(p => ({
        username: p.username as string,
        totalXp: p.totalExperience ?? 0,
        skills: Object.fromEntries(
          Object.entries((p.skills ?? {}) as Record<string, { experience: number }>)
            .map(([k, v]) => [k, v.experience])
        ) as Record<string, number>,
      }));

    const usernames = contributedPlayers.map(p => p.username);
    const lifetime: PlayerEntry[] = [];
    for (let i = 0; i < usernames.length; i += 5) {
      const batch = usernames.slice(i, i + 5);
      const profiles = await Promise.all(batch.map(u => fetchProfile(u)));
      for (const p of profiles) {
        if (p?.skillExperiences) {
          lifetime.push({
            username: p.username ?? '',
            totalXp: Object.values(p.skillExperiences).reduce((a, b) => a + b, 0),
            skills: p.skillExperiences,
          });
        }
      }
      if (i + 5 < usernames.length) await new Promise(r => setTimeout(r, 200));
    }
    lifetimePlayers = lifetime;

    selectedSkill = 'Total';
  } catch {
    clanError = true;
  } finally {
    clanLoading = false;
  }

  const gen = ++_cupGen;
  (async () => {
    try {
      for (const mode of ['Default', 'Ironman']) {
        const r = await fetch(`https://query.idleclans.com/api/ClanCup/standings/${encodeURIComponent(name)}?gameMode=${mode}`);
        if (r.ok) {
          const data = await r.json();
          if (Array.isArray(data) && data.length && gen === _cupGen) { cupStandings = data; break; }
        }
      }
    } catch {}
  })();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') fetchClan();
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

$: hasResult = clanLoading || clanError || players.length > 0;

function clear() {
  clanInput = '';
  clanName = '';
  lifetimePlayers = [];
  contributedPlayers = [];
  clanError = false;
  clanAutoFilled = false;
  cupStandings = [];
}

$: clientsWithClan = (() => {
  const seen = new Set<string>();
  return $clients.filter(c => {
    const guild = c.profile?.guildName;
    if (!guild) return false;
    if (seen.has(guild)) return false;
    seen.add(guild);
    return true;
  });
})();

function fillFromClient(client: ClientCard) {
  const clan = client.profile?.guildName;
  if (!clan) return;
  clanInput = clan;
  clanAutoFilled = true;
  fetchClan();
}
</script>

<div class="clan-tool">
  <div class="clan-input-wrap">
    <div class="input-wrap">
      <input
        class="clan-input"
        class:field-auto={clanAutoFilled}
        placeholder="Enter clan name…"
        bind:value={clanInput}
        on:input={() => clanAutoFilled = false}
        on:keydown={onKeydown}
      />
      {#if hasResult}
        <button class="clear-btn" on:click={clear}>✕</button>
      {/if}
    </div>
    <button class="clan-search-btn" on:click={fetchClan} disabled={clanLoading}>
      {clanLoading ? '…' : '→'}
    </button>
  </div>

  {#if !hasResult && clientsWithClan.length}
    <div class="clients-row">
      {#each clientsWithClan as client}
        <button class="client-chip" on:click={() => fillFromClient(client)}>
          {client.profile?.guildName}
        </button>
      {/each}
    </div>
  {/if}

  {#if clanLoading}
    <div class="clan-status">Loading…</div>
  {:else if clanError}
    <div class="clan-status error">Clan not found</div>
  {:else if players.length}
    <div class="clan-header">
      <span class="clan-name">{clanName}</span>
    </div>

    {#if cupStandings.length}
      <div class="cup-card">
        <div class="cup-card-header">
          <span class="cup-card-title">Clan Cup</span>
          <div class="cup-tabs">
            <button class="cup-tab" class:active={cupSection === 'skills'} on:click={() => cupSection = 'skills'}>Skills</button>
            <button class="cup-tab" class:active={cupSection === 'kills'} on:click={() => cupSection = 'kills'}>Kills</button>
            <button class="cup-tab" class:active={cupSection === 'speed'} on:click={() => cupSection = 'speed'}>Speed</button>
            <button class="cup-tab" class:active={cupSection === 'points'} on:click={() => cupSection = 'points'}>Points</button>
          </div>
        </div>
        {#if cupSection === 'points'}
          <div class="cup-pts-total">
            <span>~{totalCupPoints.toLocaleString()} pts</span>
            {#if cupTimeRemaining}
              <span class="cup-reset">Resets in {cupTimeRemaining}</span>
            {/if}
          </div>
          <div class="cup-grid">
            {#each pointsRows as s}
              <span class="cup-obj">{formatObjective(s.objective)}</span>
              <span class="cup-rank" class:rank-gold={s.rank <= 3} class:rank-hi={s.rank > 3 && s.rank <= 10}>#{s.rank}</span>
              <span class="cup-score cup-score-pts">{s.pts.toLocaleString()}</span>
            {/each}
          </div>
        {:else}
          <div class="cup-grid">
            {#each activeCupRows as s}
              <span class="cup-obj">{formatObjective(s.objective)}</span>
              <span class="cup-rank" class:rank-gold={s.rank <= 3} class:rank-hi={s.rank > 3 && s.rank <= 10}>#{s.rank}</span>
              <span class="cup-score">{formatCupScore(s)}</span>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    <div class="skill-row">
      <CustomSelect bind:value={selectedSkill} options={skills.map(s => ({ label: cap(s), value: s }))} />
      <div class="view-toggle">
        <button class="view-btn" class:active={viewMode === 'lifetime'} on:click={() => viewMode = 'lifetime'}>Lifetime</button>
        <button class="view-btn" class:active={viewMode === 'contributed'} on:click={() => viewMode = 'contributed'}>Contrib</button>
      </div>
    </div>

    <div class="leaderboard">
      {#each rankedPlayers as player, i}
        {@const xp = selectedSkill === 'Total' ? player.totalXp : (player.skills[selectedSkill] ?? 0)}
        {@const level = selectedSkill !== 'Total' ? xpToLevel(xp) : null}
        <div class="lb-row" class:lb-no-data={xp === 0} on:click={() => navigate('Player Lookup', player.username)}>
          <span class="lb-rank" style="color: {RANK_COLORS[i] ?? 'var(--text-dim)'}">{i + 1}</span>
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
</div>

<style>
  .clan-tool {
    flex: 1; min-height: 0;
    overflow-y: auto; overflow-x: hidden; padding-right: 10px;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }

  .clan-input-wrap {
    display: flex;
    gap: 6px;
    margin-bottom: 8px;
  }

  .input-wrap { position: relative; flex: 1; }
  .clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: var(--text-faint); font-size: 11px;
    cursor: pointer; padding: 2px 4px; line-height: 1; transition: color 0.15s; width: auto;
  }
  .clear-btn:hover { color: var(--accent); }

  .clan-input {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    padding: 7px 10px;
    font-family: 'Nunito', sans-serif;
  }
  .clan-input:focus { outline: none; border-color: var(--accent-md); }
  .field-auto { border-color: var(--accent-md) !important; background: color-mix(in srgb, var(--accent) 7%, var(--bg-card)) !important; }

  .clan-search-btn {
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
  .clan-search-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent-md); }
  .clan-search-btn:disabled { opacity: 0.4; cursor: default; }

  .clients-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
  .client-chip {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 10px; font-weight: 600; padding: 3px 8px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .client-chip:hover { border-color: var(--accent-md); color: var(--accent); }

  .clan-status {
    text-align: center;
    font-size: 11px;
    color: var(--text-faint);
    padding: 16px 0;
  }
  .clan-status.error { color: #7a3a3a; }

  .clan-header {
    display: flex;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .clan-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .skill-row { display: flex; align-items: stretch; gap: 4px; margin-bottom: 8px; }
  .skill-row :global(.cs-wrap) { flex: 1; min-width: 0; }

  .view-toggle { display: flex; gap: 3px; flex-shrink: 0; }
  .view-btn {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-muted); font-size: 9px; font-weight: 700; padding: 0 7px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
    display: flex; align-items: center;
  }
  .view-btn:hover { color: var(--text-sub); border-color: var(--accent-lo); }
  .view-btn.active { color: var(--accent); border-color: var(--accent-hi); background: var(--bg-raised); }

  .leaderboard {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lb-row {
    display: flex;
    align-items: center;
    gap: 7px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 8px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.1s;
  }
  .lb-row:hover { border-color: var(--accent-md); }
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
    color: var(--text);
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
    color: var(--text-dim);
    font-weight: 700;
  }
  .lb-xp {
    font-size: 11px;
    color: var(--accent);
    font-weight: 700;
    min-width: 38px;
    text-align: right;
  }

  .cup-card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 7px;
    margin-bottom: 8px; overflow: hidden;
  }

  .cup-card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 8px 6px 10px;
  }

  .cup-card-title {
    font-size: 10px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: var(--text-faint);
  }

  .cup-tabs {
    display: flex; gap: 3px;
  }
  .cup-tab {
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 4px; color: var(--text-muted); font-size: 9px; font-weight: 700;
    padding: 2px 7px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.15s; width: auto;
  }
  .cup-tab:hover { color: var(--text-sub); border-color: var(--accent-lo); }
  .cup-tab.active { color: var(--accent); border-color: var(--accent-hi); background: var(--bg-raised); }

  .cup-pts-total {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 10px; font-weight: 700; color: var(--accent);
    padding: 0 10px 6px;
  }
  .cup-reset { font-size: 9px; color: var(--text-faint); font-weight: 600; }
  .cup-score-pts { color: var(--accent); font-weight: 700; }

  .cup-grid {
    display: grid; grid-template-columns: 1fr auto auto;
    row-gap: 2px; padding: 0 10px 8px;
  }

  .cup-obj {
    font-size: 10px; color: var(--text-sub);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-right: 4px;
  }
  .cup-rank {
    font-size: 10px; font-weight: 700; color: var(--text-muted);
    white-space: nowrap; padding: 0 8px; text-align: right;
  }
  .cup-rank.rank-gold { color: var(--accent); }
  .cup-rank.rank-hi { color: var(--pos); }
  .cup-score {
    font-size: 10px; color: var(--text-sub); text-align: right;
    white-space: nowrap; min-width: 42px;
  }
</style>
