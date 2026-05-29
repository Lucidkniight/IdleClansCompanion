import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getGameWindows: () => ipcRenderer.invoke('get-game-windows'),
  focusWindow: (id: number) => ipcRenderer.invoke('focus-window', id),
  getWindowOffset: () => ipcRenderer.invoke('get-window-offset'),
  getWindowSize: () => ipcRenderer.invoke('get-window-size'),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.invoke('set-ignore-mouse', ignore),
  onUpdateReady: (callback: () => void) => ipcRenderer.on('update-ready', callback),
  restartAndUpdate: () => ipcRenderer.invoke('restart-and-update'),
  setAlwaysOnTop: (value: boolean) => ipcRenderer.invoke('set-always-on-top', value),
  getWindowPreviews: (ids: number[]) => ipcRenderer.invoke('get-window-previews', ids),
});

