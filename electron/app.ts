import { app, BrowserWindow, ipcMain, screen, Menu, shell, dialog } from "electron";
import { spawn } from "child_process";
import { basename } from "path";
import electronReload from "electron-reload";
import { join } from "path";
import { autoUpdater } from 'electron-updater';

import { windowManager } from 'node-window-manager';
import { Window as ScreenshotWindow } from 'node-screenshots';

let mainWindow: BrowserWindow;
let wikiWindow: BrowserWindow | null = null; // PoC: in-app wiki popup, see open-wiki-popup handler
let wikiLoadingWindow: BrowserWindow | null = null; // PoC: throbber overlay shown while wikiWindow navigates
let zoomFactor = 1;

// Renderer sends its live --bg-base/--accent/--accent-lo (getComputedStyle on the
// themed <body>) so the throbber matches whichever of the 9 themes is active,
// instead of a hardcoded color hand-copied from one theme's CSS.
interface WikiThemeColors { bg: string; accent: string; accentLo: string; border: string; bgRaised: string; }
const DEFAULT_WIKI_COLORS: WikiThemeColors = {
  bg: '#0e0f15', accent: '#8890b0', accentLo: 'rgba(136,144,176,0.3)', border: '#1e2030', bgRaised: '#1a1c2e',
};
let currentWikiColors: WikiThemeColors = DEFAULT_WIKI_COLORS; // read by the dom-ready scrollbar injector below

function wikiLoadingHtml(c: WikiThemeColors) {
  return `<!DOCTYPE html><html><head><style>
  html, body { margin: 0; height: 100%; background: ${c.bg}; display: flex; align-items: center; justify-content: center; }
  .spinner { width: 36px; height: 36px; border: 3px solid ${c.accentLo}; border-top-color: ${c.accent}; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style></head><body><div class="spinner"></div></body></html>`;
}

// Mirrors the app's own global ::-webkit-scrollbar rules (App.svelte) — injected into
// the wiki page itself since it's real external content with its own default scrollbar.
function wikiScrollbarCss(c: WikiThemeColors) {
  return `
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${c.border}; border-radius: 4px; border-left: 2px solid transparent; border-right: 1px solid transparent; background-clip: padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: ${c.bgRaised}; background-clip: padding-box; }
  `;
}

// Resolves only once the overlay has actually painted its first frame — awaited
// before wikiWindow is touched, so on first open there's no race where wikiWindow
// becomes visible (native white frame) before the overlay is there to cover it.
// Colors are only applied when the overlay window is first created — re-opens just
// reposition/show the existing (already-painted) overlay, so a theme change won't
// be reflected until the wiki popup is fully closed and reopened.
function showWikiLoadingOverlay(bounds: { x: number; y: number; width: number; height: number }, colors: WikiThemeColors): Promise<void> {
  if (wikiLoadingWindow && !wikiLoadingWindow.isDestroyed()) {
    wikiLoadingWindow.setBounds(bounds);
    wikiLoadingWindow.show();
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    wikiLoadingWindow = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true, // stays above wikiWindow without manual z-order juggling
      backgroundColor: colors.bg,
      webPreferences: { devTools: false },
    });
    wikiLoadingWindow.once('ready-to-show', () => {
      wikiLoadingWindow?.show();
      resolve();
    });
    wikiLoadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(wikiLoadingHtml(colors))}`);
  });
}

function hideWikiLoadingOverlay() {
  if (wikiLoadingWindow && !wikiLoadingWindow.isDestroyed()) wikiLoadingWindow.hide();
}

function appWidth() { return Math.round(300 * zoomFactor); }

// Manual escape hatch for the handful of multi-monitor setups (mixed DPI scaling
// between monitors is the prime suspect) where the auto-computed docked position
// lands nowhere near the real game window's monitor. User-set via Settings; added
// on top of the normal computed position rather than replacing it, so 0,0 is a
// no-op and matches today's behaviour exactly.
let dockOffsetX = 0;
let dockOffsetY = 0;

// Windows fires 'move' once per pixel of mouse movement during a drag — throttle
// so we're not making a synchronous native setBounds() call on every single tick.
function throttle(fn: () => void, ms: number) {
  let last = 0;
  let timer: NodeJS.Timeout | null = null;
  return () => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      if (timer) { clearTimeout(timer); timer = null; }
      fn();
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn();
      }, remaining);
    }
  };
}
const throttledSnap = throttle(() => { snapActiveWindow(false); snapWikiWindow(false); }, 16);

app.once("ready", main);

async function main() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 850,
    resizable: true,
    show: false,
    title: 'Idle Clans Companion',
    icon: join(__dirname, 'icon.ico'),
    webPreferences: {
      devTools: true || !app.isPackaged,
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
    },

  });
  mainWindow.on('move', throttledSnap);
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    if (w !== appWidth()) mainWindow.setSize(appWidth(), h);
    snapActiveWindow(false);
    snapWikiWindow(false);
  });
  // Tabbing back into the companion app should keep a selected game window docked
  // alongside it — but NOT via snapActiveWindow(true)/bringToTop(): that calls
  // node-window-manager's bringWindowToTop(), which on Windows calls
  // SetForegroundWindow/SetFocus/SetActiveWindow on the *game* window, stealing OS
  // keyboard focus right back from mainWindow the instant it receives it. Since this
  // handler fires on every mainWindow focus (including a plain click into a search
  // bar while the game window happens to be foregrounded), that made text inputs
  // unusable whenever a client was open/selected — every click-to-focus was
  // immediately undone. snapWikiWindow's bringToTop uses Electron's own moveTop(),
  // which reorders z-order without activating, so it's unaffected and safe to keep.
  mainWindow.on('focus', () => { snapActiveWindow(false); snapWikiWindow(true); });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  } else {
    electronReload(join(__dirname), {
      forceHardReset: true,
      hardResetMethod: "quit",
      electron: app.getPath("exe"),
    });
    await mainWindow.loadURL(`http://localhost:5173/`);
  }

  if (!app.isPackaged) {
    console.log('Skipping auto-updater in dev mode.');
  } else {
    initAutoUpdater();
  }

  mainWindow.setMenuBarVisibility(false);

  Menu.setApplicationMenu(null);
}

ipcMain.handle('get-window-previews', async (_event, ids: number[]) => {
  if (ids.length === 0) return {};
  try {
    const idSet = new Set(ids);
    const result: Record<number, string> = {};
    const windows: any[] = ScreenshotWindow.all();
    for (const win of windows) {
      const id: number = win.id();
      if (!idSet.has(id)) continue;
      try {
        const image = await win.captureImage();
        const buf: Buffer = await image.toJpeg(true); // copyOutputData=true required in Electron
        result[id] = `data:image/jpeg;base64,${buf.toString('base64')}`;
      } catch {
        // elevated process or window closed — skip cleanly
      }
    }
    return result;
  } catch (e) {
    console.error(e);
    return {};
  }
});


ipcMain.handle('restart-and-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('set-always-on-top', (_event, value: boolean) => {
  mainWindow.setAlwaysOnTop(value);
});

ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

// PoC (revertable): pops a real browser window docked to the right of mainWindow
// instead of shell.openExternal — used by the Wiki tool so wiki pages open in-app.
ipcMain.handle('open-wiki-popup', async (_event, url: string, colors?: Partial<WikiThemeColors>) => {
  try {
    const c: WikiThemeColors = { ...DEFAULT_WIKI_COLORS, ...colors };
    currentWikiColors = c;
    const bounds = computeDockedBounds();
    await showWikiLoadingOverlay(bounds, c); // wait for the overlay's first paint before touching wikiWindow

    if (wikiWindow && !wikiWindow.isDestroyed()) {
      wikiWindow.setBackgroundColor(c.bg); // cheap — keeps it current even if reused across a theme change
      wikiWindow.setBounds(bounds);
      wikiWindow.loadURL(url);
      wikiWindow.show();
      wikiWindow.focus();
      return;
    }

    wikiWindow = new BrowserWindow({
      ...bounds,
      show: false, // stays hidden until its own first paint — overlay covers the wait either way
      title: 'Idle Clans Wiki',
      icon: join(__dirname, 'icon.ico'),
      backgroundColor: c.bg,
      parent: mainWindow, // owned window — OS closes it automatically when mainWindow closes
      webPreferences: { devTools: !app.isPackaged },
    });
    wikiWindow.once('ready-to-show', () => { wikiWindow?.show(); });
    // dom-ready fires on every navigation (including entry switches on the reused
    // window) — reads currentWikiColors at fire-time so it always reflects the
    // latest theme, not whatever was current when this listener was registered.
    wikiWindow.webContents.on('dom-ready', () => {
      wikiWindow?.webContents.insertCSS(wikiScrollbarCss(currentWikiColors));
    });
    wikiWindow.webContents.on('did-finish-load', hideWikiLoadingOverlay);
    wikiWindow.webContents.on('did-fail-load', () => { wikiWindow?.show(); hideWikiLoadingOverlay(); });
    wikiWindow.on('closed', () => {
      wikiWindow = null;
      if (wikiLoadingWindow && !wikiLoadingWindow.isDestroyed()) wikiLoadingWindow.destroy();
      wikiLoadingWindow = null;
    });
    wikiWindow.loadURL(url);
  } catch (e) {
    console.error(e);
  }
});


function initAutoUpdater() {
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'Lucidkniight',
    repo: 'IdleClansCompanion',
    private: false
  });
  autoUpdater.logger = require('electron-log');
  (autoUpdater.logger as any).transports.file.level = 'info';

  autoUpdater.checkForUpdates();

  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 5 * 60 * 1000);

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-ready');
  });

  // autoUpdater.on('checking-for-update', () => {
  //   console.log('Checking for update...');
  // });

  // autoUpdater.on('update-available', (info) => {
  //   console.log('Update available:', info);
  // });

  // autoUpdater.on('update-not-available', (info) => {
  //   console.log('Update not available:', info);
  // });

  // autoUpdater.on('error', (err) => {
  //   console.error('Auto-updater error:', err);
  // });
}

ipcMain.handle("get-version", (_, key: "electron" | "node") => {
  return String(process.versions[key]);
});

const VALID_TITLE_REGEX = /^Idle Clans(?: \[[^\]]+\])?$/;

function isGameWindow(w: any): boolean {
  if (!VALID_TITLE_REGEX.test(w.getTitle())) return false;
  try {
    const exePath: string = w.path ?? '';
    if (!exePath.toLowerCase().endsWith('idle clans.exe')) return false;
  } catch {}
  return true;
}

ipcMain.handle('get-game-windows', () => {
  try {
    const all = windowManager.getWindows();
    const result = all
      .filter((w: any) => isGameWindow(w))
      .map((w: any) => ({ id: w.id, title: w.getTitle() }));
    (all as any).length = 0;
    return result;
  } catch (e) {
    console.error(e);
    return [];
  }
});

let activeGameId: number | null = null;
let activeGameWin: any = null;

// Shared docking geometry: fills the screen to the right of mainWindow, capped to a
// 16:9 width so it doesn't stretch absurdly wide on ultrawide/large monitors.
function computeDockedBounds() {
  const [x, y] = mainWindow.getPosition();
  const [, h] = mainWindow.getSize();
  const display = screen.getDisplayNearestPoint({ x, y });
  const aw = appWidth();
  const availableWidth = display.workArea.width - aw;
  const heightBasedWidth = Math.round(h * (16 / 9));
  const width = Math.min(availableWidth, heightBasedWidth);
  return { x: x + aw + dockOffsetX, y: y + dockOffsetY, width, height: h };
}

function snapActiveWindow(bringToTop = false) {
  if (activeGameWin === null) return;
  try {
    activeGameWin.setBounds(computeDockedBounds());
    if (bringToTop) activeGameWin.bringToTop();
  } catch (e) {
    // Window likely closed — clear stale reference
    activeGameWin = null;
    activeGameId = null;
    console.error(e);
  }
}

// PoC: same docking behaviour as snapActiveWindow, for the wiki popup window.
function snapWikiWindow(bringToTop = false) {
  if (wikiWindow === null || wikiWindow.isDestroyed()) return;
  try {
    const bounds = computeDockedBounds();
    wikiWindow.setBounds(bounds);
    if (wikiLoadingWindow && !wikiLoadingWindow.isDestroyed() && wikiLoadingWindow.isVisible()) {
      wikiLoadingWindow.setBounds(bounds);
    }
    if (bringToTop) wikiWindow.moveTop();
  } catch (e) {
    wikiWindow = null;
    console.error(e);
  }
}
app.on('before-quit', () => {
  try {
    const all = windowManager.getWindows();
    all.filter((w: any) => isGameWindow(w))
      .forEach((w: any) => {
        w.restore();
        w.setBounds({ x: 100, y: 100, width: 1280, height: 720 });
        w.bringToTop();
      });
  } catch (e) {
    console.error(e);
  }
});
ipcMain.handle('focus-window', (_event: any, id: number | null) => {
  try {
    const all = windowManager.getWindows();

    if (activeGameId !== null) {
      const prev = all.find((w: any) => w.id === activeGameId);
      if (prev) prev.setBounds({ x: -9999, y: 0, width: 1280, height: 720 });
    }

    activeGameId = id;
    activeGameWin = id !== null ? (all.find((w: any) => w.id === id) ?? null) : null;
    (all as any).length = 0;

    if (id !== null) {
      activeGameWin?.restore();
      snapActiveWindow(true);
      setTimeout(() => { if (activeGameId === id) snapActiveWindow(false); }, 150);
    }
  } catch (e) {
    console.error(e);
  }
});

ipcMain.handle('get-window-offset', () => {
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.handle('browse-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Game Executable',
    filters: [{ name: 'Executable', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  const filePath = result.filePaths[0];
  if (!filePath) return { path: null, error: null };

  if (basename(filePath).toLowerCase() !== 'idle clans.exe') {
    return { path: null, error: 'File must be "Idle Clans.exe".' };
  }

  return { path: filePath, error: null };
});

ipcMain.handle('launch-game-clients', (_event, exePath: string, count: number) => {
  const n = Math.max(1, Math.min(8, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
  }
});

ipcMain.handle('get-window-size', () => {
  return mainWindow.getSize();
});

ipcMain.handle('set-zoom-factor', (_event, factor: number) => {
  zoomFactor = Math.max(0.5, Math.min(3, factor));
  mainWindow.webContents.setZoomFactor(zoomFactor);
  const [, h] = mainWindow.getSize();
  mainWindow.setSize(appWidth(), h);
});

ipcMain.handle('set-dock-offset', (_event, x: number, y: number) => {
  dockOffsetX = Number.isFinite(x) ? Math.round(x) : 0;
  dockOffsetY = Number.isFinite(y) ? Math.round(y) : 0;
  // Live-reposition immediately, same as an offset-free drag would.
  snapActiveWindow(false);
  snapWikiWindow(false);
});
