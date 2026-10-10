import { describe, expect, it } from 'vitest';
import type { PolicyEvent } from '../src/index.ts';
import { last, mean, run } from './helpers.ts';

const SEEDS = [11, 12, 13, 14, 15];

function coveredListingsAtEnd(policy: PolicyEvent[]): number[] {
  return SEEDS.map((s) => last(run(s, policy, 48).series.zones[0]!.strListings));
}

function illegalAtEnd(policy: PolicyEvent[]): number[] {
  return SEEDS.map((s) => last(run(s, policy, 48).series.zones[0]!.strIllegal));
}

describe('face validity / monotonicity', () => {
  it('stricter STR regime => fewer covered-zone listings (per seed, with CRN)', () => {
    const open = coveredListingsAtEnd([]);
    const pr = coveredListingsAtEnd([{ tick: 6, lever: 'strRegime', value: 1 }]);
    const reg = coveredListingsAtEnd([{ tick: 6, lever: 'strRegime', value: 2 }]);
    SEEDS.forEach((_, i) => {
      expect(pr[i]!).toBeLessThan(open[i]!);
      expect(reg[i]!).toBeLessThanOrEqual(pr[i]!);
    });
  });

  it('more enforcement => fewer illegal listings (monotone in mean over levels 0..5)', () => {
    const means = [0, 1, 2, 3, 4, 5].map((level) =>
      mean(
        illegalAtEnd([
          { tick: 0, lever: 'enforcement', value: level },
          { tick: 6, lever: 'strRegime', value: 1 },
        ]),
      ),
    );
    for (let i = 1; i < means.length; i++) expect(means[i]!).toBeLessThan(means[i - 1]!);
  });

  it('the exempt zone does not lose listings when the rule applies to the covered zone', () => {
    const open = SEEDS.map((s) => last(run(s, [], 48).series.zones[1]!.strListings));
    const pr = SEEDS.map((s) =>
      last(run(s, [{ tick: 6, lever: 'strRegime', value: 1 }], 48).series.zones[1]!.strListings),
    );
    expect(mean(pr)).toBeGreaterThanOrEqual(mean(open));
  });
});
