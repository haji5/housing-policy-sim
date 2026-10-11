import { poisson, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { RentalKind, Tenure } from '../types.ts';
import { addConstruction, birthKey, drawLag, pickWeighted, scheduleBuy } from '../world.ts';

/**
 * Developers (PLAN §5.6, ADR 0008), after host decisions in the tick order.
 *
 * 1. Completions: units whose construction finishes this tick enter the stock, either for
 *    owner-occupiers (`forOwner`) or as purpose-built rentals (market rent) or non-market rentals
 *    (below-market rent). Rentals are always let long-term (vacant until matched).
 * 2. Market starts in zone z: Poisson with mean
 *      startsBase_z * (m_z / m_ref,z)^rho * exp(-h * (rate - rateRef)) * upzone_z,
 *    where m is the real asking rent, rate the policy rate (DATA path + shocks) and upzone_z the
 *    starts multiplier of the zone's upzoning, effective after the permit delay. Rental starts
 *    (share rentalShare_z at baseline) are further scaled by capFactor_z^capElasticity: a rent
 *    cap below inflation lowers the expected return of a rental building. Each start completes
 *    after a lag ~ U{lagMin..lagMax}.
 * 3. Non-market starts: the lever's units per quarter (real units), spread over zones in
 *    proportion to renter stock.
 */
export function developers(state: SimState): void {
  const { dwellings: dw, params, seed, tick, zones, derived } = state;

  // ---- completions
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] !== Tenure.CONSTRUCTION || dw.completeTick[d]! > tick) continue;
    state.acc.completions[dw.zone[d]!]!++;
    dw.tenant[d] = -1;
    if (dw.forOwner[d]) {
      dw.tenure[d] = Tenure.OWNER_OCC;
      dw.principalRes[d] = 1;
      scheduleBuy(state, d, tick);
    } else {
      dw.tenure[d] = Tenure.LTR;
    }
  }

  // ---- market starts
  const { rentElasticity, rateSemiElasticity, rateRef } = params.dev;
  const rateFactor = Math.exp(-rateSemiElasticity * (derived.policyRate - rateRef));
  zones.forEach((z, zi) => {
    const rental = z.rentalShare * Math.pow(derived.capFactor[zi]!, params.dev.capElasticity);
    const lambda =
      z.startsBase *
      Math.pow(z.marketRent / z.rentRef, rentElasticity) *
      rateFactor *
      derived.upzoneMult[zi]! *
      (1 - z.rentalShare + rental);
    const pRental = rental / (1 - z.rentalShare + rental);
    const k = poisson(lambda, seed, zi, tick, Purpose.DEV_START);
    for (let i = 0; i < k; i++) {
      const key = birthKey(tick, zi, i, false);
      const lag = drawLag(params, uniform(seed, key, tick, Purpose.DEV_LAG));
      const forOwner = uniform(seed, key, tick, Purpose.DEV_TENURE) >= pRental;
      addConstruction(state, zi, tick + lag, forOwner, RentalKind.PURPOSE_BUILT, key);
    }
    state.acc.starts[zi]! += k;
  });

  // ---- non-market starts (agents per month; stochastic rounding)
  const perMonth = (state.levers.nonMarket * params.scale) / 3;
  if (perMonth > 0) {
    const whole = Math.floor(perMonth);
    const k = whole + (uniform(seed, 0, tick, Purpose.NONMARKET_START) < perMonth - whole ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const key = birthKey(tick, 0, i, true);
      const zi = pickWeighted(
        state.base.renterWeights,
        uniform(seed, key, tick, Purpose.NONMARKET_ZONE),
      );
      const lag = drawLag(params, uniform(seed, key, tick, Purpose.DEV_LAG));
      addConstruction(state, zi, tick + lag, false, RentalKind.NON_MARKET, key);
      state.acc.starts[zi]!++;
    }
  }
}
