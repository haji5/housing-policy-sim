import { poisson, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { HouseholdStatus } from '../types.ts';
import { drawIncome, pickWeighted, reserveHouseholds } from '../world.ts';
import { newLeaseRent } from './rentalMarket.ts';

/**
 * Exogenous update (ODD §3, step 1): household arrivals from migration, and ordinary tenant
 * turnover. A housed household leaves the region with probability exitHazard (status LEFT) or
 * moves within the region with probability moveHazard * exp(-k * discount) (back to SEARCHING),
 * where discount is how far its rent is below the unit's current new-lease rent: tenants with a
 * good deal move less (ADR 0007). The unit it vacates is flagged `due` so its owner decides on its
 * use this tick.
 *
 * Arrivals respond to asking rents and vacancy, grow with the baseline flow of new rental homes
 * (ADR 0008), and are scaled by shock cards.
 */
export function exogenousUpdate(state: SimState): void {
  const { households: hh, dwellings: dw, params, seed, tick } = state;
  const { exitHazard, moveHazard, mobilityDiscountElasticity: kMob } = params.rental;

  // Turnover first, over the households that existed at the start of the tick.
  for (let h = 0; h < hh.n; h++) {
    if (hh.status[h] !== HouseholdStatus.HOUSED) continue;
    const exit = uniform(seed, h, tick, Purpose.TENANT_EXIT) < exitHazard;
    const d = hh.dwelling[h]!;
    let move = false;
    if (!exit) {
      const market = newLeaseRent(state, d, state.zones[dw.zone[d]!]!.marketRent);
      const discount = Math.max(0, 1 - dw.rent[d]! / market);
      move = uniform(seed, h, tick, Purpose.TENANT_MOVE) < moveHazard * Math.exp(-kMob * discount);
    }
    if (!exit && !move) continue;
    dw.tenant[d] = -1;
    dw.due[d] = 1;
    hh.dwelling[h] = -1;
    hh.searchMonths[h] = 0;
    if (exit) hh.status[h] = HouseholdStatus.LEFT;
    else {
      hh.status[h] = HouseholdStatus.SEARCHING;
      hh.prefZone[h] = dw.zone[d]!;
    }
  }

  // Arrivals.
  // Arrivals respond to asking rents (fixed-weight index): cheaper housing draws more households.
  const asking = state.zones.reduce(
    (a, z, zi) => a + z.marketRent * state.base.renterWeights[zi]!,
    0,
  );
  // ...and to how easy it is to find a place (vacancy gap), which damps the rent cycle.
  const v = totalVacancy(state);
  const lambda =
    (state.base.arrivalsPerMonth + state.base.rentalCompletionsPerMonth) *
    Math.pow(asking / state.base.askingRent, -params.rental.arrivalRentElasticity) *
    Math.exp(params.rental.arrivalVacancySemiElasticity * (v - params.rental.vStar)) *
    state.derived.shock.arrivalsMult;
  const k = poisson(lambda, seed, 0, tick, Purpose.ARRIVALS);
  reserveHouseholds(hh, k);
  for (let i = 0; i < k; i++) {
    const h = hh.n++;
    hh.income[h] = drawIncome(params, seed, h);
    hh.dwelling[h] = -1;
    hh.status[h] = HouseholdStatus.SEARCHING;
    hh.searchMonths[h] = 0;
    hh.prefZone[h] = pickWeighted(
      state.base.renterWeights,
      uniform(seed, h, 0, Purpose.HH_PREF_ZONE),
    );
  }
}

function totalVacancy(state: SimState): number {
  let vac = 0;
  let all = 0;
  state.zones.forEach((_, zi) => {
    const w = state.base.renterWeights[zi]!;
    vac += state.derived.vacancy[zi]! * w;
    all += w;
  });
  return vac / Math.max(1, all);
}
