import { writable } from 'svelte/store';
import { DEMO_ACCOUNTS } from './store';

// ── "Try it out" web demo shim ──────────────────────────────────────────────
// Stands in for window.electronAPI when the renderer is mounted in a browser
// tab instead of the real Electron app (see try-main.ts). Only ever installed
// from the demo entry point — the packaged Electron app always has the real
// preload.ts bridge and never touches this file.

const DEMO_WINDOWS = DEMO_ACCOUNTS.map((name, i) => ({
  id: i + 1,
  title: `Idle Clans [${name}]`,
}));

export const demoActiveClientId = writable<number | null>(null);

function demoPreviewUrl(id: number): string {
  const name = DEMO_ACCOUNTS[id - 1]?.toLowerCase();
  return `./try-mock/${name}.jpg`;
}

export function installDemoElectronAPI(): void {
  (window as any).__ICC_DEMO__ = true;
  (window as any).electronAPI = {
    getGameWindows: async () => DEMO_WINDOWS,
    focusWindow: async (id: number | null) => { demoActiveClientId.set(id); },
    getWindowOffset: async () => ({ x: 0, y: 0 }),
    getWindowSize: async () => ({ width: 320, height: 850 }),
    setIgnoreMouse: async () => {},
    onUpdateReady: () => {}, // never fires — no update banner in the demo
    restartAndUpdate: async () => {},
    setAlwaysOnTop: async () => {},
    getWindowPreviews: async (ids: number[]) =>
      Object.fromEntries(ids.map(id => [id, demoPreviewUrl(id)])),
    openExternal: async (url: string) => { window.open(url, '_blank', 'noopener'); },
    openWikiPopup: async (url: string) => { window.open(url, '_blank', 'noopener'); },
    browseExe: async () => ({ path: null, error: null }),
    launchGameClients: async () => {},
    setZoomFactor: async () => {},
  };
}
