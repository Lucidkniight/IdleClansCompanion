<script context="module" lang="ts">
  export const toolMeta = {
    name: 'Wiki',
    desc: 'Search the Idle Clans wiki',
    icon: '📖',
  };
</script>

<script lang="ts">
  import { track } from '../lib/analytics';

  const WIKI_API = 'https://idleclans.wiki/w/api.php';
  const WIKI_BASE = 'https://idleclans.wiki/w/';

  interface WikiResult {
    title: string;
    url: string;
  }

  let query = '';
  let results: WikiResult[] = [];
  let loading = false;
  let searched = false;
  let debounce: ReturnType<typeof setTimeout>;

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
    (window as any).electronAPI.openExternal(url);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounce);
      const q = query.trim();
      if (q) search(q);
    }
  }
</script>

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
  {/if}
</div>

{#if loading}
  <div class="wiki-status">Searching…</div>
{:else if searched && results.length === 0}
  <div class="wiki-status">No results found</div>
{:else if results.length}
  <div class="wiki-results">
    {#each results as result}
      <button class="wiki-card" on:click={() => open(result.url)}>
        {result.title}
      </button>
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

  .wiki-status {
    text-align: center;
    font-size: 11px;
    color: var(--text-faint);
    padding: 16px 0;
  }

  .wiki-results {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .wiki-card {
    width: 100%;
    text-align: left;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 7px 10px;
    cursor: pointer;
    font-family: 'Nunito', sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    transition: border-color 0.1s, color 0.1s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wiki-card:hover { border-color: var(--accent-md); color: var(--accent); }
</style>
