import { app, BrowserWindow, ipcMain, screen, Menu, shell, dialog } from "electron";
import { spawn } from "child_process";
import { basename } from "path";
import electronReload from "electron-reload";
import { join } from "path";
import { autoUpdater } from 'electron-updater';

import { windowManager } from 'node-window-manager';
import { Window as ScreenshotWindow } from 'node-screenshots';

let mainWindow: BrowserWindow;
let zoomFactor = 1;

function appWidth() { return Math.round(300 * zoomFactor); }

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
  mainWindow.on('move', () => snapActiveWindow(false));
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize();
    if (w !== appWidth()) mainWindow.setSize(appWidth(), h);
    snapActiveWindow(false);
  });

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

function snapActiveWindow(bringToTop = false) {
  if (activeGameWin === null) return;
  try {
    const [x, y] = mainWindow.getPosition();
    const [, h] = mainWindow.getSize();
    const display = screen.getDisplayNearestPoint({ x, y });
    const aw = appWidth();
    const availableWidth = display.workArea.width - aw;
    const heightBasedWidth = Math.round(h * (16 / 9));
    const gameWidth = Math.min(availableWidth, heightBasedWidth);
    activeGameWin.restore();
    activeGameWin.setBounds({ x: x + aw, y, width: gameWidth, height: h });
    if (bringToTop) activeGameWin.bringToTop();
  } catch (e) {
    // Window likely closed — clear stale reference
    activeGameWin = null;
    activeGameId = null;
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
