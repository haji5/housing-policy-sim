import { describe, expect, it } from 'vitest';
import { run } from './helpers.ts';

describe('performance budget', () => {
  it('~10k agents x 60 ticks runs well inside budget', () => {
    run(1, 'historical'); // warm up the JIT
    // Best of three: the minimum measures the code, not other load on the machine. Runs alone
    // and uninstrumented (vitest.perf.config.ts), after the coverage suite.
    let ms = Infinity;
    let agents = 0;
    for (const seed of [2, 3, 4]) {
      const t0 = performance.now();
      agents = run(seed, 'historical').meta.agents;
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(agents).toBeGreaterThan(8_000);
    // PLAN §10 M1 target is 150 ms; CI gets a generous 4x margin for slow shared runners.
    expect(ms).toBeLessThan(600);
  });
});
