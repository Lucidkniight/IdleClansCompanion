<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Market',
    desc: 'Live prices and order books',
    icon: '🏪',
  };
</script>

<script lang="ts">
import { allItems, formatItemName, formatGold, type MarketItem } from '../lib/store';

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

let marketSearch = '';
let marketDropdownOpen = false;
let marketData: ComprehensivePrice | null = null;
let historyData: PriceHistoryPoint[] = [];
let marketLoading = false;
let marketError = false;

let containerWidth = 260;
let hoveredPoint: PriceHistoryPoint | null = null;
let hoverX = 0;

$: marketSuggestions = marketSearch.trim().length >= 2
  ? $allItems
      .filter(i => i.name.replace(/_/g, ' ').toLowerCase().includes(marketSearch.toLowerCase()))
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
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function selectMarketItem(item: MarketItem) {
  marketSearch = formatItemName(item.name);
  marketDropdownOpen = false;
  marketData = null;
  historyData = [];
  hoveredPoint = null;
  marketLoading = true;
  marketError = false;
  try {
    const [compRes, histRes] = await Promise.all([
      fetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/latest/comprehensive/${item.id}`),
      fetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/history/${item.id}`),
    ]);
    if (!compRes.ok) throw new Error();
    marketData = await compRes.json();
    if (histRes.ok) historyData = await histRes.json();
  } catch {
    marketError = true;
  } finally {
    marketLoading = false;
  }
}

function onMarketInput() {
  marketData = null;
  historyData = [];
  hoveredPoint = null;
  marketDropdownOpen = marketSearch.trim().length >= 2;
}

function closeDropdown() {
  setTimeout(() => { marketDropdownOpen = false; }, 500);
}
</script>

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
      marketDropdownOpen = false;
      marketData = null;
      historyData = [];
      hoveredPoint = null;
    }}>✕</button>
  {/if}
  {#if marketDropdownOpen && marketSuggestions.length > 0}
    <div class="market-dropdown">
      {#each marketSuggestions as item}
        <button class="market-suggestion" on:click={() => selectMarketItem(item)}>
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
  <div class="market-section-label">Price Averages</div>
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
      <span class="market-avg-label">Volume 24h</span>
      <span class="market-avg-val">{marketData.tradeVolume1Day.toLocaleString()}</span>
    </div>
  </div>

  <div class="market-section-label">Price History (24h)</div>
  <div class="chart-wrap" bind:clientWidth={containerWidth}>
    {#if historyData.length >= 2}
      <svg
        width={containerWidth}
        height={svgH}
        on:mousemove={onMouseMove}
        on:mouseleave={onMouseLeave}
      >
        {#if bandPoints}
          <polygon points={bandPoints} fill="#e8b84b" fill-opacity="0.12" />
        {/if}

        {#if avgLine}
          <polyline
            points={avgLine}
            fill="none"
            stroke="#e8b84b"
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
            fill="#2a2d42"
            rx="1"
          />
        {/each}

        {#if hoveredPoint}
          {@const hy = getY(hoveredPoint.averagePrice)}
          <line
            x1={hoverX} y1={PAD_T}
            x2={hoverX} y2={PAD_T + CHART_H}
            stroke="#3a3f58"
            stroke-width="1"
            stroke-dasharray="3,2"
          />
          <circle
            cx={hoverX}
            cy={hy}
            r="3"
            fill="#e8b84b"
            stroke="#13151f"
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
          <div class="tooltip-row"><span>Avg</span><span>{formatGold(hoveredPoint.averagePrice)}</span></div>
          <div class="tooltip-row"><span>Low</span><span>{formatGold(hoveredPoint.lowesSellPrice)}</span></div>
          <div class="tooltip-row"><span>High</span><span>{formatGold(hoveredPoint.highestSellPrice)}</span></div>
          <div class="tooltip-row"><span>Vol</span><span>{hoveredPoint.tradeVolume.toLocaleString()}</span></div>
        </div>
      {/if}
    {:else}
      <div class="chart-no-data">No history data available</div>
    {/if}
  </div>

  <div class="market-books">
    <div class="market-book">
      <div class="market-section-label buy-label">Buy Orders</div>
      <div class="market-table-head">
        <span>Price</span>
        <span>Volume</span>
      </div>
      {#each marketData.highestBuyPricesWithVolume as row}
        <div class="market-table-row buy">
          <span>{formatGold(row.key)}</span>
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
      {#each marketData.lowestSellPricesWithVolume as row}
        <div class="market-table-row sell">
          <span>{formatGold(row.key)}</span>
          <span>{Math.round(row.value).toLocaleString()}</span>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .market-search-wrap { position: relative; margin-bottom: 8px; }

  .market-input {
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 6px; color: #c8cad4; font-size: 12px;
    padding: 7px 10px; font-family: 'Nunito', sans-serif; padding-right: 28px;
  }
  .market-input:focus { outline: none; border-color: #e8b84b55; }

  .market-clear {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: #3a3f58; font-size: 11px;
    cursor: pointer; padding: 2px 4px; line-height: 1; transition: color 0.15s; width: auto;
  }
  .market-clear:hover { color: #e8b84b; }

  .market-dropdown {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: #13151f; border: 1px solid #1e2030; border-radius: 6px;
    max-height: 200px; overflow-y: auto; z-index: 100;
    scrollbar-width: thin; scrollbar-color: #1e2030 transparent;
  }

  .market-suggestion {
    width: 100%; background: none; border: none; border-bottom: 1px solid #1a1c28;
    color: #8890b0; font-size: 11px; padding: 7px 10px; text-align: left;
    cursor: pointer; transition: background 0.1s, color 0.1s;
    border-radius: 0; font-family: 'Nunito', sans-serif;
  }
  .market-suggestion:last-child { border-bottom: none; }
  .market-suggestion:hover { background: #1a1c28; color: #e8b84b; }

  .market-status { text-align: center; font-size: 11px; color: #3a3f58; padding: 16px 0; }
  .market-status.error { color: #7a3a3a; }

  .market-section-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: #3a3f58; margin: 10px 0 5px;
  }

  .market-avg-row { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; margin-bottom: 4px; }
  .market-avg-box {
    background: #13151f; border: 1px solid #1e2030; border-radius: 6px;
    padding: 7px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  }
  .market-avg-label { font-size: 8px; color: #474d6d; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; }
  .market-avg-val { font-size: 12px; font-weight: 700; color: #e8b84b; }

  /* Price History Chart */
  .chart-wrap {
    position: relative;
    background: #13151f;
    border: 1px solid #1e2030;
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
    color: #3a3f58;
    font-family: 'Nunito', sans-serif;
  }

  .chart-tooltip {
    position: absolute;
    background: #0e1018;
    border: 1px solid #1e2030;
    border-radius: 5px;
    padding: 5px 7px;
    pointer-events: none;
    z-index: 10;
    min-width: 82px;
  }

  .tooltip-time {
    font-size: 9px;
    font-weight: 700;
    color: #e8b84b;
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
    color: #474d6d;
    font-family: 'Nunito', sans-serif;
  }

  .tooltip-row span:last-child { color: #c8cad4; }

  .market-table-head {
    display: flex; justify-content: space-between; font-size: 8px; font-weight: 700;
    letter-spacing: 0.5px; color: #474d6d; text-transform: uppercase;
    padding: 0 8px; margin-bottom: 2px;
  }
  .market-table-row {
    display: flex; justify-content: space-between; background: #13151f;
    border: 1px solid #1e2030; border-radius: 5px; padding: 5px 8px;
    font-size: 11px; font-weight: 600;
  }
  .market-table-row.buy { color: #e05555; border-left: 2px solid #e0555544; }
  .market-table-row.sell { color: #4ade80; border-left: 2px solid #4ade8044; }

  .market-books { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .market-book { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .market-book .market-section-label { text-align: center; }
  .sell-label { color: #4ade80; }
  .buy-label { color: #e05555; }
</style>
