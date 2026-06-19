<!-- renderer/src/_submissions/Bestiary.svelte -->
<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Bestiary',
    desc: 'Browse monsters and bosses with key stats',
    icon: '🐉',
    author: 'Z0ne'
  };
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  // ── Types ───────────────────────────────────────────────────────────────────
  interface LootEntry {
    itemId: number;
    amountMin: number;
    amountMax: number;
    weight: number;
  }

  interface Monster {
    name: string;
    attackLevel: number;
    strengthLevel: number;
    defenceLevel: number;
    archeryLevel: number;
    magicLevel: number;
    health: number;
    baseTime: number;
    respawnTime: number;
    meleeDefenceBonus: number;
    archeryDefenceBonus: number;
    magicDefenceBonus: number;
    weaknessType: number | null;
    isBoss: boolean;
    isClanBoss: boolean;
    bossType: number;
    loot: LootEntry[];
  }

  // ── Weakness (inlined from lib/weakness.ts) ─────────────────────────────────
  const WEAKNESS_LABELS: Record<number, string> = {
    1: 'Stab', 2: 'Slash', 3: 'Pound', 4: 'Crush',
    5: 'Archery', 6: 'Magic', 7: 'Varies', 8: 'All',
  };

  type WeaknessCategory = 'melee' | 'archery' | 'magic' | 'varies' | 'none';

  function weaknessLabel(wt: number | null | undefined): string {
    if (wt == null || wt <= 0) return 'None';
    return WEAKNESS_LABELS[wt] ?? 'None';
  }

  function weaknessCategory(wt: number | null | undefined): WeaknessCategory {
    if (wt == null || wt <= 0) return 'none';
    if (wt <= 4) return 'melee';
    if (wt === 5) return 'archery';
    if (wt === 6) return 'magic';
    if (wt === 7 || wt === 8) return 'varies';
    return 'none';
  }

  // ── Formatting (inlined from lib/store.ts) ──────────────────────────────────
  function formatItemName(name: string): string {
    return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }


  // ── Category color map ───────────────────────────────────────────────────────
  const CATEGORY_COLOR: Record<string, string> = {
    melee:   '#e8884b',
    archery: '#6eb86e',
    magic:   '#7baaf7',
    varies:  'var(--text-sub)',
    none:    'var(--text-sub)',
  };

  function weaknessColor(wt: number | null): string {
    return CATEGORY_COLOR[weaknessCategory(wt)] ?? 'var(--text-muted)';
  }

  // ── Filter mode ──────────────────────────────────────────────────────────────
  type FilterMode = 'all' | 'bosses' | 'clan';
  const FILTER_OPTIONS: { label: string; value: FilterMode }[] = [
    { label: 'All',        value: 'all'    },
    { label: 'Bosses',     value: 'bosses' },
    { label: 'Clan Bosses', value: 'clan'  },
  ];

  // ── Component state ──────────────────────────────────────────────────────────
  let allMonsters: Monster[] = [];
  let search      = '';
  let filterMode: FilterMode = 'all';
  let selected: Monster | null = null;
  let loading = true;
  let loadError = false;

  // ── Generation token — prevents stale fetches overwriting newer state ────────
  let _generation = 0;

  // ── Derived list ─────────────────────────────────────────────────────────────
  $: filtered = allMonsters.filter(m => {
    const q = search.toLowerCase();
    const nameMatch = formatItemName(m.name).toLowerCase().includes(q);
    const typeOk =
      filterMode === 'bosses' ? m.isBoss :
      filterMode === 'clan'   ? m.isClanBoss :
      true;
    return nameMatch && typeOk;
  }).sort((a, b) => a.health - b.health);

  // ── Icon helpers ──────────────────────────────────────────────────────────────
  function monsterIconPath(name: string): string {
    return `./combat/${name.replace(/ /g, '_')}.png`;
  }

  function onImgError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.src = './image_placeholder.png';
  }

  // ── Fetch + parse game data (inlined from lib/store.ts _loadGameConfigInner) ─
  async function loadGameData() {
    const gen = ++_generation;
    loading = true;
    loadError = false;

    try {
      const res = await fetch('https://query.idleclans.com/api/Configuration/game-data');
      if (!res.ok) {
        if (gen === _generation) { loadError = true; loading = false; }
        return;
      }
      const text = await res.text();
      // Clean MongoDB-extended JSON before parsing
      const cleaned = text.replace(/ObjectId\("([^"]+)"\)/g, '"$1"');
      const data = JSON.parse(cleaned);

      if (gen !== _generation) return; // stale — discard

      const monsters: Monster[] = [];

      // Regular + Invocation combat tasks
      for (const skillKey of ['Combat', 'Invocation']) {
        const groups = data.Tasks?.[skillKey];
        if (!Array.isArray(groups)) continue;
        for (const group of groups) {
          if (!Array.isArray(group.Items)) continue;
          for (const t of group.Items) {
            if (t.Disabled || !t.EnemyHealth) continue;
            monsters.push({
              name: t.Name,
              attackLevel:        t.EnemyRigourLevel        ?? 0,
              strengthLevel:      t.EnemyStrengthLevel      ?? 0,
              defenceLevel:       t.EnemyDefenceLevel       ?? 0,
              archeryLevel:       t.EnemyArcheryLevel       ?? 0,
              magicLevel:         t.EnemyMagicLevel         ?? 0,
              health:             t.EnemyHealth,
              baseTime:           t.BaseTime                ?? 0,
              respawnTime:        t.EnemyRespawnTime        ?? 0,
              meleeDefenceBonus:  t.EnemyDefenceBonus       ?? 0,
              archeryDefenceBonus:t.EnemyArcheryDefenceBonus?? 0,
              magicDefenceBonus:  t.EnemyMagicDefenceBonus  ?? 0,
              weaknessType:       t.AttackStyleWeakness     ?? null,
              isBoss:             t.IsBoss                  ?? false,
              isClanBoss:         false,
              bossType:           t.BossType                ?? 0,
              loot: Array.isArray(t.Loot)
                ? t.Loot.map((e: any) => ({
                    itemId:    e.ItemId,
                    amountMin: e.ItemAmountMin,
                    amountMax: e.ItemAmountMax,
                    weight:    e.Weight,
                  }))
                : [],
            });
          }
        }
      }

      // Clan bosses from top-level ClanBossInfos
      // (otherworldly_golem / skeleton_warrior / malignant_spider)
      if (Array.isArray(data.ClanBossInfos)) {
        for (const c of data.ClanBossInfos) {
          if (!c.EnemyHealth) continue;
          monsters.push({
            name:               c.BossNameLocalizationKey,
            attackLevel:        c.EnemyRigourLevel         ?? 0,
            strengthLevel:      c.EnemyStrengthLevel       ?? 0,
            defenceLevel:       c.EnemyDefenceLevel        ?? 0,
            archeryLevel:       c.EnemyArcheryLevel        ?? 0,
            magicLevel:         c.EnemyMagicLevel          ?? 0,
            health:             c.EnemyHealth,
            baseTime:           0,
            respawnTime:        c.EnemyRespawnTime         ?? 0,
            meleeDefenceBonus:  c.EnemyDefenceBonus        ?? 0,
            archeryDefenceBonus:c.EnemyArcheryDefenceBonus ?? 0,
            magicDefenceBonus:  c.EnemyMagicDefenceBonus   ?? 0,
            weaknessType:       c.AttackStyleWeakness      ?? null,
            isBoss:             false,
            isClanBoss:         true,
            bossType:           c.BossType                 ?? 0,
            loot: Array.isArray(c.LootTable)
              ? c.LootTable.map((e: any) => ({
                  itemId:    e.ItemId,
                  amountMin: e.ItemAmountMin,
                  amountMax: e.ItemAmountMax,
                  weight:    e.Weight,
                }))
              : [],
          });
        }
      }

      if (gen === _generation) {
        allMonsters = monsters;
        loading = false;
      }
    } catch (e) {
      if (gen === _generation) {
        loadError = true;
        loading = false;
      }
    }
  }

  onMount(() => { loadGameData(); });
</script>

<div class="container">

  <!-- Search bar (inlined SearchInput) -->
  <div class="si" class:focus-within={false}>
    <span class="si-lead">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    </span>
    <input
      class="si-input"
      type="text"
      placeholder="Search monsters…"
      bind:value={search}
    />
    {#if search.length > 0}
      <button
        type="button"
        class="si-clear"
        aria-label="Clear"
        on:click={() => { search = ''; }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  <!-- Segmented control (inlined SegmentedControl) -->
  {#if !loading && !loadError}
    {@const segCount = FILTER_OPTIONS.length}
    {@const segIndex = Math.max(0, FILTER_OPTIONS.findIndex(o => o.value === filterMode))}
    <div class="seg" role="tablist" style="--seg-count:{segCount}">
      <div
        class="seg-pill"
        aria-hidden="true"
        style="width:calc((100% - 4px)/{segCount});transform:translateX(calc({segIndex} * 100%))"
      ></div>
      {#each FILTER_OPTIONS as o}
        <button
          type="button"
          role="tab"
          class="seg-btn"
          class:active={o.value === filterMode}
          aria-selected={o.value === filterMode}
          on:click={() => { filterMode = o.value; selected = null; }}
        >{o.label}</button>
      {/each}
    </div>

    <div class="filter-row">
      <span class="count">{filtered.length} monsters</span>
    </div>
  {/if}

  <!-- Loading state -->
  {#if loading}
    <div class="card">
      <p class="empty-msg">Loading monster data…</p>
    </div>

  <!-- Error state -->
  {:else if loadError}
    <div class="card">
      <p class="empty-msg error-msg">Failed to load game data. Check your connection.</p>
      <div class="retry-row">
        <button class="retry-btn" on:click={loadGameData}>Retry</button>
      </div>
    </div>

  <!-- Empty search result -->
  {:else if filtered.length === 0}
    <div class="card">
      <p class="empty-msg">No monsters match "{search}".</p>
    </div>

  <!-- Detail view -->
  {:else if selected}
    <button class="back-btn" on:click={() => { selected = null; }}>← Back to list</button>

    <div class="card">
      <div class="detail-header">
        <img
          class="detail-icon"
          src={monsterIconPath(selected.name)}
          alt={formatItemName(selected.name)}
          on:error={onImgError}
        />
        <div class="detail-title">
          <span class="detail-name">{formatItemName(selected.name)}</span>
          {#if selected.isBoss}
            <span class="boss-badge">BOSS</span>
          {:else if selected.isClanBoss}
            <span class="clan-badge">CLAN</span>
          {/if}
        </div>
      </div>

      <!-- Section: Combat Stats -->
      <div class="section-label">
        <span class="sl-line"></span>
        <span class="sl-text">Combat Stats</span>
        <span class="sl-line"></span>
      </div>
      <div class="stat-grid">
        <div class="stat-cell">
          <span class="stat-value">{selected.health}</span>
          <span class="stat-label">HP</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.attackLevel}</span>
          <span class="stat-label">Attack</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.strengthLevel}</span>
          <span class="stat-label">Strength</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.defenceLevel}</span>
          <span class="stat-label">Defence</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.archeryLevel}</span>
          <span class="stat-label">Archery</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.magicLevel}</span>
          <span class="stat-label">Magic</span>
        </div>
      </div>

      <!-- Section: Defence Bonuses -->
      <div class="section-label">
        <span class="sl-line"></span>
        <span class="sl-text">Defence Bonuses</span>
        <span class="sl-line"></span>
      </div>
      <div class="stat-grid">
        <div class="stat-cell">
          <span class="stat-value">{selected.meleeDefenceBonus}</span>
          <span class="stat-label">vs Melee</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.archeryDefenceBonus}</span>
          <span class="stat-label">vs Archery</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.magicDefenceBonus}</span>
          <span class="stat-label">vs Magic</span>
        </div>
      </div>

      <!-- Section: Timing -->
      <div class="section-label">
        <span class="sl-line"></span>
        <span class="sl-text">Timing</span>
        <span class="sl-line"></span>
      </div>
      <div class="stat-grid">
        <div class="stat-cell">
          <span class="stat-value">{selected.respawnTime > 0 ? `${(selected.respawnTime / 1000).toFixed(1)}s` : '—'}</span>
          <span class="stat-label">Respawn</span>
        </div>
        <div class="stat-cell">
          <span class="stat-value">{selected.baseTime > 0 ? `${(selected.baseTime / 1000).toFixed(2)}s` : '—'}</span>
          <span class="stat-label">Base time</span>
        </div>
        <div class="stat-cell">
          <span
            class="stat-value"
            class:stat-accent={weaknessCategory(selected.weaknessType) !== 'none'}
            style="color:{weaknessCategory(selected.weaknessType) !== 'none' ? weaknessColor(selected.weaknessType) : ''}"
          >{weaknessLabel(selected.weaknessType)}</span>
          <span class="stat-label">Weakness</span>
        </div>
      </div>

      <p class="caveat">
        * Weakness labels are reverse-engineered from community data and may not match all in-game encounters.
      </p>
    </div>

  <!-- List view -->
  {:else}
    <div class="monster-list">
      {#each filtered as m}
        <button
          class="monster-row"
          on:click={() => { selected = m; }}
        >
          <img
            class="monster-icon"
            src={monsterIconPath(m.name)}
            alt={formatItemName(m.name)}
            on:error={onImgError}
          />
          <div class="monster-info">
            <span class="monster-name">{formatItemName(m.name)}</span>
            {#if m.isBoss}
              <span class="boss-badge">BOSS</span>
            {:else if m.isClanBoss}
              <span class="clan-badge">CLAN</span>
            {/if}
          </div>
          <div class="monster-stats">
            <span class="hp-stat">HP {m.health}</span>
            <span
              class="weak-stat"
              style="color:{weaknessColor(m.weaknessType)}"
            >{weaknessLabel(m.weaknessType)}</span>
          </div>
          <span class="row-arrow">›</span>
        </button>
      {/each}
    </div>
  {/if}

</div>

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ── Inlined SearchInput ── */
  .si {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .si:focus-within {
    border-color: var(--accent-md);
  }
  .si-lead {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-left: 8px;
    color: var(--text-faint);
    flex-shrink: 0;
  }
  .si-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 11px;
    padding: 7px 8px;
    font-family: 'Nunito', sans-serif;
  }
  .si-input::placeholder { color: var(--text-faint); }
  .si-clear {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-right: 3px;
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-faint);
    border-radius: 5px;
    transition: color 0.15s;
  }
  .si-clear:hover { color: var(--accent); }

  /* ── Inlined SegmentedControl ── */
  .seg {
    position: relative;
    display: flex;
    gap: 0;
    padding: 2px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    width: 100%;
    box-sizing: border-box;
  }
  .seg-pill {
    position: absolute;
    top: 2px;
    left: 2px;
    bottom: 2px;
    border-radius: 5px;
    background: var(--accent-lo);
    transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
    z-index: 0;
  }
  .seg-btn {
    position: relative;
    z-index: 1;
    flex: 1;
    background: none;
    border: none;
    color: var(--text-muted);
    font-family: 'Nunito', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.4px;
    padding: 5px 4px;
    cursor: pointer;
    transition: color 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-radius: 4px;
  }
  .seg-btn:hover { color: var(--text-sub); }
  .seg-btn.active { color: var(--accent); }

  /* ── Filter row ── */
  .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .count {
    font-size: 10px;
    color: var(--text-muted);
    margin-left: auto;
  }

  /* ── Inlined Card ── */
  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  /* ── Inlined SectionLabel ── */
  .section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--text-sub);
    padding: 5px 10px 4px;
    white-space: nowrap;
  }
  .sl-line {
    flex: 1;
    height: 1px;
    background: var(--divider);
  }
  .sl-text {
    flex-shrink: 0;
  }

  /* ── Inlined StatCell ── */
  .stat-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-hi);
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .stat-accent { color: var(--accent); }
  .stat-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-sub);
    white-space: nowrap;
  }

  /* ── Monster list ── */
  .monster-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .monster-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 0.12s, border-color 0.12s;
  }
  .monster-row:hover {
    background: var(--bg-hover);
    border-color: var(--accent-md);
  }
  .monster-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
    flex-shrink: 0;
    image-rendering: pixelated;
  }
  .monster-info {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }
  .monster-name {
    font-size: 11px;
    color: var(--text-hi);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .boss-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .clan-badge {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.04em;
    flex-shrink: 0;
  }
  .monster-stats {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    font-size: 10px;
  }
  .hp-stat  { color: var(--text-muted); }
  .weak-stat { font-weight: 600; }
  .row-arrow {
    font-size: 12px;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  /* ── Detail view ── */
  .back-btn {
    background: none;
    border: none;
    color: var(--accent);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 0;
    text-align: left;
    width: auto;
  }
  .back-btn:hover { opacity: 0.8; }

  .detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 12px 12px 0;
  }
  .detail-icon {
    width: 40px;
    height: 40px;
    object-fit: contain;
    image-rendering: pixelated;
  }
  .detail-title {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detail-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-hi);
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 8px;
    padding: 0 10px;
  }

  /* ── Empty / error states ── */
  .empty-msg {
    font-size: 11px;
    color: var(--text-sub);
    margin: 0;
    text-align: center;
    padding: 12px;
  }
  .error-msg { color: var(--neg); }

  .retry-row {
    display: flex;
    justify-content: center;
    padding: 0 12px 12px;
  }
  .retry-btn {
    background: var(--accent-lo);
    border: 1px solid var(--accent-md);
    border-radius: 5px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 700;
    font-family: 'Nunito', sans-serif;
    padding: 5px 16px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .retry-btn:hover { background: var(--accent-md); }

  /* ── Caveat note ── */
  .caveat {
    font-size: 10px;
    color: var(--text-faint);
    margin: 4px 10px 10px;
    line-height: 1.4;
  }
</style>
