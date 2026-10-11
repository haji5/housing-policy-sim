import { defineConfig } from 'vitest/config';

// The performance budget runs alone and without coverage instrumentation: timing it inside the
// instrumented, parallel suite measured the machine's load, not the code (1.0 s on a CI runner).
export default defineConfig({
  test: {
    include: ['test/perf.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
