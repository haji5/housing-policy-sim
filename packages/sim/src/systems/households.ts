import type { SimState } from '../types.ts';
import { HouseholdStatus } from '../types.ts';

/**
 * Household stress transitions (ODD §7.5): searching longer than kDouble months => DOUBLED_UP
 * (still searching); longer than kLeave => GONE (leaves the region because of housing stress).
 */
export function householdUpdate(state: SimState): void {
  const { households: hh, params } = state;
  const { kDouble, kLeave } = params.households;
  for (let h = 0; h < hh.n; h++) {
    const st = hh.status[h];
    if (st !== HouseholdStatus.SEARCHING && st !== HouseholdStatus.DOUBLED_UP) continue;
    const months = hh.searchMonths[h]! + 1;
    hh.searchMonths[h] = months;
    if (months > kLeave) hh.status[h] = HouseholdStatus.GONE;
    else if (months > kDouble) hh.status[h] = HouseholdStatus.DOUBLED_UP;
  }
}
