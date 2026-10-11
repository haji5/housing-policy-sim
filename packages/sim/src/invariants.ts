import type { SimState } from './types.ts';
import { HouseholdStatus, Tenure } from './types.ts';

const TENURES = new Set<number>(Object.values(Tenure));
const STATUSES = new Set<number>(Object.values(HouseholdStatus));

/**
 * Conservation and consistency checks (PLAN §8.1). Returns a list of violations (empty = OK).
 * Used by tests; cheap enough to call every tick in debug runs.
 */
export function checkInvariants(state: SimState): string[] {
  const errs: string[] = [];
  const { dwellings: dw, households: hh, zones } = state;
  const push = (m: string) => {
    if (errs.length < 20) errs.push(m);
  };

  for (let d = 0; d < dw.n; d++) {
    const t = dw.tenure[d]!;
    if (!TENURES.has(t)) push(`dwelling ${d}: invalid tenure ${t}`);
    if (dw.zone[d]! >= zones.length) push(`dwelling ${d}: invalid zone`);
    if (dw.principalRes[d] && t !== Tenure.OWNER_OCC && t !== Tenure.STR)
      push(`dwelling ${d}: principal residence in tenure ${t}`);
    if (!dw.principalRes[d] && t === Tenure.OWNER_OCC)
      push(`dwelling ${d}: investor unit owner-occupied`);
    if (t === Tenure.CONSTRUCTION && dw.completeTick[d]! < state.tick)
      push(`dwelling ${d}: construction past its completion tick`);
    if (dw.rentalKind[d] && t !== Tenure.LTR && t !== Tenure.CONSTRUCTION)
      push(`dwelling ${d}: purpose-built or non-market rental in tenure ${t}`);
    const h = dw.tenant[d]!;
    if (h >= 0) {
      if (t !== Tenure.LTR) push(`dwelling ${d}: tenant in non-LTR tenure ${t}`);
      if (h >= hh.n) push(`dwelling ${d}: tenant ${h} out of range`);
      else if (hh.dwelling[h] !== d) push(`dwelling ${d}: tenant ${h} points to ${hh.dwelling[h]}`);
      if (!(Number.isFinite(dw.rent[d]) && dw.rent[d]! > 0))
        push(`dwelling ${d}: bad rent ${dw.rent[d]}`);
    }
  }

  for (let h = 0; h < hh.n; h++) {
    const st = hh.status[h]!;
    if (!STATUSES.has(st)) push(`household ${h}: invalid status ${st}`);
    const d = hh.dwelling[h]!;
    if (st === HouseholdStatus.HOUSED) {
      if (d < 0 || d >= dw.n) push(`household ${h}: housed without dwelling`);
      else if (dw.tenant[d] !== h) push(`household ${h}: dwelling ${d} has tenant ${dw.tenant[d]}`);
    } else if (d !== -1) push(`household ${h}: status ${st} but holds dwelling ${d}`);
    if (!(Number.isFinite(hh.income[h]) && hh.income[h]! > 0)) push(`household ${h}: bad income`);
  }

  zones.forEach((z, zi) => {
    if (!(Number.isFinite(z.marketRent) && z.marketRent > 0)) push(`zone ${zi}: bad market rent`);
    if (!(z.occupancy >= 0 && z.occupancy <= 1)) push(`zone ${zi}: occupancy out of [0,1]`);
  });
  return errs;
}
