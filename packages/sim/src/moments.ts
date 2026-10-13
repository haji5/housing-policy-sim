/**
 * Calibration moments (docs/CALIBRATION.md): the researcher-style statistics of a run, computed the way
 * the first project computed them on real data, but on the sim's zone x snapshot-month panel and
 * without observation noise.
 *
 *  - S2a DiD: log(1 + listings) ~ antic + phase1 + phase2 | zone FE + month FE, covered zones vs
 *    exempt zones; an opted-in zone leaves the control group from its opt-in tick.
 *  - Event study: covered x snapshot dummies (reference = last pre-announcement snapshot); the
 *    pre-announcement coefficients are the pre-trend leads (target T7).
 *  - Level paths of covered and never-covered listings relative to the reference snapshot.
 *  - Multi-listing-host share and registry shares of all listings at the last snapshot.
 *
 * Listing counts are rescaled to real units (n / scale) before taking logs.
 */
import { HISTORICAL_TICKS } from './policy.ts';
import type { RunOutput } from './types.ts';

export interface PanelRow {
  unit: number;
  time: number;
  y: number;
  x: number[];
}

/**
 * OLS of y on k regressors with unit and time fixed effects (dummy-variable form, normal
 * equations, Gaussian elimination with partial pivoting). Returns the k slope coefficients.
 * Intended for small panels (tens of units and periods).
 */
export function twoWayFE(rows: readonly PanelRow[], k: number): number[] {
  const units = [...new Set(rows.map((r) => r.unit))].sort((a, b) => a - b);
  const times = [...new Set(rows.map((r) => r.time))].sort((a, b) => a - b);
  const uIdx = new Map(units.map((u, i) => [u, i]));
  const tIdx = new Map(times.slice(1).map((t, i) => [t, units.length + i]));
  const p = units.length + times.length - 1 + k;
  const xtx = Array.from({ length: p }, () => new Float64Array(p));
  const xty = new Float64Array(p);
  const cols: number[] = [];
  const vals: number[] = [];
  for (const r of rows) {
    cols.length = 0;
    vals.length = 0;
    cols.push(uIdx.get(r.unit)!);
    vals.push(1);
    const ti = tIdx.get(r.time);
    if (ti !== undefined) {
      cols.push(ti);
      vals.push(1);
    }
    for (let j = 0; j < k; j++) {
      cols.push(p - k + j);
      vals.push(r.x[j]!);
    }
    for (let a = 0; a < cols.length; a++) {
      xty[cols[a]!]! += vals[a]! * r.y;
      for (let b = 0; b < cols.length; b++) xtx[cols[a]!]![cols[b]!]! += vals[a]! * vals[b]!;
    }
  }
  const beta = solve(xtx, xty);
  return Array.from(beta.slice(p - k));
}

function solve(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  const M = A.map((row, i) => {
    const r = new Float64Array(n + 1);
    r.set(row);
    r[n] = b[i]!;
    return r;
  });
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12)
      throw new Error('twoWayFE: singular design (collinear regressors)');
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / M[c]![c]!;
      if (f === 0) continue;
      for (let j = c; j <= n; j++) M[r]![j]! -= f * M[c]![j]!;
    }
  }
  return Float64Array.from(M.map((row, i) => row[n]! / row[i]!));
}

export interface Moments {
  didAntic: number;
  didP1: number;
  didP2: number;
  /** Event-study coefficients at pre-announcement snapshots (ascending tick). */
  leads: number[];
  leadTicks: number[];
  /** Snapshot ticks after the reference used for the level paths. */
  pathTicks: number[];
  /** log(listings / listings at reference) for covered zones. */
  coveredPath: number[];
  /** Same for never-covered zones (no opt-in). */
  exemptPath: number[];
  /** Same for zones that opt in later (Salt Spring); held out of calibration. */
  optInPath: number[];
  multiShareRef: number;
  multiShareEnd: number;
  registeredShareEnd: number;
  exemptClaimShareEnd: number;
  /** Asking and CPI-style rent index change from tick 0 to the last snapshot (log points). */
  askingChangeEnd: number;
  cpiChangeEnd: number;
}

export function computeMoments(out: RunOutput): Moments {
  const obs = out.meta.observation;
  if (!obs) throw new Error('computeMoments: scenario has no observation calendar');
  const { snapshotTicks, refTick } = obs;
  const f = out.meta.firstTick;
  const scale = out.meta.scale;
  const zones = out.series.zones;
  const idx = (t: number) => {
    const i = t - f;
    if (i < 0 || i >= out.series.tick.length) throw new Error(`snapshot tick ${t} not simulated`);
    return i;
  };
  const inControl = (zi: number, t: number) => {
    const z = zones[zi]!;
    return !z.covered && (z.optInTick === undefined || t < z.optInTick);
  };
  const { announced, phase1, phase2 } = HISTORICAL_TICKS;
  const y = (zi: number, t: number) => Math.log(1 + zones[zi]!.strListings[idx(t)]! / scale);

  // ---- static DiD (S2a)
  const rows: PanelRow[] = [];
  for (const t of snapshotTicks) {
    zones.forEach((z, zi) => {
      if (!z.covered && !inControl(zi, t)) return;
      const tr = z.covered ? 1 : 0;
      rows.push({
        unit: zi,
        time: t,
        y: y(zi, t),
        x: [
          tr * (t >= announced && t < phase1 ? 1 : 0),
          tr * (t >= phase1 ? 1 : 0),
          tr * (t >= phase2 ? 1 : 0),
        ],
      });
    });
  }
  const [didAntic, didP1, didP2] = twoWayFE(rows, 3) as [number, number, number];

  // ---- event study (pre-trend leads)
  const eventTicks = snapshotTicks.filter((t) => t !== refTick);
  const esRows: PanelRow[] = rows.map((r) => ({
    ...r,
    x: eventTicks.map((t) => (zones[r.unit]!.covered && r.time === t ? 1 : 0)),
  }));
  const es = twoWayFE(esRows, eventTicks.length);
  const leadTicks = eventTicks.filter((t) => t < announced);
  const leads = leadTicks.map((t) => es[eventTicks.indexOf(t)]!);

  // ---- level paths
  const sumAt = (
    pred: (zi: number) => boolean,
    t: number,
    key: 'strListings' | 'strMulti' | 'strRegistered' | 'strExemptClaim' = 'strListings',
  ) => zones.reduce((a, z, zi) => a + (pred(zi) ? z[key][idx(t)]! : 0), 0);
  const isCovered = (zi: number) => zones[zi]!.covered;
  const isNever = (zi: number) => !zones[zi]!.covered && zones[zi]!.optInTick === undefined;
  const isOptIn = (zi: number) => !zones[zi]!.covered && zones[zi]!.optInTick !== undefined;
  const all = () => true;
  const pathTicks = snapshotTicks.filter((t) => t > refTick);
  const path = (pred: (zi: number) => boolean) => {
    const base = Math.max(1, sumAt(pred, refTick));
    return pathTicks.map((t) => Math.log(Math.max(1, sumAt(pred, t)) / base));
  };
  const end = snapshotTicks[snapshotTicks.length - 1]!;
  const totalEnd = Math.max(1, sumAt(all, end));
  const s = out.series;

  return {
    didAntic,
    didP1,
    didP2,
    leads,
    leadTicks,
    pathTicks,
    coveredPath: path(isCovered),
    exemptPath: path(isNever),
    optInPath: zones.some((_, zi) => isOptIn(zi)) ? path(isOptIn) : [],
    multiShareRef: sumAt(all, refTick, 'strMulti') / Math.max(1, sumAt(all, refTick)),
    multiShareEnd: sumAt(all, end, 'strMulti') / totalEnd,
    registeredShareEnd: sumAt(all, end, 'strRegistered') / totalEnd,
    exemptClaimShareEnd: sumAt(all, end, 'strExemptClaim') / totalEnd,
    askingChangeEnd: Math.log(s.askingRentIndex[idx(end)]! / s.askingRentIndex[idx(0)]!),
    cpiChangeEnd: Math.log(s.cpiRentIndex[idx(end)]! / s.cpiRentIndex[idx(0)]!),
  };
}
