import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OBSERVATION,
  flagIncomplete,
  researcherCpi,
  researcherPanel,
} from '../src/index.ts';
import type { ObservationParams } from '../src/index.ts';
import { mean, run } from './helpers.ts';

const TICKS = [0, 3, 6, 9, 12, 15, 18, 21];

describe('researcher view (observation layer)', () => {
  it('is deterministic and does not change the model output', () => {
    const out = run(5, 'historical', 24);
    const before = JSON.stringify(out);
    const a = researcherPanel(out, 5, TICKS);
    const b = researcherPanel(out, 5, TICKS);
    expect(a).toEqual(b);
    expect(JSON.stringify(out)).toBe(before);
    expect(researcherCpi(out, 5)).toEqual(researcherCpi(out, 5));
    // A rerun of the model with the same seed is unaffected by having observed it.
    expect(JSON.stringify(run(5, 'historical', 24))).toBe(before);
  });

  it('truth is the true listings in real units', () => {
    const out = run(2, 'historical', 24);
    const p = researcherPanel(out, 2, TICKS);
    out.series.zones.forEach((z, zi) =>
      TICKS.forEach((t, k) =>
        expect(p.truth[zi]![k]).toBeCloseTo(z.strListings[t]! / out.meta.scale),
      ),
    );
    for (const row of p.observed)
      for (const v of row) expect(Number.isInteger(v) && v >= 0).toBe(true);
  });

  it('uses the same observation draws for paired runs (CRN)', () => {
    const exact: ObservationParams = { ...DEFAULT_OBSERVATION, truncationProb: 0 };
    const h = researcherPanel(run(3, 'historical', 24), 3, TICKS, exact);
    const n = researcherPanel(run(3, 'none', 24), 3, TICKS, exact);
    // Before the policy starts the true series agree, so the observed ones must too.
    expect(h.observed.map((r) => r[0])).toEqual(n.observed.map((r) => r[0]));
  });

  it('flags a snapshot below 75% of the larger neighbour (the first project rule)', () => {
    expect(flagIncomplete([100, 100, 60, 100], 0.75)).toEqual([false, false, true, false]);
    // Compared with the larger neighbour, not the mean: 89 < 0.75 * 120, but 89 > 0.75 * 110.
    expect(flagIncomplete([120, 89, 100], 0.75)).toEqual([false, true, false]);
    expect(flagIncomplete([50, 100], 0.75)).toEqual([true, false]);
    expect(flagIncomplete([100], 0.75)).toEqual([false]);
  });

  it('has unbiased zone noise and the configured truncation rate', () => {
    const out = run(1, 'none', 24);
    const noTrunc: ObservationParams = {
      ...DEFAULT_OBSERVATION,
      truncationProb: 0,
      completenessMean: 1,
      completenessSd: 0,
      zoneNoiseSd: 0.1,
    };
    const ratios: number[] = [];
    let truncated = 0;
    let snaps = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const p = researcherPanel(out, seed, TICKS, noTrunc);
      p.observed.forEach((row, zi) =>
        row.forEach((v, k) => ratios.push(v / Math.max(1, p.truth[zi]![k]!))),
      );
      const q = researcherPanel(out, seed, TICKS);
      truncated += q.truncated.filter(Boolean).length;
      snaps += TICKS.length;
    }
    expect(Math.abs(mean(ratios) - 1)).toBeLessThan(0.01);
    expect(Math.abs(truncated / snaps - DEFAULT_OBSERVATION.truncationProb)).toBeLessThan(0.015);
  });

  it('flags most truncated snapshots and few complete ones', () => {
    const out = run(1, 'none', 24);
    let hit = 0;
    let trunc = 0;
    let falseFlag = 0;
    let complete = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const p = researcherPanel(out, seed, TICKS);
      p.truncated.forEach((t, k) => {
        if (t) {
          trunc++;
          if (p.incomplete[k]) hit++;
        } else {
          complete++;
          if (p.incomplete[k]) falseFlag++;
        }
      });
    }
    expect(hit / trunc).toBeGreaterThan(0.8);
    expect(falseFlag / complete).toBeLessThan(0.02);
  });

  it('adds CPI noise with the configured SD in percent', () => {
    const out = run(1, 'none', 24);
    const errs: number[] = [];
    for (let seed = 1; seed <= 200; seed++) {
      const c = researcherCpi(out, seed);
      c.tick.forEach((t, i) => {
        const truth = out.series.cpiRentIndex[out.series.tick.indexOf(t)]!;
        errs.push(100 * Math.log(c.value[i]! / truth));
      });
    }
    const m = mean(errs);
    const sd = Math.sqrt(mean(errs.map((e) => (e - m) ** 2)));
    expect(Math.abs(m)).toBeLessThan(0.3);
    expect(Math.abs(sd - DEFAULT_OBSERVATION.cpiNoiseSd)).toBeLessThan(0.2);
  });
});
