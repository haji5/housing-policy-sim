import { gumbel, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { HostClass, HouseholdStatus, RegStatus, StrRegime, Tenure } from '../types.ts';
import { classBeta, classCompliance, scheduleBuy } from '../world.ts';
import { anticipatedPenalty, DUE_REMOVED, illegalPenalty } from './enforcement.ts';

/**
 * Host decisions (ODD §7.1, ADR 0007). Investor-owned units choose among renting long-term
 * (LTR), short-term (STR), holding the unit vacant (VACANT) and selling it to an owner-occupier
 * (SELL); principal-residence owners choose whether to list their home. Choices are multinomial
 * logit, implemented with keyed Gumbel draws (argmax of U_k + scale * G_k) so draws are common
 * across counterfactual runs:
 *
 *   U_LTR  = beta_c * ltrNet_z
 *   U_STR  = ASC_str,z,c + beta_c * (strNet_z - penalty - registration)   (if legal or risked)
 *   U_VAC  = ASC_vac,z - beta_c * vacancyTax
 *   U_SELL = ASC_sell,z
 *
 * Who decides this tick:
 *  - investor STR units, vacant LTR units and held-vacant units review with probability pReview;
 *  - occupied LTR units do not review (sitting tenants are not displaced);
 *  - a unit whose tenant just left, that was just bought or completed, or that was just removed
 *    from the platforms is `due` and decides now (a removed one cannot relist this month);
 *  - purpose-built and non-market rentals never review (they stay long-term rentals).
 *
 * A sale can free a rental: some buyers are renter households already in the region (ADR 0013).
 */
export function hostDecisions(state: SimState): void {
  purchases(state);
  investorEntry(state);
  const { dwellings: dw, params, seed, tick, zones, derived } = state;
  const { gumbelScale: sigma, pReview, prReview, prBeta } = params.host;
  const registry = state.levers.strRegime >= StrRegime.PR_REGISTRY;
  const regCost = registry ? params.enforcement.registrationCost : 0;
  const tax = derived.vacancyTaxMonthly;
  const pool: BuyerPool = { ids: null };

  for (let d = 0; d < dw.n; d++) {
    const t = dw.tenure[d];
    if (t === Tenure.CONSTRUCTION || dw.rentalKind[d]) continue;
    const zi = dw.zone[d]!;
    const cost = dw.claimsExempt[d] ? 0 : regCost;

    if (dw.principalRes[d]) {
      if (uniform(seed, dw.key[d]!, tick, Purpose.PR_REVIEW) >= prReview) continue;
      const uList =
        zones[zi]!.ascPr +
        prBeta * (derived.strNet[zi]! - cost) +
        sigma * gumbel(seed, dw.key[d]!, tick, Purpose.PR_CHOICE, 1);
      const uNot = sigma * gumbel(seed, dw.key[d]!, tick, Purpose.PR_CHOICE, 0);
      const list = uList > uNot;
      if (!list && t === Tenure.STR) dw.registered[d] = RegStatus.NONE;
      dw.tenure[d] = list ? Tenure.STR : Tenure.OWNER_OCC;
      if (!list && t === Tenure.STR) scheduleBuy(state, d, tick);
      continue;
    }

    if (t === Tenure.LTR && dw.tenant[d]! >= 0) continue;
    const due = dw.due[d]!;
    dw.due[d] = 0;
    if (due === 0 && uniform(seed, dw.key[d]!, tick, Purpose.HOST_REVIEW) >= pReview) continue;

    const c = dw.hostClass[d]!;
    const beta = classBeta(params, c);
    const z = zones[zi]!;
    const illegal = derived.coveredNow[zi]!;
    const strAvailable = due !== DUE_REMOVED && !(illegal && dw.compliant[d]);
    const uLtr =
      beta * derived.ltrNet[zi]! + sigma * gumbel(seed, dw.key[d]!, tick, Purpose.HOST_CHOICE, 0);
    let uStr = Number.NEGATIVE_INFINITY;
    if (strAvailable) {
      const penalty = illegal
        ? illegalPenalty(state, zi, dw.claimsExempt[d] === 1)
        : anticipatedPenalty(state, zi);
      uStr =
        z.ascStr[c]! +
        beta * (derived.strNet[zi]! - penalty - cost) +
        sigma * gumbel(seed, dw.key[d]!, tick, Purpose.HOST_CHOICE, 1);
    }
    const uVac =
      z.ascVac - beta * tax + sigma * gumbel(seed, dw.key[d]!, tick, Purpose.HOST_CHOICE, 2);
    const uSell = z.ascSell + sigma * gumbel(seed, dw.key[d]!, tick, Purpose.HOST_CHOICE, 3);
    const best = Math.max(uLtr, uStr, uVac, uSell);

    if (best === uStr) {
      dw.tenure[d] = Tenure.STR;
      continue;
    }
    dw.registered[d] = RegStatus.NONE;
    if (best === uSell) {
      // Sold to an owner-occupier: the unit leaves the investor stock.
      dw.tenure[d] = Tenure.OWNER_OCC;
      dw.principalRes[d] = 1;
      dw.hostClass[d] = HostClass.SINGLE;
      dw.tenant[d] = -1;
      scheduleBuy(state, d, tick);
      state.acc.sales[zi]!++;
      renterBuyer(state, d, pool);
    } else if (best === uVac) {
      dw.tenure[d] = Tenure.VACANT;
      dw.tenant[d] = -1;
    } else if (t !== Tenure.LTR) {
      dw.tenure[d] = Tenure.LTR;
      dw.tenant[d] = -1;
    }
  }
}

/** Housed renter households at the first sale of the tick (built lazily, once per tick). */
interface BuyerPool {
  ids: number[] | null;
}

/** Draws per renter purchase (a draw that hits a household that already bought this tick is retried). */
const BUYER_TRIES = 4;

/**
 * Renter buyers (ADR 0013): with probability renterBuyerShare the owner-occupier who buys sold
 * investor home d is a renter household already housed in the region, drawn uniformly (region-wide).
 * Uniform, not income-selected, so the renter income distribution stays stationary: removing richer
 * renters while arrivals have the starting distribution would make the rent-burden level drift. The
 * buyer leaves the rental market (BOUGHT) and its rental becomes vacant and `due`, as after any
 * move-out. Otherwise the buyer comes from outside the rental market and no rental is freed.
 */
function renterBuyer(state: SimState, d: number, pool: BuyerPool): void {
  const { dwellings: dw, households: hh, params, seed, tick } = state;
  const share = params.host.renterBuyerShare;
  const key = dw.key[d]!;
  if (!(share > 0) || uniform(seed, key, tick, Purpose.RENTER_BUYER, 0) >= share) return;
  if (pool.ids === null) {
    pool.ids = [];
    for (let h = 0; h < hh.n; h++) if (hh.status[h] === HouseholdStatus.HOUSED) pool.ids.push(h);
  }
  const ids = pool.ids;
  if (ids.length === 0) return;
  let buyer = -1;
  for (let j = 1; j <= BUYER_TRIES && buyer < 0; j++) {
    const h = ids[Math.floor(uniform(seed, key, tick, Purpose.RENTER_BUYER, j) * ids.length)]!;
    // Skip households that already bought this tick.
    if (hh.status[h] === HouseholdStatus.HOUSED) buyer = h;
  }
  if (buyer < 0) return;
  const home = hh.dwelling[buyer]!;
  dw.tenant[home] = -1;
  dw.due[home] = 1;
  hh.dwelling[buyer] = -1;
  hh.status[buyer] = HouseholdStatus.BOUGHT;
  hh.searchMonths[buyer] = 0;
}

/**
 * Baseline purchases (ADR 0007): an owner-occupied, non-listing home is bought by a small investor
 * with monthly probability buyProb_z (drawn as a geometric waiting time, `scheduleBuy`), which
 * balances sales in the starting steady state. The new owner decides on the unit's use at once.
 */
function purchases(state: SimState): void {
  const { dwellings: dw, params, seed, tick } = state;
  for (let d = 0; d < dw.n; d++) {
    if (dw.buyTick[d]! > tick || dw.tenure[d] !== Tenure.OWNER_OCC) continue;
    dw.principalRes[d] = 0;
    dw.hostClass[d] = HostClass.SINGLE;
    dw.compliant[d] =
      uniform(seed, dw.key[d]!, 0, Purpose.HOST_COMPLIANT) <
      classCompliance(params, HostClass.SINGLE)
        ? 1
        : 0;
    dw.tenure[d] = Tenure.LTR;
    dw.tenant[d] = -1;
    dw.due[d] = 1;
  }
}

/**
 * Investor entry (spillover, ODD §7.1): in zones where the rule does not bind, a non-listing
 * owner-occupied home is bought by an investor with monthly probability
 * investorEntry * max(0, strNet / strNet0 - 1). The new owner is a commercial operator and
 * decides on the unit's use immediately. Zero while STR profits are at or below their start level.
 */
function investorEntry(state: SimState): void {
  const { dwellings: dw, params, seed, tick, zones, derived } = state;
  const rate = params.host.investorEntry;
  if (rate <= 0) return;
  const p = zones.map((z, zi) =>
    derived.coveredNow[zi]
      ? 0
      : rate * Math.max(0, derived.strNet[zi]! / Math.max(0.1, z.strNet0) - 1),
  );
  if (p.every((x) => x <= 0)) return;
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] !== Tenure.OWNER_OCC || !dw.principalRes[d]) continue;
    const pz = p[dw.zone[d]!]!;
    if (pz <= 0 || uniform(seed, dw.key[d]!, tick, Purpose.INVESTOR_ENTRY) >= pz) continue;
    dw.principalRes[d] = 0;
    dw.hostClass[d] = HostClass.COMMERCIAL;
    dw.compliant[d] =
      uniform(seed, dw.key[d]!, 0, Purpose.HOST_COMPLIANT) <
      classCompliance(params, HostClass.COMMERCIAL)
        ? 1
        : 0;
    dw.tenure[d] = Tenure.LTR;
    dw.tenant[d] = -1;
    dw.due[d] = 1;
  }
}
