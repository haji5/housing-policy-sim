import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Timed separately, alone and uninstrumented (vitest.perf.config.ts).
    exclude: [...configDefaults.exclude, 'test/perf.test.ts'],
    environment: 'node',
    // Multi-run property tests are slow under coverage instrumentation.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts'],
      thresholds: { lines: 85 },
    },
  },
});
