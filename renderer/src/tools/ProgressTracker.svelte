<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Progress Tracker',
    desc: 'Track XP gains over time',
    icon: '🌱',
    author: 'Lucid',
  };
</script>



<script lang="ts">
  import { onMount } from 'svelte';
  import {
    trackedPlayers, snapshots, fetchingSet,
    addTrackedPlayer, removeTrackedPlayer, forceRefresh,
    type PlayerSnapshot,
  } from '../lib/trackerStore';
  import { formatGold, xpToLevel, clients } from '../lib/store';
  import CustomSelect from '../lib/CustomSelect.svelte';

  // ── State ─────────────────────────────────────────────────────────────────
  let addInput      = '';
  let addError      = '';
  let addLoading    = false;
  let selectedPlayer: string | null = null;

  // Active metric for the detail view — reactive so Svelte tracks it directly
  let activeMetric = 'totalXp';
  // Per-player metric persistence — remembers selection when navigating back
  let chartMetrics: Record<string, string> = {};

  let hoveredIdx: number | null = null;
  let detailChartW = 240;
  let removeConfirmUsername: string | null = null;
  let timeRange = 'all';
  let now = Date.now();

  const SNAP_INTERVAL = 55 * 60 * 1000;

  onMount(() => {
    const id = setInterval(() => { now = Date.now(); }, 30_000);
    return () => clearInterval(id);
  });

  function formatRemaining(ms: number): string {
    const mins = Math.ceil(ms / 60_000);
    return mins <= 1 ? '< 1m' : `${mins}m`;
  }

  const TIME_RANGES = [
    { label: '6H',  value: '6h',  ms: 6   * 3_600_000  },
    { label: '1D',  value: '1d',  ms: 1   * 86_400_000 },
    { label: '7D',  value: '7d',  ms: 7   * 86_400_000 },
    { label: '30D', value: '30d', ms: 30  * 86_400_000 },
    { label: '6M',  value: '6m',  ms: 182 * 86_400_000 },
    { label: 'All', value: 'all', ms: 0 },
  ];

  const PAD_L = 38;
  const PAD_R = 6;
  const PAD_T = 8;
  const PAD_B = 22;
  const CHART_H = 110;

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

  const METRIC_OPTIONS = [
    { label: 'Total XP',    value: 'totalXp'    },
    { label: 'Total Level', value: 'totalLevel' },
    ...Object.entries(SKILL_ICON).map(([k, iconName]) => ({
      label: cap(k),
      value: k,
      icon: `./skilltaskicons/${iconName}.png`,
    })),
  ];

  function timeAgo(ts: number): string {
    const s = (Date.now() - ts) / 1000;
    if (s < 60)    return 'just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  function timeSpan(ms: number): string {
    const s = ms / 1000;
    if (s < 3600)  return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
  }

  function formatDateShort(ts: number): string {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function getModeLogo(mode: string | null): string {
    const m = mode?.toLowerCase() ?? '';
    if (m === 'ironman' || m === 'ultimateironman') return './logos/Ironman.png';
    if (m === 'groupironmanprestige') return './logos/GroupIronmanPrestige.png';
    if (m === 'groupironman') return './logos/GroupIronman.png';
    return './logos/Default.png';
  }

  function setMetric(metric: string) {
    activeMetric = metric;
    if (selectedPlayer) chartMetrics = { ...chartMetrics, [selectedPlayer.toLowerCase()]: metric };
    hoveredIdx = null;
  }

  function openDetail(username: string) {
    selectedPlayer = username;
    activeMetric = chartMetrics[username.toLowerCase()] ?? 'totalXp';
    hoveredIdx = null;
  }

  function closeDetail() {
    selectedPlayer = null;
    hoveredIdx = null;
  }

  // ── Add player ────────────────────────────────────────────────────────────
  async function handleAdd() {
    const name = addInput.trim();
    if (!name || addLoading) return;
    addError   = '';
    addLoading = true;
    const result = await addTrackedPlayer(name);
    addLoading = false;
    if (result === 'added') {
      addInput = '';
    } else if (result === 'duplicate') {
      addError = 'Already tracking this player';
    } else {
      addError = 'Player not found';
    }
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key !== 'Enter') { addError = ''; return; }
    handleAdd();
  }

  $: untrackedClients = $clients.filter(c =>
    c.playerName &&
    !$trackedPlayers.some(p => p.username.toLowerCase() === c.playerName!.toLowerCase())
  );

  // ── Chart ─────────────────────────────────────────────────────────────────
  interface ChartPt { x: number; y: number; }

  interface DetailChart {
    linePath: string;
    areaPath: string;
    minY: number; maxY: number; midY: number;
    toGridY: (v: number) => number;
    x1: number; x2: number;
    pts: ChartPt[];
    dots: Array<{ cx: number; cy: number }>;
    hovX: number; hovY: number; hovPt: ChartPt | null;
    hovSnap: PlayerSnapshot | null;
    hovPrevSnap: PlayerSnapshot | null;
    chartMinX: number; chartMaxX: number;
    xTicks: Array<{ px: number; label: string }>;
  }

  function buildChart(snaps: PlayerSnapshot[], metric: string, svgW: number, hovIdx: number | null, windowMs: number): DetailChart | null {
    if (snaps.length < 2) return null;

    const getY = (s: PlayerSnapshot): number => {
      if (metric === 'totalLevel') return s.totalLevel;
      if (metric === 'totalXp')   return s.totalXp;
      return s.skills[metric] ?? 0;
    };

    const pts: ChartPt[] = snaps.map(s => ({ x: s.timestamp, y: getY(s) }));
    const chartNow  = Date.now();
    const chartMinX = windowMs > 0 ? chartNow - windowMs : pts[0].x;
    const chartMaxX = windowMs > 0 ? chartNow : pts[pts.length - 1].x;

    const ys     = pts.map(p => p.y);
    const rawMin = Math.min(...ys), rawMax = Math.max(...ys);
    const pad    = (rawMax - rawMin) * 0.1 || 1;
    const minY   = rawMin - pad, maxY = rawMax + pad;

    const cw = svgW - PAD_L - PAD_R;
    const rx = chartMaxX - chartMinX || 1;
    const ry = maxY - minY;

    const toX     = (x: number) => PAD_L + ((x - chartMinX) / rx) * cw;
    const toY     = (y: number) => PAD_T + (1 - (y - minY) / ry) * CHART_H;
    const toGridY = (v: number) => toY(v);

    const coords   = pts.map(p => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`);
    const linePath = 'M ' + coords.join(' L ');
    const areaPath = `${linePath} L ${toX(pts[pts.length - 1].x).toFixed(1)},${PAD_T + CHART_H} L ${toX(pts[0].x).toFixed(1)},${PAD_T + CHART_H} Z`;
    const dots     = pts.length <= 30 ? pts.map(p => ({ cx: toX(p.x), cy: toY(p.y) })) : [];

    let hovX = 0, hovY = 0, hovPt: ChartPt | null = null;
    let hovSnap: PlayerSnapshot | null = null;
    let hovPrevSnap: PlayerSnapshot | null = null;
    if (hovIdx !== null && hovIdx < pts.length) {
      hovPt      = pts[hovIdx];
      hovX       = toX(hovPt.x);
      hovY       = toY(hovPt.y);
      hovSnap    = snaps[hovIdx];
      hovPrevSnap = hovIdx > 0 ? snaps[hovIdx - 1] : null;
    }

    // ── X-axis ticks ──────────────────────────────────────────────────────────
    const totalMs = chartMaxX - chartMinX;
    let tickMs = 3_600_000;
    let tickFmt: 'hhmm' | 'date' | 'mon' = 'hhmm';
    if      (totalMs <= 8  * 3_600_000)  { tickMs = 3_600_000;      tickFmt = 'hhmm'; }
    else if (totalMs <= 2  * 86_400_000) { tickMs = 4 * 3_600_000;  tickFmt = 'hhmm'; }
    else if (totalMs <= 10 * 86_400_000) { tickMs = 2 * 86_400_000; tickFmt = 'date'; }
    else if (totalMs <= 45 * 86_400_000) { tickMs = 7 * 86_400_000; tickFmt = 'date'; }
    else                                 {                            tickFmt = 'mon';  }

    const fmtTick = (ts: number): string => {
      const d = new Date(ts);
      if (tickFmt === 'hhmm') return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
      if (tickFmt === 'date') return `${d.getMonth() + 1}/${d.getDate()}`;
      return d.toLocaleString('en-US', { month: 'short' });
    };

    const xTicks: Array<{ px: number; label: string }> = [];
    if (tickFmt === 'mon') {
      const cur = new Date(chartMinX);
      cur.setDate(1); cur.setHours(0, 0, 0, 0);
      if (cur.getTime() <= chartMinX) cur.setMonth(cur.getMonth() + 1);
      while (cur.getTime() < chartMaxX) {
        xTicks.push({ px: toX(cur.getTime()), label: fmtTick(cur.getTime()) });
        cur.setMonth(cur.getMonth() + 1);
      }
    } else if (tickFmt === 'date') {
      const cur = new Date(chartMinX);
      cur.setHours(0, 0, 0, 0);
      if (cur.getTime() <= chartMinX) cur.setDate(cur.getDate() + 1);
      let ts = cur.getTime();
      while (ts < chartMaxX) {
        xTicks.push({ px: toX(ts), label: fmtTick(ts) });
        ts += tickMs;
      }
    } else {
      let ts = Math.ceil(chartMinX / tickMs) * tickMs;
      while (ts < chartMaxX) {
        xTicks.push({ px: toX(ts), label: fmtTick(ts) });
        ts += tickMs;
      }
    }

    return {
      linePath, areaPath,
      minY: rawMin, maxY: rawMax, midY: (rawMin + rawMax) / 2,
      toGridY, x1: PAD_L, x2: PAD_L + cw,
      pts, dots, hovX, hovY, hovPt, hovSnap, hovPrevSnap,
      chartMinX, chartMaxX, xTicks,
    };
  }

  function formatYLabel(v: number, metric: string): string {
    return metric === 'totalLevel' ? Math.round(v).toLocaleString() : formatGold(v);
  }

  function onChartMousemove(e: MouseEvent, pts: ChartPt[], svgW: number, chartMinX: number, chartMaxX: number) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left - PAD_L) / (svgW - PAD_L - PAD_R)));
    if (pts.length < 2) { hoveredIdx = 0; return; }
    const targetX = chartMinX + frac * (chartMaxX - chartMinX);
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - targetX);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    hoveredIdx = best;
  }

  function onChartMouseleave() { hoveredIdx = null; }

  // ── Skill gains ───────────────────────────────────────────────────────────
  interface SkillGain {
    key: string;
    icon: string | null;
    currentLevel: number;
    xpGained: number;
    levelsGained: number;
  }

  function getSkillGains(snaps: PlayerSnapshot[]): SkillGain[] {
    if (snaps.length < 2) return [];
    const first = snaps[0], last = snaps[snaps.length - 1];
    return Object.keys(last.skills)
      .map(key => ({
        key,
        gained: (last.skills[key] ?? 0) - (first.skills[key] ?? 0),
        now:    last.skills[key] ?? 0,
        then:   first.skills[key] ?? 0,
      }))
      .filter(x => x.gained > 0)
      .sort((a, b) => b.gained - a.gained)
      .map(x => ({
        key: x.key,
        icon: SKILL_ICON[x.key] ? `./skilltaskicons/${SKILL_ICON[x.key]}.png` : null,
        currentLevel: xpToLevel(x.now),
        xpGained: x.gained,
        levelsGained: xpToLevel(x.now) - xpToLevel(x.then),
      }));
  }
</script>



{#if selectedPlayer === null}

  <!-- ════════════════════════════════════════════════════════
       LIST VIEW
  ═══════════════════════════════════════════════════════════ -->

  <div class="add-row">
    <input
      class="add-input"
      class:add-input-error={!!addError}
      placeholder="Add player name…"
      bind:value={addInput}
      on:keydown={onAddKeydown}
      disabled={addLoading}
    />
    <button class="add-btn" on:click={handleAdd} disabled={addLoading || !addInput.trim()}>
      {addLoading ? '…' : '+'}
    </button>
  </div>
  {#if addError}
    <div class="add-error">{addError}</div>
  {/if}

  {#if untrackedClients.length > 0}
    <div class="chip-section">
      <div class="chip-label">Clients</div>
      <div class="chip-row">
        {#each untrackedClients as client}
          <button class="chip" on:click={() => { addInput = client.playerName!; handleAdd(); }}>
            {client.playerName}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if $trackedPlayers.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📈</div>
      <p>Add player names above to start tracking their growth.</p>
      <p class="empty-sub">Snapshots are taken every hour automatically.</p>
    </div>
  {:else}
    <div class="player-list">
      {#each $trackedPlayers as player (player.username)}
        {@const key       = player.username.toLowerCase()}
        {@const snaps     = $snapshots[key] ?? []}
        {@const last      = snaps.length > 0 ? snaps[snaps.length - 1] : null}
        {@const first     = snaps.length > 0 ? snaps[0] : null}
        {@const busy      = $fetchingSet.has(key)}
        {@const lastTs    = last?.timestamp ?? 0}
        {@const elapsed   = now - lastTs}
        {@const remaining = Math.min(Math.max(SNAP_INTERVAL - elapsed, 0), SNAP_INTERVAL)}
        {@const pct       = lastTs === 0 ? 0 : Math.max(0, Math.min((elapsed / SNAP_INTERVAL) * 100, 100))}

        <div
          class="player-card"
          role="button"
          tabindex="0"
          on:click={() => openDetail(player.username)}
          on:keydown={e => e.key === 'Enter' && openDetail(player.username)}
        >
          <div class="card-header">
            {#if last}
              <img class="card-mode-icon" src={getModeLogo(last.gameMode)} alt="" />
            {/if}
            <span class="card-name">{last?.canonicalName ?? player.username}</span>
            <div class="card-actions">
              {#if busy}
                <span class="spinner">⟳</span>
              {:else}
                <button class="icon-btn" title="Force Snapshot" on:click|stopPropagation={() => forceRefresh(player.username)}>
                  <svg width="13" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </button>
              {/if}
              <button class="icon-btn icon-btn-remove" title="Stop tracking" on:click|stopPropagation={() => removeConfirmUsername = player.username}>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 3h10M4 3V2h4v1M5 5.5v4M7 5.5v4M2 3l.7 7.5a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L10 3"/>
                </svg>
              </button>
            </div>
          </div>

          <div class="card-stats">
            <div class="card-stat">
              <span class="stat-val">{last?.totalLevel.toLocaleString() ?? '—'}</span>
              <span class="stat-lbl">Total Lv</span>
            </div>
            <div class="card-stat">
              <span class="stat-val">{last ? formatGold(last.totalXp) : '—'}</span>
              <span class="stat-lbl">Total XP</span>
            </div>
            <div class="card-stat">
              <span class="stat-val">{first && last && snaps.length >= 2 ? timeSpan(last.timestamp - first.timestamp) : '—'}</span>
              <span class="stat-lbl">Tracked</span>
            </div>
            <div class="card-stat">
              <span class="stat-val">{snaps.length || '—'}</span>
              <span class="stat-lbl">Snapshots</span>
            </div>
          </div>

          <div class="snap-progress">
            <span class="snap-label">
              {busy ? 'Fetching…' : lastTs === 0 ? 'Waiting for first snapshot…' : remaining === 0 ? 'Due soon…' : `Next snapshot in ${formatRemaining(remaining)}`}
            </span>
            <div class="snap-bar"><div class="snap-fill" style="width:{pct.toFixed(1)}%"></div></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

{:else}

  <!-- ════════════════════════════════════════════════════════
       DETAIL VIEW
  ═══════════════════════════════════════════════════════════ -->
  {@const key      = selectedPlayer.toLowerCase()}
  {@const allSnaps = $snapshots[key] ?? []}
  {@const rangeMs  = TIME_RANGES.find(t => t.value === timeRange)?.ms ?? 0}
  {@const visSnaps = rangeMs === 0 ? allSnaps : allSnaps.filter(s => s.timestamp >= Date.now() - rangeMs)}
  {@const last     = allSnaps.length > 0 ? allSnaps[allSnaps.length - 1] : null}
  {@const first    = visSnaps.length > 0 ? visSnaps[0] : null}
  {@const busy     = $fetchingSet.has(key)}
  {@const chart    = detailChartW > 0 ? buildChart(visSnaps, activeMetric, detailChartW, hoveredIdx, rangeMs) : null}
  {@const gains    = getSkillGains(visSnaps)}

  <!-- Back bar -->
  <div class="detail-bar">
    <button class="back-btn" on:click={closeDetail}>‹</button>
    {#if last}
      <img class="detail-mode-icon" src={getModeLogo(last.gameMode)} alt="" />
    {/if}
    <span class="detail-name">{last?.canonicalName ?? selectedPlayer}</span>
    {#if busy}
      <span class="spinner">⟳</span>
    {:else}
      <button class="icon-btn" title="Force Snapshot" on:click={() => forceRefresh(selectedPlayer!)}>
        <svg width="13" height="12" viewBox="0 0 24 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
    {/if}
    <button class="icon-btn icon-btn-remove" title="Stop tracking" on:click={() => removeConfirmUsername = selectedPlayer}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 3h10M4 3V2h4v1M5 5.5v4M7 5.5v4M2 3l.7 7.5a.5.5 0 00.5.5h5.6a.5.5 0 00.5-.5L10 3"/>
      </svg>
    </button>
  </div>

  <!-- Summary pills -->
  <div class="summary-row">
    <div class="summary-pill">
      <span class="summary-val">{last?.totalLevel.toLocaleString() ?? '—'}</span>
      <span class="summary-lbl">Total Lv</span>
    </div>
    <div class="summary-pill">
      <span class="summary-val">{last ? formatGold(last.totalXp) : '—'}</span>
      <span class="summary-lbl">Total XP</span>
    </div>
    {#if first && last && visSnaps.length >= 2}
      <div class="summary-pill">
        <span class="summary-val stat-pos">+{(last.totalLevel - first.totalLevel).toLocaleString()}</span>
        <span class="summary-lbl">Lvs gained</span>
      </div>
      <div class="summary-pill">
        <span class="summary-val stat-pos">+{formatGold(last.totalXp - first.totalXp)}</span>
        <span class="summary-lbl">XP gained</span>
      </div>
    {/if}
  </div>

  {#if last}
    <div class="detail-meta">
      {#if last.task}<span class="meta-task">{last.task.replace(/_/g, ' ')}</span>{/if}
      <span class="meta-since">{timeAgo(last.timestamp)} · {allSnaps.length} snapshot{allSnaps.length !== 1 ? 's' : ''}</span>
    </div>
  {/if}

  <!-- Metric selector + time range -->
  <div class="metric-select">
    <CustomSelect
      bind:value={activeMetric}
      options={METRIC_OPTIONS}
      on:change={e => setMetric(e.detail)}
    />
  </div>
  <div class="range-tabs">
    {#each TIME_RANGES as r}
      <button
        class="range-tab"
        class:range-tab-active={timeRange === r.value}
        on:click={() => { timeRange = r.value; hoveredIdx = null; }}
      >{r.label}</button>
    {/each}
  </div>

  <!-- Chart -->
  <div class="chart-wrap" bind:clientWidth={detailChartW}>
    {#if chart}
      {#if chart.hovPt && chart.hovSnap}
        {@const hovSnap = chart.hovSnap}
        {@const hovPrevY = chart.hovPrevSnap
          ? (activeMetric === 'totalLevel' ? chart.hovPrevSnap.totalLevel
            : activeMetric === 'totalXp'  ? chart.hovPrevSnap.totalXp
            : (chart.hovPrevSnap.skills[activeMetric] ?? 0))
          : null}
        {@const hovDelta = hovPrevY !== null ? chart.hovPt.y - hovPrevY : null}
        {@const hovExtra = activeMetric === 'totalXp'    ? `Lv. ${hovSnap.totalLevel.toLocaleString()}`
                         : activeMetric === 'totalLevel' ? `${formatGold(hovSnap.totalXp)} XP`
                         : `Lv. ${xpToLevel(hovSnap.skills[activeMetric] ?? 0)}`}
        {@const tipX = Math.min(Math.max(chart.hovX - 60, PAD_L), detailChartW - 126)}
        {@const tipY = Math.max(chart.hovY - 80, 4)}
        <div class="chart-tooltip" style="left:{tipX}px; top:{tipY}px">
          <span class="tt-val">{formatYLabel(chart.hovPt.y, activeMetric)}</span>
          {#if hovDelta !== null && hovDelta !== 0}
            <span class="tt-delta" class:tt-pos={hovDelta > 0} class:tt-neg={hovDelta < 0}>
              {hovDelta > 0 ? '+' : ''}{formatYLabel(hovDelta, activeMetric)}
            </span>
          {/if}
          <span class="tt-extra">{hovExtra}</span>
          <span class="tt-date">{formatDateShort(chart.hovPt.x)}</span>
          {#if hovSnap.task}
            <span class="tt-task">{hovSnap.task.replace(/_/g, ' ')}</span>
          {/if}
        </div>
      {/if}

      <svg
        viewBox="0 0 {detailChartW} {CHART_H + PAD_T + PAD_B}"
        class="detail-svg"
        on:mousemove={e => onChartMousemove(e, chart.pts, detailChartW, chart.chartMinX, chart.chartMaxX)}
        on:mouseleave={onChartMouseleave}
      >
        <defs>
          <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
          </linearGradient>
        </defs>

        <line class="grid-line" x1={chart.x1} x2={chart.x2} y1={chart.toGridY(chart.maxY)} y2={chart.toGridY(chart.maxY)} />
        <line class="grid-line" x1={chart.x1} x2={chart.x2} y1={chart.toGridY(chart.midY)} y2={chart.toGridY(chart.midY)} />
        <line class="grid-line" x1={chart.x1} x2={chart.x2} y1={chart.toGridY(chart.minY)} y2={chart.toGridY(chart.minY)} />

        <text class="y-label" x={chart.x1 - 4} y={chart.toGridY(chart.maxY) + 3} text-anchor="end">{formatYLabel(chart.maxY, activeMetric)}</text>
        <text class="y-label" x={chart.x1 - 4} y={chart.toGridY(chart.midY) + 3} text-anchor="end">{formatYLabel(chart.midY, activeMetric)}</text>
        <text class="y-label" x={chart.x1 - 4} y={chart.toGridY(chart.minY) + 3} text-anchor="end">{formatYLabel(chart.minY, activeMetric)}</text>

        <path d={chart.areaPath} fill="url(#cg)" />
        <path d={chart.linePath} fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" />

        {#each chart.dots as dot}
          <circle cx={dot.cx} cy={dot.cy} r="2.5" fill="var(--bg-base)" stroke="var(--accent)" stroke-width="1.5" />
        {/each}

        {#if chart.hovPt}
          <line class="hover-line" x1={chart.hovX} x2={chart.hovX} y1={PAD_T} y2={PAD_T + CHART_H} />
          <circle cx={chart.hovX} cy={chart.hovY} r="4" fill="var(--accent)" />
        {/if}

        {#each chart.xTicks as tick}
          <text class="x-label" x={tick.px} y={PAD_T + CHART_H + 16} text-anchor="middle">{tick.label}</text>
        {/each}
      </svg>
    {:else}
      <div class="chart-empty">
        {allSnaps.length < 2 ? 'Chart appears after the next hourly snapshot.' : visSnaps.length < 2 ? 'No snapshots in this time range.' : 'No data for this metric.'}
      </div>
    {/if}
  </div>

  <!-- Skill gains -->
  {#if gains.length > 0}
    <div class="section-label">Skill Gains</div>
    <div class="gains-list">
      {#each gains as g (g.key)}
        {@const isActive = activeMetric === g.key}
        <button
          class="gain-row"
          class:gain-row-active={isActive}
          on:click={() => setMetric(isActive ? 'totalXp' : g.key)}
          title="Chart {cap(g.key)} XP"
        >
          {#if g.icon}
            <img class="gain-icon" src={g.icon} alt=""
              on:error={e => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          {:else}
            <span class="gain-icon"></span>
          {/if}
          <span class="gain-name">{cap(g.key)}</span>
          <span class="gain-level">Lv.{g.currentLevel}</span>
          <span class="gain-xp">+{formatGold(g.xpGained)}</span>
          {#if g.levelsGained > 0}
            <span class="gain-lvdelta">+{g.levelsGained}</span>
          {:else}
            <span></span>
          {/if}
        </button>
      {/each}
    </div>
  {:else if allSnaps.length >= 2}
    <div class="no-gains">{visSnaps.length < 2 ? 'No snapshots in this time range.' : 'No skill gains recorded yet.'}</div>
  {/if}

{/if}

{#if removeConfirmUsername !== null}
  {@const confirmName = removeConfirmUsername}
  <div class="modal-overlay" role="none" on:click={() => removeConfirmUsername = null} on:keydown={e => e.key === 'Escape' && (removeConfirmUsername = null)}>
    <div class="modal-card" role="dialog" tabindex="-1" on:click|stopPropagation>
      <div class="modal-title">Stop tracking {confirmName}?</div>
      <p class="modal-body">All recorded snapshots for this character will be permanently deleted.</p>
      <div class="modal-actions">
        <button class="modal-btn modal-btn-cancel" on:click={() => removeConfirmUsername = null}>Cancel</button>
        <button class="modal-btn modal-btn-remove" on:click={() => { removeTrackedPlayer(confirmName); removeConfirmUsername = null; closeDetail(); }}>Remove</button>
      </div>
    </div>
  </div>
{/if}



<style>
  /* ── Add row ── */
  .add-row { display: flex; gap: 6px; margin-bottom: 4px; }
  .add-input {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    color: var(--text); font-size: 12px; padding: 7px 10px;
    font-family: 'Nunito', sans-serif; min-width: 0;
  }
  .add-input:focus { outline: none; border-color: var(--accent-md); }
  .add-input-error { border-color: var(--neg) !important; }
  .add-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 6px;
    color: var(--accent); font-size: 16px; padding: 0 13px; cursor: pointer;
    font-family: 'Nunito', sans-serif; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .add-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: var(--accent-md); }
  .add-btn:disabled { opacity: 0.4; cursor: default; }
  .add-error { font-size: 10px; color: var(--neg); margin: 0 0 6px 2px; }

  /* ── Client chips ── */
  .chip-section { margin-bottom: 8px; display: flex; flex-direction: column; gap: 5px; }
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

  /* ── Empty state ── */
  .empty-state {
    text-align: center; padding: 28px 12px;
    display: flex; flex-direction: column; align-items: center; gap: 6px;
  }
  .empty-icon { font-size: 34px; margin-bottom: 4px; }
  .empty-state p { font-size: 11px; color: var(--text-sub); margin: 0; line-height: 1.5; }
  .empty-sub { color: var(--text-faint) !important; font-size: 10px !important; }

  /* ── Player list ── */
  .player-list { display: flex; flex-direction: column; gap: 5px; }

  /* ── Snapshot progress bar ── */
  .snap-progress { margin-top: -4px; padding: 0 10px 8px; display: flex; flex-direction: column; gap: 3px; }
  .snap-label { font-size: 8px; color: var(--text-faint); }
  .snap-bar { height: 2px; background: var(--bg-deep); border-radius: 1px; overflow: hidden; }
  .snap-fill { height: 100%; background: var(--accent); opacity: 0.55; border-radius: 1px; transition: width 1s linear; }

  /* ── Player card ── */
  .player-card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    cursor: pointer; transition: border-color 0.12s, background 0.12s;
  }
  .player-card:hover { border-color: var(--accent-md); background: var(--bg-hover); }

  .card-header {
    display: flex; align-items: center; gap: 6px; padding: 8px 10px 5px;
  }
  .card-mode-icon { width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; }
  .card-name {
    flex: 1; font-size: 13px; font-weight: 700; color: var(--text-hi);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .card-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }

  /* ── Stat row (collapsed) ── */
  .card-stats {
    display: grid; grid-template-columns: repeat(4, 1fr);
    padding: 0 10px 9px; gap: 2px;
  }
  .card-stat { display: flex; flex-direction: column; align-items: center; gap: 1px; }
  .stat-val { font-size: 11px; font-weight: 700; color: var(--accent); white-space: nowrap; }
  .stat-lbl { font-size: 8px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }

  /* ── Shared helpers ── */
  .spinner { font-size: 12px; color: var(--text-faint); display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .icon-btn {
    background: none; border: none; color: var(--text-faint); font-size: 14px;
    cursor: pointer; padding: 2px 4px; line-height: 1; border-radius: 3px;
    transition: color 0.1s, background 0.1s; width: auto;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .icon-btn:hover { color: var(--accent); background: var(--bg-raised); }
  .icon-btn-remove:hover { color: var(--neg); }

  /* ── Detail back bar ── */
  .detail-bar {
    display: flex; align-items: center; gap: 7px; margin-bottom: 10px;
  }
  .back-btn {
    background: none; border: none; color: var(--text-sub); font-size: 20px;
    cursor: pointer; padding: 0 4px 0 0; line-height: 1;
    transition: color 0.15s; width: auto; flex-shrink: 0;
  }
  .back-btn:hover { color: var(--accent); }
  .detail-mode-icon { width: 16px; height: 16px; object-fit: contain; flex-shrink: 0; }
  .detail-name {
    flex: 1; font-size: 14px; font-weight: 700; color: var(--text-hi);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Detail summary ── */
  .summary-row {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-bottom: 6px;
  }
  .summary-pill {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    padding: 5px 4px; display: flex; flex-direction: column; align-items: center; gap: 2px;
  }
  .summary-val { font-size: 11px; font-weight: 700; color: var(--accent); white-space: nowrap; }
  .summary-lbl { font-size: 8px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.3px; }
  .stat-pos { color: var(--pos); }

  .detail-meta {
    display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
  }
  .meta-task {
    font-size: 10px; color: var(--text-sub); text-transform: capitalize;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1;
  }
  .meta-since { font-size: 9px; color: var(--text-faint); white-space: nowrap; flex-shrink: 0; margin-left: 6px; }

  /* ── Metric selector + range tabs ── */
  .metric-select { margin-bottom: 4px; }
  .range-tabs { display: flex; gap: 3px; margin-bottom: 6px; }
  .range-tab {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-muted); font-size: 10px; font-weight: 700; padding: 3px 0;
    cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
  }
  .range-tab:hover { color: var(--accent); border-color: var(--accent-md); }
  .range-tab-active { background: var(--accent-md); border-color: var(--accent-hi); color: var(--accent); }

  /* ── Chart ── */
  .chart-wrap {
    position: relative; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; margin-bottom: 6px;
  }
  .detail-svg { display: block; width: 100%; cursor: crosshair; overflow: visible; }
  .chart-empty {
    height: 90px; display: flex; align-items: center; justify-content: center;
    font-size: 10px; color: var(--text-faint); text-align: center; padding: 12px; line-height: 1.5;
  }

  .grid-line { stroke: var(--border); stroke-width: 1; stroke-dasharray: 3 3; }
  .y-label { font-size: 8px; fill: var(--text-faint); font-family: 'Nunito', sans-serif; }
  .x-label { font-size: 7px; fill: var(--text-faint); font-family: 'Nunito', sans-serif; }
  .hover-line { stroke: var(--accent); stroke-width: 1; stroke-dasharray: 2 3; opacity: 0.6; }

  .chart-tooltip {
    position: absolute; background: var(--bg-raised); border: 1px solid var(--accent-hi);
    border-radius: 4px; padding: 3px 7px; pointer-events: none; z-index: 10;
    display: flex; flex-direction: column; gap: 1px;
  }
  .tt-val   { font-size: 11px; font-weight: 700; color: var(--accent); white-space: nowrap; }
  .tt-delta { font-size: 9px; font-weight: 700; white-space: nowrap; }
  .tt-pos   { color: var(--pos); }
  .tt-neg   { color: var(--neg); }
  .tt-extra { font-size: 9px; color: var(--text-sub); white-space: nowrap; }
  .tt-date  { font-size: 8px; color: var(--text-faint); white-space: nowrap; }
  .tt-task  { font-size: 8px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 112px; text-transform: capitalize; font-style: italic; }

  /* ── Skill gains ── */
  .section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
    margin-bottom: 5px;
  }
  .section-label::before, .section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .gains-list { display: flex; flex-direction: column; gap: 2px; }
  .gain-row {
    display: grid; grid-template-columns: 16px 1fr auto auto auto;
    column-gap: 6px; align-items: center; text-align: left;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    padding: 5px 8px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.12s, background 0.12s; width: 100%;
  }
  .gain-row:hover { border-color: var(--accent-md); background: var(--bg-hover); }
  .gain-row-active { border-color: var(--accent-hi); background: var(--accent-lo); }

  .gain-icon { width: 16px; height: 16px; object-fit: contain; }
  .gain-name { font-size: 11px; font-weight: 600; color: var(--text); }
  .gain-level { font-size: 10px; color: var(--text-dim); white-space: nowrap; }
  .gain-xp { font-size: 11px; font-weight: 700; color: var(--pos); white-space: nowrap; }
  .gain-lvdelta {
    font-size: 9px; font-weight: 700; color: var(--accent);
    background: var(--accent-lo); border-radius: 3px; padding: 1px 3px; white-space: nowrap;
  }
  .no-gains { font-size: 10px; color: var(--text-faint); text-align: center; padding: 12px 0; }

  /* ── Remove confirm modal ── */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 200;
    background: rgba(0, 0, 0, 0.55);
    display: flex; align-items: center; justify-content: center;
  }
  .modal-card {
    background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 10px; padding: 18px 18px 14px; width: 220px;
    display: flex; flex-direction: column; gap: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  .modal-title {
    font-size: 13px; font-weight: 700; color: var(--text-hi);
    line-height: 1.3; word-break: break-word;
  }
  .modal-body {
    font-size: 11px; color: var(--text-sub); line-height: 1.5; margin: 0;
  }
  .modal-actions { display: flex; gap: 6px; }
  .modal-btn {
    flex: 1; padding: 6px 0; border-radius: 6px; font-size: 11px; font-weight: 700;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: background 0.15s, border-color 0.15s;
  }
  .modal-btn-cancel {
    background: var(--bg-card); border: 1px solid var(--border); color: var(--text-sub);
  }
  .modal-btn-cancel:hover { border-color: var(--accent-md); color: var(--text); }
  .modal-btn-remove {
    background: color-mix(in srgb, var(--neg) 15%, var(--bg-card));
    border: 1px solid color-mix(in srgb, var(--neg) 40%, transparent);
    color: var(--neg);
  }
  .modal-btn-remove:hover {
    background: color-mix(in srgb, var(--neg) 25%, var(--bg-card));
    border-color: var(--neg);
  }
</style>
