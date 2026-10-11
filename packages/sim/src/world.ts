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
import { HostClass, HouseholdStatus, RentalKind, Tenure } from './types.ts';
import { NO_SHOCK } from './shocks.ts';

const NO_ONE = -1;

export function logit(p: number): number {
  const q = Math.min(1 - 1e-6, Math.max(1e-6, p));
  return Math.log(q / (1 - q));
}

export function strNetRevenue(params: Params, occupancy: number, nightlyRate: number): number {
  return occupancy * nightlyRate * 30 * (1 - params.host.strCostShare) - params.host.strUpkeep;
}

/**
 * Expected monthly LTR net revenue. `capFactor` < 1 when a nominal rent cap below inflation plus
 * expected real market growth erodes future rent from a sitting tenant (ADR 0007).
 */
export function ltrNetRevenue(
  params: Params,
  marketRent: number,
  vacancy: number,
  capFactor = 1,
): number {
  return marketRent * (1 - vacancy) * capFactor - params.host.ltrUpkeep;
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

type AnyArray = Float64Array | Int32Array | Uint8Array | Uint16Array;

function grow<T extends AnyArray>(a: T, cap: number, fill?: number): T {
  const b = new (a.constructor as new (n: number) => T)(cap);
  if (fill !== undefined) b.fill(fill);
  b.set(a);
  return b;
}

/** Ensure room for `extra` more households, doubling capacity when needed. */
export function reserveHouseholds(hh: Households, extra: number): void {
  if (hh.n + extra <= hh.income.length) return;
  const cap = Math.max(hh.income.length * 2, hh.n + extra);
  hh.income = grow(hh.income, cap);
  hh.dwelling = grow(hh.dwelling, cap, NO_ONE);
  hh.status = grow(hh.status, cap);
  hh.searchMonths = grow(hh.searchMonths, cap);
  hh.prefZone = grow(hh.prefZone, cap);
}

export function allocDwellings(cap: number): Dwellings {
  return {
    n: 0,
    key: new Int32Array(cap),
    zone: new Uint8Array(cap),
    tenure: new Uint8Array(cap),
    principalRes: new Uint8Array(cap),
    compliant: new Uint8Array(cap),
    due: new Uint8Array(cap),
    quality: new Float64Array(cap),
    rent: new Float64Array(cap),
    tenant: new Int32Array(cap).fill(NO_ONE),
    leaseStart: new Int32Array(cap),
    registered: new Uint8Array(cap),
    hostClass: new Uint8Array(cap),
    claimsExempt: new Uint8Array(cap),
    completeTick: new Int32Array(cap),
    forOwner: new Uint8Array(cap),
    rentalKind: new Uint8Array(cap),
    buyTick: new Int32Array(cap),
  };
}

/** Ensure room for `extra` more dwellings (construction), doubling capacity when needed. */
export function reserveDwellings(dw: Dwellings, extra: number): void {
  if (dw.n + extra <= dw.zone.length) return;
  const cap = Math.max(dw.zone.length * 2, dw.n + extra);
  dw.key = grow(dw.key, cap);
  dw.zone = grow(dw.zone, cap);
  dw.tenure = grow(dw.tenure, cap);
  dw.principalRes = grow(dw.principalRes, cap);
  dw.compliant = grow(dw.compliant, cap);
  dw.due = grow(dw.due, cap);
  dw.quality = grow(dw.quality, cap);
  dw.rent = grow(dw.rent, cap);
  dw.tenant = grow(dw.tenant, cap, NO_ONE);
  dw.leaseStart = grow(dw.leaseStart, cap);
  dw.registered = grow(dw.registered, cap);
  dw.hostClass = grow(dw.hostClass, cap);
  dw.claimsExempt = grow(dw.claimsExempt, cap);
  dw.completeTick = grow(dw.completeTick, cap);
  dw.forOwner = grow(dw.forOwner, cap);
  dw.rentalKind = grow(dw.rentalKind, cap);
  dw.buyTick = grow(dw.buyTick, cap);
}

/**
 * A home becomes owner-occupied at `tick`: draw when a small investor will buy it. Equivalent to a
 * monthly purchase probability p (geometric waiting time), but drawn once instead of every month.
 */
export function scheduleBuy(state: SimState, d: number, tick: number): void {
  const dw = state.dwellings;
  const p = state.zones[dw.zone[d]!]!.buyProb;
  if (!(p > 0)) {
    dw.buyTick[d] = 0x7fffffff;
    return;
  }
  const u = uniform(state.seed, dw.key[d]!, tick, Purpose.BUY);
  const wait = p >= 1 ? 1 : Math.floor(Math.log(u) / Math.log(1 - p)) + 1;
  dw.buyTick[d] = Math.min(0x7fffffff, tick + wait);
}

/** Fixed per-dwelling draws shared by every new dwelling (quality, exempt-claim trait). */
export function initDwellingTraits(dw: Dwellings, d: number, params: Params, seed: number): void {
  const s = params.rental.qualitySpread;
  const k = dw.key[d]!;
  dw.claimsExempt[d] =
    uniform(seed, k, 0, Purpose.INIT_EXEMPT_CLAIM) < params.enforcement.exemptClaimShare ? 1 : 0;
  dw.quality[d] = 1 - s + 2 * s * uniform(seed, k, 0, Purpose.INIT_QUALITY);
}

/**
 * RNG key of the i-th unit started in zone `zi` at `tick` (bit 30 set, so it never collides with
 * a starting-stock index; bit 29 marks non-market starts).
 */
export function birthKey(tick: number, zi: number, i: number, nonMarket: boolean): number {
  return (
    (1 << 30) |
    (nonMarket ? 1 << 29 : 0) |
    (((tick + 512) & 0x3ff) << 19) |
    ((zi & 0xff) << 11) |
    (i & 0x7ff)
  );
}

/**
 * Add a unit under construction in zone `zi`, completing at `completeTick`, for an owner-occupier
 * or as a rental of the given RentalKind (purpose-built or non-market).
 */
export function addConstruction(
  state: SimState,
  zi: number,
  completeTick: number,
  forOwner: boolean,
  rentalKind: number,
  key: number,
): number {
  const dw = state.dwellings;
  reserveDwellings(dw, 1);
  const d = dw.n++;
  dw.key[d] = key;
  dw.zone[d] = zi;
  dw.tenure[d] = Tenure.CONSTRUCTION;
  dw.principalRes[d] = 0;
  dw.hostClass[d] = HostClass.SINGLE;
  dw.compliant[d] =
    uniform(state.seed, key, 0, Purpose.HOST_COMPLIANT) <
    classCompliance(state.params, HostClass.SINGLE)
      ? 1
      : 0;
  dw.completeTick[d] = completeTick;
  dw.forOwner[d] = forOwner ? 1 : 0;
  dw.rentalKind[d] = forOwner ? RentalKind.INVESTOR : rentalKind;
  initDwellingTraits(dw, d, state.params, state.seed);
  return d;
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

/** Construction lag in months, uniform on the integers lagMin..lagMax. */
export function drawLag(params: Params, u: number): number {
  const { lagMin, lagMax } = params.dev;
  return lagMin + Math.min(lagMax - lagMin, Math.floor(u * (lagMax - lagMin + 1)));
}

/**
 * Build the initial world. Counts come from the scenario (real units x params.scale). The
 * alternative-specific constants and matching efficiencies are solved here so that, with no
 * policy change, the starting state is approximately flow-balanced (ADRs 0002, 0007); spin-up
 * (ADR 0005) then settles them in the model's own steady state.
 */
export function buildWorld(config: RunConfig): SimState {
  const scenario =
    typeof config.scenario === 'string' ? loadScenario(config.scenario) : config.scenario;
  const params = config.params;
  const seed = config.seed >>> 0;
  const sc = params.scale;
  // The world starts at its first simulated tick: before the pre-ticks and the spin-up (ADR 0005),
  // so every scheduled event (pipeline completions, purchases, leases) is on the same clock.
  const spinUp = Math.max(0, Math.floor(scenario.spinUpMonths ?? 0));
  const startTick = -Math.max(0, Math.floor(config.preTicks ?? 0)) - spinUp;
  const nZones = scenario.zones.length;
  if (nZones > 255) throw new Error('At most 255 zones');
  const { lagMin, lagMax, startsAnnualShare } = params.dev;
  const meanLag = (lagMin + lagMax) / 2;

  // ---- per-zone counts
  const plan = scenario.zones.map((z, zi) => {
    const nD = Math.round(z.dwellings * sc);
    const nStr = Math.round(z.strListings * sc);
    const nPrStr = Math.round(nStr * (z.prShareOfListings ?? params.host.prShare));
    const nInvStr = nStr - nPrStr;
    const nOcc = Math.round(z.renterHouseholds * sc);
    const nVac = Math.round((nOcc * params.rental.vStar) / (1 - params.rental.vStar));
    const nHeld = Math.round(params.host.vacantHeldShare * (nOcc + nVac + nInvStr));
    const nOwner = nD - nPrStr - nInvStr - nOcc - nVac - nHeld;
    if (nOwner < 0)
      throw new Error(`Zone ${zi} (${z.name}): more STR + rental units than dwellings`);
    const startsBase = (startsAnnualShare * nD) / 12;
    return { nD, nPrStr, nInvStr, nOcc, nVac, nHeld, nOwner, startsBase };
  });
  const totalD = plan.reduce((a, p) => a + p.nD, 0);
  const totalOcc = plan.reduce((a, p) => a + p.nOcc, 0);
  const pipelineGuess = Math.ceil(plan.reduce((a, p) => a + p.startsBase * meanLag * 1.5, 0));
  // Multi-listing hosts: a share m of investor units, chosen so that the multi-host share of all
  // starting listings matches the scenario (PR hosts are single by definition).
  const totalStr = plan.reduce((a, p) => a + p.nPrStr + p.nInvStr, 0);
  const totalInvStr = plan.reduce((a, p) => a + p.nInvStr, 0);
  const multiShareInv =
    scenario.multiHostShare === undefined || totalInvStr === 0
      ? 0
      : Math.min(1, (scenario.multiHostShare * totalStr) / totalInvStr);
  const nSearch0 = Math.round(totalOcc * scenario.initialSearchingShare);

  const dw = allocDwellings(totalD + pipelineGuess + 1024);
  const hh = allocHouseholds((totalOcc + nSearch0) * 3 + 1024);

  plan.forEach((p, zi) => {
    const zspec = scenario.zones[zi]!;
    const put = (count: number, tenure: number, pr: boolean) => {
      for (let k = 0; k < count; k++) {
        const d = dw.n++;
        dw.key[d] = d;
        dw.zone[d] = zi;
        dw.tenure[d] = tenure;
        dw.principalRes[d] = pr ? 1 : 0;
        assignHostClass(dw, d, pr, multiShareInv, params, seed);
        initDwellingTraits(dw, d, params, seed);
      }
    };
    put(p.nOwner, Tenure.OWNER_OCC, true);
    put(p.nPrStr, Tenure.STR, true);
    put(p.nInvStr, Tenure.STR, false);
    const occStart = dw.n;
    put(p.nOcc, Tenure.LTR, false);
    put(p.nVac, Tenure.LTR, false);
    put(p.nHeld, Tenure.VACANT, false);
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
  // Units under construction at the start: a steady-state pipeline (lags length-biased, ages
  // uniform), so completions flow from the first month.
  plan.forEach((p, zi) => {
    const zspec = scenario.zones[zi]!;
    const rentalShare = zspec.renterHouseholds / Math.max(1, zspec.dwellings);
    const count = Math.round(p.startsBase * meanLag);
    for (let k = 0; k < count; k++) {
      const d = dw.n++;
      dw.key[d] = d;
      const u = uniform(seed, d, 0, Purpose.INIT_PIPELINE, 0);
      const lag = Math.sqrt(lagMin * lagMin + u * (lagMax * lagMax - lagMin * lagMin));
      const remaining = Math.max(1, Math.ceil(lag * uniform(seed, d, 0, Purpose.INIT_PIPELINE, 1)));
      const forOwner = uniform(seed, d, 0, Purpose.INIT_PIPELINE, 2) >= rentalShare;
      dw.zone[d] = zi;
      dw.tenure[d] = Tenure.CONSTRUCTION;
      dw.hostClass[d] = HostClass.SINGLE;
      dw.compliant[d] =
        uniform(seed, d, 0, Purpose.HOST_COMPLIANT) < classCompliance(params, HostClass.SINGLE)
          ? 1
          : 0;
      dw.completeTick[d] = startTick + remaining;
      dw.forOwner[d] = forOwner ? 1 : 0;
      dw.rentalKind[d] = forOwner ? RentalKind.INVESTOR : RentalKind.PURPOSE_BUILT;
      initDwellingTraits(dw, d, params, seed);
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
  const sigma = params.host.gumbelScale;
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
    const ltrNet0 = ltrNetRevenue(params, z.marketRent, vac0);
    // Flow balance for investor units (ADR 0007). Reviewers per month: r (S + V + H) + h O. Each
    // stock is stationary when the share of reviewers choosing it equals its outflow share.
    const inv = p.nInvStr + p.nOcc + p.nVac + p.nHeld;
    const reviewers = Math.max(1, r * (p.nInvStr + p.nVac + p.nHeld) + turnover * p.nOcc);
    const pStr = Math.max(1e-6, (r * p.nInvStr) / reviewers);
    const pHeld = Math.max(1e-6, (r * p.nHeld) / reviewers);
    const pSell = Math.max(1e-6, ((params.host.sellRateAnnual / 12) * inv) / reviewers);
    const pLtr = Math.max(0.05, 1 - pStr - pHeld - pSell);
    const ascStr = [0, 1, 2].map(
      (c) => sigma * Math.log(pStr / pLtr) - classBeta(params, c) * (strNet0 - ltrNet0),
    );
    const ascVac = sigma * Math.log(pHeld / pLtr) + classBeta(params, 0) * ltrNet0;
    const ascSell = sigma * Math.log(pSell / pLtr) + classBeta(params, 0) * ltrNet0;
    // Purchases from owner-occupiers balance sales at the start.
    const buyProb = ((params.host.sellRateAnnual / 12) * inv) / Math.max(1, p.nOwner);
    // Principal-residence hosts review symmetrically, so the stationary share equals P.
    const sPr = p.nPrStr / Math.max(1, p.nPrStr + p.nOwner);
    const ascPr = sigma * logit(sPr) - params.host.prBeta * strNet0;
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
      ascVac,
      ascSell,
      buyProb,
      startsBase: p.startsBase,
      rentRef: z.marketRent,
      rentalShare: z.renterHouseholds / Math.max(1, z.dwellings),
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
    derived: {
      coveredNow: [],
      detectProb: 0,
      strNet: [],
      ltrNet: [],
      vacancy: [],
      policyRate: 0,
      vacancyTaxMonthly: 0,
      upzoneMult: [],
      capFactor: [],
      shock: { ...NO_SHOCK },
    },
    base: {
      cpiQualityRent: qRent / Math.max(1, nRented),
      askingRent: askingBase,
      cpiIndexBase: qRent / Math.max(1, nRented),
      askingIndexBase: askingBase,
      arrivalsPerMonth: baseArrivals(params, scenario, renterWeights, nRented),
      renterWeights,
      rentalCompletionsPerMonth: zones.reduce((a, z) => a + z.startsBase * z.rentalShare, 0),
    },
    history: [],
    acc: emptyAcc(nZones),
  };
  updateDerived(state);
  for (let d = 0; d < dw.n; d++)
    if (dw.tenure[d] === Tenure.OWNER_OCC) scheduleBuy(state, d, startTick);
  return state;
}

export function emptyAcc(nZones: number): SimState['acc'] {
  return {
    fines: 0,
    vacancyTax: 0,
    starts: new Array<number>(nZones).fill(0),
    completions: new Array<number>(nZones).fill(0),
    sales: new Array<number>(nZones).fill(0),
  };
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
  const k = dw.key[d]!;
  if (!principalRes && uniform(seed, k, 0, Purpose.INIT_CLASS, 0) < multiShareInv) {
    c =
      uniform(seed, k, 0, Purpose.INIT_CLASS, 1) < params.host.commercialShareOfMulti
        ? HostClass.COMMERCIAL
        : HostClass.MULTI;
  }
  dw.hostClass[d] = c;
  dw.compliant[d] =
    uniform(seed, k, 0, Purpose.HOST_COMPLIANT) < classCompliance(params, c) ? 1 : 0;
}
