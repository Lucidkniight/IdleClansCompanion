<script context="module" lang="ts">
  export const toolMeta = {
    name: 'News',
    desc: 'Latest Idle Clans patch notes and announcements',
    icon: '📰',
    author: 'Z0ne',
  };
</script>



<script lang="ts">
  import { onMount } from 'svelte';

  interface NewsItem {
    title: string;
    body: string;
    imageUrl: string | null;
    linkUrl: string;
    publishedAt: string;
  }

  let items: NewsItem[] = [];
  let loading = true;
  let error = false;

  async function load() {
    loading = true;
    error = false;
    try {
      const res = await fetch('https://query.idleclans.com/api/news/latest?count=25');
      if (!res.ok) throw new Error();
      items = await res.json();
    } catch {
      error = true;
    } finally {
      loading = false;
    }
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function timeAgo(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  }

  onMount(load);
</script>



{#if loading}
  <div class="state-box">
    <span class="spinner">⟳</span>
    <span class="state-text">Loading news…</span>
  </div>

{:else if error}
  <div class="state-box">
    <span class="state-icon">⚠</span>
    <span class="state-text">Could not load news.</span>
    <button class="retry-btn" on:click={load}>Retry</button>
  </div>

{:else}
  <div class="refresh-row">
    <span class="count">{items.length} post{items.length !== 1 ? 's' : ''}</span>
    <button class="refresh-btn" on:click={load} title="Refresh">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Refresh
    </button>
  </div>

  <div class="news-list">
    {#each items as item (item.publishedAt)}
      <article class="news-card">
        <div class="news-header">
          <h2 class="news-title">{item.title}</h2>
          <div class="news-date" title={formatDate(item.publishedAt)}>{timeAgo(item.publishedAt)}</div>
        </div>
        <div class="news-body">{@html item.body}</div>
        {#if item.linkUrl}
          <a
            class="news-link"
            href={item.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            on:click|preventDefault={() => (window as any).electronAPI.openExternal(item.linkUrl)}
          >
            Read more ›
          </a>
        {/if}
      </article>
    {/each}
  </div>
{/if}



<style>
  /* ── Loading / error states ── */
  .state-box {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 40px 12px; text-align: center;
  }
  .spinner {
    font-size: 20px; color: var(--text-faint);
    display: inline-block; animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .state-icon { font-size: 20px; color: var(--text-faint); }
  .state-text { font-size: 11px; color: var(--text-faint); }
  .retry-btn {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-sub); font-size: 11px; font-weight: 700;
    padding: 5px 14px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .retry-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  /* ── Top row ── */
  .refresh-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 8px;
  }
  .count { font-size: 10px; color: var(--text-faint); }
  .refresh-btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: none; border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-faint); font-size: 10px; font-weight: 700;
    padding: 3px 8px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: border-color 0.1s, color 0.1s; width: auto;
  }
  .refresh-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  /* ── News list ── */
  .news-list { display: flex; flex-direction: column; gap: 6px; }

  .news-card {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; display: flex; flex-direction: column; gap: 7px;
  }

  .news-header { display: flex; flex-direction: column; gap: 3px; }

  .news-title {
    font-size: 12px; font-weight: 700; color: var(--text-hi); line-height: 1.35;
  }

  .news-date {
    font-size: 9px; color: var(--text-faint); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.4px;
  }

  .news-body {
    font-size: 11px; color: var(--text-sub); line-height: 1.6;
  }

  .news-link {
    align-self: flex-start; font-size: 10px; font-weight: 700;
    color: var(--accent); text-decoration: none;
    transition: opacity 0.1s;
  }
  .news-link:hover { opacity: 0.75; }
</style>
