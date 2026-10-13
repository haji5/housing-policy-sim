import { describe, expect, it } from 'vitest';
import {
  checkInvariants,
  createSim,
  DEFAULT_PARAMS,
  HouseholdStatus,
  mergeParams,
  stepSim,
} from '../src/index.ts';
import type { Params, PolicyEvent } from '../src/index.ts';
import { last, mean, run, SCENARIO } from './helpers.ts';

// Renter buyers (ADR 0013): a home sold by an investor to an owner-occupier is bought by a renter
// household already in the region with probability renterBuyerShare, which frees its rental.

const SEEDS = [31, 32, 33, 34, 35, 36];
const withShare = (share: number): Params =>
  mergeParams(DEFAULT_PARAMS, { host: { renterBuyerShare: share } });
const RULE: PolicyEvent[] = [
  { tick: 3, lever: 'strRegime', value: 2 },
  { tick: 3, lever: 'enforcement', value: 4 },
];

function countBought(share: number, seed: number, ticks: number): number {
  const s = createSim({ scenario: SCENARIO, params: withShare(share), seed, policy: RULE });
  for (let t = 0; t < ticks; t++) {
    stepSim(s);
    expect(checkInvariants(s)).toEqual([]);
  }
  let n = 0;
  for (let h = 0; h < s.households.n; h++)
    if (s.households.status[h] === HouseholdStatus.BOUGHT) n++;
  return n;
}

describe('renter buyers (ADR 0013)', () => {
  it('no renter buys a home when the share is zero', () => {
    expect(countBought(0, 31, 24)).toBe(0);
  });

  it('renters buy homes when the share is positive, and every tick stays consistent', () => {
    expect(countBought(0.5, 31, 24)).toBeGreaterThan(0);
  });

  it('the baseline stays balanced: no-policy renter population is the same with or without buyers', () => {
    const housed = (share: number) =>
      mean(SEEDS.map((s) => last(run(s, 'none', 48, withShare(share)).series.housed)));
    const h0 = housed(0);
    expect(Math.abs(housed(0.6) / h0 - 1)).toBeLessThan(0.02);
  });

  it('the no-policy asking rent does not drift because of buyers', () => {
    const ask = (share: number) =>
      mean(SEEDS.map((s) => last(run(s, 'none', 48, withShare(share)).series.askingRentIndex)));
    expect(Math.abs(ask(0.6) / ask(0) - 1)).toBeLessThan(0.01);
  });

  it('with buyers, the STR rule lowers asking rents by more (sold homes free rentals)', () => {
    const effect = (share: number) =>
      mean(
        SEEDS.map((s) => {
          const p = withShare(share);
          const pol = last(run(s, RULE, 48, p).series.askingRentIndex);
          const base = last(run(s, 'none', 48, p).series.askingRentIndex);
          return pol / base - 1;
        }),
      );
    const e0 = effect(0);
    const e1 = effect(0.6);
    expect(e0).toBeLessThan(0);
    expect(e1).toBeLessThan(e0);
  });
});
