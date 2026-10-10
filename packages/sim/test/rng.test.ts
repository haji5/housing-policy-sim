import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gumbel, hash32, normal, poisson, uniform } from '../src/rng.ts';

const u32 = fc.integer({ min: 0, max: 0xffffffff });
const id = fc.integer({ min: 0, max: 2_000_000 });
const tick = fc.integer({ min: -120, max: 600 });
const purpose = fc.integer({ min: 0, max: 255 });

describe('counter-based RNG', () => {
  it('is a pure function of its keys', () => {
    fc.assert(
      fc.property(u32, id, tick, purpose, (s, a, t, p) => {
        expect(hash32(s, a, t, p)).toBe(hash32(s, a, t, p));
        expect(uniform(s, a, t, p)).toBe(uniform(s, a, t, p));
      }),
    );
  });

  it('returns uniforms strictly inside (0, 1)', () => {
    fc.assert(
      fc.property(u32, id, tick, purpose, fc.integer({ min: 0, max: 64 }), (s, a, t, p, k) => {
        const u = uniform(s, a, t, p, k);
        expect(u).toBeGreaterThan(0);
        expect(u).toBeLessThan(1);
      }),
    );
  });

  it('changes when any single key changes', () => {
    // Collisions are possible in principle for a 32-bit hash; with these sizes they are ~1e-9.
    fc.assert(
      fc.property(u32, id, tick, purpose, (s, a, t, p) => {
        const base = hash32(s, a, t, p);
        expect(hash32((s + 1) >>> 0, a, t, p)).not.toBe(base);
        expect(hash32(s, a + 1, t, p)).not.toBe(base);
        expect(hash32(s, a, t + 1, p)).not.toBe(base);
        expect(hash32(s, a, t, p + 1)).not.toBe(base);
        expect(hash32(s, a, t, p, 1)).not.toBe(base);
      }),
    );
  });

  it('is approximately uniform (chi-square, 20 bins, 100k draws)', () => {
    const bins = new Array<number>(20).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const b = Math.floor(uniform(7, i, 3, 1) * 20);
      bins[b] = (bins[b] ?? 0) + 1;
    }
    const expected = n / 20;
    const chi2 = bins.reduce((acc, o) => acc + (o - expected) ** 2 / expected, 0);
    // 19 dof: the 99.9th percentile is 43.8.
    expect(chi2).toBeLessThan(43.8);
  });

  it('streams for neighbouring agents are uncorrelated', () => {
    const n = 50_000;
    let sxy = 0;
    for (let i = 0; i < n; i++)
      sxy += (uniform(1, i, 0, 1) - 0.5) * (uniform(1, i + 1, 0, 1) - 0.5);
    const corr = sxy / n / (1 / 12);
    expect(Math.abs(corr)).toBeLessThan(0.02);
  });

  it('normal draws have mean 0 and sd 1', () => {
    const n = 50_000;
    let s = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const z = normal(3, i, 0, 9);
      s += z;
      s2 += z * z;
    }
    expect(Math.abs(s / n)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(s2 / n) - 1)).toBeLessThan(0.02);
  });

  it('gumbel draws have the Euler-Mascheroni mean', () => {
    const n = 50_000;
    let s = 0;
    for (let i = 0; i < n; i++) s += gumbel(5, i, 2, 4);
    expect(Math.abs(s / n - 0.5772)).toBeLessThan(0.03);
  });

  it('poisson draws have mean and variance lambda', () => {
    for (const lambda of [0.5, 4, 25, 180]) {
      const n = 20_000;
      let s = 0;
      let s2 = 0;
      for (let i = 0; i < n; i++) {
        const k = poisson(lambda, 11, i, 0, 2);
        expect(Number.isInteger(k) && k >= 0).toBe(true);
        s += k;
        s2 += k * k;
      }
      const mean = s / n;
      const variance = s2 / n - mean * mean;
      expect(Math.abs(mean - lambda) / lambda).toBeLessThan(0.05);
      expect(Math.abs(variance - lambda) / lambda).toBeLessThan(0.1);
    }
  });
});
