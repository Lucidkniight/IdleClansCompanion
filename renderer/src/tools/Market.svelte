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

let marketSearch = '';
let marketDropdownOpen = false;
let selectedMarketItem: MarketItem | null = null;
let marketData: ComprehensivePrice | null = null;
let marketLoading = false;
let marketError = false;

$: marketSuggestions = marketSearch.trim().length >= 2
  ? $allItems
      .filter(i => i.name.replace(/_/g, ' ').toLowerCase().includes(marketSearch.toLowerCase()))
      .slice(0, 50)
  : [];

async function selectMarketItem(item: MarketItem) {
  selectedMarketItem = item;
  marketSearch = formatItemName(item.name);
  marketDropdownOpen = false;
  marketData = null;
  marketLoading = true;
  marketError = false;
  try {
    const res = await fetch(`https://query.idleclans.com/api/PlayerMarket/items/prices/latest/comprehensive/${item.id}`);
    if (!res.ok) throw new Error();
    marketData = await res.json();
  } catch {
    marketError = true;
  } finally {
    marketLoading = false;
  }
}

function onMarketInput() {
  selectedMarketItem = null;
  marketData = null;
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
      selectedMarketItem = null;
      marketData = null;
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
