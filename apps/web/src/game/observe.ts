import { researcherCpi, researcherPanel } from '@zoned-out/sim';
import type { RunOutput } from '@zoned-out/sim';
import type { Point } from '../ui/LineChart.tsx';
import type { Snapshot, WorldLayout } from './protocol.ts';

/**
 * The player's view of the city ("fog of data", ODD §7.8): quarterly listing snapshots with
 * scrape noise and the analyst's incomplete-snapshot flag, a noisy quarterly CPI rent series,
 * and the asking-rent index only for months covered by a data purchase.
 */
export interface ResearcherView {
  covered: Point[];
  exempt: Point[];
  cpi: Point[];
  asking: Point[];
  /** Snapshots flagged incomplete so far. */
  flagged: number;
}

/** The snapshot series as a RunOutput, for the sim's researcher functions. */
function asRun(s: Snapshot, layout: WorldLayout, seed: number): RunOutput {
  return {
    meta: {
      scenario: '',
      seed,
      ticks: s.series.tick.length,
      scale: layout.scale,
      agents: 0,
      paramsHash: '',
      policy: [],
      firstTick: s.series.tick[0] ?? 0,
    },
    series: s.series,
  };
}

export function researcherView(
  s: Snapshot,
  layout: WorldLayout,
  seed: number,
  dataThroughTick: number,
): ResearcherView {
  const ticks = s.series.tick;
  if (ticks.length === 0) return { covered: [], exempt: [], cpi: [], asking: [], flagged: 0 };
  const run = asRun(s, layout, seed);
  const last = ticks[ticks.length - 1]!;
  const snapTicks: number[] = [];
  for (let t = 0; t <= last; t += 3) snapTicks.push(t);
  const panel = researcherPanel(run, seed, snapTicks);
  const sum = (pred: (covered: boolean) => boolean): Point[] =>
    snapTicks.map((t, k) => ({
      x: t,
      y: panel.observed.reduce((a, z, zi) => (pred(layout.zoneCovered[zi]!) ? a + z[k]! : a), 0),
      hollow: panel.incomplete[k]!,
    }));
  const cpi = researcherCpi(run, seed);
  const asking: Point[] = [];
  ticks.forEach((t, i) => {
    if (t >= 0 && t <= dataThroughTick) asking.push({ x: t, y: s.series.askingRentIndex[i]! });
  });
  return {
    covered: sum((c) => c),
    exempt: sum((c) => !c),
    cpi: cpi.tick.map((t, i) => ({ x: t, y: cpi.value[i]! })),
    asking,
    flagged: panel.incomplete.filter(Boolean).length,
  };
}

/** First and last points that were not flagged incomplete. */
export function firstLastValid(points: readonly Point[]): [Point, Point] | null {
  const ok = points.filter((p) => !p.hollow);
  return ok.length === 0 ? null : [ok[0]!, ok[ok.length - 1]!];
}
