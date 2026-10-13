import { defineConfig, devices } from '@playwright/test';

// Smoke test of the deployed site (the deployed URL must work from a clean browser).
// Not part of `pnpm e2e`: it needs the network and checks what GitHub Pages serves, not the
// local build. Run with `pnpm e2e:live`; LIVE_URL overrides the address (must end in "/").
export default defineConfig({
  testDir: 'e2e-live',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.LIVE_URL ?? 'https://haji5.github.io/housing-policy-sim/',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
  ],
});
