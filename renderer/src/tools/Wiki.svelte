<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Wiki',
    desc: 'Search the Idle Clans wiki',
    icon: '📖',
    author: 'Lucid',
  };
</script>

<script lang="ts">
  import { track } from '../lib/analytics';
  import DevPanel from '../lib/DevPanel.svelte';

  const WIKI_API = 'https://idleclans.wiki/w/api.php';
  const WIKI_BASE = 'https://idleclans.wiki/w/';

  interface WikiResult {
    title: string;
    url: string;
  }

  const FAV_KEY = 'icc-wiki-favourites';

  // Seeded on first run only — once the user favourites/unfavourites anything,
  // toggleFavourite() persists the real list and this default is never consulted again.
  const DEFAULT_FAVOURITE_TITLES = ['Gear', 'Skills', 'Quests', 'Combat', 'Game Rules', 'Holiday Events', "Beginner's Guide"];
  const DEFAULT_FAVOURITES: WikiResult[] = DEFAULT_FAVOURITE_TITLES.map(title => ({
    title,
    url: WIKI_BASE + encodeURIComponent(title.replace(/ /g, '_')),
  }));

  let query = '';
  let results: WikiResult[] = [];
  let loading = false;
  let searched = false;
  let debounce: ReturnType<typeof setTimeout>;
  let favourites: WikiResult[] = JSON.parse(localStorage.getItem(FAV_KEY) ?? JSON.stringify(DEFAULT_FAVOURITES));

  function isFavourite(url: string) {
    return favourites.some(f => f.url === url);
  }

  function toggleFavourite(result: WikiResult) {
    favourites = isFavourite(result.url)
      ? favourites.filter(f => f.url !== result.url)
      : [...favourites, result];
    localStorage.setItem(FAV_KEY, JSON.stringify(favourites));
  }

  function onInput() {
    clearTimeout(debounce);
    const q = query.trim();
    if (!q) { results = []; searched = false; return; }
    debounce = setTimeout(() => search(q), 350);
  }

  async function search(q: string) {
    loading = true;
    searched = true;
    try {
      const enc = encodeURIComponent(q);
      const [openRes, textRes] = await Promise.all([
        fetch(`${WIKI_API}?action=opensearch&search=${enc}&limit=20&namespace=0&format=json&origin=*`),
        fetch(`${WIKI_API}?action=query&list=search&srsearch=${enc}&srlimit=20&srprop=&format=json&origin=*`),
      ]);
      const openData = await openRes.json();
      const textData = await textRes.json();

      const openTitles: string[] = openData?.[1] ?? [];
      const textHits: any[] = textData?.query?.search ?? [];

      const seen = new Set<string>();
      const combined: WikiResult[] = [];
      for (const title of openTitles) {
        if (!seen.has(title)) {
          seen.add(title);
          combined.push({ title, url: WIKI_BASE + encodeURIComponent(title.replace(/ /g, '_')) });
        }
      }
      for (const h of textHits) {
        if (!seen.has(h.title)) {
          seen.add(h.title);
          combined.push({ title: h.title, url: WIKI_BASE + encodeURIComponent(h.title.replace(/ /g, '_')) });
        }
      }
      results = combined;
    } catch {
      results = [];
    } finally {
      loading = false;
    }
  }

  function open(url: string) {
    track('external_link_opened', { source: 'wiki_tool' });
    const inApp = localStorage.getItem('s-wiki-in-app') !== 'false';
    if (inApp) {
      const style = getComputedStyle(document.body);
      const colors = {
        bg: style.getPropertyValue('--bg-base').trim(),
        accent: style.getPropertyValue('--accent').trim(),
        accentLo: style.getPropertyValue('--accent-lo').trim(),
        border: style.getPropertyValue('--border').trim(),
        bgRaised: style.getPropertyValue('--bg-raised').trim(),
      };
      (window as any).electronAPI.openWikiPopup(url, colors);
    } else {
      (window as any).electronAPI.openExternal(url);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      const q = query.trim();
      if (q) search(q);
    }
  }

  function clearQuery() {
    clearTimeout(debounce);
    query = '';
    results = [];
    searched = false;
    loading = false;
  }
</script>

<DevPanel>
  <div class="dev-row"><span class="dev-key">Results</span><span class="dev-val">{results.length}</span></div>
  <div class="dev-row"><span class="dev-key">Favourites</span><span class="dev-val">{favourites.length}</span></div>
  <div class="dev-row"><span class="dev-key">Debounce</span><span class="dev-val">350ms</span></div>
  <div class="dev-row"><span class="dev-key">Query</span><span class="dev-val">{query || '—'}</span></div>
  <div class="dev-sep"></div>
  <div class="dev-row"><span class="dev-key">Search API</span><span class="dev-val">idleclans.wiki/w/api.php?action=opensearch</span></div>
  <div class="dev-row"><span class="dev-key">Text API</span><span class="dev-val">idleclans.wiki/w/api.php?action=query&list=search</span></div>
</DevPanel>

<p class="wiki-hint">Use full words for best results</p>
<div class="wiki-search-row">
  <input
    class="wiki-input"
    placeholder="Search wiki…"
    bind:value={query}
    on:input={onInput}
    on:keydown={onKeydown}
  />
  {#if loading}
    <span class="wiki-spinner">…</span>
  {:else if query.length > 0}
    <button class="wiki-clear" on:click={clearQuery}>✕</button>
  {/if}
</div>

{#if loading}
  <div class="wiki-status">Searching…</div>
{:else if searched && results.length === 0}
  <div class="wiki-status">No results found</div>
{:else if results.length}
  <div class="wiki-results">
    {#each results as result}
      <div class="wiki-card">
        <button class="wiki-card-link" on:click={() => open(result.url)}>{result.title}</button>
        <button
          class="wiki-fav-btn"
          class:fav-active={isFavourite(result.url)}
          on:click={() => toggleFavourite(result)}
          title={isFavourite(result.url) ? 'Remove from favourites' : 'Add to favourites'}
        >★</button>
      </div>
    {/each}
  </div>
{:else if favourites.length}
  <div class="wiki-section-label">Favourites</div>
  <div class="wiki-results">
    {#each favourites as result}
      <div class="wiki-card">
        <button class="wiki-card-link" on:click={() => open(result.url)}>{result.title}</button>
        <button class="wiki-fav-btn fav-active" on:click={() => toggleFavourite(result)} title="Remove from favourites">★</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .wiki-hint {
    font-size: 10px;
    color: var(--text-faint);
    margin: 0 0 6px;
    text-align: center;
  }

  .wiki-search-row {
    position: relative;
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }

  .wiki-input {
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 12px;
    padding: 7px 28px 7px 10px;
    font-family: 'Nunito', sans-serif;
    box-sizing: border-box;
  }
  .wiki-input:focus { outline: none; border-color: var(--accent-md); }

  .wiki-spinner {
    position: absolute;
    right: 10px;
    font-size: 13px;
    color: var(--text-faint);
    pointer-events: none;
  }

  .wiki-clear {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
    transition: color 0.15s;
    width: auto;
  }
  .wiki-clear:hover { color: var(--accent); }

  .wiki-status {
    text-align: center;
    font-size: 11px;
    color: var(--text-faint);
    padding: 16px 0;
  }

  .wiki-section-label {
    font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--accent); display: flex; align-items: center; gap: 8px; white-space: nowrap;
    margin: 4px 0 5px;
  }
  .wiki-section-label::before, .wiki-section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  .wiki-results {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .wiki-card {
    position: relative;
    display: flex;
    align-items: center;
    width: 100%;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    transition: border-color 0.1s;
  }
  .wiki-card:hover { border-color: var(--accent-md); }

  .wiki-card-link {
    flex: 1;
    min-width: 0;
    text-align: left;
    background: none;
    border: none;
    padding: 7px 4px 7px 10px;
    cursor: pointer;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    transition: color 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wiki-card:hover .wiki-card-link { color: var(--accent); }

  .wiki-fav-btn {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 10px 4px 4px;
    font-size: 13px;
    line-height: 1;
    color: var(--text-faint);
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
  }
  .wiki-card:hover .wiki-fav-btn { opacity: 1; }
  .wiki-fav-btn:hover { color: var(--accent); }
  .wiki-fav-btn.fav-active { color: var(--accent); opacity: 1; }
</style>
