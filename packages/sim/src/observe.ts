import type { SimState, TickRecord } from './types.ts';
import { HostClass, HouseholdStatus, RegStatus, RentalKind, Tenure } from './types.ts';

/**
 * Observation (PLAN §5.3 step 7): the true ("god view") state at the end of a tick.
 * The noisy researcher view (researcher.ts) is computed from these records.
 */
export function observe(state: SimState): TickRecord {
  const { dwellings: dw, households: hh, zones, derived } = state;
  const zr = zones.map((z, zi) => ({
    strListings: 0,
    strPrincipal: 0,
    strIllegal: 0,
    ltrOccupied: 0,
    ltrVacant: 0,
    ownerOcc: 0,
    marketRent: z.marketRent,
    occupancy: z.occupancy,
    strRegistered: 0,
    strExemptClaim: 0,
    strMulti: 0,
    vacantHeld: 0,
    construction: 0,
    starts: state.acc.starts[zi]!,
    completions: state.acc.completions[zi]!,
    sales: state.acc.sales[zi]!,
    nonMarket: 0,
    dwellings: 0,
  }));
  let qRent = 0;
  for (let d = 0; d < dw.n; d++) {
    const r = zr[dw.zone[d]!]!;
    if (dw.rentalKind[d] === RentalKind.NON_MARKET && dw.tenure[d] !== Tenure.CONSTRUCTION)
      r.nonMarket++;
    if (dw.tenure[d] !== Tenure.CONSTRUCTION) r.dwellings++;
    switch (dw.tenure[d]) {
      case Tenure.STR:
        r.strListings++;
        if (dw.principalRes[d]) r.strPrincipal++;
        else if (derived.coveredNow[dw.zone[d]!]) r.strIllegal++;
        if (dw.hostClass[d] !== HostClass.SINGLE) r.strMulti++;
        if (dw.registered[d] === RegStatus.REGISTERED) r.strRegistered++;
        else if (dw.registered[d] === RegStatus.EXEMPT_CLAIM) r.strExemptClaim++;
        break;
      case Tenure.LTR:
        if (dw.tenant[d]! >= 0) {
          r.ltrOccupied++;
          qRent += dw.rent[d]! / dw.quality[d]!;
        } else r.ltrVacant++;
        break;
      case Tenure.OWNER_OCC:
        r.ownerOcc++;
        break;
      case Tenure.VACANT:
        r.vacantHeld++;
        break;
      case Tenure.CONSTRUCTION:
        r.construction++;
        break;
    }
  }
  let housed = 0;
  let searching = 0;
  let doubledUp = 0;
  let gone = 0;
  let left = 0;
  let burdened = 0;
  const incomeMult = derived.shock.incomeMult;
  for (let h = 0; h < hh.n; h++) {
    switch (hh.status[h]) {
      case HouseholdStatus.HOUSED:
        housed++;
        if (dw.rent[hh.dwelling[h]!]! > 0.3 * hh.income[h]! * incomeMult) burdened++;
        break;
      case HouseholdStatus.SEARCHING:
        searching++;
        break;
      case HouseholdStatus.DOUBLED_UP:
        doubledUp++;
        break;
      case HouseholdStatus.GONE:
        gone++;
        break;
      case HouseholdStatus.LEFT:
        left++;
        break;
    }
  }
  const occupied = zr.reduce((a, z) => a + z.ltrOccupied, 0);
  const asking = zones.reduce((a, z, zi) => a + z.marketRent * state.base.renterWeights[zi]!, 0);
  return {
    zones: zr,
    housed,
    searching,
    doubledUp,
    gone,
    left,
    cpiRentIndex: (100 * qRent) / Math.max(1, occupied) / state.base.cpiIndexBase,
    askingRentIndex: (100 * asking) / state.base.askingIndexBase,
    rentBurdenShare: burdened / Math.max(1, housed),
    fines: state.acc.fines,
    vacancyTaxRevenue: zr.reduce((a, z) => a + z.vacantHeld, 0) * derived.vacancyTaxMonthly,
    policyRate: derived.policyRate,
  };
}
