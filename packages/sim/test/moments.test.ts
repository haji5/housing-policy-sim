import { describe, expect, it } from 'vitest';
import { computeMoments, DEFAULT_PARAMS, runSim, twoWayFE } from '../src/index.ts';

describe('two-way fixed-effects OLS', () => {
  it('recovers treatment effects exactly on a noiseless panel', () => {
    const rows = [];
    for (let u = 0; u < 6; u++) {
      for (let t = 0; t < 10; t++) {
        const treated = u < 3;
        const d1 = treated && t >= 4 ? 1 : 0;
        const d2 = treated && t >= 7 ? 1 : 0;
        rows.push({
          unit: u,
          time: t,
          y: 0.3 * u - 0.05 * t * t - 0.4 * d1 - 0.1 * d2,
          x: [d1, d2],
        });
      }
    }
    const b = twoWayFE(rows, 2);
    expect(b[0]).toBeCloseTo(-0.4, 10);
    expect(b[1]).toBeCloseTo(-0.1, 10);
  });

  it('handles an unbalanced panel (units dropped after some time)', () => {
    const rows = [];
    for (let u = 0; u < 5; u++) {
      for (let t = 0; t < 8; t++) {
        if (u === 4 && t >= 5) continue;
        const d = u < 2 && t >= 3 ? 1 : 0;
        rows.push({ unit: u, time: t, y: u + Math.sin(t) + 0.25 * d, x: [d] });
      }
    }
    expect(twoWayFE(rows, 1)[0]).toBeCloseTo(0.25, 10);
  });
});

describe('calibration moments on the Victoria scenario', () => {
  const run = (policy: string) =>
    runSim({
      scenario: 'victoria',
      params: DEFAULT_PARAMS,
      seed: 3,
      policy,
      ticks: 49,
      preTicks: 15,
    });

  it('are finite and have the expected shapes', () => {
    const m = computeMoments(run('historical'));
    for (const v of [m.didAntic, m.didP1, m.didP2, m.multiShareEnd, m.registeredShareEnd]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(m.leads).toHaveLength(4);
    expect(m.pathTicks).toEqual([3, 6, 9, 12, 15, 18, 21, 24, 27, 33]);
    expect(m.coveredPath).toHaveLength(10);
    expect(m.registeredShareEnd).toBeGreaterThan(0);
    expect(m.registeredShareEnd + m.exemptClaimShareEnd).toBeLessThanOrEqual(1);
  });

  it('no-policy runs show no listing effect and no pre-trends (mean over seeds, T7)', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const ms = seeds.map((seed) =>
      computeMoments(
        runSim({
          scenario: 'victoria',
          params: DEFAULT_PARAMS,
          seed,
          policy: 'none',
          ticks: 49,
          preTicks: 15,
        }),
      ),
    );
    const avg = (f: (m: (typeof ms)[number]) => number) =>
      ms.reduce((a, m) => a + f(m), 0) / ms.length;
    // Single-seed sampling SD is ~0.04-0.07 at scale 0.2; the mean of 8 seeds has SE ~0.02.
    expect(Math.abs(avg((m) => m.didP1))).toBeLessThan(0.05);
    expect(Math.abs(avg((m) => m.didP2))).toBeLessThan(0.05);
    for (let j = 0; j < 4; j++) expect(Math.abs(avg((m) => m.leads[j]!))).toBeLessThan(0.05);
    for (const m of ms) expect(m.registeredShareEnd).toBe(0);
  }, 120_000); // 8 full Victoria runs: a few seconds plain, 30+ s under coverage on a busy machine

  it('the historical policy cuts covered listings relative to exempt ones', () => {
    const m = computeMoments(run('historical'));
    expect(m.didP1).toBeLessThan(-0.1);
    expect(m.coveredPath[m.coveredPath.length - 1]!).toBeLessThan(-0.1);
  });
});
