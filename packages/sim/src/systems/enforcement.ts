import { leversAt } from '../policy.ts';
import { policyRateAt } from '../rates.ts';
import { Purpose, uniform } from '../rng.ts';
import { combineShocks } from '../shocks.ts';
import type { Params, SimState } from '../types.ts';
import { RegStatus, RentCap, StrRegime, Tenure, Upzone } from '../types.ts';
import { ltrNetRevenue, scheduleBuy, strNetRevenue } from '../world.ts';

/** Nominal annual rent-increase cap for a RentCap setting. */
export function rentCapValue(params: Params, code: number): number {
  if (code === RentCap.LOW) return params.rental.rentCapLow;
  if (code === RentCap.HIGH) return params.rental.rentCapHigh;
  return params.rental.rentCapAnnual;
}

/** Starts multiplier for an Upzone setting. */
export function upzoneMultiplier(params: Params, code: number): number {
  if (code === Upzone.MODERATE) return params.dev.upzoneModerate;
  if (code === Upzone.AGGRESSIVE) return params.dev.upzoneAggressive;
  return 1;
}

/**
 * Rent-cap factor on expected LTR revenue (ADR 0007): a sitting tenant's rent can rise by at most
 * the nominal cap, so when inflation plus expected real market growth exceeds it, the investor
 * expects to fall behind the market by the gap for about capPenaltyYears years.
 */
export function capFactor(params: Params, cap: number, realGrowth: number): number {
  const gap = Math.max(0, params.rental.inflationAnnual + Math.max(0, realGrowth) - cap);
  return Math.max(0.5, 1 - params.host.capPenaltyYears * gap);
}

/** dwellings.due codes: 1 = tenant left or new owner; 2 = just removed from STR (no relisting). */
export const DUE_NOW = 1;
export const DUE_REMOVED = 2;

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
export function zoneStatutorilyCovered(state: SimState, zi: number, tick: number): boolean {
  const spec = state.zones[zi]!.spec;
  return spec.covered || (spec.optInTick !== undefined && tick >= spec.optInTick);
}

/**
 * Expected monthly cost of running an illegal STR (non-compliant host): expected fine plus the
 * revenue lost if detected or de-listed this month.
 */
export function illegalPenalty(state: SimState, zi: number, claimsExempt = false): number {
  const dp = state.derived.detectProb;
  const delist =
    state.levers.strRegime >= StrRegime.PR_REGISTRY && !claimsExempt
      ? state.params.enforcement.delistProb
      : 0;
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
  const shock = combineShocks(state.levers.shocks);
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
  // Common growth in tourist demand from tick 0 (none during pre-ticks).
  const growth = Math.exp((params.str.demandGrowthAnnual * Math.max(0, state.tick)) / 12);
  zones.forEach((z) => {
    z.strDemand = z.strDemand0 * growth * shock.strDemandMult;
  });
  zones.forEach((z, zi) => {
    if (coveredNow[zi]) {
      const served = servedNights(params, z.strDemand, strCount[zi]!);
      displaced += Math.max(0, z.baselineServedStr * growth * shock.strDemandMult - served);
    } else exemptDemand += z.strDemand;
  });
  zones.forEach((z, zi) => {
    let demand = z.strDemand;
    if (!coveredNow[zi] && exemptDemand > 0) {
      demand += (params.str.demandSpillover * displaced * z.strDemand) / exemptDemand;
    }
    z.occupancy = occupancy(params, demand, strCount[zi]!);
  });
  // Upzoning takes effect after the permit delay; the cap bites through expected real growth.
  const permitted = leversAt(state.policy, state.tick - params.dev.permitDelayTicks).upzone;
  const cap = rentCapValue(params, state.levers.rentCap);
  const H = state.history;
  const caps = zones.map((z, zi) => {
    const past = H.length >= 12 ? H[H.length - 12]!.zones[zi]!.marketRent : z.marketRent;
    return capFactor(params, cap, z.marketRent / past - 1);
  });
  state.derived = {
    coveredNow,
    detectProb: detectProb(params, state.levers.enforcement) * shock.detectMult,
    strNet: zones.map((z) => strNetRevenue(params, z.occupancy, z.spec.nightlyRate)),
    vacancy: zones.map((_, zi) => ltrVac[zi]! / Math.max(1, ltrOcc[zi]! + ltrVac[zi]!)),
    ltrNet: [],
    policyRate: policyRateAt(state.scenario.start, state.tick) + shock.rateShift,
    vacancyTaxMonthly: ((state.levers.vacancyTax / 100) * params.fiscal.assessedValue) / 12,
    upzoneMult: zones.map((_, zi) => upzoneMultiplier(params, permitted[zi] ?? Upzone.NONE)),
    capFactor: caps,
    shock,
  };
  state.derived.ltrNet = zones.map((z, zi) =>
    ltrNetRevenue(params, z.marketRent, state.derived.vacancy[zi]!, caps[zi]),
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
 * Policy enforcement for this tick (PLAN §5.3 step 2).
 *
 * Announcement (rule announced, not yet in force): compliant investor hosts in zones the rule will
 * cover exit with monthly probability `anticipation`.
 *
 * Principal-residence rule (regime >= 1): an investor STR in a covered zone is illegal. It is
 * removed when its host is compliant (at the first tick the rule binds) or when detected (fined).
 *
 * Registry (regime 2) applies to every listing, covered or not. Hosts with the fixed
 * "claims exempt" trait show "Exempt" and are never de-listed by the platform. Other legal
 * listings register with probability regTakeup per month; illegal ones cannot register. Each
 * month the platform removes an unregistered, non-exempt listing with probability delistProb.
 *
 * Removed investor units return to the LTR market; removed PR listings revert to owner use.
 */
export function applyEnforcement(state: SimState): void {
  const { dwellings: dw, params, seed, tick } = state;
  const { coveredNow, detectProb: dp } = state.derived;
  const registry = state.levers.strRegime >= StrRegime.PR_REGISTRY;
  // Platforms validate registrations only after the registry has been open for a while
  // (registry opened 1 May 2025, platform validation from 1 Jun 2025: one month).
  const platformValidates =
    leversAt(state.policy, tick - params.enforcement.delistLagTicks).strRegime >=
    StrRegime.PR_REGISTRY;
  const { fine, delistProb, regTakeup } = params.enforcement;
  const anticipating = state.levers.announced === 1 && state.levers.strRegime === StrRegime.OPEN;
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] !== Tenure.STR) continue;
    const zi = dw.zone[d]!;
    const illegal = !dw.principalRes[d] && coveredNow[zi]!;
    let removed = false;
    // Anticipation: after the announcement, law-abiding hosts in zones the rule will cover wind
    // down before it takes effect (monthly hazard = anticipation).
    if (
      anticipating &&
      !dw.principalRes[d] &&
      dw.compliant[d] &&
      zoneStatutorilyCovered(state, zi, tick) &&
      uniform(seed, dw.key[d]!, tick, Purpose.ANTICIPATE) < params.host.anticipation
    )
      removed = true;
    if (illegal) {
      if (dw.registered[d] === RegStatus.REGISTERED) dw.registered[d] = RegStatus.NONE;
      if (dw.compliant[d]) removed = true;
      else if (uniform(seed, dw.key[d]!, tick, Purpose.DETECT) < dp) {
        state.acc.fines += fine;
        removed = true;
      }
    }
    if (!removed && registry) {
      if (dw.registered[d] === RegStatus.NONE) {
        if (dw.claimsExempt[d]) dw.registered[d] = RegStatus.EXEMPT_CLAIM;
        else if (!illegal && uniform(seed, dw.key[d]!, tick, Purpose.REG_TAKEUP) < regTakeup)
          dw.registered[d] = RegStatus.REGISTERED;
      }
      if (
        platformValidates &&
        dw.registered[d] === RegStatus.NONE &&
        uniform(seed, dw.key[d]!, tick, Purpose.DELIST) < delistProb
      )
        removed = true;
    }
    if (removed) {
      dw.registered[d] = RegStatus.NONE;
      if (dw.principalRes[d]) {
        dw.tenure[d] = Tenure.OWNER_OCC;
        scheduleBuy(state, d, tick);
      } else {
        // The host chooses between renting long-term, holding vacant and selling this month.
        dw.tenure[d] = Tenure.LTR;
        dw.tenant[d] = -1;
        dw.due[d] = DUE_REMOVED;
      }
    }
  }
}
