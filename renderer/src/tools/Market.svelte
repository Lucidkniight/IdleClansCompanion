<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Market',
    desc: 'Live prices and order books',
    icon: './skilltaskicons/AuctionHouse.png',
  };
</script>

<script lang="ts">
import { allItems, priceCache, lastPriceRefresh, priceRefreshCount, formatItemName, formatGold, toolNavigation, apiFetch, priceAlerts, addPriceAlert, removePriceAlert, checkPriceAlerts, type MarketItem, type PriceAlert } from '../lib/store';
import { track } from '../lib/analytics';
import DevPanel from '../lib/DevPanel.svelte';

interface ComprehensivePrice {
  itemId: number;
  lowestSellPricesWithVolume: { key: number; value: number }[];
  highestBuyPricesWithVolume: { key: number; value: number }[];
  averagePrice1Day: number;
  averagePrice7Days: number;
  averagePrice30Days: number;
  tradeVolume1Day: number;
}

interface PriceHistoryPoint {
  itemId: number;
  timestamp: string;
  lowesSellPrice: number;   // API field name has a typo — preserved intentionally
  highestSellPrice: number;
  averagePrice: number;
  tradeVolume: number;
}

const CHART_H = 80;
const VOL_H = 18;
const PAD_T = 6;
const PAD_L = 4;
const PAD_R = 4;
const VOL_GAP = 4;

const WIKI_BASE = 'https://idleclans.wiki/w/';

let marketSearch = '';
let marketDropdownOpen = false;
let selectedItemName = '';
let selectedItemId: number | null = null;
type Period = '24h' | '7d' | '30d' | '1y';
let selectedPeriod: Period = '24h';
let marketData: ComprehensivePrice | null = null;
let historyData: PriceHistoryPoint[] = [];
let historyCache: Partial<Record<Period, PriceHistoryPoint[]>> = {};
let marketLoading = false;
let periodLoading = false;
let marketError = false;
let historyError: number | null = null;

let containerWidth = 260;
let hoveredPoint: PriceHistoryPoint | null = null;
let hoverX = 0;

let alertField: 'sell' | 'buy' = 'sell';
let alertDirection: 'below' | 'above' = 'below';
let alertThreshold = 0;


$: isUntradeable = marketData !== null &&
  marketData.averagePrice1Day === 0 &&
  marketData.averagePrice7Days === 0 &&
  marketData.averagePrice30Days === 0 &&
  marketData.tradeVolume1Day === 0 &&
  marketData.lowestSellPricesWithVolume.length === 0 &&
  marketData.highestBuyPricesWithVolume.length === 0;

$: marketSuggestions = marketSearch.trim().length >= 2
  ? $allItems
      .filter(i => $priceCache[i.id] !== undefined && i.name.replace(/_/g, ' ').toLowerCase().includes(marketSearch.toLowerCase()))
      .slice(0, 50)
  : [];

$: chartW = Math.max(containerWidth - PAD_L - PAD_R, 1);
$: svgH = PAD_T + CHART_H + VOL_GAP + VOL_H + 2;

$: minP = historyData.length
  ? Math.min(...historyData.flatMap(d => [d.lowesSellPrice, d.highestSellPrice, d.averagePrice]))
  : 0;
$: maxP = historyData.length
  ? Math.max(...historyData.flatMap(d => [d.lowesSellPrice, d.highestSellPrice, d.averagePrice]))
  : 1;
$: priceRange = maxP - minP || 1;
$: minT = historyData.length ? Math.min(...historyData.map(d => new Date(d.timestamp).getTime())) : 0;
$: maxT = historyData.length ? Math.max(...historyData.map(d => new Date(d.timestamp).getTime())) : 1;
$: timeRange = maxT - minT || 1;
$: maxVol = historyData.length ? Math.max(...historyData.map(d => d.tradeVolume)) : 1;

$: bandPoints = (() => {
  if (historyData.length < 2) return '';
  const x = (d: PriceHistoryPoint) => PAD_L + ((new Date(d.timestamp).getTime() - minT) / timeRange) * chartW;
  const y = (p: number) => PAD_T + (1 - (p - minP) / priceRange) * CHART_H;
  return [
    ...historyData.map(d => `${x(d).toFixed(1)},${y(d.highestSellPrice).toFixed(1)}`),
    ...[...historyData].reverse().map(d => `${x(d).toFixed(1)},${y(d.lowesSellPrice).toFixed(1)}`),
  ].join(' ');
})();

$: avgLine = (() => {
  if (historyData.length < 2) return '';
  const x = (d: PriceHistoryPoint) => PAD_L + ((new Date(d.timestamp).getTime() - minT) / timeRange) * chartW;
  const y = (p: number) => PAD_T + (1 - (p - minP) / priceRange) * CHART_H;
  return historyData.map(d => `${x(d).toFixed(1)},${y(d.averagePrice).toFixed(1)}`).join(' ');
})();

function getX(d: PriceHistoryPoint): number {
  return PAD_L + ((new Date(d.timestamp).getTime() - minT) / timeRange) * chartW;
}

function getY(price: number): number {
  return PAD_T + (1 - (price - minP) / priceRange) * CHART_H;
}

function onMouseMove(e: MouseEvent) {
  if (!historyData.length) return;
  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  let closest = historyData[0];
  let closestDist = Infinity;
  for (const d of historyData) {
    const dist = Math.abs(getX(d) - mouseX);
    if (dist < closestDist) { closest = d; closestDist = dist; }
  }
  hoveredPoint = closest;
  hoverX = getX(closest);
}

function onMouseLeave() {
  hoveredPoint = null;
}

function fmtTime(ts: string): string {
  const d = new Date(ts);
  if (selectedPeriod === '24h') {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (selectedPeriod === '7d') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function openWiki() {
  track('external_link_opened', { source: 'market_tool' });
  const title = selectedItemName.charAt(0).toUpperCase() + selectedItemName.slice(1);
  (window as any).electronAPI.openExternal(WIKI_BASE + encodeURIComponent(title));
}

async function changePeriod(p: Period) {
  if (selectedPeriod === p) return;
  selectedPeriod = p;
  hoveredPoint = null;
  if (historyCache[p] !== undefined) {
    historyData = historyCache[p]!;
    historyError = null;
    return;
  }
  if (!selectedItemId) return;
  periodLoading = true;
  historyData = [];
  historyError = null;
  const suffix = p === '24h' ? '' : `?period=${p}`;
  try {
    const res = await apiFetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/history/${selectedItemId}${suffix}`);
    if (res.ok) {
      const data = await res.json();
      historyCache = { ...historyCache, [p]: data };
      historyData = data;
    } else {
      historyError = res.status;
    }
  } finally {
    periodLoading = false;
  }
}

async function selectMarketItem(item: MarketItem) {
  marketSearch = formatItemName(item.name);
  selectedItemName = item.name;
  selectedItemId = item.id;
  selectedPeriod = '24h';
  marketDropdownOpen = false;
  marketData = null;
  historyData = [];
  historyCache = {};
  hoveredPoint = null;
  marketLoading = true;
  marketError = false;
  historyError = null;
  try {
    const compRes = await apiFetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/latest/comprehensive/${item.id}`);
    if (!compRes.ok) throw new Error();
    const compData = await compRes.json();
    await new Promise(r => setTimeout(r, 300));
    const h24 = await apiFetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/history/${item.id}`);
    const cache: typeof historyCache = {};
    if (h24.ok) { cache['24h'] = await h24.json(); }
    else { historyError = h24.status; }
    historyCache = cache;
    historyData = cache['24h'] ?? [];
    marketData = compData;
    // Keep priceCache in sync so alert checks use what's visible on screen
    priceCache.update(c => ({
      ...c,
      [item.id]: {
        lowestSell: compData.lowestSellPricesWithVolume[0]?.key ?? 0,
        highestBuy:  compData.highestBuyPricesWithVolume[0]?.key ?? 0,
      },
    }));
    checkPriceAlerts();
    alertField = 'sell';
    alertDirection = 'below';
    alertThreshold = compData.lowestSellPricesWithVolume[0]?.key ?? compData.averagePrice1Day ?? 0;
  } catch {
    marketError = true;
  } finally {
    marketLoading = false;
  }
}

function navigateToAlert(alert: PriceAlert) {
  const item = $allItems.find(i => i.id === alert.itemId);
  if (item) selectMarketItem(item);
}

function onMarketInput() {
  selectedItemName = '';
  selectedPeriod = '24h';
  marketData = null;
  historyData = [];
  historyCache = {};
  hoveredPoint = null;
  marketDropdownOpen = marketSearch.trim().length >= 2;
}

function closeDropdown() {
  setTimeout(() => { marketDropdownOpen = false; }, 500);
}

let _marketNavId = -1;
$: {
  const _nav = $toolNavigation;
  if (_nav?.tool === 'Market' && _nav.id !== _marketNavId) {
    _marketNavId = _nav.id;
    const item = $allItems.find(i => i.id === parseInt(_nav.param));
    if (item) selectMarketItem(item);
  }
}
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Last refresh</span><span class="dev-val">{$lastPriceRefresh ? $lastPriceRefresh.toLocaleTimeString() : 'never'}</span></div>
  <div class="dev-row"><span class="dev-key">Refresh count</span><span class="dev-val">{$priceRefreshCount} (interval: 60s)</span></div>
  <div class="dev-row"><span class="dev-key">Cache size</span><span class="dev-val">{Object.keys($priceCache).length} items</span></div>
  <div class="dev-row"><span class="dev-key">Active alerts</span><span class="dev-val">{$priceAlerts.length} · live poll: {$priceAlerts.length > 0 ? 'yes (comprehensive)' : 'no'}</span></div>
  <div class="dev-row"><span class="dev-key">Selected ID</span><span class="dev-val">{selectedItemId ?? '—'} · history: {Object.keys(historyCache).length} period(s)</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Bulk API</span><span class="dev-val">/PlayerMarket/items/prices/latest (~5m cache)</span></div>
  <div class="dev-row"><span class="dev-key">Live API</span><span class="dev-val">/PlayerMarket/items/prices/latest/comprehensive/{'{id}'}</span></div>
  <div class="dev-row"><span class="dev-key">History API</span><span class="dev-val">/PlayerMarket/items/prices/history/{'{id}'}[?period=X]</span></div>
</DevPanel>

<div class="market-search-wrap">
  <input
    class="market-input"
    placeholder="Search items…"
    bind:value={marketSearch}
    on:input={onMarketInput}
    on:focus={() => { if (marketSearch.length >= 2) marketDropdownOpen = true; }}
    on:blur={closeDropdown}
  />
  {#if marketSearch.length > 0}
    <button class="market-clear" on:click={() => {
      marketSearch = '';
      selectedItemName = '';
      selectedPeriod = '24h';
      marketDropdownOpen = false;
      marketData = null;
      historyData = [];
      historyCache = {};
      hoveredPoint = null;
    }}>✕</button>
  {/if}
  {#if marketDropdownOpen && marketSuggestions.length > 0}
    <div class="market-dropdown">
      {#each marketSuggestions as item}
        <button class="market-suggestion" on:click={() => selectMarketItem(item)}>
          <img class="suggestion-icon" src="./itemicons/{item.name}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          {formatItemName(item.name)}
        </button>
      {/each}
    </div>
  {/if}
</div>

{#if marketLoading}
  <div class="market-status">Loading…</div>
{:else if marketError}
  <div class="market-status error">Could not load market data</div>
{:else if marketData}
  <div class="item-info-row">
    <div class="item-header">
      <img class="item-header-img" src="./itemicons/{selectedItemName}.png" alt={formatItemName(selectedItemName)} on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
      <button class="wiki-btn" on:click={openWiki}>Wiki</button>
    </div>
    {#if isUntradeable}
      <div class="market-untradeable">This item is not tradeable</div>
    {:else}
      <div class="market-avg-row">
        <div class="market-avg-box">
          <span class="market-avg-label">1 Day</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice1Day)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">7 Days</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice7Days)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">30 Days</span>
          <span class="market-avg-val">{formatGold(marketData.averagePrice30Days)}</span>
        </div>
        <div class="market-avg-box">
          <span class="market-avg-label">Vol 24h</span>
          <span class="market-avg-val">{marketData.tradeVolume1Day.toLocaleString()}</span>
        </div>
      </div>
    {/if}
  </div>

  {#if !isUntradeable}
  <div class="market-chart-header">
    <div class="market-section-label">Price History</div>
    <div class="period-tabs">
      <button class="period-tab" class:active={selectedPeriod === '24h'} on:click={() => changePeriod('24h')}>24H</button>
      <button class="period-tab" class:active={selectedPeriod === '7d'}  on:click={() => changePeriod('7d')}>7D</button>
      <button class="period-tab" class:active={selectedPeriod === '30d'} on:click={() => changePeriod('30d')}>30D</button>
      <button class="period-tab" class:active={selectedPeriod === '1y'}  on:click={() => changePeriod('1y')}>1Y</button>
    </div>
  </div>
  <div class="chart-wrap" bind:clientWidth={containerWidth}>
    {#if historyData.length >= 2}
      <svg
        width={containerWidth}
        height={svgH}
        on:mousemove={onMouseMove}
        on:mouseleave={onMouseLeave}
      >
        {#if bandPoints}
          <polygon points={bandPoints} class="chart-band" fill-opacity="0.12" />
        {/if}

        {#if avgLine}
          <polyline
            points={avgLine}
            class="chart-line"
            fill="none"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        {/if}

        {#each historyData as d}
          {@const bh = Math.max(1, (d.tradeVolume / maxVol) * VOL_H)}
          {@const bx = getX(d)}
          <rect
            x={bx - 1.5}
            y={PAD_T + CHART_H + VOL_GAP + (VOL_H - bh)}
            width={3}
            height={bh}
            class="chart-vol-bar"
            rx="1"
          />
        {/each}

        {#if hoveredPoint}
          {@const hy = getY(hoveredPoint.averagePrice)}
          <line
            x1={hoverX} y1={PAD_T}
            x2={hoverX} y2={PAD_T + CHART_H}
            class="chart-crosshair"
            stroke-width="1"
            stroke-dasharray="3,2"
          />
          <circle
            cx={hoverX}
            cy={hy}
            r="3"
            class="chart-dot"
            stroke-width="1.5"
          />
        {/if}
      </svg>

      {#if hoveredPoint}
        <div
          class="chart-tooltip"
          style="left: {hoverX < containerWidth / 2 ? hoverX + 8 : hoverX - 90}px; top: 4px;"
        >
          <div class="tooltip-time">{fmtTime(hoveredPoint.timestamp)}</div>
          <div class="tooltip-row"><span>Avg</span><span>{hoveredPoint.averagePrice.toLocaleString()}</span></div>
          <div class="tooltip-row"><span>Low</span><span>{hoveredPoint.lowesSellPrice.toLocaleString()}</span></div>
          <div class="tooltip-row"><span>High</span><span>{hoveredPoint.highestSellPrice.toLocaleString()}</span></div>
          <div class="tooltip-row"><span>Vol</span><span>{hoveredPoint.tradeVolume.toLocaleString()}</span></div>
        </div>
      {/if}
    {:else}
      <div class="chart-no-data">
        {#if periodLoading}
          Loading…
        {:else if historyError === 429}
          Rate limited — try again shortly
        {:else if historyError !== null}
          Failed to load history ({historyError})
        {:else}
          No history data
        {/if}
      </div>
    {/if}
  </div>

  <div class="market-books">
    <div class="market-book">
      <div class="market-section-label buy-label">Buy Orders</div>
      <div class="market-table-head">
        <span>Price</span>
        <span>Volume</span>
      </div>
      {#each marketData.highestBuyPricesWithVolume.slice(0, 10) as row}
        <div class="market-table-row buy">
          <span>{row.key.toLocaleString()}</span>
          <span>{Math.round(row.value).toLocaleString()}</span>
        </div>
      {/each}
    </div>
    <div class="market-book">
      <div class="market-section-label sell-label">Sell Orders</div>
      <div class="market-table-head">
        <span>Price</span>
        <span>Volume</span>
      </div>
      {#each marketData.lowestSellPricesWithVolume.slice(0, 10) as row}
        <div class="market-table-row sell">
          <span>{row.key.toLocaleString()}</span>
          <span>{Math.round(row.value).toLocaleString()}</span>
        </div>
      {/each}
    </div>
  </div>

  <div class="alert-section">
    <div class="market-section-label">Price Alert</div>
    <div class="alert-form">
      <div class="alert-sentence">
        <span class="alert-label">If</span>
        <div class="alert-toggle-group">
          <button class="alert-tog" class:active={alertField === 'sell'} on:click={() => alertField = 'sell'}>Sell</button>
          <button class="alert-tog" class:active={alertField === 'buy'} on:click={() => alertField = 'buy'}>Buy</button>
        </div>
        <span class="alert-label">price is</span>
        <div class="alert-toggle-group">
          <button class="alert-tog" class:active={alertDirection === 'below'} on:click={() => alertDirection = 'below'}>Below</button>
          <button class="alert-tog" class:active={alertDirection === 'above'} on:click={() => alertDirection = 'above'}>Above</button>
        </div>
      </div>
      <div class="alert-input-row">
        <input class="alert-price-input" type="number" min="0" bind:value={alertThreshold} />
        <button
          class="alert-set-btn"
          disabled={alertThreshold <= 0}
          on:click={() => {
            if (selectedItemId && selectedItemName && alertThreshold > 0) {
              addPriceAlert({ itemId: selectedItemId, itemName: selectedItemName, field: alertField, direction: alertDirection, threshold: alertThreshold });
            }
          }}
        >Set Alert</button>
      </div>
    </div>
  </div>
  {/if}
{/if}

{#if $priceAlerts.length > 0}
  <div class="alerts-list">
    <div class="market-section-label">Active Alerts</div>
    {#each $priceAlerts as alert (alert.id)}
      <div class="alert-row">
        <button class="alert-item-btn" on:click={() => navigateToAlert(alert)}>
          <img class="alert-icon" src="./itemicons/{alert.itemName}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
          <div class="alert-info">
            <span class="alert-item-name">{formatItemName(alert.itemName)}</span>
            <span class="alert-cond">{alert.field === 'sell' ? 'Sell' : 'Buy'} {alert.direction === 'below' ? '<' : '>'} {formatGold(alert.threshold)}</span>
          </div>
        </button>
        <button class="alert-remove-btn" on:click={() => removePriceAlert(alert.id)}>✕</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .market-search-wrap { position: relative; margin-bottom: 8px; }

  .market-input {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 12px;
    padding: 7px 10px; font-family: 'Nunito', sans-serif; padding-right: 28px;
  }
  .market-input:focus { outline: none; border-color: var(--accent-md); }

  .market-clear {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: var(--text-faint); font-size: 11px;
    cursor: pointer; padding: 2px 4px; line-height: 1; transition: color 0.15s; width: auto;
  }
  .market-clear:hover { color: var(--accent); }

  .market-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    max-height: 200px; overflow-y: auto; z-index: 100;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }

  .market-suggestion {
    width: 100%; background: none; border: none; border-bottom: 1px solid var(--divider);
    color: var(--text-sub); font-size: 11px; padding: 5px 10px; text-align: left;
    cursor: pointer; transition: background 0.1s, color 0.1s;
    border-radius: 0; font-family: 'Nunito', sans-serif;
    display: flex; align-items: center; gap: 7px;
  }
  .market-suggestion:last-child { border-bottom: none; }
  .market-suggestion:hover { background: var(--divider); color: var(--accent); }

  .suggestion-icon {
    width: 20px; height: 20px; object-fit: contain; flex-shrink: 0;
  }

  .item-info-row {
    display: flex; align-items: center; gap: 10px; margin-bottom: 4px;
  }

  .item-header {
    display: flex; flex-direction: column; align-items: center; gap: 5px;
    flex-shrink: 0; width: 80px;
  }

  .item-header-img {
    width: 64px; height: 64px; object-fit: contain;
  }

.wiki-btn {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text-sub); font-size: 10px; font-family: 'Nunito', sans-serif;
    font-weight: 600; padding: 3px 10px; cursor: pointer; text-align: center;
    transition: border-color 0.1s, color 0.1s;
  }
  .wiki-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .market-avg-row { flex: 1; }

  .market-untradeable {
    flex: 1; text-align: center; font-size: 11px; color: var(--text-faint);
    font-style: italic;
  }

  .market-status { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }
  .market-status.error { color: #7a3a3a; }

  .market-section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
    margin: 10px 0 5px;
  }
  .market-section-label::before, .market-section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .market-avg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 4px; }
  .market-avg-box {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 6px;
    padding: 7px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .market-avg-label { font-size: 8px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
  .market-avg-val { font-size: 12px; font-weight: 700; color: var(--accent); }

  .chart-wrap {
    position: relative;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    margin-bottom: 4px;
    cursor: crosshair;
    overflow: visible;
  }

  .chart-no-data {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-faint);
    font-family: 'Nunito', sans-serif;
  }

  .chart-band { fill: var(--accent); }
  .chart-line { stroke: var(--accent); }
  .chart-vol-bar { fill: var(--border); }
  .chart-crosshair { stroke: var(--text-faint); }
  .chart-dot { fill: var(--accent); stroke: var(--bg-card); }

  .chart-tooltip {
    position: absolute;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 5px 7px;
    pointer-events: none;
    z-index: 10;
    min-width: 82px;
  }

  .tooltip-time {
    font-size: 9px;
    font-weight: 700;
    color: var(--accent);
    text-align: center;
    margin-bottom: 3px;
    letter-spacing: 0.5px;
    font-family: 'Nunito', sans-serif;
  }

  .tooltip-row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 9px;
    font-weight: 600;
    color: var(--text-dim);
    font-family: 'Nunito', sans-serif;
  }

  .tooltip-row span:last-child { color: var(--text); }

  .market-table-head {
    display: flex; justify-content: space-between; font-size: 8px; font-weight: 700;
    letter-spacing: 0.5px; color: var(--text-dim); text-transform: uppercase;
    padding: 0 8px; margin-bottom: 2px;
  }
  .market-table-row {
    display: flex; justify-content: space-between; background: var(--bg-card);
    border: 1px solid var(--border); border-radius: 5px; padding: 5px 8px;
    font-size: 11px; font-weight: 600;
  }
  .market-table-row.buy { color: var(--neg); border-left: 2px solid var(--neg); }
  .market-table-row.sell { color: var(--pos); border-left: 2px solid var(--pos); }

  .market-books { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .market-book { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .market-book .market-section-label { justify-content: center; }
  .sell-label { color: var(--pos); }
  .buy-label { color: var(--neg); }

  /* ── Active alerts list ── */
  .alerts-list { margin-bottom: 8px; }

  .alert-row {
    display: flex; align-items: center; gap: 4px;
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; padding: 5px 6px; margin-bottom: 3px;
  }

  .alert-item-btn {
    flex: 1; display: flex; align-items: center; gap: 7px;
    background: none; border: none; cursor: pointer; padding: 0; text-align: left; min-width: 0;
  }
  .alert-item-btn:hover .alert-item-name { color: var(--accent); }

  .alert-icon { width: 22px; height: 22px; object-fit: contain; flex-shrink: 0; }

  .alert-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .alert-item-name { font-size: 11px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 0.1s; }
  .alert-cond { font-size: 9px; color: var(--text-faint); font-weight: 600; }

  .alert-remove-btn {
    background: none; border: none; cursor: pointer; color: var(--text-faint);
    font-size: 10px; padding: 2px 4px; line-height: 1; flex-shrink: 0;
    transition: color 0.15s;
  }
  .alert-remove-btn:hover { color: var(--neg); }

  /* ── Set alert section ── */
  .alert-section { margin-top: 2px; }

  .alert-form { display: flex; flex-direction: column; gap: 5px; }

  .alert-sentence { display: flex; align-items: center; gap: 5px; }
  .alert-label { font-size: 10px; font-weight: 700; color: var(--text-faint); white-space: nowrap; }

  .alert-toggle-group { display: flex; flex: 1; }
  .alert-tog {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border);
    color: var(--text-faint); font-size: 10px; font-weight: 700;
    padding: 4px 6px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s, background 0.1s;
  }
  .alert-tog:first-child { border-radius: 5px 0 0 5px; margin-right: -1px; }
  .alert-tog:last-child  { border-radius: 0 5px 5px 0; }
  .alert-tog.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-raised); position: relative; z-index: 1; }
  .alert-tog:hover:not(.active) { color: var(--text-sub); }

  .alert-input-row { display: flex; gap: 5px; }

  .alert-price-input {
    flex: 1; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text); font-size: 11px;
    padding: 5px 7px; font-family: 'Nunito', sans-serif; min-width: 0;
  }
  .alert-price-input:focus { outline: none; border-color: var(--accent-md); }

  .alert-set-btn {
    flex-shrink: 0; background: var(--bg-raised); border: 1px solid var(--accent-hi);
    color: var(--accent); font-size: 10px; font-weight: 700;
    padding: 5px 10px; border-radius: 5px; cursor: pointer;
    font-family: 'Nunito', sans-serif; transition: background 0.15s;
  }
  .alert-set-btn:hover:not(:disabled) { background: var(--accent-lo); }
  .alert-set-btn:disabled { opacity: 0.4; cursor: default; border-color: var(--border); color: var(--text-faint); }

  .market-chart-header {
    display: flex; align-items: center; justify-content: space-between;
    margin: 10px 0 5px;
  }
  .market-chart-header .market-section-label { margin: 0; }

  .period-tabs { display: flex; gap: 2px; }

  .period-tab {
    background: none; border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-faint); font-size: 9px; font-weight: 700; padding: 2px 6px;
    cursor: pointer; font-family: 'Nunito', sans-serif; letter-spacing: 0.5px;
    transition: border-color 0.1s, color 0.1s;
  }
  .period-tab.active { border-color: var(--accent-md); color: var(--accent); }
  .period-tab:hover:not(.active) { color: var(--text-sub); }
</style>
