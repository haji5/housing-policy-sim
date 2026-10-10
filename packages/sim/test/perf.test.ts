import { describe, expect, it } from 'vitest';
import { run } from './helpers.ts';

describe('performance budget', () => {
  it('~10k agents x 60 ticks runs well inside budget', () => {
    run(1, 'historical'); // warm up the JIT
    const t0 = performance.now();
    const out = run(2, 'historical');
    const ms = performance.now() - t0;
    expect(out.meta.agents).toBeGreaterThan(8_000);
    // PLAN §10 M1 target is 150 ms; CI gets a generous 4x margin for slow shared runners.
    expect(ms).toBeLessThan(600);
  });
});
