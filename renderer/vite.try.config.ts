import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { createRequire } from 'module';

// Separate build target for the browser-hosted "Try it out" demo page.
// Kept isolated from vite.config.ts so it can never affect the Electron
// packaging build (`npm run build:renderer` / `npm run package`).
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export default defineConfig({
  plugins: [svelte()],
  base: "./",
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version)
  },
  resolve: {
    alias: {
      $lib: path.resolve(path.dirname(new URL(import.meta.url).pathname), "src/lib"),
    },
  },
  json: {
    namedExports: true
  },
  build: {
    outDir: "../docs/try/",
    emptyOutDir: true,
    rollupOptions: {
      input: "try.html",
    },
  },
});
