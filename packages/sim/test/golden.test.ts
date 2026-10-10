import { describe, expect, it } from 'vitest';
import { run } from './helpers.ts';

// Golden test: a small fixed run is snapshot-tested. If a deliberate model change alters it,
// update with `pnpm --filter @zoned-out/sim test -u` and explain why in the commit message.
describe('golden output', () => {
  it('two-zone, seed 2024, historical, 24 ticks', () => {
    const out = run(2024, 'historical', 24);
    const round = (xs: number[]) => xs.map((x) => Math.round(x * 1e6) / 1e6);
    expect({
      covered: out.series.zones[0]!.strListings,
      exempt: out.series.zones[1]!.strListings,
      coveredRent: round(out.series.zones[0]!.marketRent),
      cpi: round(out.series.cpiRentIndex),
      searching: out.series.searching,
    }).toMatchSnapshot();
  });
});
