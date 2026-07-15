<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import App from './App.svelte';
  import { scan, DEMO_ACCOUNTS } from './lib/store';
  import { demoActiveClientId } from './lib/demoPlatform';

  // null until the user clicks an account — matches the real app, where nothing is
  // focused (and no game window controlled) until you explicitly pick a client.
  $: activeName = $demoActiveClientId ? DEMO_ACCOUNTS[$demoActiveClientId - 1] : null;
  $: shotSrc = activeName ? `./try-mock/${activeName.toLowerCase()}.jpg` : './try-mock/wallpaper.jpg';
  $: badgeText = activeName ? 'Demo — static preview, click an account to switch' : 'Select an account to preview';

  // Falls back to the releases page (no `download` attribute) until the API call
  // resolves — same pattern as docs/index.html's download buttons.
  let downloadUrl = 'https://github.com/Lucidkniight/IdleClansCompanion/releases/latest';
  let downloadAssetName = '';
  let downloadLabel = '↓ Download the real app';

  onMount(async () => {
    await scan();
    try {
      const r = await fetch('https://api.github.com/repos/Lucidkniight/IdleClansCompanion/releases/latest');
      const data = await r.json();
      const asset = data.assets?.find((a: any) => a.name.endsWith('.exe'));
      if (asset) {
        downloadUrl = asset.browser_download_url;
        downloadAssetName = asset.name;
        downloadLabel = `↓ Download for Windows (${data.tag_name})`;
      }
    } catch {}
  });
</script>

<div class="try-page">
  <nav class="site-nav">
    <a class="nav-logo" href="https://idleclanscompanion.com/">
      <img src="./logo.png" alt="" />
      Idle Clans <span>Companion</span>
    </a>
    <div class="nav-links">
      <a href="https://idleclanscompanion.com/#features">Features</a>
      <a href="https://github.com/Lucidkniight/IdleClansCompanion/releases">Releases</a>
      <a href="https://github.com/Lucidkniight/IdleClansCompanion" class="nav-gh">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
        </svg>
        GitHub
      </a>
      <a class="nav-download" href={downloadUrl} download={downloadAssetName || undefined}>{downloadLabel}</a>
    </div>
  </nav>

  <div class="try-body">
    <div class="frame-wrap">
      <div class="monitor-frame">
        <div class="frame-inner">
          <div class="app-embed">
            <App />
          </div>
          <div class="game-pane">
            {#key activeName ?? 'wallpaper'}
              <img src={shotSrc} alt={activeName ? `Idle Clans — ${activeName}` : 'Desktop'} in:fade={{ duration: 180 }} />
            {/key}
            <div class="game-pane-badge">{badgeText}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    background: #0e0e16;
  }

  /* App.svelte's .sidebar is height:100vh (correct for a real Electron window,
     which IS the viewport) — here it's nested inside a sized frame, so it
     needs to fill that frame's height instead of the whole browser viewport. */
  :global(.app-embed .sidebar) {
    height: 100% !important;
  }

  /* App.svelte also globally styles #app as display:flex; justify-content:flex-start
     (correct for the real app, where #app directly holds the narrow sidebar).
     TryPage's own root mounts into that same #app id, so without this override it
     inherits flex-row shrink-to-fit sizing instead of filling the viewport width. */
  :global(#app) {
    display: block !important;
    height: auto !important;
  }

  .try-page {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #0e0e16;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
  }

  .site-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 2rem;
    border-bottom: 1px solid #2a2a3a;
    position: sticky;
    top: 0;
    background: rgba(14, 14, 22, 0.92);
    backdrop-filter: blur(8px);
    z-index: 100;
  }

  .nav-logo {
    font-weight: 700;
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #e2e2ee;
    text-decoration: none;
  }
  .nav-logo img { width: 22px; height: 22px; }
  .nav-logo span { color: #e8b84b; }

  .nav-links { display: flex; gap: 1.25rem; align-items: center; }

  .nav-links a {
    color: #7878a0;
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.15s;
  }
  .nav-links a:hover { color: #e2e2ee; }

  .nav-gh {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: #1d1d28;
    border: 1px solid #2a2a3a;
    border-radius: 6px;
    padding: 0.35rem 0.75rem;
    font-size: 0.8rem;
    color: #e2e2ee !important;
    transition: border-color 0.15s;
  }
  .nav-gh:hover { border-color: #e8b84b; }

  .nav-download {
    background: #e8b84b;
    color: #0e0e16 !important;
    font-weight: 700;
    padding: 0.45rem 0.9rem;
    border-radius: 6px;
    font-size: 0.8rem;
    transition: opacity 0.15s;
  }
  .nav-download:hover { opacity: 0.88; }

  .try-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .frame-wrap {
    height: 100%;
    max-width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* The real app docks its sidebar at a fixed width and gives the game window
     the *remaining* space at a true 16:9 (electron/app.ts's snapActiveWindow:
     game width = height * 16/9, positioned after the app's own width) — so the
     combined frame is wider than 16:9, not 16:9 itself. .game-pane below carries
     the aspect-ratio directly so it always shows the full mock image undistorted,
     and .monitor-frame just shrink-wraps around app-embed + game-pane's widths. */
  .monitor-frame {
    height: 100%;
    max-width: 100%;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid #2a2a3a;
    box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
  }

  .frame-inner {
    height: 100%;
    width: fit-content;
    display: flex;
  }

  .app-embed {
    width: 320px;
    flex-shrink: 0;
    height: 100%;
    overflow: hidden;
  }

  .game-pane {
    height: 100%;
    /* Matches the actual 1023x638 mock screenshots (accounts + wallpaper) exactly,
       so no letterboxing is needed. */
    aspect-ratio: 1023 / 638;
    flex-shrink: 0;
    position: relative;
    overflow: hidden;
    background: #16161f;
  }

  .game-pane img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .game-pane-badge {
    position: absolute;
    bottom: 12px;
    right: 12px;
    background: rgba(14, 14, 22, 0.75);
    color: #e2e2ee;
    font-size: 0.72rem;
    padding: 0.35rem 0.7rem;
    border-radius: 100px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(4px);
  }

  @media (max-width: 760px) {
    /* The desktop layout locks to 100vh with no scroll to maximize frame height,
       but the stacked mobile layout below is often taller than the viewport —
       let the page scroll instead of clipping content. */
    .try-page {
      height: auto;
      min-height: 100vh;
      overflow: visible;
    }
    .frame-wrap {
      height: auto;
    }
    .monitor-frame {
      height: auto;
      width: 100%;
    }
    .frame-inner {
      width: 100%;
      flex-direction: column;
    }
    .app-embed {
      width: 100%;
      height: 500px;
    }
    .game-pane {
      width: 100%;
      height: 220px;
      aspect-ratio: auto;
      flex-shrink: 1;
    }
  }

  @media (max-width: 640px) {
    .site-nav { padding: 0.75rem 1rem; }
    .nav-links a:not(.nav-gh):not(.nav-download) { display: none; }
  }
</style>
