import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { checkInvariants, stepSim, Tenure } from '../src/index.ts';
import type { PolicyEvent } from '../src/index.ts';
import { sim, stepN } from './helpers.ts';

const policyEvent: fc.Arbitrary<PolicyEvent> = fc.oneof(
  fc.record({
    tick: fc.integer({ min: 0, max: 30 }),
    lever: fc.constantFrom('vacancyTax' as const, 'rentCap' as const, 'nonMarket' as const),
    value: fc.integer({ min: 0, max: 3 }).map((v) => v * 50),
  }),
  fc.record({
    tick: fc.integer({ min: 0, max: 30 }),
    lever: fc.constant('upzone' as const),
    value: fc.integer({ min: 0, max: 2 }),
    zone: fc.integer({ min: 0, max: 1 }),
  }),
  fc.record({
    tick: fc.integer({ min: 0, max: 30 }),
    lever: fc.constant('shock' as const),
    value: fc.integer({ min: 1, max: 6 }),
  }),
  fc.record({
    tick: fc.integer({ min: 0, max: 30 }),
    lever: fc.constant('strRegime' as const),
    value: fc.integer({ min: 0, max: 2 }),
  }),
  fc.record({
    tick: fc.integer({ min: 0, max: 30 }),
    lever: fc.constant('enforcement' as const),
    value: fc.integer({ min: 0, max: 5 }),
  }),
);

describe('conservation and consistency', () => {
  it('holds at every tick for random seeds and random policy schedules', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.array(policyEvent, { maxLength: 6 }),
        (seed, events) => {
          const s = sim(seed, events);
          expect(checkInvariants(s)).toEqual([]);
          for (let t = 0; t < 30; t++) {
            const before = s.dwellings.n;
            const rec = stepSim(s);
            expect(checkInvariants(s)).toEqual([]);
            // The dwelling stock changes only through construction starts.
            const starts = rec.zones.reduce((a, z) => a + z.starts, 0);
            expect(s.dwellings.n - before).toBe(starts);
          }
        },
      ),
      { numRuns: 12 },
    );
  });

  it('every dwelling is in exactly one tenure and every household in one status', () => {
    const s = stepN(sim(42, 'historical'), 40);
    const tenureCounts = new Map<number, number>();
    for (let d = 0; d < s.dwellings.n; d++) {
      const t = s.dwellings.tenure[d] as number;
      tenureCounts.set(t, (tenureCounts.get(t) ?? 0) + 1);
    }
    const total = [...tenureCounts.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(s.dwellings.n);
    for (const t of tenureCounts.keys()) expect(Object.values(Tenure)).toContain(t);
  });
});
