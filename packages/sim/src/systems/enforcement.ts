import { leversAt } from '../policy.ts';
import { Purpose, uniform } from '../rng.ts';
import type { Params, SimState } from '../types.ts';
import { StrRegime, Tenure } from '../types.ts';
import { ltrNetRevenue, strNetRevenue } from '../world.ts';

/** Monthly detection probability of an illegal STR at enforcement level 0..5 (diminishing returns). */
export function detectProb(params: Params, level: number): number {
  return params.enforcement.detectMax * (1 - Math.exp(-params.enforcement.detectK * (level + 1)));
}

/** Is zone `zi` under the principal-residence rule at `tick` given the lever state? */
export function zoneCovered(state: SimState, zi: number, tick: number): boolean {
  if (state.levers.strRegime === StrRegime.OPEN) return false;
  const spec = state.zones[zi]!.spec;
  return spec.covered || (spec.optInTick !== undefined && tick >= spec.optInTick);
}

/** Would the zone be covered once the announced rule takes effect? (for anticipation) */
function zoneStatutorilyCovered(state: SimState, zi: number, tick: number): boolean {
  const spec = state.zones[zi]!.spec;
  return spec.covered || (spec.optInTick !== undefined && tick >= spec.optInTick);
}

/**
 * Expected monthly cost of running an illegal STR (non-compliant host): expected fine plus the
 * revenue lost if detected or de-listed this month.
 */
export function illegalPenalty(state: SimState, zi: number): number {
  const dp = state.derived.detectProb;
  const delist =
    state.levers.strRegime >= StrRegime.PR_REGISTRY ? state.params.enforcement.delistProb : 0;
  const pRemoved = 1 - (1 - dp) * (1 - delist);
  return dp * state.params.enforcement.fine + pRemoved * Math.max(0, state.derived.strNet[zi]!);
}

/**
 * Anticipation: between announcement and the rule taking effect, hosts in zones that will be
 * covered weigh a share of the penalty they will face.
 */
export function anticipatedPenalty(state: SimState, zi: number): number {
  const a = state.params.host.anticipation;
  if (a <= 0 || !state.levers.announced || state.levers.strRegime !== StrRegime.OPEN) return 0;
  if (!zoneStatutorilyCovered(state, zi, state.tick)) return 0;
  const dp = state.derived.detectProb;
  return a * (dp * state.params.enforcement.fine + dp * Math.max(0, state.derived.strNet[zi]!));
}

/** Recompute lever state, coverage, occupancy and revenue expectations from current counts. */
export function updateDerived(state: SimState): void {
  const { params, zones, dwellings: dw } = state;
  state.levers = leversAt(state.policy, state.tick);
  const nZ = zones.length;
  const strCount = new Array<number>(nZ).fill(0);
  const ltrOcc = new Array<number>(nZ).fill(0);
  const ltrVac = new Array<number>(nZ).fill(0);
  for (let d = 0; d < dw.n; d++) {
    const z = dw.zone[d]!;
    const t = dw.tenure[d];
    if (t === Tenure.STR) strCount[z]!++;
    else if (t === Tenure.LTR) {
      if (dw.tenant[d]! >= 0) ltrOcc[z]!++;
      else ltrVac[z]!++;
    }
  }
  // Tourist demand displaced from covered zones partly shifts to exempt ones.
  let displaced = 0;
  let exemptDemand = 0;
  const coveredNow = zones.map((_, zi) => zoneCovered(state, zi, state.tick));
  zones.forEach((z, zi) => {
    if (coveredNow[zi]) {
      const served = servedNights(params, z.strDemand, strCount[zi]!);
      displaced += Math.max(0, z.baselineServedStr - served);
    } else exemptDemand += z.strDemand;
  });
  zones.forEach((z, zi) => {
    let demand = z.strDemand;
    if (!coveredNow[zi] && exemptDemand > 0) {
      demand += (params.str.demandSpillover * displaced * z.strDemand) / exemptDemand;
    }
    z.occupancy = occupancy(params, demand, strCount[zi]!);
  });
  state.derived = {
    coveredNow,
    detectProb: detectProb(params, state.levers.enforcement),
    strNet: zones.map((z) => strNetRevenue(params, z.occupancy, z.spec.nightlyRate)),
    vacancy: zones.map((_, zi) => ltrVac[zi]! / Math.max(1, ltrOcc[zi]! + ltrVac[zi]!)),
    ltrNet: [],
  };
  state.derived.ltrNet = zones.map((z, zi) =>
    ltrNetRevenue(params, z.marketRent, state.derived.vacancy[zi]!),
  );
}

/** Occupancy given demand D (listing-equivalents) and supply S: occMax * D / (D + S). */
export function occupancy(params: Params, demand: number, supply: number): number {
  if (demand <= 0) return 0;
  return (params.str.occMax * demand) / (demand + Math.max(supply, 0));
}

function servedNights(params: Params, demand: number, supply: number): number {
  return occupancy(params, demand, supply) * supply;
}

/**
 * Policy enforcement for this tick (PLAN §5.3 step 2). Illegal STRs in covered zones are removed
 * when the host is compliant (at the first tick the rule binds), when detected (fined), or when
 * de-listed by the platform under the registry regime. Removed units return to the LTR market.
 * Principal-residence listings register (Phase 2).
 */
export function applyEnforcement(state: SimState): void {
  const { dwellings: dw, params, seed, tick } = state;
  const { coveredNow, detectProb: dp } = state.derived;
  const registry = state.levers.strRegime >= StrRegime.PR_REGISTRY;
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] !== Tenure.STR) continue;
    const zi = dw.zone[d]!;
    if (dw.principalRes[d]) {
      if (registry && coveredNow[zi]) dw.registered[d] = 1;
      continue;
    }
    if (!coveredNow[zi]) continue;
    let removed = false;
    if (dw.compliant[d]) removed = true;
    else if (uniform(seed, d, tick, Purpose.DETECT) < dp) {
      state.acc.fines += params.enforcement.fine;
      removed = true;
    } else if (registry && uniform(seed, d, tick, Purpose.DELIST) < params.enforcement.delistProb) {
      removed = true;
    }
    if (removed) {
      dw.tenure[d] = Tenure.LTR;
      dw.tenant[d] = -1;
      dw.registered[d] = 0;
    }
  }
}
