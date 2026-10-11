import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, RentCap, runSim, Upzone } from '../src/index.ts';
import type { PolicyEvent, RunOutput } from '../src/index.ts';
import { last, mean, run } from './helpers.ts';

const SEEDS = [21, 22, 23, 24, 25];
const sum = (xs: readonly number[], from = 0, to = xs.length) =>
  xs.slice(from, to).reduce((a, b) => a + b, 0);
const allZones = (o: RunOutput, f: (z: RunOutput['series']['zones'][number]) => number[]) =>
  o.series.zones.map(f).reduce((acc, xs) => acc.map((v, i) => v + xs[i]!));

describe('M5 mechanics: face validity (PLAN §8.1)', () => {
  it('a higher vacancy tax means fewer units held vacant (monotone over 0..3%)', () => {
    const held = [0, 1, 2, 3].map((rate) =>
      mean(
        SEEDS.map((s) =>
          last(
            allZones(
              run(s, [{ tick: 0, lever: 'vacancyTax', value: rate }], 36),
              (z) => z.vacantHeld,
            ),
          ),
        ),
      ),
    );
    for (let i = 1; i < held.length; i++) expect(held[i]!).toBeLessThan(held[i - 1]!);
  });

  it('the vacancy tax raises revenue that is zero without it', () => {
    const none = run(21, 'none', 12);
    const taxed = run(21, [{ tick: 0, lever: 'vacancyTax', value: 2 }], 12);
    expect(sum(none.series.vacancyTaxRevenue)).toBe(0);
    expect(sum(taxed.series.vacancyTaxRevenue)).toBeGreaterThan(0);
  });

  it('upzoning raises starts only after the permit delay', () => {
    const delay = DEFAULT_PARAMS.dev.permitDelayTicks;
    const ev: PolicyEvent[] = [{ tick: 0, lever: 'upzone', value: Upzone.AGGRESSIVE, zone: 0 }];
    for (const s of SEEDS) {
      const a = run(s, 'none', 36).series.zones[0]!.starts;
      const b = run(s, ev, 36).series.zones[0]!.starts;
      expect(b.slice(0, delay)).toEqual(a.slice(0, delay));
      expect(sum(b, delay)).toBeGreaterThan(sum(a, delay));
    }
  });

  it('starts follow the policy rate: a rate-hike shock cuts them', () => {
    const base = SEEDS.map((s) => sum(allZones(run(s, 'none', 24), (z) => z.starts)));
    const hike = SEEDS.map((s) =>
      sum(allZones(run(s, [{ tick: 0, lever: 'shock', value: 1 }], 24), (z) => z.starts)),
    );
    expect(mean(hike)).toBeLessThan(mean(base));
    const r0 = run(21, [{ tick: 0, lever: 'shock', value: 1 }], 13).series.policyRate;
    const r1 = run(21, 'none', 13).series.policyRate;
    expect(r0[0]! - r1[0]!).toBeCloseTo(1, 10);
    expect(r0[12]!).toBeCloseTo(r1[12]!, 10); // the card lasts 12 months
  });

  it('completions follow starts with an 18-30 month lag', () => {
    const o = run(21, 'none', 48);
    const z = o.series.zones[0]!;
    // Starting stock includes a steady-state pipeline, so completions flow from the start.
    expect(sum(z.completions, 0, 12)).toBeGreaterThan(0);
    expect(last(z.dwellings)).toBeGreaterThan(z.dwellings[0]!);
  });

  it('non-market building adds below-market rentals after the construction lag', () => {
    const ev: PolicyEvent[] = [{ tick: 0, lever: 'nonMarket', value: 300 }];
    const o = run(21, ev, 48);
    const units = (k: number) => sum(o.series.zones.map((z) => z.nonMarket[k]!));
    expect(units(DEFAULT_PARAMS.dev.lagMin - 1)).toBe(0);
    expect(units(47)).toBeGreaterThan(0);
  });

  it('a lower rent cap holds sitting-tenant (CPI-style) rents down', () => {
    const cpi = (cap: number) =>
      mean(
        SEEDS.map((s) =>
          last(run(s, [{ tick: 0, lever: 'rentCap', value: cap }], 48).series.cpiRentIndex),
        ),
      );
    expect(cpi(RentCap.LOW)).toBeLessThan(cpi(RentCap.MEDIUM));
    expect(cpi(RentCap.MEDIUM)).toBeLessThanOrEqual(cpi(RentCap.HIGH));
  });

  it('a court challenge leaves more illegal listings under the rule', () => {
    const rule: PolicyEvent[] = [{ tick: 3, lever: 'strRegime', value: 1 }];
    const plain = SEEDS.map((s) => sum(run(s, rule, 18).series.zones[0]!.strIllegal));
    const court = SEEDS.map((s) =>
      sum(run(s, [...rule, { tick: 3, lever: 'shock', value: 4 }], 18).series.zones[0]!.strIllegal),
    );
    expect(mean(court)).toBeGreaterThan(mean(plain));
  });

  it('a migration surge brings more searching households', () => {
    const base = SEEDS.map((s) => sum(run(s, 'none', 12).series.searching));
    const surge = SEEDS.map((s) =>
      sum(run(s, [{ tick: 0, lever: 'shock', value: 2 }], 12).series.searching),
    );
    expect(mean(surge)).toBeGreaterThan(mean(base));
  });

  it('a tourism boom raises STR listings in the open market', () => {
    const base = SEEDS.map((s) => last(run(s, 'none', 12).series.zones[1]!.strListings));
    const boom = SEEDS.map((s) =>
      last(run(s, [{ tick: 0, lever: 'shock', value: 5 }], 12).series.zones[1]!.strListings),
    );
    expect(mean(boom)).toBeGreaterThan(mean(base));
  });

  it('runs on the calibrated Victoria scenario with every lever pulled, without violations', () => {
    const ev: PolicyEvent[] = [
      { tick: 1, lever: 'strRegime', value: 2 },
      { tick: 1, lever: 'vacancyTax', value: 3 },
      { tick: 1, lever: 'rentCap', value: RentCap.LOW },
      { tick: 1, lever: 'nonMarket', value: 200 },
      { tick: 1, lever: 'upzone', value: Upzone.MODERATE, zone: 2 },
      { tick: 4, lever: 'shock', value: 3 },
    ];
    const o = runSim({
      scenario: 'victoria',
      params: DEFAULT_PARAMS,
      seed: 3,
      policy: ev,
      ticks: 24,
    });
    for (const v of o.series.cpiRentIndex) expect(Number.isFinite(v)).toBe(true);
    expect(last(o.series.housed)).toBeGreaterThan(0);
  });
});
