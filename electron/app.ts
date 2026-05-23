import { app, BrowserWindow, ipcMain, screen, desktopCapturer, Menu } from "electron";
import electronReload from "electron-reload";
import { join } from "path";
import { autoUpdater } from 'electron-updater';

const { windowManager } = require('node-window-manager');

let mainWindow: BrowserWindow;

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
    if (w !== 300) mainWindow.setSize(300, h);
    snapActiveWindow(false);
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

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
  // mainWindow.webContents.openDevTools();
}

ipcMain.handle('get-window-previews', async (_event, ids: number[]) => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 280, height: 158 }, // 16:9
    });

    const result: Record<number, string> = {};
    for (const source of sources) {
      const hwnd = parseInt(source.id.split(':')[1], 10);
      if (ids.includes(hwnd)) {
        result[hwnd] = source.thumbnail.toDataURL();
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

ipcMain.handle('get-game-windows', () => {
  try {
    const all = windowManager.getWindows();

    const validTitleRegex = /^Idle Clans(?: \[[^\]]+\])?$/;

    return all
      .filter((w: any) => validTitleRegex.test(w.getTitle()))
      .map((w: any) => ({
        id: w.id,
        title: w.getTitle()
      }));

  } catch (e) {
    console.error(e);
    return [];
  }
});

let activeGameId: number | null = null;

function snapActiveWindow(bringToTop = false) {
  if (activeGameId === null) return;
  try {
    const all = windowManager.getWindows();
    const win = all.find((w: any) => w.id === activeGameId);
    if (!win) return;
    const [x, y] = mainWindow.getPosition();
    const [, h] = mainWindow.getSize();
    const display = screen.getDisplayNearestPoint({ x, y });
    const availableWidth = display.workArea.width - 300;
    const heightBasedWidth = Math.round(h * (16 / 9));
    const gameWidth = Math.min(availableWidth, heightBasedWidth);
    win.restore();
    win.setBounds({ x: x + 300, y, width: gameWidth, height: h });
    if (bringToTop) win.bringToTop();
  } catch (e) {
    console.error(e);
  }
}
app.on('before-quit', () => {
  try {
    const all = windowManager.getWindows();
    all.filter((w: any) => w.getTitle().includes('Idle Clans'))
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

    // Move previous active window offscreen
    if (activeGameId !== null) {
      const prev = all.find((w: any) => w.id === activeGameId);
      if (prev) prev.setBounds({ x: -9999, y: 0, width: 1280, height: 720 });
    }

    activeGameId = id;

    if (id !== null) {
      snapActiveWindow(true);
    }
  } catch (e) {
    console.error(e);
  }
});

ipcMain.handle('get-window-offset', () => {
  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

ipcMain.handle('get-window-size', () => {
  return mainWindow.getSize();
});