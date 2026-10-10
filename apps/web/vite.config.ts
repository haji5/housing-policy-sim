import { defineConfig } from 'vite';

// BASE_PATH is set by the Pages workflow (e.g. /housing-policy-sim/); '/' locally.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  oxc: {
    jsx: { runtime: 'automatic', importSource: 'preact' },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
