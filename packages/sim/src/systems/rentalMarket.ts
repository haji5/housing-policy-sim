import { hash32, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { HouseholdStatus, Tenure } from '../types.ts';
import { pickWeighted } from '../world.ts';

/**
 * Rental market (PLAN §5.5), M1 version.
 *
 * 1. Each searching household targets its preferred zone, or with probability
 *    searchOtherZoneProb another zone chosen in proportion to renter stock.
 * 2. Per zone, M = min(S, V, A * sqrt(S * V)) matches (stochastically rounded). Searchers are taken
 *    in a hashed random order; each takes the first affordable vacant unit (new-lease rent
 *    <= maxRentShare * income) scanning from a hashed start position.
 * 3. Asking rents adjust: d log m = kappa * (vStar - v) + drift.
 * 4. Sitting-tenant rents adjust on lease anniversaries by min(cap, phi * gap to market), never down.
 */
export function rentalMarket(state: SimState): void {
  const { households: hh, dwellings: dw, params, seed, tick, zones } = state;
  const nZ = zones.length;
  const {
    maxRentShare,
    searchOtherZoneProb: psi,
    kappa,
    vStar,
    phi,
    rentCapAnnual,
  } = params.rental;

  // ---- vacant units and searchers per zone
  const vacant: number[][] = Array.from({ length: nZ }, () => []);
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] === Tenure.LTR && dw.tenant[d]! < 0) vacant[dw.zone[d]!]!.push(d);
  }
  const searchers: number[][] = Array.from({ length: nZ }, () => []);
  for (let h = 0; h < hh.n; h++) {
    const st = hh.status[h];
    if (st !== HouseholdStatus.SEARCHING && st !== HouseholdStatus.DOUBLED_UP) continue;
    let z = hh.prefZone[h]!;
    if (nZ > 1 && uniform(seed, h, tick, Purpose.SEARCH_ZONE) < psi) {
      // Another zone, in proportion to its renter stock.
      const w = state.base.renterWeights.map((x, zi) => (zi === z ? 0 : x));
      z = pickWeighted(w, uniform(seed, h, tick, Purpose.SEARCH_ZONE, 1));
    }
    searchers[z]!.push(h);
  }

  // ---- matching
  for (let zi = 0; zi < nZ; zi++) {
    const V = vacant[zi]!;
    const S = searchers[zi]!;
    if (V.length === 0 || S.length === 0) continue;
    const raw = zones[zi]!.matchEff * Math.sqrt(S.length * V.length);
    const frac = raw - Math.floor(raw);
    const target = Math.floor(raw) + (uniform(seed, zi, tick, Purpose.MATCH_ROUND) < frac ? 1 : 0);
    const M = Math.min(S.length, V.length, target);
    if (M <= 0) continue;

    const keys = new Map<number, number>();
    for (const h of S) keys.set(h, hash32(seed, h, tick, Purpose.MATCH_ORDER));
    S.sort((a, b) => keys.get(a)! - keys.get(b)! || a - b);

    const m = zones[zi]!.marketRent;
    let matches = 0;
    for (const h of S) {
      if (matches >= M || V.length === 0) break;
      const budget = maxRentShare * hh.income[h]!;
      const start = Math.floor(uniform(seed, h, tick, Purpose.MATCH_UNIT) * V.length);
      let found = -1;
      for (let j = 0; j < V.length; j++) {
        const idx = (start + j) % V.length;
        if (m * dw.quality[V[idx]!]! <= budget) {
          found = idx;
          break;
        }
      }
      if (found < 0) continue;
      const d = V[found]!;
      V[found] = V[V.length - 1]!;
      V.pop();
      dw.tenant[d] = h;
      dw.rent[d] = m * dw.quality[d]!;
      dw.leaseStart[d] = tick;
      dw.due[d] = 0;
      hh.dwelling[h] = d;
      hh.status[h] = HouseholdStatus.HOUSED;
      hh.searchMonths[h] = 0;
      matches++;
    }
  }

  // ---- asking rents
  const occ = new Array<number>(nZ).fill(0);
  const vac = new Array<number>(nZ).fill(0);
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenure[d] !== Tenure.LTR) continue;
    if (dw.tenant[d]! >= 0) occ[dw.zone[d]!]!++;
    else vac[dw.zone[d]!]!++;
  }
  const drift = Math.log(1 + state.scenario.rentDriftAnnual) / 12;
  zones.forEach((z, zi) => {
    const v = vac[zi]! / Math.max(1, occ[zi]! + vac[zi]!);
    z.marketRent *= Math.exp(kappa * (vStar - v) + drift);
  });

  // ---- sitting-tenant anniversaries
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenant[d]! < 0) continue;
    const age = tick - dw.leaseStart[d]!;
    if (age <= 0 || age % 12 !== 0) continue;
    const target = zones[dw.zone[d]!]!.marketRent * dw.quality[d]!;
    const gap = target / dw.rent[d]! - 1;
    dw.rent[d]! *= 1 + Math.min(rentCapAnnual, Math.max(0, phi * gap));
  }
}
