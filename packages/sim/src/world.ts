import { leversAt, resolvePolicy, sortEvents } from './policy.ts';
import { normal, Purpose, uniform } from './rng.ts';
import { loadScenario } from './scenarios/index.ts';
import { updateDerived } from './systems/enforcement.ts';
import type {
  Dwellings,
  Households,
  Params,
  RunConfig,
  Scenario,
  SimState,
  ZoneState,
} from './types.ts';
import { HostClass, HouseholdStatus, Tenure } from './types.ts';

const NO_ONE = -1;

export function logit(p: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
}

export function strNetRevenue(params: Params, occupancy: number, nightlyRate: number): number {
  return occupancy * nightlyRate * 30 * (1 - params.host.strCostShare) - params.host.strUpkeep;
}

export function ltrNetRevenue(params: Params, marketRent: number, vacancy: number): number {
  return marketRent * (1 - vacancy) - params.host.ltrUpkeep;
}

export function allocHouseholds(cap: number): Households {
  return {
    n: 0,
    income: new Float64Array(cap),
    dwelling: new Int32Array(cap).fill(NO_ONE),
    status: new Uint8Array(cap),
    searchMonths: new Uint16Array(cap),
    prefZone: new Uint8Array(cap),
  };
}

/** Ensure room for `extra` more households, doubling capacity when needed. */
export function reserveHouseholds(hh: Households, extra: number): void {
  if (hh.n + extra <= hh.income.length) return;
  const cap = Math.max(hh.income.length * 2, hh.n + extra);
  const grow = <T extends Float64Array | Int32Array | Uint8Array | Uint16Array>(
    a: T,
    fill?: number,
  ): T => {
    const b = new (a.constructor as new (n: number) => T)(cap);
    if (fill !== undefined) b.fill(fill);
    b.set(a);
    return b;
  };
  hh.income = grow(hh.income);
  hh.dwelling = grow(hh.dwelling, NO_ONE);
  hh.status = grow(hh.status);
  hh.searchMonths = grow(hh.searchMonths);
  hh.prefZone = grow(hh.prefZone);
}

export function drawIncome(params: Params, seed: number, hhId: number): number {
  const { incomeMedian, incomeSigma } = params.households;
  return incomeMedian * Math.exp(incomeSigma * normal(seed, hhId, 0, Purpose.HH_INCOME));
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp((-x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Pick a zone index with probability proportional to `weights`, using one keyed uniform. */
export function pickWeighted(weights: readonly number[], u: number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = u * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]!;
    if (x < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Build the initial world. Counts come from the scenario (real units x params.scale). The
 * alternative-specific constants and matching efficiencies are solved here so that, with no
 * policy change, the starting state is a flow-balanced steady state (see ADR 0002).
 */
export function buildWorld(config: RunConfig): SimState {
  const scenario =
    typeof config.scenario === 'string' ? loadScenario(config.scenario) : config.scenario;
  const params = config.params;
  const seed = config.seed >>> 0;
  const sc = params.scale;
  const startTick = -Math.max(0, Math.floor(config.preTicks ?? 0));
  const nZones = scenario.zones.length;
  if (nZones > 255) throw new Error('At most 255 zones');

  // ---- per-zone counts
  const plan = scenario.zones.map((z, zi) => {
    const nD = Math.round(z.dwellings * sc);
    const nStr = Math.round(z.strListings * sc);
    const nPrStr = Math.round(nStr * (z.prShareOfListings ?? params.host.prShare));
    const nInvStr = nStr - nPrStr;
    const nOcc = Math.round(z.renterHouseholds * sc);
    const nVac = Math.round((nOcc * params.rental.vStar) / (1 - params.rental.vStar));
    const nOwner = nD - nPrStr - nInvStr - nOcc - nVac;
    if (nOwner < 0)
      throw new Error(`Zone ${zi} (${z.name}): more STR + rental units than dwellings`);
    return { nD, nPrStr, nInvStr, nOcc, nVac, nOwner };
  });
  const totalD = plan.reduce((a, p) => a + p.nD, 0);
  const totalOcc = plan.reduce((a, p) => a + p.nOcc, 0);
  // Multi-listing hosts: a share m of investor units, chosen so that the multi-host share of all
  // starting listings matches the scenario (PR hosts are single by definition).
  const totalStr = plan.reduce((a, p) => a + p.nPrStr + p.nInvStr, 0);
  const totalInvStr = plan.reduce((a, p) => a + p.nInvStr, 0);
  const multiShareInv =
    scenario.multiHostShare === undefined || totalInvStr === 0
      ? 0
      : Math.min(1, (scenario.multiHostShare * totalStr) / totalInvStr);
  const nSearch0 = Math.round(totalOcc * scenario.initialSearchingShare);

  const dw: Dwellings = {
    n: totalD,
    zone: new Uint8Array(totalD),
    tenure: new Uint8Array(totalD),
    principalRes: new Uint8Array(totalD),
    compliant: new Uint8Array(totalD),
    due: new Uint8Array(totalD),
    quality: new Float64Array(totalD),
    rent: new Float64Array(totalD),
    tenant: new Int32Array(totalD).fill(NO_ONE),
    leaseStart: new Int32Array(totalD),
    registered: new Uint8Array(totalD),
    hostClass: new Uint8Array(totalD),
    claimsExempt: new Uint8Array(totalD),
  };
  const hh = allocHouseholds((totalOcc + nSearch0) * 3 + 1024);

  const s = params.rental.qualitySpread;
  let d = 0;
  plan.forEach((p, zi) => {
    const zspec = scenario.zones[zi]!;
    const put = (count: number, tenure: number, pr: boolean) => {
      for (let k = 0; k < count; k++, d++) {
        dw.zone[d] = zi;
        dw.tenure[d] = tenure;
        dw.principalRes[d] = pr ? 1 : 0;
        assignHostClass(dw, d, pr, multiShareInv, params, seed);
        dw.claimsExempt[d] =
          uniform(seed, d, 0, Purpose.INIT_EXEMPT_CLAIM) < params.enforcement.exemptClaimShare
            ? 1
            : 0;
        dw.quality[d] = 1 - s + 2 * s * uniform(seed, d, 0, Purpose.INIT_QUALITY);
      }
    };
    put(p.nOwner, Tenure.OWNER_OCC, true);
    put(p.nPrStr, Tenure.STR, true);
    put(p.nInvStr, Tenure.STR, false);
    const occStart = d;
    put(p.nOcc, Tenure.LTR, false);
    put(p.nVac, Tenure.LTR, false);
    // Sitting tenants: rent at or somewhat below market; staggered lease anniversaries.
    for (let k = occStart; k < occStart + p.nOcc; k++) {
      const h = hh.n++;
      const discount = params.rental.sittingDiscount * uniform(seed, k, 0, Purpose.INIT_RENT);
      dw.rent[k] = zspec.marketRent * dw.quality[k]! * (1 - discount);
      dw.tenant[k] = h;
      dw.leaseStart[k] = startTick - Math.floor(uniform(seed, k, 0, Purpose.INIT_LEASE) * 12) - 1;
      hh.income[h] = drawIncome(params, seed, h);
      hh.dwelling[h] = k;
      hh.status[h] = HouseholdStatus.HOUSED;
      hh.prefZone[h] = zi;
    }
  });

  // ---- initial searchers
  const renterWeights = plan.map((p) => p.nOcc);
  for (let k = 0; k < nSearch0; k++) {
    const h = hh.n++;
    hh.income[h] = drawIncome(params, seed, h);
    hh.status[h] = HouseholdStatus.SEARCHING;
    hh.prefZone[h] = pickWeighted(renterWeights, uniform(seed, h, 0, Purpose.HH_PREF_ZONE));
    hh.searchMonths[h] = Math.floor(uniform(seed, h, 0, Purpose.SEARCH_ZONE, 99) * 3);
  }

  // ---- zone state, steady-state constants
  const turnover = params.rental.moveHazard + params.rental.exitHazard;
  const r = params.host.pReview;
  const psi = nZones > 1 ? params.rental.searchOtherZoneProb : 0;
  const searchersByPref = new Array<number>(nZones).fill(0);
  for (let h = 0; h < hh.n; h++)
    if (hh.status[h] !== HouseholdStatus.HOUSED) searchersByPref[hh.prefZone[h]!]!++;

  const zones: ZoneState[] = scenario.zones.map((z, zi) => {
    const p = plan[zi]!;
    const nStr = p.nPrStr + p.nInvStr;
    const strDemand = (nStr * z.occupancy) / (params.str.occMax - z.occupancy);
    const vac0 = p.nVac / Math.max(1, p.nOcc + p.nVac);
    const strNet0 = strNetRevenue(params, z.occupancy, z.nightlyRate);
    const dNet = strNet0 - ltrNetRevenue(params, z.marketRent, vac0);
    // Flow balance for investor units: inflow to STR = P (h*O + r*V), outflow = r*S*(1-P).
    const pStar = (r * p.nInvStr) / (turnover * p.nOcc + r * p.nVac + r * p.nInvStr);
    const ascStr = [0, 1, 2].map(
      (c) => params.host.gumbelScale * logit(pStar) - classBeta(params, c) * dNet,
    );
    // Principal-residence hosts review symmetrically, so the stationary share equals P.
    const sPr = p.nPrStr / Math.max(1, p.nPrStr + p.nOwner);
    const ascPr =
      params.host.gumbelScale * logit(sPr) -
      params.host.prBeta * strNetRevenue(params, z.occupancy, z.nightlyRate);
    // Matching efficiency so that matches balance vacancy creation at the start.
    // Searchers from other zones arrive in proportion to this zone's renter stock.
    const wTot = renterWeights.reduce((a, b) => a + b, 0);
    let inflow = 0;
    for (let o = 0; o < nZones; o++) {
      if (o !== zi)
        inflow +=
          (psi * searchersByPref[o]! * renterWeights[zi]!) / Math.max(1, wTot - renterWeights[o]!);
    }
    const expectedSearchers = searchersByPref[zi]! * (1 - psi) + inflow;
    const matchEff =
      (turnover * p.nOcc) / Math.sqrt(Math.max(1, expectedSearchers) * Math.max(1, p.nVac));
    return {
      spec: z,
      marketRent: z.marketRent,
      strDemand,
      strDemand0: strDemand,
      strNet0,
      occupancy: z.occupancy,
      matchEff,
      ascStr,
      ascPr,
      baselineServedStr: nStr * z.occupancy,
    };
  });

  // ---- index bases
  let qRent = 0;
  let nRented = 0;
  for (let k = 0; k < dw.n; k++) {
    if (dw.tenant[k]! >= 0) {
      qRent += dw.rent[k]! / dw.quality[k]!;
      nRented++;
    }
  }
  const askingBase = zones.reduce((a, z, zi) => a + z.marketRent * renterWeights[zi]!, 0);
  const policy = sortEvents(resolvePolicy(config.policy));

  const state: SimState = {
    seed,
    tick: startTick,
    scenario,
    params,
    policy,
    levers: leversAt(policy, startTick),
    zones,
    dwellings: dw,
    households: hh,
    derived: { coveredNow: [], detectProb: 0, strNet: [], ltrNet: [], vacancy: [] },
    base: {
      cpiQualityRent: qRent / Math.max(1, nRented),
      askingRent: askingBase,
      cpiIndexBase: qRent / Math.max(1, nRented),
      askingIndexBase: askingBase,
      arrivalsPerMonth: baseArrivals(params, scenario, renterWeights, nRented),
      renterWeights,
    },
    history: [],
    acc: { fines: 0 },
  };
  updateDerived(state);
  return state;
}

/**
 * Baseline monthly arrivals that keep the renter population stationary with no policy change:
 * replace ordinary exits, grossed up for the share of arrivals who cannot afford even the cheapest
 * unit in their preferred zone (they eventually leave as GONE).
 */
function baseArrivals(
  params: Params,
  scenario: Scenario,
  weights: readonly number[],
  housed: number,
): number {
  const { incomeMedian, incomeSigma } = params.households;
  const total = weights.reduce((a, b) => a + b, 0);
  let pUnaffordable = 0;
  scenario.zones.forEach((z, zi) => {
    const minIncome =
      (z.marketRent * (1 - params.rental.qualitySpread)) / params.rental.maxRentShare;
    pUnaffordable +=
      (weights[zi]! / total) * normCdf(Math.log(minIncome / incomeMedian) / incomeSigma);
  });
  return (params.rental.exitHazard * housed) / Math.max(0.05, 1 - pUnaffordable);
}

/** Utility weight on net revenue for a host class (commercial operators may be more sensitive). */
export function classBeta(params: Params, hostClass: number): number {
  return (
    params.host.beta * (hostClass === HostClass.COMMERCIAL ? params.host.commercialBetaMult : 1)
  );
}

/** Compliance threshold for a host class (multi-listing hosts are shifted). */
export function classCompliance(params: Params, hostClass: number): number {
  const shift = hostClass === HostClass.SINGLE ? 0 : params.host.multiComplianceShift;
  return Math.min(1, Math.max(0, params.host.complianceBase + shift));
}

/** Fixed draws for a dwelling's host class and compliance type. */
export function assignHostClass(
  dw: Dwellings,
  d: number,
  principalRes: boolean,
  multiShareInv: number,
  params: Params,
  seed: number,
): void {
  let c: number = HostClass.SINGLE;
  if (!principalRes && uniform(seed, d, 0, Purpose.INIT_CLASS, 0) < multiShareInv) {
    c =
      uniform(seed, d, 0, Purpose.INIT_CLASS, 1) < params.host.commercialShareOfMulti
        ? HostClass.COMMERCIAL
        : HostClass.MULTI;
  }
  dw.hostClass[d] = c;
  dw.compliant[d] =
    uniform(seed, d, 0, Purpose.HOST_COMPLIANT) < classCompliance(params, c) ? 1 : 0;
}
