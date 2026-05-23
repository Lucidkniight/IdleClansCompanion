<script context="module" lang="ts">
  declare const __APP_VERSION__: string;
</script>

<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import {
  type PlayerProfile, type ClientCard,
  xpToLevel,
  clients, activeId, previews, updateReady,
  scan, focusClient, refreshPreviews, loadGameConfig, refreshPrices,
} from './lib/store';

// ── Tool discovery ────────────────────────────────────────────────────────────
interface ToolMeta {
  name: string;
  desc: string;
  icon: string;
}

interface ToolModule {
  toolMeta: ToolMeta;
  default: any;
}

const toolModules = import.meta.glob('./tools/*.svelte', { eager: true }) as Record<string, ToolModule>;
const TOOLS: ToolModule[] = Object.values(toolModules).sort((a, b) => a.toolMeta.name.localeCompare(b.toolMeta.name));

let activeTool: ToolModule | null = null;
let toolSearch = '';

$: filteredTools = toolSearch.trim() === ''
  ? TOOLS
  : TOOLS.filter(t => {
      const q = toolSearch.toLowerCase();
      return t.toolMeta.name.toLowerCase().includes(q) || t.toolMeta.desc.toLowerCase().includes(q);
    });

// ── UI state ──────────────────────────────────────────────────────────────────
type Tab = 'clients' | 'tools';
let activeTab: Tab = 'clients';
let refreshInterval: ReturnType<typeof setInterval>;
let previewInterval: ReturnType<typeof setInterval>;
let priceInterval: ReturnType<typeof setInterval>;

// ── Client tab ────────────────────────────────────────────────────────────────
function getTotalLevel(profile: PlayerProfile): number {
  if (!profile.skillExperiences) return 0;
  return Object.values(profile.skillExperiences).reduce((sum, xp) => sum + xpToLevel(xp), 0);
}

function getOnlineStatus(profile: PlayerProfile): { online: boolean } {
  return { online: !!profile.activeServerId };
}

async function focus(client: ClientCard) {
  const newId = $activeId === client.win.id ? null : client.win.id;
  await focusClient(newId);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMount(async () => {
  await loadGameConfig();
  await scan();
  refreshInterval = setInterval(scan, 10000);
  previewInterval = setInterval(refreshPreviews, 1000);
  priceInterval  = setInterval(refreshPrices, 5 * 60 * 1000);
  (window as any).electronAPI.onUpdateReady(() => {
    updateReady.set(true);
  });
});

onDestroy(() => {
  clearInterval(refreshInterval);
  clearInterval(previewInterval);
  clearInterval(priceInterval);
});
</script>

<div class="sidebar">

  <div class="header">
    <div class="logo">
      <img src="./logo.png" alt="Logo" class="logo-image" />
      <span class="logo-text">Idle Clans Companion</span>
    </div>
  </div>

  {#if $updateReady}
    <div class="update-banner">
      <span>Update ready</span>
      <button class="restart-btn" on:click={() => (window as any).electronAPI.restartAndUpdate()}>
        Restart
      </button>
    </div>
  {/if}

  <div class="tabs">
    <button class="tab" class:active={activeTab === 'clients'} on:click={() => activeTab = 'clients'}>
      Clients
    </button>
    <button class="tab" class:active={activeTab === 'tools'} on:click={() => { activeTab = 'tools'; activeTool = null; }}>
      Tools
    </button>
  </div>

  <div class="content">

    <!-- ── Clients ── -->
    {#if activeTab === 'clients'}
      <div class="section-header">
        <span>Accounts</span>
        <button class="scan-btn" on:click={scan} title="Rescan">↺</button>
      </div>

      {#if $clients.length === 0}
        <div class="empty">
          <div class="empty-icon">⚔</div>
          <p>No clients found</p>
          <span>Open Idle Clans and click ↺</span>
        </div>
      {:else}
        <div class="cards">
          {#each $clients as client (client.win.id)}
            <button
              class="card"
              class:active={client.win.id === $activeId}
              on:click={() => focus(client)}
            >
              {#if !client.playerName}
                <div class="card-top">
                  <div class="avatar ghost">?</div>
                  <div class="card-info">
                    <span class="card-name muted">Not logged in</span>
                    <span class="card-clan">Idle Clans</span>
                  </div>
                  <div class="status-dot offline"></div>
                </div>

              {:else if client.loading}
                <div class="card-top">
                  <div class="avatar ghost">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan loading-text">Loading...</span>
                  </div>
                  <div class="status-dot offline"></div>
                </div>

              {:else if client.error || !client.profile}
                <div class="card-top">
                  <div class="avatar ghost">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan error-text">Could not load profile</span>
                  </div>
                  <div class="status-dot offline"></div>
                </div>
                <div class="card-preview">
                  {#if $previews[client.win.id]}
                    <img src={$previews[client.win.id]} alt={client.playerName} />
                  {:else}
                    <div class="preview-placeholder">No preview</div>
                  {/if}
                </div>

              {:else}
                {@const status = getOnlineStatus(client.profile)}
                {@const totalLevel = getTotalLevel(client.profile)}
                <div class="card-top">
                  <div class="avatar">{client.playerName[0].toUpperCase()}</div>
                  <div class="card-info">
                    <span class="card-name">{client.playerName}</span>
                    <span class="card-clan">{client.profile.guildName ?? 'No clan'}</span>
                  </div>
                  <div class="status-dot" class:offline={!status.online}></div>
                </div>
                <div class="card-preview">
                  {#if $previews[client.win.id]}
                    <img src={$previews[client.win.id]} alt={client.playerName} />
                  {:else}
                    <div class="preview-placeholder">No preview</div>
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <!-- ── Tools ── -->
    {#if activeTab === 'tools'}
      {#if activeTool}
        <div class="section-header">
          <button class="back-btn" on:click={() => activeTool = null}>← Back</button>
          <span>{activeTool.toolMeta.name}</span>
        </div>
        <svelte:component this={activeTool.default} />
      {:else}
        <div class="section-header"><span>Tools</span></div>
        <input
          class="tool-search"
          placeholder="Search tools…"
          bind:value={toolSearch}
        />
        <div class="calc-list">
          {#each filteredTools as tool}
            <button class="calc-item" on:click={() => activeTool = tool}>
              <span class="calc-item-icon">{tool.toolMeta.icon}</span>
              <div class="calc-item-info">
                <span class="calc-item-name">{tool.toolMeta.name}</span>
                <span class="calc-item-desc">{tool.toolMeta.desc}</span>
              </div>
              <span class="calc-item-arrow">›</span>
            </button>
          {/each}
          {#if filteredTools.length === 0}
            <div class="tool-no-results">No tools match "{toolSearch}"</div>
          {/if}
        </div>
      {/if}
    {/if}

  </div>

  <div class="footer">
    <span class="version">v{__APP_VERSION__}</span>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Nunito:wght@400;600;700&display=swap');

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
  :global(body) { background: #0e0f15; color: #c8cad4; font-family: 'Nunito', sans-serif; }
  :global(#app) { width: 100%; height: 100%; display: flex; justify-content: flex-start; padding: 0; margin: 0; }

  :global(::-webkit-scrollbar) { width: 4px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: #1e2030; border-radius: 4px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: #2a2d3e; }

  .sidebar {
    width: 100%; height: 100vh;
    display: flex; flex-direction: column;
    background: #0e0f15; overflow: hidden;
  }

  .header { padding: 16px 14px 12px; border-bottom: 1px solid #1a1c28; }
  .logo { display: flex; align-items: center; gap: 8px; }
  .logo-image { width: 22px; height: 22px; object-fit: contain; }
  .logo-text { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 600; color: #e8b84b; letter-spacing: 0.5px; }

  .update-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; background: #1a2a1a; border-bottom: 1px solid #2a4a2a;
    font-size: 12px; color: #4ade80; font-weight: 600;
  }
  .restart-btn {
    background: #2a4a2a; border: 1px solid #4ade8044; color: #4ade80;
    padding: 3px 10px; border-radius: 4px; font-size: 11px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .restart-btn:hover { background: #3a5a3a; border-color: #4ade80; }

  .tabs { display: flex; padding: 8px 8px 0; gap: 2px; border-bottom: 1px solid #1a1c28; }
  .tab {
    flex: 1; background: none; border: none; border-bottom: 2px solid transparent;
    color: #555870; font-family: 'Nunito', sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.5px; padding: 6px 4px 8px; cursor: pointer;
    transition: color 0.15s, border-color 0.15s; text-transform: uppercase;
  }
  .tab:hover { color: #9098b8; }
  .tab.active { color: #e8b84b; border-bottom-color: #e8b84b; }

  .content {
    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px;
    display: flex; flex-direction: column;
    scrollbar-width: thin; scrollbar-color: #1e2030 transparent;
  }

  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; font-size: 10px; font-weight: 700;
    letter-spacing: 1.2px; text-transform: uppercase; color: #3a3f58;
  }

  .scan-btn {
    background: none; border: 1px solid #1e2030; color: #3a3f58;
    width: 22px; height: 22px; border-radius: 4px; cursor: pointer;
    font-size: 13px; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; padding: 0;
  }
  .scan-btn:hover { border-color: #e8b84b55; color: #e8b84b; }

  .back-btn {
    background: none; border: 1px solid #1e2030; color: #555870;
    font-size: 11px; padding: 3px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .back-btn:hover { border-color: #e8b84b55; color: #e8b84b; }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 12px; text-align: center; }
  .empty-icon { font-size: 28px; opacity: 0.3; }
  .empty p { font-size: 13px; color: #4a5070; font-weight: 600; }
  .empty span { font-size: 11px; color: #474d6d; }

  .cards { display: flex; flex-direction: column; gap: 8px; }
  .card {
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 8px; padding: 10px; cursor: pointer; text-align: left;
    transition: border-color 0.15s, background 0.15s;
    display: flex; flex-direction: column; gap: 8px;
  }
  .card:hover { border-color: #e8b84b44; background: #161824; }
  .card.active { border-color: #e8b84b88; background: #161824; box-shadow: 0 0 12px #e8b84b11; }

  .card-top { display: flex; align-items: center; gap: 8px; }
  .avatar {
    width: 32px; height: 32px; border-radius: 6px;
    background: linear-gradient(135deg, #2a2d3e, #1a1c28);
    border: 1px solid #2a2d3e; display: flex; align-items: center; justify-content: center;
    font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; color: #e8b84b; flex-shrink: 0;
  }
  .avatar.ghost { color: #474d6d; border-color: #1e2030; }

  .card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-size: 13px; font-weight: 700; color: #d0d4e8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-name.muted { color: #3a3f58; }
  .card-clan { font-size: 10px; color: #3a3f58; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loading-text { color: #474d6d; font-style: italic; }
  .error-text { color: #7a3a3a; }

  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; box-shadow: 0 0 6px #4ade8088; }
  .status-dot.offline { background: #555870; box-shadow: none; }

  .card-preview { width: 100%; aspect-ratio: 16 / 9; border-radius: 4px; overflow: hidden; background: #0c0d13; }
  .card-preview img { width: 100%; height: 100%; object-fit: cover; }
  .preview-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #474d6d; }

  .tool-search {
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 6px; color: #c8cad4; font-size: 12px;
    padding: 7px 10px; font-family: 'Nunito', sans-serif;
    margin-bottom: 8px; outline: none;
  }
  .tool-search:focus { border-color: #e8b84b55; }
  .tool-search::placeholder { color: #3a3f58; }

  .tool-no-results { text-align: center; font-size: 11px; color: #3a3f58; padding: 16px 0; }

  .calc-list { display: flex; flex-direction: column; gap: 6px; }
  .calc-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; background: #13151f; border: 1px solid #1e2030;
    border-radius: 8px; padding: 10px 12px; cursor: pointer;
    text-align: left; transition: border-color 0.15s, background 0.15s;
  }
  .calc-item:hover { border-color: #e8b84b44; background: #161824; }
  .calc-item-icon { font-size: 18px; flex-shrink: 0; }
  .calc-item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .calc-item-name { font-size: 12px; font-weight: 700; color: #d0d4e8; }
  .calc-item-desc { font-size: 10px; color: #3a3f58; }
  .calc-item-arrow { font-size: 18px; color: #3a3f58; }

  .footer { padding: 8px 14px; border-top: 1px solid #1a1c28; display: flex; justify-content: flex-end; }
  .version { font-size: 10px; color: #2a2d3e; letter-spacing: 0.5px; }
</style>
