<script context="module" lang="ts">
  declare const __APP_VERSION__: string;
</script>

<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import {
  type PlayerProfile, type ClientCard, type TriggeredAlert,
  clients, activeId, previews, updateReady, apiError, apiErrorLog,
  scan, focusClient, refreshPreviews, loadGameConfig, refreshPrices,
  toolNavigation, navigate, triggeredAlerts, dismissTriggeredAlert,
  formatItemName, formatGold, devMode,
} from './lib/store';
import { initAnalytics, setOptOut, track } from './lib/analytics';

// ── Tool discovery ────────────────────────────────────────────────────────────
interface ToolMeta {
  name: string;
  desc: string;
  icon: string;
  author?: string;
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
  track('tool_opened', { tool: tool.toolMeta.name });
}

$: if ($toolNavigation && $toolNavigation.id !== _lastNavId) {
  const nav = $toolNavigation;
  _lastNavId = nav.id;
  const target = TOOLS.find(t => t.toolMeta.name === nav.tool);
  if (target) {
    activeTab = 'tools';
    showSettings = false;
    showAlerts = false;
    openTool(target);
  }
}

$: filteredTools = toolSearch.trim() === ''
  ? TOOLS
  : TOOLS.filter(t => {
      const q = toolSearch.toLowerCase();
      return t.toolMeta.name.toLowerCase().includes(q) || t.toolMeta.desc.toLowerCase().includes(q);
    });

const FAV_KEY = 'icc-tool-favourites';
let favouriteNames: Set<string> = new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]'));

function toggleFavourite(name: string) {
  if (favouriteNames.has(name)) favouriteNames.delete(name);
  else favouriteNames.add(name);
  favouriteNames = new Set(favouriteNames);
  localStorage.setItem(FAV_KEY, JSON.stringify([...favouriteNames]));
}

$: filteredFavourites = filteredTools.filter(t => favouriteNames.has(t.toolMeta.name));
$: filteredOfficial   = filteredTools.filter(t => !t.toolMeta.author || t.toolMeta.author === 'Lucid').filter(t => !favouriteNames.has(t.toolMeta.name));
$: filteredCommunity  = filteredTools.filter(t => t.toolMeta.author && t.toolMeta.author !== 'Lucid').filter(t => !favouriteNames.has(t.toolMeta.name));

// ── UI state ──────────────────────────────────────────────────────────────────
type Tab = 'clients' | 'tools';
let activeTab: Tab = 'clients';
let showSettings = false;
let showAlerts = false;
let showApiDetails = false;
let showWipeModal = false;

// ── Feedback ──────────────────────────────────────────────────────────────────
const FEEDBACK_FORM_URL      = 'https://docs.google.com/forms/d/e/1FAIpQLScbSYv3pOHLQ_gVwy2q4xqC4MbiKJZIxNrJ1al7wCsu_6Llcw/formResponse';
const FEEDBACK_ENTRY_TYPE    = 'entry.34567192';
const FEEDBACK_ENTRY_DESC    = 'entry.1538414375';
const FEEDBACK_ENTRY_VERSION = 'entry.387633934';

let showFeedbackModal = false;
let feedbackType: 'Bug Report' | 'Suggestion' = 'Bug Report';
let feedbackText = '';
let feedbackState: 'idle' | 'submitting' | 'done' = 'idle';

function openFeedback(type: 'Bug Report' | 'Suggestion') {
  feedbackType = type;
  feedbackText = '';
  feedbackState = 'idle';
  showFeedbackModal = true;
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  el.style.height = Math.max(140, el.scrollHeight) + 'px';
}

async function submitFeedback() {
  if (!feedbackText.trim()) return;
  feedbackState = 'submitting';
  const body = new URLSearchParams({
    [FEEDBACK_ENTRY_TYPE]: feedbackType,
    [FEEDBACK_ENTRY_DESC]: feedbackText.trim(),
    [FEEDBACK_ENTRY_VERSION]: __APP_VERSION__,
  });
  try {
    await fetch(FEEDBACK_FORM_URL, { method: 'POST', body, mode: 'no-cors' });
  } catch {}
  feedbackState = 'done';
  track('feedback_submitted', { type: feedbackType });
}

const WIPE_CATS = [
  { id: 'settings',  label: 'Settings',        desc: 'Theme, sounds, FPS, always-on-top, zoom, launcher',             keys: ['s-theme','s-aot','s-zoom','s-prev-fps','s-alert-volume','s-alert-sound','s-game-exe','s-launch-count','s-dev-mode','s-api-debug','s-analytics-opt-out'] },
  { id: 'alerts',    label: 'Price Alerts',     desc: 'Alert rules and triggered notification history',                 keys: ['icc-price-alerts','icc-triggered-alerts'] },
  { id: 'tracker',   label: 'Progress Tracker', desc: 'Tracked players and all XP snapshot history',                   keys: ['icc-tracker-players'], prefix: 'icc-tracker-snap-' },
  { id: 'notepad',   label: 'Notepad',          desc: 'All saved notes',                                               keys: ['notepad'] },
  { id: 'toolprefs', label: 'Tool Preferences', desc: 'Favourites, client order, calculator modifiers, recent lookups', keys: ['icc-tool-favourites','icc-client-order','icc-xp-mods','icc-profit-mods','icc-completion-mods','icc-lookup-recent'] },
];
let wipeSelected: Set<string> = new Set(WIPE_CATS.map(c => c.id));

function wipeSelectedData() {
  for (const cat of WIPE_CATS) {
    if (!wipeSelected.has(cat.id)) continue;
    cat.keys.forEach(k => localStorage.removeItem(k));
    if (cat.prefix) {
      Object.keys(localStorage).filter(k => k.startsWith(cat.prefix!)).forEach(k => localStorage.removeItem(k));
    }
  }
  showWipeModal = false;
  location.reload();
}

let _tipText = '';
let _tipX = 0;
let _tipY = 0;
let _tipVisible = false;
function showTip(e: MouseEvent, text: string) { _tipText = text; _tipX = e.clientX; _tipY = e.clientY; _tipVisible = true; }
function moveTip(e: MouseEvent) { _tipX = e.clientX; _tipY = e.clientY; }
function hideTip() { _tipVisible = false; }

function dismissApiError() {
  apiError.set(false);
  apiErrorLog.set([]);
  showApiDetails = false;
}

function getModeLogo(mode: string | null): string {
  const m = mode?.toLowerCase() ?? '';
  if (m === 'ironman' || m === 'ultimateironman') return './logos/Ironman.png';
  if (m === 'groupironmanprestige') return './logos/GroupIronmanPrestige.png';
  if (m === 'groupironman') return './logos/GroupIronman.png';
  return './logos/Default.png';
}

function statusLabel(status: number | null): string {
  if (status === null) return 'Network error';
  const labels: Record<number, string> = {
    200: 'OK', 201: 'Created', 204: 'No content',
    400: 'Bad request', 401: 'Unauthorized', 403: 'Forbidden',
    404: 'Not found', 408: 'Timeout', 429: 'Too many req',
    500: 'Server error', 502: 'Bad gateway', 503: 'Unavailable', 504: 'Gateway timeout',
  };
  return labels[status] ?? `HTTP ${status}`;
}

// ── Alert settings ────────────────────────────────────────────────────────────
let settingAlertVolume = parseInt(localStorage.getItem('s-alert-volume') ?? '50');
let settingAlertSound  = localStorage.getItem('s-alert-sound') ?? 'mixkit-software-interface-start-2574.wav';

const ALERT_SOUNDS: { label: string; value: string }[] = [
  { label: 'None',             value: 'none' },
  { label: 'Access Allowed',   value: 'mixkit-access-allowed-tone-2869.wav' },
  { label: 'Arabian Harp',     value: 'mixkit-arabian-mystery-harp-notification-2489.wav' },
  { label: 'Arcade Magic',     value: 'mixkit-arcade-magic-notification-2342.wav' },
  { label: 'Bubble Pop',       value: 'mixkit-bubble-pop-up-alert-notification-2357.wav' },
  { label: 'Clear Announce',   value: 'mixkit-clear-announce-tones-2861.wav' },
  { label: 'Confirmation',     value: 'mixkit-confirmation-tone-2867.wav' },
  { label: 'Correct Answer',   value: 'mixkit-correct-answer-reward-952.wav' },
  { label: 'Doorbell',         value: 'mixkit-doorbell-tone-2864.wav' },
  { label: 'Dry Pop',          value: 'mixkit-dry-pop-up-notification-alert-2356.wav' },
  { label: 'Guitar Alert',     value: 'mixkit-guitar-notification-alert-2320.wav' },
  { label: 'Interface Hint',   value: 'mixkit-interface-hint-notification-911.wav' },
  { label: 'Interface Select', value: 'mixkit-interface-option-select-2573.wav' },
  { label: 'Magic Marimba',    value: 'mixkit-magic-marimba-2820.wav' },
  { label: 'Magic Ring',       value: 'mixkit-magic-notification-ring-2344.wav' },
  { label: 'Musical Alert',    value: 'mixkit-musical-alert-notification-2309.wav' },
  { label: 'Musical Reveal',   value: 'mixkit-musical-reveal-961.wav' },
  { label: 'Positive',         value: 'mixkit-positive-notification-951.wav' },
  { label: 'Sci-Fi Confirm',   value: 'mixkit-sci-fi-confirmation-914.wav' },
  { label: 'Sci-Fi Reject',    value: 'mixkit-sci-fi-reject-notification-896.wav' },
  { label: 'Interface Back',   value: 'mixkit-software-interface-back-2575.wav' },
  { label: 'Interface Remove', value: 'mixkit-software-interface-remove-2576.wav' },
  { label: 'Interface Start',  value: 'mixkit-software-interface-start-2574.wav' },
  { label: 'Success Tone',     value: 'mixkit-success-software-tone-2865.wav' },
  { label: 'Tile Reveal',      value: 'mixkit-tile-game-reveal-960.wav' },
  { label: 'Uplifting Flute',  value: 'mixkit-uplifting-flute-notification-2317.wav' },
];

$: localStorage.setItem('s-alert-volume', String(settingAlertVolume));
$: localStorage.setItem('s-alert-sound', settingAlertSound);

function previewAlertSound() {
  if (settingAlertSound === 'none') return;
  try {
    const audio = new Audio(`./sounds/${settingAlertSound}`);
    audio.volume = settingAlertVolume / 100;
    audio.play().catch(() => {});
  } catch {}
}

function openAlertItem(alert: TriggeredAlert) {
  showAlerts = false;
  navigate('Market', String(alert.itemId));
}

// ── Game launcher ─────────────────────────────────────────────────────────────
let settingGameExe: string = localStorage.getItem('s-game-exe') ?? '';
let settingLaunchCount: number = parseInt(localStorage.getItem('s-launch-count') ?? '1');
let exeError: string | null = null;

$: localStorage.setItem('s-game-exe', settingGameExe);
$: localStorage.setItem('s-launch-count', String(settingLaunchCount));

async function browseExe() {
  exeError = null;
  const result = await (window as any).electronAPI.browseExe();
  if (result.path) {
    settingGameExe = result.path;
  } else if (result.error) {
    exeError = result.error;
  }
}

let showLaunchSetupModal = false;
let showLaunchConfirmModal = false;

function launchClients() {
  if (!settingGameExe) { showLaunchSetupModal = true; return; }
  showLaunchConfirmModal = true;
}

function confirmLaunch() {
  showLaunchConfirmModal = false;
  (window as any).electronAPI.launchGameClients(settingGameExe, settingLaunchCount);
}

// ── Dev mode ──────────────────────────────────────────────────────────────────
let settingDevMode = localStorage.getItem('s-dev-mode') === 'true';

function toggleDevMode() {
  settingDevMode = !settingDevMode;
  localStorage.setItem('s-dev-mode', String(settingDevMode));
}

$: devMode.set(settingDevMode);

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
const ZOOM_OPTIONS = Array.from({ length: 25 }, (_, i) => Math.round((0.80 + i * 0.05) * 100) / 100);
const _storedZoom = parseFloat(localStorage.getItem('s-zoom') ?? '1');
let settingZoomIdx = (() => { const i = ZOOM_OPTIONS.findIndex(v => Math.abs(v - _storedZoom) < 0.01); return i !== -1 ? i : ZOOM_OPTIONS.indexOf(1); })();
let settingZoom = ZOOM_OPTIONS[settingZoomIdx];
let settingAlwaysOnTop    = localStorage.getItem('s-aot') === 'true';
let settingAnalyticsOptOut = localStorage.getItem('s-analytics-opt-out') === 'true';
const _storedFps = parseFloat(localStorage.getItem('s-prev-fps') ?? '1');
let settingPreviewFpsIdx = (() => { const i = FPS_OPTIONS.indexOf(_storedFps); return i !== -1 ? i : 4; })();
let settingPreviewFps = FPS_OPTIONS[settingPreviewFpsIdx];
let settingTheme       = (localStorage.getItem('s-theme') ?? 'dark') as Theme;
let settingApiDebug    = localStorage.getItem('s-api-debug') === 'true';

applyTheme(settingTheme);

$: {
  settingZoom = ZOOM_OPTIONS[settingZoomIdx];
  localStorage.setItem('s-zoom', String(settingZoom));
}
$: {
  localStorage.setItem('s-aot', String(settingAlwaysOnTop));
  (window as any).electronAPI.setAlwaysOnTop(settingAlwaysOnTop);
}
$: localStorage.setItem('s-api-debug', String(settingApiDebug));
$: localStorage.setItem('s-analytics-opt-out', String(settingAnalyticsOptOut));

function toggleAnalyticsOptOut() {
  const newValue = !settingAnalyticsOptOut;
  settingAnalyticsOptOut = newValue;
  if (newValue) {
    track('analytics_opted_out');
    setOptOut(true);
  } else {
    setOptOut(false);       // re-enable capturing first
    track('analytics_opted_in'); // then fire so PostHog can receive it
  }
}

let _analyticsReady = false;

$: {
  localStorage.setItem('s-theme', settingTheme);
  applyTheme(settingTheme);
}

function _onThemeChange(t: Theme) {
  if (_analyticsReady) track('theme_changed', { theme: t });
}
$: _onThemeChange(settingTheme);

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
function getOnlineStatus(profile: PlayerProfile): { online: boolean } {
  return { online: !!profile.activeServerId };
}

async function focus(client: ClientCard) {
  const newId = $activeId === client.win.id ? null : client.win.id;
  await focusClient(newId);
}

// ── Client ordering ───────────────────────────────────────────────────────────
const _ORDER_KEY = 'icc-client-order';
let clientOrder: string[] = (() => {
  try { return JSON.parse(localStorage.getItem(_ORDER_KEY) ?? '[]'); } catch { return []; }
})();
function saveClientOrder() {
  try { localStorage.setItem(_ORDER_KEY, JSON.stringify(clientOrder)); } catch {}
}
$: orderedClients = (() => {
  const named   = $clients.filter(c => c.playerName);
  const unnamed = $clients.filter(c => !c.playerName);
  const sorted  = [...named].sort((a, b) => {
    const ai = clientOrder.indexOf(a.playerName!);
    const bi = clientOrder.indexOf(b.playerName!);
    if (ai === -1 && bi === -1) return (a.playerName ?? '').localeCompare(b.playerName ?? '');
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return [...sorted, ...unnamed];
})();
$: namedClientCount = orderedClients.filter(c => c.playerName).length;
function moveClient(client: ClientCard, dir: -1 | 1) {
  const named = orderedClients.filter(c => c.playerName);
  const idx   = named.findIndex(c => c.playerName === client.playerName);
  if (idx === -1) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= named.length) return;
  const names = named.map(c => c.playerName!);
  [names[idx], names[newIdx]] = [names[newIdx], names[idx]];
  clientOrder = names;
  saveClientOrder();
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
onMount(async () => {
  (window as any).electronAPI.setZoomFactor(settingZoom);
  initAnalytics(settingAnalyticsOptOut);
  await loadGameConfig();
  await scan();
  track('app_started', {
    version: __APP_VERSION__,
    theme: settingTheme,
  });
  setTimeout(() => {
    track('client_count_detected', {
      client_count: $clients.filter(c => c.playerName).length,
    });
  }, 60_000);
  _analyticsReady = true;
  refreshInterval = setInterval(scan, 10000);
  priceInterval  = setInterval(refreshPrices, 60 * 1000);
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
    <div class="header-btns">
      <button class="header-btn" class:active={showAlerts} on:click={() => { showAlerts = !showAlerts; if (showAlerts) showSettings = false; }} title="Alerts">
        <span class="bell-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {#if $triggeredAlerts.length > 0}
            <span class="alert-dot"></span>
          {/if}
        </span>
      </button>
      <button class="header-btn" class:active={showSettings} on:click={() => { showSettings = !showSettings; if (showSettings) showAlerts = false; }} title="Settings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>
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

  {#if $apiError && settingApiDebug}
    <div class="error-banner">
      <span>API error detected</span>
      <div class="error-banner-btns">
        <button class="dismiss-btn" on:click={() => showApiDetails = !showApiDetails}>
          {showApiDetails ? 'Hide' : 'Details'}
        </button>
        <button class="dismiss-btn" on:click={dismissApiError}>Dismiss</button>
      </div>
    </div>
    {#if showApiDetails}
      <div class="error-details">
        {#if $apiErrorLog.length === 0}
          <div class="error-entry error-empty">No details available</div>
        {:else}
          {#each $apiErrorLog as entry}
            <div class="error-entry">
              <div class="error-meta">
                <span class="error-time">{entry.time.toLocaleTimeString()}</span>
                <span class="error-status" class:error-net={entry.status === null} class:error-ok={entry.note === 'Retry OK'}>
                  {entry.status ?? 'Network'}
                </span>
                <span class="error-label">{statusLabel(entry.status)}</span>
                {#if entry.note}
                  <span class="error-note">{entry.note}</span>
                {/if}
                {#if entry.detail}
                  <span class="error-note">{entry.detail}</span>
                {/if}
              </div>
              <span class="error-url">{entry.url}</span>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}

  {#if !showSettings && !showAlerts}
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
    <div class="settings-content">
      <div class="section-header"><span>Settings</span></div>

      <div class="settings-group">
        <div class="settings-group-label">General</div>
        <div class="settings-row">
          <span class="settings-label tip-label" role="none" on:mouseenter={e => showTip(e, 'Keeps the companion window above all other windows.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Always on top</span>
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
        <div class="settings-row settings-row-col">
          <div class="settings-row-top">
            <span class="settings-label">UI Scale</span>
            <span class="settings-value">{Math.round(settingZoom * 100)}%</span>
          </div>
          <input
            class="settings-slider"
            type="range"
            min="0" max="24" step="1"
            bind:value={settingZoomIdx}
            style="--fill: {(settingZoomIdx / 24) * 100}%"
            on:change={() => (window as any).electronAPI.setZoomFactor(settingZoom)}
          />
        </div>
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

      <div class="settings-group">
        <div class="settings-group-label">Alerts</div>
        <div class="settings-row settings-row-col">
          <div class="settings-row-top">
            <span class="settings-label">Alert volume</span>
            <span class="settings-value">{settingAlertVolume}%</span>
          </div>
          <input
            class="settings-slider"
            type="range"
            min="0" max="100" step="1"
            bind:value={settingAlertVolume}
            style="--fill: {settingAlertVolume}%"
          />
        </div>
        <div class="settings-row">
          <span class="settings-label">Alert sound</span>
          <div class="sound-select-row">
            <select class="settings-select" bind:value={settingAlertSound}>
              {#each ALERT_SOUNDS as snd}
                <option value={snd.value}>{snd.label}</option>
              {/each}
            </select>
            <button class="preview-sound-btn" on:click={previewAlertSound} disabled={settingAlertSound === 'none'} title="Preview sound">▶</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-label">Game Client</div>
        <div class="settings-row">
          <span class="settings-label">Executable</span>
          {#if settingGameExe}
            <div class="exe-selected">
              <span class="exe-path" title={settingGameExe}>{settingGameExe.split(/[\\/]/).pop()}</span>
              <button class="exe-clear-btn" on:click={() => settingGameExe = ''} title="Clear">✕</button>
            </div>
          {:else}
            <button class="feedback-btn" on:click={browseExe}>Browse…</button>
          {/if}
        </div>
        {#if exeError}
          <div class="settings-row exe-error-row">
            <span class="exe-error">{exeError}</span>
          </div>
        {/if}
        <div class="settings-row">
          <span class="settings-label">Launch count</span>
          <div class="count-stepper">
            <button class="stepper-btn" on:click={() => settingLaunchCount = Math.max(1, settingLaunchCount - 1)}>−</button>
            <span class="stepper-val">{settingLaunchCount}</span>
            <button class="stepper-btn" on:click={() => settingLaunchCount = Math.min(8, settingLaunchCount + 1)}>+</button>
          </div>
        </div>
      </div>

      <div class="settings-group">
        <div class="settings-group-label">Support</div>
        <div class="settings-row">
          <span class="settings-label">Report a bug</span>
          <button class="feedback-btn" on:click={() => openFeedback('Bug Report')}>Report</button>
        </div>
        <div class="settings-row">
          <span class="settings-label">Feedback & suggestions</span>
          <button class="feedback-btn" on:click={() => openFeedback('Suggestion')}>Share</button>
        </div>
      </div>

      <div class="settings-group settings-group-danger">
        <div class="settings-group-label">Advanced</div>
        <div class="settings-row">
          <span class="settings-label tip-label" role="none" on:mouseenter={e => showTip(e, 'Disables anonymous usage analytics.\nNo personal data is ever collected.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Opt out of analytics</span>
          <button class="toggle" class:on={settingAnalyticsOptOut} on:click={toggleAnalyticsOptOut} aria-label="Opt out of analytics">
            <span class="toggle-thumb"></span>
          </button>
        </div>
        <div class="settings-row">
          <span class="settings-label tip-label" role="none" on:mouseenter={e => showTip(e, 'Shows a diagnostic panel at the top of every tool with API endpoints, cache sizes, storage keys, and live data. Intended for developers and debugging.')} on:mousemove={moveTip} on:mouseleave={hideTip}>Dev mode</span>
          <button class="toggle" class:on={settingDevMode} on:click={toggleDevMode} aria-label="Toggle dev mode">
            <span class="toggle-thumb"></span>
          </button>
        </div>
        <div class="settings-row">
          <span class="settings-label tip-label" role="none" on:mouseenter={e => showTip(e, 'Shows a banner when API requests fail.\nUseful for diagnosing connection issues.')} on:mousemove={moveTip} on:mouseleave={hideTip}>API debug mode</span>
          <button class="toggle" class:on={settingApiDebug} on:click={() => settingApiDebug = !settingApiDebug} aria-label="Toggle API debug mode">
            <span class="toggle-thumb"></span>
          </button>
        </div>
        <div class="settings-row">
          <span class="settings-label">Wipe app data</span>
          <button class="wipe-btn" on:click={() => { wipeSelected = new Set(WIPE_CATS.map(c => c.id)); showWipeModal = true; }}>Wipe…</button>
        </div>
      </div>
    </div>
    {/if}

    <!-- ── Alerts panel ── -->
    {#if showAlerts}
    <div class="alerts-content">
      <div class="section-header"><span>Alerts</span></div>
      {#if $triggeredAlerts.length === 0}
        <div class="alerts-empty">
          <div class="alerts-empty-icon">🔔</div>
          <p>No notifications</p>
        </div>
      {:else}
        <div class="alerts-list-panel">
          {#each $triggeredAlerts as alert (alert.id)}
            <div class="alert-panel-row">
              <button class="alert-panel-main" on:click={() => openAlertItem(alert)}>
                <img class="alert-panel-icon" src="./itemicons/{alert.itemName}.png" alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
                <div class="alert-panel-info">
                  <span class="alert-panel-name">{formatItemName(alert.itemName)}</span>
                  <span class="alert-panel-cond">{alert.field === 'sell' ? 'Sell' : 'Buy'} {alert.direction === 'below' ? '<' : '>'} {formatGold(alert.threshold)} — now {formatGold(alert.triggeredPrice)}</span>
                </div>
                <span class="alert-panel-tag">Market</span>
              </button>
              <button class="alert-panel-remove" on:click={() => dismissTriggeredAlert(alert.id)}>✕</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    {/if}

    <!-- ── Clients ── -->
    <div class="clients-tab" class:tab-hidden={activeTab !== 'clients' || showSettings || showAlerts}>
      <div class="section-header">
        <span>Accounts</span>
        <div class="header-action-btns">
          <button
            class="scan-btn"
            on:click={launchClients}
            title={settingGameExe ? `Launch ${settingLaunchCount} client${settingLaunchCount !== 1 ? 's' : ''}` : 'Launch game client'}
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
          <button class="scan-btn" on:click={scan} title="Rescan">↺</button>
        </div>
      </div>

      {#if $clients.length === 0}
        <div class="empty">
          <div class="empty-icon">⚔</div>
          <p>No clients found</p>
          {#if settingGameExe}
            <span>Press ▶ to launch a client, or click ↺ to rescan</span>
          {:else}
            <span>Open Idle Clans and click ↺, or set up the launcher in Settings</span>
          {/if}
        </div>
      {:else}
        <div class="cards">
          {#each orderedClients as client, i (client.win.id)}
            <div class="card-outer">
              <button
                class="card"
                class:active={client.win.id === $activeId}
                on:click={() => focus(client)}
              >
                {#if !client.playerName}
                  <div class="card-top">
                    <div class="avatar ghost"><img class="avatar-logo" src="./logos/Default.png" alt="" /></div>
                    <div class="card-info">
                      <span class="card-name muted">Not logged in</span>
                      <span class="card-clan">Idle Clans</span>
                    </div>
                    <div class="status-dot offline"></div>
                  </div>

                {:else if client.loading}
                  <div class="card-top">
                    <div class="avatar ghost"><img class="avatar-logo" src="./logos/Default.png" alt="" /></div>
                    <div class="card-info">
                      <span class="card-name">{client.playerName}</span>
                      <span class="card-clan loading-text">Loading...</span>
                    </div>
                    <div class="status-dot offline"></div>
                  </div>

                {:else if client.error || !client.profile}
                  <div class="card-top">
                    <div class="avatar ghost"><img class="avatar-logo" src="./logos/Default.png" alt="" /></div>
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
                  <div class="card-top">
                    <div class="avatar"><img class="avatar-logo" src={getModeLogo(client.profile.gameMode)} alt="" /></div>
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
              {#if client.playerName}
                <div class="card-arrows">
                  <button class="arrow-btn" aria-label="Move up" on:click={() => moveClient(client, -1)} disabled={i === 0}>
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,7 5,3 8,7"/></svg>
                  </button>
                  <button class="arrow-btn" aria-label="Move down" on:click={() => moveClient(client, 1)} disabled={i >= namedClientCount - 1}>
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,3 5,7 8,3"/></svg>
                  </button>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <!-- ── Tools ── -->
    <div class="tools-tab" class:tab-hidden={activeTab !== 'tools' || showSettings || showAlerts}>
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
          {#if filteredFavourites.length > 0}
            <div class="calc-section-label">Favourites</div>
            {#each filteredFavourites as tool}
              <div class="calc-item-wrap">
                <button class="calc-item" class:calc-item-community={tool.toolMeta.author && tool.toolMeta.author !== 'Lucid'} on:click={() => openTool(tool)}>
                  {#if tool.toolMeta.icon.startsWith('./')}
                    <img class="calc-item-icon-img" src={tool.toolMeta.icon} alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
                  {:else}
                    <span class="calc-item-icon">{tool.toolMeta.icon}</span>
                  {/if}
                  <div class="calc-item-info">
                    <span class="calc-item-name">{tool.toolMeta.name}{#if tool.toolMeta.author && tool.toolMeta.author !== 'Lucid'}<span class="calc-item-author"> by {tool.toolMeta.author}</span>{/if}</span>
                    <span class="calc-item-desc">{tool.toolMeta.desc}</span>
                  </div>
                </button>
                <button class="fav-btn fav-active" on:click={() => toggleFavourite(tool.toolMeta.name)} title="Remove from favourites">★</button>
              </div>
            {/each}
          {/if}

          {#if filteredOfficial.length > 0}
            {#if filteredCommunity.length > 0 || filteredFavourites.length > 0}<div class="calc-section-label">Official</div>{/if}
            {#each filteredOfficial as tool}
              <div class="calc-item-wrap">
                <button class="calc-item" on:click={() => openTool(tool)}>
                  {#if tool.toolMeta.icon.startsWith('./')}
                    <img class="calc-item-icon-img" src={tool.toolMeta.icon} alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
                  {:else}
                    <span class="calc-item-icon">{tool.toolMeta.icon}</span>
                  {/if}
                  <div class="calc-item-info">
                    <span class="calc-item-name">{tool.toolMeta.name}</span>
                    <span class="calc-item-desc">{tool.toolMeta.desc}</span>
                  </div>
                </button>
                <button class="fav-btn" on:click={() => toggleFavourite(tool.toolMeta.name)} title="Add to favourites">★</button>
              </div>
            {/each}
          {/if}

          {#if filteredCommunity.length > 0}
            <div class="calc-section-label">Community</div>
            {#each filteredCommunity as tool}
              <div class="calc-item-wrap">
                <button class="calc-item calc-item-community" on:click={() => openTool(tool)}>
                  {#if tool.toolMeta.icon.startsWith('./')}
                    <img class="calc-item-icon-img" src={tool.toolMeta.icon} alt="" on:error={(e) => { (e.target as HTMLImageElement).src = './image_placeholder.png'; }} />
                  {:else}
                    <span class="calc-item-icon">{tool.toolMeta.icon}</span>
                  {/if}
                  <div class="calc-item-info">
                    <span class="calc-item-name">{tool.toolMeta.name}<span class="calc-item-author"> by {tool.toolMeta.author}</span></span>
                    <span class="calc-item-desc">{tool.toolMeta.desc}</span>
                  </div>
                </button>
                <button class="fav-btn" on:click={() => toggleFavourite(tool.toolMeta.name)} title="Add to favourites">★</button>
              </div>
            {/each}
          {/if}

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

{#if showLaunchSetupModal}
  <div class="modal-overlay" role="presentation" on:click={() => showLaunchSetupModal = false}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <div class="modal-title">Game Client Not Set</div>
      <p class="modal-body">To launch game clients from here, you need to set the path to your game executable in Settings under <strong>Game Client</strong>.</p>
      <div class="modal-actions">
        <button class="modal-cancel" on:click={() => showLaunchSetupModal = false}>Cancel</button>
        <button class="modal-submit" on:click={() => { showLaunchSetupModal = false; showSettings = true; showAlerts = false; }}>Go to Settings</button>
      </div>
    </div>
  </div>
{/if}

{#if showLaunchConfirmModal}
  <div class="modal-overlay" role="presentation" on:click={() => showLaunchConfirmModal = false}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <div class="modal-title">Launch Game Clients</div>
      <p class="modal-body">
        This will open <strong>{settingLaunchCount} instance{settingLaunchCount !== 1 ? 's' : ''}</strong> of:<br/>
        <span class="modal-path">{settingGameExe}</span>
      </p>
      <div class="modal-actions">
        <button class="modal-cancel" on:click={() => showLaunchConfirmModal = false}>Cancel</button>
        <button class="modal-submit" on:click={confirmLaunch}>Launch</button>
      </div>
    </div>
  </div>
{/if}

{#if showWipeModal}
  <div class="modal-overlay" role="presentation" on:click={() => showWipeModal = false}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      <div class="modal-title">Wipe Data</div>
      <div class="wipe-cats">
        {#each WIPE_CATS as cat}
          <label class="wipe-cat-row">
            <input
              type="checkbox"
              class="wipe-checkbox"
              checked={wipeSelected.has(cat.id)}
              on:change={() => {
                if (wipeSelected.has(cat.id)) wipeSelected.delete(cat.id);
                else wipeSelected.add(cat.id);
                wipeSelected = new Set(wipeSelected);
              }}
            />
            <div class="wipe-cat-info">
              <span class="wipe-cat-label">{cat.label}</span>
              <span class="wipe-cat-desc">{cat.desc}</span>
            </div>
          </label>
        {/each}
      </div>
      <div class="modal-actions">
        <button class="modal-cancel" on:click={() => showWipeModal = false}>Cancel</button>
        <button class="modal-wipe" disabled={wipeSelected.size === 0} on:click={wipeSelectedData}>
          Wipe {wipeSelected.size > 0 ? `(${wipeSelected.size})` : ''}
        </button>
      </div>
    </div>
  </div>
{/if}


{#if showFeedbackModal}
  <div class="modal-overlay" role="presentation" on:click={() => { if (feedbackState !== 'submitting') showFeedbackModal = false; }}>
    <div class="modal" role="dialog" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
      {#if feedbackState === 'done'}
        <div class="modal-title">Thanks!</div>
        <p class="modal-body">Your {feedbackType === 'Bug Report' ? 'bug report' : 'feedback'} has been received.</p>
        <div class="modal-actions">
          <button class="modal-cancel" on:click={() => showFeedbackModal = false}>Close</button>
        </div>
      {:else}
        <div class="modal-title">{feedbackType === 'Bug Report' ? 'Report a Bug' : 'Share Feedback'}</div>
        <textarea
          class="feedback-textarea"
          placeholder={feedbackType === 'Bug Report' ? 'Describe the issue…' : 'Share your suggestions or thoughts…'}
          bind:value={feedbackText}
          maxlength={1000}
          disabled={feedbackState === 'submitting'}
          on:input={(e) => autoGrow(e.currentTarget as HTMLTextAreaElement)}
        ></textarea>
        <div class="modal-actions">
          <button class="modal-cancel" on:click={() => showFeedbackModal = false} disabled={feedbackState === 'submitting'}>Cancel</button>
          <button class="modal-submit" on:click={submitFeedback} disabled={!feedbackText.trim() || feedbackState === 'submitting'}>
            {feedbackState === 'submitting' ? 'Sending…' : 'Submit'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if _tipVisible}
  <div class="tooltip" style="left:{Math.min(_tipX + 14, window.innerWidth - 200)}px; top:{_tipY + 18}px;">
    {_tipText}
  </div>
{/if}

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
    --text-dim:   #6a7090;
    --text-faint: #5c6280;
    --accent:     #e8b84b;
    --accent-lo:  rgba(232,184,75,0.17);
    --accent-md:  rgba(232,184,75,0.33);
    --accent-hi:  rgba(232,184,75,0.53);
    --pos:        #4ade80;
    --neg:        #e05555;
    --neutral:    #e8884a;
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
    --text-dim:   #6a72a0;
    --text-faint: #7880a8;
    --accent:     #2d6278;
    --accent-lo:  rgba(45,98,120,0.12);
    --accent-md:  rgba(45,98,120,0.28);
    --accent-hi:  rgba(45,98,120,0.50);
    --pos:        #2a7a50;
    --neg:        #a03830;
    --neutral:    #c06820;
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
    --text-dim:   #686488;
    --text-faint: #5a5678;
    --accent:     #cc78c0;
    --accent-lo:  rgba(204,120,192,0.17);
    --accent-md:  rgba(204,120,192,0.33);
    --accent-hi:  rgba(204,120,192,0.53);
    --pos:        #50c0a8;
    --neg:        #e06080;
    --neutral:    #e8904c;
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
    --text-dim:   #666e80;
    --text-faint: #586270;
    --accent:     #7090aa;
    --accent-lo:  rgba(112,144,170,0.17);
    --accent-md:  rgba(112,144,170,0.33);
    --accent-hi:  rgba(112,144,170,0.53);
    --pos:        #60b890;
    --neg:        #c07070;
    --neutral:    #c89050;
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
    --text-dim:   #687065;
    --text-faint: #5a6258;
    --accent:     #68b86c;
    --accent-lo:  rgba(104,184,108,0.17);
    --accent-md:  rgba(104,184,108,0.33);
    --accent-hi:  rgba(104,184,108,0.53);
    --pos:        #70c880;
    --neg:        #d07050;
    --neutral:    #d09040;
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
    --text-dim:   #627080;
    --text-faint: #556474;
    --accent:     #4ea8c8;
    --accent-lo:  rgba(78,168,200,0.17);
    --accent-md:  rgba(78,168,200,0.33);
    --accent-hi:  rgba(78,168,200,0.53);
    --pos:        #48c890;
    --neg:        #e07060;
    --neutral:    #d09040;
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
    --text-dim:   #646488;
    --text-faint: #585874;
    --accent:     #7878c0;
    --accent-lo:  rgba(120,120,192,0.17);
    --accent-md:  rgba(120,120,192,0.33);
    --accent-hi:  rgba(120,120,192,0.53);
    --pos:        #60b8a0;
    --neg:        #c87878;
    --neutral:    #c89050;
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
    --text-dim:   #6e6268;
    --text-faint: #60545c;
    --accent:     #c84060;
    --accent-lo:  rgba(200,64,96,0.17);
    --accent-md:  rgba(200,64,96,0.33);
    --accent-hi:  rgba(200,64,96,0.53);
    --pos:        #70b880;
    --neg:        #b83858;
    --neutral:    #d08038;
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
    --text-dim:   #6e665e;
    --text-faint: #605850;
    --accent:     #cc4030;
    --accent-lo:  rgba(204,64,48,0.17);
    --accent-md:  rgba(204,64,48,0.33);
    --accent-hi:  rgba(204,64,48,0.53);
    --pos:        #78b858;
    --neg:        #983030;
    --neutral:    #d09040;
  }

  :global(*, *::before, *::after) { box-sizing: border-box; margin: 0; padding: 0; }
  :global(html, body) { height: 100%; width: 100%; margin: 0; padding: 0; overflow: hidden; }
  :global(body) { background: var(--bg-base); color: var(--text); font-family: 'Nunito', sans-serif; }
  :global(#app) { width: 100%; height: 100%; display: flex; justify-content: flex-start; padding: 0; margin: 0; }

  :global(::-webkit-scrollbar) { width: 8px; }
  :global(::-webkit-scrollbar-track) { background: transparent; }
  :global(::-webkit-scrollbar-thumb) { background: var(--border); border-radius: 4px; border-left: 2px solid transparent; border-right: 1px solid transparent; background-clip: padding-box; }
  :global(::-webkit-scrollbar-thumb:hover) { background: var(--bg-raised); background-clip: padding-box; }

  .sidebar {
    width: 100%; height: 100vh;
    display: flex; flex-direction: column;
    background: var(--bg-base); overflow: hidden;
  }

  .header { padding: 16px 8px 12px 14px; border-bottom: 1px solid var(--divider); display: flex; align-items: center; justify-content: space-between; }
  .logo { display: flex; align-items: center; gap: 7px; flex-shrink: 0; }
  .logo-icon { color: var(--accent); flex-shrink: 0; }
  .logo-text { font-family: 'Cinzel', serif; font-size: 14px; font-weight: 600; letter-spacing: 0.4px; color: var(--accent); white-space: nowrap; }

  .header-btns { display: flex; align-items: center; gap: 1px; }

  .header-btn {
    background: none; border: 1px solid transparent; border-radius: 5px;
    color: var(--text-faint); padding: 4px 5px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: color 0.15s, border-color 0.15s, background 0.15s; flex-shrink: 0;
  }
  .header-btn:hover { color: var(--text-sub); border-color: var(--border); background: var(--bg-card); }
  .header-btn.active { color: var(--accent); border-color: var(--accent-md); background: var(--bg-card); }

  .bell-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
  .alert-dot {
    position: absolute; top: -3px; right: -3px;
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); border: 1px solid var(--bg-base);
    box-shadow: 0 0 4px var(--accent-md);
  }

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

  .error-banner {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; background: #2a1a1a; border-bottom: 1px solid #4a2a2a;
    font-size: 12px; color: #e05555; font-weight: 600;
  }
  .error-banner-btns { display: flex; gap: 6px; align-items: center; }
  .dismiss-btn {
    background: #4a2a2a; border: 1px solid #e0555544; color: #e05555;
    padding: 3px 10px; border-radius: 4px; font-size: 11px;
    cursor: pointer; transition: all 0.15s; width: auto;
  }
  .dismiss-btn:hover { background: #5a2a2a; border-color: #e05555; }

  .error-details {
    background: #1a1010; border-bottom: 1px solid #4a2a2a;
    max-height: 100vh; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: #4a2a2a transparent;
  }
  .error-entry {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 5px 14px; border-bottom: 1px solid #261616;
    font-size: 12px; font-family: monospace;
  }
  .error-entry:last-child { border-bottom: none; }
  .error-empty { color: #7a5555; font-style: italic; font-family: 'Nunito', sans-serif; }
  .error-meta { display: flex; flex-direction: column; gap: 3px; flex-shrink: 0; }
  .error-time { color: #7a5555; }
  .error-status {
    background: #3a1515; color: #e05555; border: 1px solid #5a2a2a;
    border-radius: 3px; padding: 0 4px; font-size: 11px; font-weight: bold; flex-shrink: 0;
  }
  .error-net { background: #2a1a2e; border-color: #6a3a7a; color: #c060c0; }
  .error-ok  { background: #1a2e1a; border-color: #3a6a3a; color: #4ade80; }
  .error-url { color: #8a6060; word-break: break-all; }
  .error-label { font-size: 10px; color: #7a5555; font-family: 'Nunito', sans-serif; }
  .error-note  { font-size: 10px; color: #7a5555; font-style: italic; font-family: 'Nunito', sans-serif; }

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
    flex: 1; overflow-y: auto; overflow-x: hidden; padding: 10px 0 10px 10px;
    display: flex; flex-direction: column;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }

  .tools-tab {
    flex: 1; min-height: 0;
    display: flex; flex-direction: column;
    overflow-y: auto; overflow-x: hidden;
    scrollbar-gutter: stable;
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

  .card-outer { position: relative; }

  .card-arrows {
    position: absolute; top: 7px; right: 7px;
    display: flex; flex-direction: column; gap: 2px;
    opacity: 0; transition: opacity 0.15s; z-index: 1;
  }
  .card-outer:hover .card-arrows { opacity: 1; }

  .arrow-btn {
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 3px; color: var(--text-faint);
    font-size: 9px; line-height: 1; padding: 0;
    width: 16px; height: 16px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: color 0.1s, border-color 0.1s;
  }
  .arrow-btn:hover:not(:disabled) { color: var(--accent); border-color: var(--accent-md); }
  .arrow-btn:disabled { opacity: 0.25; cursor: default; }

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
  .avatar-logo { width: 20px; height: 20px; object-fit: contain; }

  .card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .card-name { font-size: 13px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-name.muted { color: var(--text-faint); }
  .card-clan { font-size: 10px; color: var(--text-faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta-right { display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 3px; flex-shrink: 0; }
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
  .calc-item-icon-img { width: 24px; height: 24px; object-fit: contain; flex-shrink: 0; }
  .calc-item-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .calc-item-name { font-size: 12px; font-weight: 700; color: var(--text-hi); }
  .calc-item-desc { font-size: 10px; color: var(--text-faint); }
  .calc-item-wrap { position: relative; }
  .calc-item-wrap .calc-item { padding-right: 30px; }
  .fav-btn {
    position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
    background: none; border: none; cursor: pointer; padding: 4px 3px;
    font-size: 16px; line-height: 1; color: var(--text-faint);
    opacity: 0; transition: opacity 0.15s, color 0.15s; width: auto; z-index: 1;
  }
  .calc-item-wrap:hover .fav-btn { opacity: 1; }
  .fav-btn.fav-active { color: var(--accent); opacity: 1; }

  .calc-section-label {
    font-size: 8px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
    color: var(--text-faint); padding: 6px 4px 2px; display: flex; align-items: center; gap: 6px;
  }
  .calc-section-label::before, .calc-section-label::after {
    content: ''; flex: 1; height: 1px; background: var(--border);
  }
  .calc-item-community { border-style: dashed; }
  .calc-item-author {
    font-size: 9px; font-weight: 400; color: var(--text-faint); margin-left: 4px;
  }

  .header-action-btns { display: flex; align-items: center; gap: 4px; }

  .exe-selected {
    display: flex; align-items: center; gap: 4px;
    max-width: 160px; min-width: 0;
  }
  .exe-path {
    font-size: 10px; color: var(--text-sub); font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    min-width: 0;
  }
  .exe-clear-btn {
    background: none; border: none; color: var(--text-faint); font-size: 10px;
    cursor: pointer; padding: 1px 3px; line-height: 1; flex-shrink: 0;
    transition: color 0.1s;
  }
  .exe-clear-btn:hover { color: var(--neg); }
  .exe-error-row { padding-top: 4px; padding-bottom: 6px; }
  .exe-error { font-size: 10px; color: var(--neg); font-weight: 600; }

  .count-stepper { display: flex; align-items: center; gap: 6px; }
  .stepper-btn {
    background: var(--bg-raised); border: 1px solid var(--border); border-radius: 4px;
    color: var(--text-sub); font-size: 13px; line-height: 1;
    width: 22px; height: 22px; display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: border-color 0.1s, color 0.1s; padding: 0;
  }
  .stepper-btn:hover { border-color: var(--accent-md); color: var(--accent); }
  .stepper-val { font-size: 12px; font-weight: 700; color: var(--text-hi); min-width: 14px; text-align: center; }

  .clients-tab { padding-right: 10px; }
  .settings-content { padding-right: 10px; }

  .tab-hidden { display: none; }

  .footer { padding: 8px 14px; border-top: 1px solid var(--divider); display: flex; align-items: center; justify-content: flex-end; }
  .version { font-size: 10px; color: var(--border); letter-spacing: 0.5px; }

  .settings-group-danger .settings-group-label { color: var(--neg); }
  .wipe-btn {
    background: none; border: 1px solid var(--neg); color: var(--neg);
    font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 4px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .wipe-btn:hover { background: rgba(224, 85, 85, 0.12); }

  .modal-overlay {
    position: fixed; inset: 0; z-index: 9998;
    background: rgba(0, 0, 0, 0.6);
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: var(--bg-card); border: 1px solid var(--border);
    border-radius: 10px; padding: 20px; width: 260px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .modal-title { font-size: 13px; font-weight: 700; color: var(--text-hi); }
  .modal-path {
    display: block; margin-top: 6px;
    font-size: 10px; color: var(--text-dim); font-weight: 600;
    word-break: break-all;
  }
  .modal-body { font-size: 11px; color: var(--text-sub); line-height: 1.6; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .modal-cancel {
    background: var(--bg-raised); border: 1px solid var(--border); color: var(--text-sub);
    font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 5px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .modal-cancel:hover { border-color: var(--accent-md); color: var(--accent); }
  .modal-wipe {
    background: rgba(224, 85, 85, 0.15); border: 1px solid #e05555; color: #e05555;
    font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 5px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .modal-wipe:hover:not(:disabled) { background: rgba(224, 85, 85, 0.28); }
  .modal-wipe:disabled { opacity: 0.35; cursor: default; }

  .wipe-cats { display: flex; flex-direction: column; gap: 2px; }
  .wipe-cat-row {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 7px 10px; border-radius: 6px; cursor: pointer;
    transition: background 0.1s;
  }
  .wipe-cat-row:hover { background: var(--bg-raised); }
  .wipe-checkbox {
    appearance: none; -webkit-appearance: none;
    width: 13px; height: 13px; flex-shrink: 0; margin-top: 2px;
    border: 1px solid var(--border); border-radius: 3px;
    background: var(--bg-raised); cursor: pointer;
    position: relative; transition: all 0.15s;
  }
  .wipe-checkbox:checked { background: #e05555; border-color: #e05555; }
  .wipe-checkbox:checked::after {
    content: ''; position: absolute;
    left: 3px; top: 0px; width: 4px; height: 8px;
    border: 2px solid var(--bg-deep); border-top: none; border-left: none;
    transform: rotate(45deg);
  }
  .wipe-cat-info { display: flex; flex-direction: column; gap: 2px; }
  .wipe-cat-label { font-size: 11px; font-weight: 700; color: var(--text-hi); }
  .wipe-cat-desc { font-size: 10px; color: var(--text-faint); }

  .feedback-btn {
    background: none; border: 1px solid var(--accent-md); color: var(--accent);
    font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 4px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .feedback-btn:hover { background: var(--accent-lo); border-color: var(--accent-hi); }

  .feedback-textarea {
    width: 100%; min-height: 140px; max-height: calc(80vh - 110px); overflow-y: auto; resize: none;
    background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 6px; color: var(--text); font-size: 11px;
    padding: 8px 10px; font-family: 'Nunito', sans-serif;
    outline: none; line-height: 1.5;
  }
  .feedback-textarea:focus { border-color: var(--accent-md); }
  .feedback-textarea::placeholder { color: var(--text-faint); }
  .feedback-textarea:disabled { opacity: 0.6; }

  .modal-submit {
    background: var(--accent-lo); border: 1px solid var(--accent-md); color: var(--accent);
    font-size: 11px; font-weight: 700; padding: 5px 14px; border-radius: 5px;
    cursor: pointer; font-family: 'Nunito', sans-serif; transition: all 0.15s; width: auto;
  }
  .modal-submit:hover:not(:disabled) { background: var(--accent-md); border-color: var(--accent-hi); }
  .modal-submit:disabled { opacity: 0.5; cursor: default; }

  /* ── Alerts panel ── */
  .alerts-content { padding-right: 10px; }

  .alerts-empty {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 32px 12px; text-align: center;
  }
  .alerts-empty-icon { font-size: 26px; opacity: 0.3; }
  .alerts-empty p { font-size: 13px; color: var(--text-muted); font-weight: 600; }


  .alerts-list-panel { display: flex; flex-direction: column; gap: 5px; }

  .alert-panel-row {
    display: flex; align-items: center; gap: 4px;
    background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px;
    overflow: hidden;
  }

  .alert-panel-main {
    flex: 1; display: flex; align-items: center; gap: 10px;
    background: none; border: none; cursor: pointer; padding: 10px 10px 10px 12px;
    text-align: left; min-width: 0;
    transition: background 0.1s;
  }
  .alert-panel-main:hover { background: var(--bg-hover); }
  .alert-panel-main:hover .alert-panel-name { color: var(--accent); }

  .alert-panel-icon { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }

  .alert-panel-info { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .alert-panel-name { font-size: 12px; font-weight: 700; color: var(--text-hi); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color 0.1s; }
  .alert-panel-cond { font-size: 10px; color: var(--text-faint); font-weight: 600; }

  .alert-panel-tag {
    font-size: 8px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    color: var(--text-dim); background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 3px; padding: 2px 5px; flex-shrink: 0;
  }

  .alert-panel-remove {
    background: none; border: none; cursor: pointer; color: var(--text-faint);
    font-size: 11px; padding: 10px 10px; line-height: 1; flex-shrink: 0;
    transition: color 0.15s;
  }
  .alert-panel-remove:hover { color: var(--neg); }

  /* ── Alert settings ── */
  .sound-select-row { display: flex; gap: 4px; align-items: center; }

  .settings-select {
    flex: 1; background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text); font-size: 11px;
    padding: 4px 6px; font-family: 'Nunito', sans-serif; cursor: pointer; outline: none;
    transition: border-color 0.1s;
  }
  .settings-select:focus { border-color: var(--accent-md); }

  .preview-sound-btn {
    background: var(--bg-raised); border: 1px solid var(--border);
    border-radius: 5px; color: var(--text-sub); font-size: 9px;
    padding: 4px 8px; cursor: pointer; flex-shrink: 0;
    transition: border-color 0.1s, color 0.1s;
  }
  .preview-sound-btn:hover:not(:disabled) { border-color: var(--accent-md); color: var(--accent); }
  .preview-sound-btn:disabled { opacity: 0.35; cursor: default; }




  .tip-label { cursor: help; }
  .tooltip {
    position: fixed; z-index: 9999; pointer-events: none;
    background: var(--bg-deep); border: 1px solid var(--border);
    border-radius: 5px; padding: 5px 8px;
    font-size: 10px; color: var(--text-muted); line-height: 1.5;
    white-space: pre-line; max-width: 200px;
  }
</style>
