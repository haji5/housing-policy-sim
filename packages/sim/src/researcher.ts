/**
 * Researcher view ("fog of data", ODD §7.8, ADR 0006): what an analyst with Inside Airbnb-style
 * snapshots and a CPI series would see. Pure post-processing of a run's true series, so it never
 * changes model dynamics. Draws are keyed hashes (seed, zone, tick, purpose): deterministic, and
 * shared by paired runs with the same seed (CRN).
 *
 * Listings: at each snapshot tick, observed_z = true_z × completeness_t × exp(σ_z·ε − σ_z²/2),
 * where completeness_t ~ N(mean, sd) is common to all zones (scrape coverage). With probability
 * truncationProb a snapshot is truncated: each zone keeps only U(keepMin, keepMax) of its
 * listings. A snapshot is flagged incomplete when its total is below flagThreshold × the larger of
 * its neighbouring snapshots' totals (the first project's rule), and analysts drop it.
 *
 * CPI: a quarterly reading of the CPI-style index times exp(cpiNoiseSd/100 · ε) (SD in percent).
 */
import observation from './params/observation.json' with { type: 'json' };
import { normal, Purpose, uniform } from './rng.ts';
import type { RunOutput } from './types.ts';

export interface ObservationParams {
  completenessMean: number;
  completenessSd: number;
  zoneNoiseSd: number;
  truncationProb: number;
  truncationKeepMin: number;
  truncationKeepMax: number;
  flagThreshold: number;
  /** Month-to-month noise of the published CPI rent series, SD in percent. */
  cpiNoiseSd: number;
}

export const DEFAULT_OBSERVATION: Readonly<ObservationParams> = observation as ObservationParams;

export interface ResearcherPanel {
  snapshotTicks: number[];
  /** Observed active listings in real units, [zone][snapshot]. */
  observed: number[][];
  /** True listings in real units, [zone][snapshot]. */
  truth: number[][];
  /** Snapshot was truncated by the scrape (known only to the god view). */
  truncated: boolean[];
  /** Snapshot flagged as incomplete by the analyst's rule (dropped from estimation). */
  incomplete: boolean[];
}

/**
 * The first project's completeness flag: total < threshold × max(previous, next) total. A missing
 * neighbour falls back to the snapshot itself (SQL `COALESCE(lag(n), n)`).
 */
export function flagIncomplete(totals: readonly number[], threshold: number): boolean[] {
  return totals.map((tot, k) => {
    const ref = Math.max(totals[k - 1] ?? tot, totals[k + 1] ?? tot);
    return ref > 0 && tot < threshold * ref;
  });
}

export function researcherPanel(
  out: RunOutput,
  seed: number,
  snapshotTicks: readonly number[],
  obs: ObservationParams = DEFAULT_OBSERVATION,
): ResearcherPanel {
  const f = out.meta.firstTick;
  const scale = out.meta.scale;
  const zones = out.series.zones;
  const truth = zones.map((z) =>
    snapshotTicks.map((t) => {
      const v = z.strListings[t - f];
      if (v === undefined) throw new Error(`Snapshot tick ${t} is outside the run`);
      return v / scale;
    }),
  );
  const observed = zones.map(() => snapshotTicks.map(() => 0));
  const truncated = snapshotTicks.map(
    (t) => uniform(seed, 0, t, Purpose.OBS_TRUNCATED) < obs.truncationProb,
  );
  snapshotTicks.forEach((t, k) => {
    const completeness = Math.min(
      1,
      Math.max(
        0.5,
        obs.completenessMean + obs.completenessSd * normal(seed, 0, t, Purpose.OBS_COMPLETE),
      ),
    );
    const s = obs.zoneNoiseSd;
    zones.forEach((_, zi) => {
      let v =
        truth[zi]![k]! *
        completeness *
        Math.exp(s * normal(seed, zi + 1, t, Purpose.OBS_ZONE) - (s * s) / 2);
      if (truncated[k]) {
        const u = uniform(seed, zi + 1, t, Purpose.OBS_TRUNCATED);
        v *= obs.truncationKeepMin + (obs.truncationKeepMax - obs.truncationKeepMin) * u;
      }
      observed[zi]![k] = Math.round(v);
    });
  });
  const totals = snapshotTicks.map((_, k) => observed.reduce((a, z) => a + z[k]!, 0));
  const incomplete = flagIncomplete(totals, obs.flagThreshold);
  return { snapshotTicks: [...snapshotTicks], observed, truth, truncated, incomplete };
}

/** Quarterly noisy CPI-style readings (every 3rd tick from tick 0), as published series would be. */
export function researcherCpi(
  out: RunOutput,
  seed: number,
  obs: ObservationParams = DEFAULT_OBSERVATION,
): { tick: number[]; value: number[] } {
  const tick: number[] = [];
  const value: number[] = [];
  out.series.tick.forEach((t, i) => {
    if (t < 0 || t % 3 !== 0) return;
    tick.push(t);
    value.push(
      out.series.cpiRentIndex[i]! *
        Math.exp((obs.cpiNoiseSd / 100) * normal(seed, 0, t, Purpose.OBS_CPI)),
    );
  });
  return { tick, value };
}
