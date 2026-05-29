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
  toolNavigation,
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

const toolModules = import.meta.glob(['./tools/*.svelte', '!./tools/_*.svelte'], { eager: true }) as Record<string, ToolModule>;
const TOOLS: ToolModule[] = Object.values(toolModules).sort((a, b) => a.toolMeta.name.localeCompare(b.toolMeta.name));

let activeTool: ToolModule | null = null;
let mountedTools: ToolModule[] = [];
let toolSearch = '';
let _lastNavId = -1;

function openTool(tool: ToolModule) {
  activeTool = tool;
  if (!mountedTools.some(t => t.toolMeta.name === tool.toolMeta.name)) {
    mountedTools = [...mountedTools, tool];
  }
}

$: if ($toolNavigation && $toolNavigation.id !== _lastNavId) {
  const nav = $toolNavigation;
  _lastNavId = nav.id;
  const target = TOOLS.find(t => t.toolMeta.name === nav.tool);
  if (target) {
    activeTab = 'tools';
    showSettings = false;
    openTool(target);
  }
}

$: filteredTools = toolSearch.trim() === ''
  ? TOOLS
  : TOOLS.filter(t => {
      const q = toolSearch.toLowerCase();
      return t.toolMeta.name.toLowerCase().includes(q) || t.toolMeta.desc.toLowerCase().includes(q);
    });

// ── UI state ──────────────────────────────────────────────────────────────────
type Tab = 'clients' | 'tools';
let activeTab: Tab = 'clients';
let showSettings = false;

// ── Settings ─────────────────────────────────────────────────────────────────
const THEMES = ['dark', 'light', 'vaporwave', 'slate', 'forest', 'ocean', 'midnight', 'rose', 'ember'] as const;
type Theme = typeof THEMES[number];

const THEME_LABELS: Record<Theme, string> = {
  dark:      'Dark',
  light:     'Light',
  vaporwave: 'Vaporwave',
  slate:     'Slate',
  forest:    'Forest',
  ocean:     'Ocean',
  midnight:  'Midnight',
  rose:      'Rose',
  ember:     'Ember',
};

function applyTheme(theme: Theme) {
  THEMES.forEach(t => document.body.classList.remove(`${t}-theme`));
  if (theme !== 'dark') document.body.classList.add(`${theme}-theme`);
}

const FPS_OPTIONS = [0, 0.1, 0.3, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
let settingAlwaysOnTop = localStorage.getItem('s-aot') === 'true';
const _storedFps = parseFloat(localStorage.getItem('s-prev-fps') ?? '1');
let settingPreviewFpsIdx = (() => { const i = FPS_OPTIONS.indexOf(_storedFps); return i !== -1 ? i : 4; })();
let settingPreviewFps = FPS_OPTIONS[settingPreviewFpsIdx];
let settingTheme       = (localStorage.getItem('s-theme') ?? 'dark') as Theme;

applyTheme(settingTheme);

$: {
  localStorage.setItem('s-aot', String(settingAlwaysOnTop));
  (window as any).electronAPI.setAlwaysOnTop(settingAlwaysOnTop);
}

$: {
  localStorage.setItem('s-theme', settingTheme);
  applyTheme(settingTheme);
}

$: {
  settingPreviewFps = FPS_OPTIONS[settingPreviewFpsIdx];
  localStorage.setItem('s-prev-fps', String(settingPreviewFps));
  clearInterval(previewInterval);
  if (settingPreviewFps > 0) {
    previewInterval = setInterval(refreshPreviews, Math.round(1000 / settingPreviewFps));
  } else {
    previews.set({});
  }
}
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
      <svg class="logo-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7L12 2z"/>
      </svg>
      <span class="logo-text">Idle Clans Companion</span>
    </div>
    <button class="settings-btn" class:active={showSettings} on:click={() => showSettings = !showSettings} title="Settings">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>
  </div>

  {#if $updateReady}
    <div class="update-banner">
      <span>Update ready</span>
      <button class="restart-btn" on:click={() => (window as any).electronAPI.restartAndUpdate()}>
        Restart
      </button>
    </div>
  {/if}

  {#if !showSettings}
  <div class="tabs">
    <button class="tab" class:active={activeTab === 'clients'} on:click={() => activeTab = 'clients'}>
      Clients
    </button>
    <button class="tab" class:active={activeTab === 'tools'} on:click={() => activeTab = 'tools'}>
      Tools
    </button>
  </div>
  {/if}

  <div class="content">

    <!-- ── Settings ── -->
    {#if showSettings}
      <div class="section-header"><span>Settings</span></div>

      <div class="settings-group">
        <div class="settings-group-label">General</div>
        <div class="settings-row">
          <span class="settings-label">Always on top</span>
          <button class="toggle" class:on={settingAlwaysOnTop} on:click={() => settingAlwaysOnTop = !settingAlwaysOnTop}>
            <span class="toggle-thumb" />
          </button>
        </div>
        <div class="settings-row settings-row-col">
          <div class="settings-row-top">
            <span class="settings-label">Client preview FPS</span>
            <span class="settings-value">{settingPreviewFps === 0 ? 'Off' : settingPreviewFps + ' FPS'}</span>
          </div>
          <input
            class="settings-slider"
            type="range"
            min="0" max="13" step="1"
            bind:value={settingPreviewFpsIdx}
            style="--fill: {(settingPreviewFpsIdx / 13) * 100}%"
          />
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-label">Appearance</div>
        <div class="settings-row settings-row-label-only">
          <span class="settings-label">Theme</span>
        </div>
        <div class="theme-grid">
          {#each THEMES as theme}
            <button
              class="theme-btn"
              class:active={settingTheme === theme}
              on:click={() => settingTheme = theme}
            >{THEME_LABELS[theme]}</button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- ── Clients ── -->
    <div class:tab-hidden={activeTab !== 'clients' || showSettings}>
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
                    <div class="preview-placeholder">{settingPreviewFps === 0 ? 'Previews disabled' : 'Loading..'}</div>
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
                    <div class="preview-placeholder">{settingPreviewFps === 0 ? 'Previews disabled' : 'Loading..'}</div>
                  {/if}
                </div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Tools ── -->
    <div class="tools-tab" class:tab-hidden={activeTab !== 'tools' || showSettings}>
      <div class="section-header">
        {#if activeTool}
          <button class="back-btn" on:click={() => activeTool = null}>← Back</button>
          <span>{activeTool.toolMeta.name}</span>
        {:else}
          <span>Tools</span>
        {/if}
      </div>

      <div class:tab-hidden={activeTool !== null}>
        <input
          class="tool-search"
          placeholder="Search tools…"
          bind:value={toolSearch}
        />
        <div class="calc-list">
          {#each filteredTools as tool}
            <button class="calc-item" on:click={() => openTool(tool)}>
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
      </div>

      {#each mountedTools as tool (tool.toolMeta.name)}
        <div class="tool-body" class:tab-hidden={activeTool !== tool}>
          <svelte:component this={tool.default} />
        </div>
      {/each}
    </div>

  </div>

  <div class="footer">
    <span class="version">v{__APP_VERSION__}</span>
  </div>
</div>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Nunito:wght@400;600;700&display=swap');

  :global(:root) {
    --bg-deep:    #0c0d13;
    --bg-base:    #0e0f15;
    --bg-card:    #13151f;
    --bg-hover:   #161824;
    --bg-raised:  #1a1c2e;
    --border:     #1e2030;
    --divider:    #1a1c28;
    --text:       #c8cad4;
    --text-hi:    #d0d4e8;
    --text-sub:   #8890b0;
    --text-muted: #555870;
    --text-dim:   #565c7a;
    --text-faint: #484e68;
    --accent:     #e8b84b;
    --accent-lo:  rgba(232,184,75,0.17);
    --accent-md:  rgba(232,184,75,0.33);
    --accent-hi:  rgba(232,184,75,0.53);
    --pos:        #4ade80;
    --neg:        #e05555;
  }

  :global(body.light-theme) {
    --bg-deep:    #c8cad6;
    --bg-base:    #d8dae6;
    --bg-card:    #e4e6f0;
    --bg-hover:   #dcdee8;
    --bg-raised:  #cfd1de;
    --border:     #b4b8cc;
    --divider:    #c4c8d8;
    --text:       #22253a;
    --text-hi:    #14162a;
    --text-sub:   #42486a;
    --text-muted: #5c6280;
    --text-dim:   #7880a0;
    --text-faint: #9098b4;
    --accent:     #2d6278;
    --accent-lo:  rgba(45,98,120,0.12);
    --accent-md:  rgba(45,98,120,0.28);
    --accent-hi:  rgba(45,98,120,0.50);
    --pos:        #2a7a50;
    --neg:        #a03830;
  }

  :global(body.vaporwave-theme) {
    --bg-deep:    #0c0b13;
    --bg-base:    #100f18;
    --bg-card:    #16151f;
    --bg-hover:   #1c1a27;
    --bg-raised:  #21202f;
    --border:     #2b293c;
    --divider:    #1c1a27;
    --text:       #c8c6d2;
    --text-hi:    #d2d0dc;
    --text-sub:   #8a88a4;
    --text-muted: #565468;
    --text-dim:   #545070;
    --text-faint: #464260;
    --accent:     #cc78c0;
    --accent-lo:  rgba(204,120,192,0.17);
    --accent-md:  rgba(204,120,192,0.33);
    --accent-hi:  rgba(204,120,192,0.53);
    --pos:        #50c0a8;
    --neg:        #e06080;
  }

  :global(body.slate-theme) {
    --bg-deep:    #0b0c0e;
    --bg-base:    #0f1115;
    --bg-card:    #14161c;
    --bg-hover:   #191c23;
    --bg-raised:  #1e222b;
    --border:     #262a34;
    --divider:    #191c23;
    --text:       #c2c4cc;
    --text-hi:    #ccd0d8;
    --text-sub:   #828a98;
    --text-muted: #525860;
    --text-dim:   #525a66;
    --text-faint: #444e58;
    --accent:     #7090aa;
    --accent-lo:  rgba(112,144,170,0.17);
    --accent-md:  rgba(112,144,170,0.33);
    --accent-hi:  rgba(112,144,170,0.53);
    --pos:        #60b890;
    --neg:        #c07070;
  }

  :global(body.forest-theme) {
    --bg-deep:    #0b0d0b;
    --bg-base:    #0f1110;
    --bg-card:    #141715;
    --bg-hover:   #191d1a;
    --bg-raised:  #1e231f;
    --border:     #262d27;
    --divider:    #191d1a;
    --text:       #c4c8c2;
    --text-hi:    #ced2cc;
    --text-sub:   #868e82;
    --text-muted: #545a50;
    --text-dim:   #545c50;
    --text-faint: #464e42;
    --accent:     #68b86c;
    --accent-lo:  rgba(104,184,108,0.17);
    --accent-md:  rgba(104,184,108,0.33);
    --accent-hi:  rgba(104,184,108,0.53);
    --pos:        #70c880;
    --neg:        #d07050;
  }

  :global(body.ocean-theme) {
    --bg-deep:    #0a0c10;
    --bg-base:    #0e1116;
    --bg-card:    #13171e;
    --bg-hover:   #181d25;
    --bg-raised:  #1d222d;
    --border:     #252c38;
    --divider:    #181d25;
    --text:       #c0c4ca;
    --text-hi:    #ccd0d8;
    --text-sub:   #7a8898;
    --text-muted: #4e5c6c;
    --text-dim:   #4e5a6c;
    --text-faint: #40505e;
    --accent:     #4ea8c8;
    --accent-lo:  rgba(78,168,200,0.17);
    --accent-md:  rgba(78,168,200,0.33);
    --accent-hi:  rgba(78,168,200,0.53);
    --pos:        #48c890;
    --neg:        #e07060;
  }

  :global(body.midnight-theme) {
    --bg-deep:    #0b0b13;
    --bg-base:    #0f0f18;
    --bg-card:    #14141f;
    --bg-hover:   #1a1a27;
    --bg-raised:  #1f1f2f;
    --border:     #27273c;
    --divider:    #1a1a27;
    --text:       #c0c0d0;
    --text-hi:    #ccccdc;
    --text-sub:   #8080a0;
    --text-muted: #505068;
    --text-dim:   #505070;
    --text-faint: #42425e;
    --accent:     #7878c0;
    --accent-lo:  rgba(120,120,192,0.17);
    --accent-md:  rgba(120,120,192,0.33);
    --accent-hi:  rgba(120,120,192,0.53);
    --pos:        #60b8a0;
    --neg:        #c87878;
  }

  :global(body.rose-theme) {
    --bg-deep:    #110e0f;
    --bg-base:    #161214;
    --bg-card:    #1c171a;
    --bg-hover:   #221d20;
    --bg-raised:  #282228;
    --border:     #322830;
    --divider:    #221d20;
    --text:       #c8c2c4;
    --text-hi:    #d4cecc;
    --text-sub:   #907a82;
    --text-muted: #5c5054;
    --text-dim:   #5a4e54;
    --text-faint: #4c4048;
    --accent:     #c84060;
    --accent-lo:  rgba(200,64,96,0.17);
    --accent-md:  rgba(200,64,96,0.33);
    --accent-hi:  rgba(200,64,96,0.53);
    --pos:        #70b880;
    --neg:        #b83858;
  }

  :global(body.ember-theme) {
    --bg-deep:    #100e0b;
    --bg-base:    #151310;
    --bg-card:    #1a1815;
    --bg-hover:   #201e1a;
    --bg-raised:  #262420;
    --border:     #302e28;
    --divider:    #201e1a;
    --text:       #c8c4bc;
    --text-hi:    #d4d0c8;
    --text-sub:   #908878;
    --text-muted: #5c5448;
    --text-dim:   #5a5248;
    --text-faint: #4c443a;
    --accent:     #cc4030;
    --accent-lo:  rgba(204,64,48,0.17);
    --accent-md:  rgba(204,64,48,0.33);
    --accent-hi:  rgba(204,64,48,0.53);
    --pos:        #78b858;
    --neg:        #983030;
  }

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
  :global(body) { background: var(--bg-base); color: var(--text); font-family: 'Nunito', sans-serif; }
  :global(#app) { width: 100%; height: 100%; display: flex; justify-content: flex-start; padding: 0; margin: 0; }

  :global(::-webkit-scrollbar) { width: 4px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 4px; }
  :global(::-webkit-scrollbar-thumb:hover) { background: var(--bg-raised); }

  .sidebar {
    width: 100%; height: 100vh;
    display: flex; flex-direction: column;
    background: var(--bg-base); overflow: hidden;
  }

  .header { padding: 16px 14px 12px; border-bottom: 1px solid var(--divider); display: flex; align-items: center; justify-content: space-between; }
  .logo { display: flex; align-items: center; gap: 7px; }
  .logo-icon { color: var(--accent); flex-shrink: 0; }
  .logo-text { font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; letter-spacing: 0.4px; color: var(--accent); }

  .settings-btn {
    background: none; border: 1px solid transparent; border-radius: 5px;
    color: var(--text-faint); padding: 4px 5px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: color 0.15s, border-color 0.15s, background 0.15s; flex-shrink: 0;
  }
  .settings-btn:hover { color: var(--text-sub); border-color: var(--border); background: var(--bg-card); }
  .settings-btn.active { color: var(--accent); border-color: var(--accent-md); background: var(--bg-card); }

  .settings-group {
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden; margin-bottom: 10px;
  }
  .settings-group-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--text-faint); padding: 8px 12px 6px;
    border-bottom: 1px solid var(--border);
  }
  .settings-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 9px 12px; gap: 12px;
  }
  .settings-row + .settings-row { border-top: 1px solid var(--divider); }
  .settings-row-col { flex-direction: column; align-items: stretch; gap: 6px; }
  .settings-row-top { display: flex; align-items: center; justify-content: space-between; }
  .settings-label { font-size: 11px; font-weight: 600; color: var(--text-sub); }
  .settings-value { font-size: 11px; font-weight: 700; color: var(--accent); }

  .settings-slider {
    width: 100%; cursor: pointer; height: 4px;
    -webkit-appearance: none; appearance: none;
    border-radius: 2px; outline: none;
    background: linear-gradient(to right, var(--accent) var(--fill, 0%), var(--bg-raised) var(--fill, 0%));
  }
  .settings-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--accent); cursor: pointer;
  }

  .settings-row-label-only { padding-bottom: 4px; }

  .theme-grid {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 4px; padding: 0 12px 10px;
  }
  .theme-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 5px;
    color: var(--text-muted); font-size: 10px; font-weight: 700;
    padding: 5px 4px; cursor: pointer; font-family: 'Nunito', sans-serif;
    transition: all 0.1s; width: auto;
  }
  .theme-btn:hover { color: var(--text-sub); border-color: var(--accent-lo); }
  .theme-btn.active { border-color: var(--accent-hi); color: var(--accent); background: var(--bg-card); }

  .toggle {
    position: relative; width: 32px; height: 18px; border-radius: 9px;
    background: var(--border); border: 1px solid var(--border); cursor: pointer;
    padding: 0; flex-shrink: 0; transition: background 0.2s, border-color 0.2s;
  }
  .toggle.on { background: var(--accent-md); border-color: var(--accent-hi); }
  .toggle-thumb {
    position: absolute; top: 2px; left: 2px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-faint); transition: transform 0.2s, background 0.2s;
    display: block;
  }
  .toggle.on .toggle-thumb { transform: translateX(14px); background: var(--accent); }

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

  .tabs { display: flex; padding: 8px 8px 0; gap: 2px; border-bottom: 1px solid var(--divider); }
  .tab {
    flex: 1; background: none; border: none; border-bottom: 2px solid transparent;
    color: var(--text-muted); font-family: 'Nunito', sans-serif; font-size: 11px; font-weight: 700;
    letter-spacing: 0.5px; padding: 6px 4px 8px; cursor: pointer;
    transition: color 0.15s, border-color 0.15s; text-transform: uppercase;
  }
  .tab:hover { color: var(--text-sub); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }

  .content {
    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px;
    display: flex; flex-direction: column;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }

  .tools-tab {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }

  .tool-body {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
  }

  .section-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 10px; font-size: 10px; font-weight: 700;
    letter-spacing: 1.2px; text-transform: uppercase; color: var(--text-faint);
  }

  .scan-btn {
    background: none; border: 1px solid var(--border); color: var(--text-faint);
    width: 22px; height: 22px; border-radius: 4px; cursor: pointer;
    font-size: 13px; display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; padding: 0;
  }
  .scan-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .back-btn {
    background: none; border: 1px solid var(--border); color: var(--text-muted);
    font-size: 11px; padding: 3px 8px; border-radius: 5px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .back-btn:hover { border-color: var(--accent-md); color: var(--accent); }

  .empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 12px; text-align: center; }
  .empty-icon { font-size: 28px; opacity: 0.3; }
  .empty p { font-size: 13px; color: var(--text-muted); font-weight: 600; }
  .empty span { font-size: 11px; color: var(--text-dim); }

  .cards { display: flex; flex-direction: column; gap: 8px; }
  .card {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px; cursor: pointer; text-align: left;
    transition: border-color 0.15s, background 0.15s;
    display: flex; flex-direction: column; gap: 8px;
  }
  .card:hover { border-color: var(--accent-lo); background: var(--bg-hover); }
  .card.active { border-color: var(--accent-hi); background: var(--bg-hover); box-shadow: 0 0 12px var(--accent-lo); }

  .card-top { display: flex; align-items: center; gap: 8px; }
  .avatar {
    width: 32px; height: 32px; border-radius: 6px;
    background: linear-gradient(135deg, var(--border), var(--divider));
    border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;
    font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; color: var(--accent); flex-shrink: 0;
  }
  .avatar.ghost { color: var(--text-dim); border-color: var(--border); }

  .card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-size: 13px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-name.muted { color: var(--text-faint); }
  .card-clan { font-size: 10px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .loading-text { color: var(--text-dim); font-style: italic; }
  .error-text { color: #7a3a3a; }

  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; box-shadow: 0 0 6px #4ade8088; }
  .status-dot.offline { background: var(--text-muted); box-shadow: none; }

  .card-preview { width: 100%; aspect-ratio: 16 / 9; border-radius: 4px; overflow: hidden; background: var(--bg-deep); }
  .card-preview img { width: 100%; height: 100%; object-fit: cover; }
  .preview-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--text-dim); }

  .tool-search {
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 12px;
    padding: 7px 10px; font-family: 'Nunito', sans-serif;
    margin-bottom: 8px; outline: none;
  }
  .tool-search:focus { border-color: var(--accent-md); }
  .tool-search::placeholder { color: var(--text-faint); }

  .tool-no-results { text-align: center; font-size: 11px; color: var(--text-faint); padding: 16px 0; }

  .calc-list { display: flex; flex-direction: column; gap: 6px; }
  .calc-item {
    display: flex; align-items: center; gap: 10px;
    width: 100%; background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px; cursor: pointer;
    text-align: left; transition: border-color 0.15s, background 0.15s;
  }
  .calc-item:hover { border-color: var(--accent-lo); background: var(--bg-hover); }
  .calc-item-icon { font-size: 18px; flex-shrink: 0; }
  .calc-item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .calc-item-name { font-size: 12px; font-weight: 700; color: var(--text-hi); }
  .calc-item-desc { font-size: 10px; color: var(--text-faint); }
  .calc-item-arrow { font-size: 18px; color: var(--text-faint); }

  .tab-hidden { display: none; }

  .footer { padding: 8px 14px; border-top: 1px solid var(--divider); display: flex; justify-content: flex-end; }
  .version { font-size: 10px; color: var(--border); letter-spacing: 0.5px; }
</style>
