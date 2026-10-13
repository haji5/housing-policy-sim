import { describe, expect, it } from 'vitest';
import type { PolicyEvent } from '../src/index.ts';
import { last, run, variance } from './helpers.ts';

const ruleAt = (tick: number): PolicyEvent[] => [{ tick, lever: 'strRegime', value: 1 }];

describe('common random numbers', () => {
  it('a policy change at tick T leaves every output before T untouched', () => {
    const base = run(5, 'none');
    const treated = run(5, ruleAt(24));
    const prefix = (xs: readonly number[]) => xs.slice(0, 24);
    for (let z = 0; z < base.series.zones.length; z++) {
      expect(prefix(treated.series.zones[z]!.strListings)).toEqual(
        prefix(base.series.zones[z]!.strListings),
      );
      expect(prefix(treated.series.zones[z]!.marketRent)).toEqual(
        prefix(base.series.zones[z]!.marketRent),
      );
    }
    expect(prefix(treated.series.searching)).toEqual(prefix(base.series.searching));
  });

  it('paired (same-seed) effect estimates are far less noisy than unpaired ones', () => {
    // Measured six months after the rule. Further out, the paired advantage fades: once the rule
    // has removed the investor STR stock in the treated arm, the churn of that stock in the
    // no-policy arm (reviews, sales, purchases; ADR 0007) is no longer shared by the two arms.
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    const covered = (out: ReturnType<typeof run>) => out.series.zones[0]!.strListings[12]!;
    const base = seeds.map((s) => covered(run(s, 'none', 13)));
    const treated = seeds.map((s) => covered(run(s, ruleAt(6), 13)));
    const treatedShifted = seeds.map((s) => covered(run(s + 1000, ruleAt(6), 13)));

    const paired = seeds.map((_, i) => treated[i]! - base[i]!);
    const unpaired = seeds.map((_, i) => treatedShifted[i]! - base[i]!);
    expect(variance(paired)).toBeLessThan(variance(unpaired) / 2);
  });

  it('exempt-zone host draws are unchanged by covered-zone policy when markets are decoupled', async () => {
    // With rents frozen (kappa = 0), no tourist-demand spillover, arrivals independent of vacancy,
    // households locked to their preferred zone and no renter buyers (who are drawn region-wide,
    // ADR 0013), the exempt zone shares nothing with the covered zone except the RNG seed.
    const { DEFAULT_PARAMS } = await import('../src/index.ts');
    const decoupled = structuredClone(DEFAULT_PARAMS);
    decoupled.rental.kappa = 0;
    decoupled.rental.searchOtherZoneProb = 0;
    decoupled.rental.arrivalVacancySemiElasticity = 0;
    decoupled.str.demandSpillover = 0;
    decoupled.host.renterBuyerShare = 0;
    const a = run(8, 'none', 60, decoupled);
    // PR rule only: the Phase 2 registry applies to exempt zones too (ADR 0004), so it is excluded.
    const b = run(8, ruleAt(8), 60, decoupled);
    expect(b.series.zones[1]!.strListings).toEqual(a.series.zones[1]!.strListings);
    expect(b.series.zones[1]!.ltrVacant).toEqual(a.series.zones[1]!.ltrVacant);
    // ...while the covered zone did respond.
    expect(last(b.series.zones[0]!.strListings)).toBeLessThan(last(a.series.zones[0]!.strListings));
  });
});
