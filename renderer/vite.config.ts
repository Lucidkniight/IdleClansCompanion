import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import path from "path";
import { createRequire } from 'module';

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
    outDir: "../dist/renderer/",
  },
});