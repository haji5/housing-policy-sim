import { gumbel, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { HostClass, RegStatus, StrRegime, Tenure } from '../types.ts';
import { classBeta, classCompliance } from '../world.ts';
import { anticipatedPenalty, illegalPenalty } from './enforcement.ts';

/**
 * Host decisions (PLAN §5.4): investor-owned units choose STR vs LTR; principal-residence owners
 * choose whether to list their home. Choices are multinomial logit, implemented with keyed Gumbel
 * draws (argmax of U_k + scale * G_k) so draws are common across counterfactual runs.
 *
 * Who decides this tick:
 *  - investor STR units and vacant investor LTR units review with probability pReview;
 *  - occupied LTR units do not review (sitting tenants are not displaced for STR conversion);
 *  - a unit whose tenant just left, or that an investor just bought, is `due` and decides now.
 *
 * Under the registry regime every listing bears the registration cost, except hosts who claim
 * an exemption.
 */
export function hostDecisions(state: SimState): void {
  investorEntry(state);
  const { dwellings: dw, params, seed, tick, zones, derived } = state;
  const { gumbelScale: sigma, pReview, prReview, prBeta } = params.host;
  const registry = state.levers.strRegime >= StrRegime.PR_REGISTRY;
  const regCost = registry ? params.enforcement.registrationCost : 0;

  for (let d = 0; d < dw.n; d++) {
    const t = dw.tenure[d];
    const zi = dw.zone[d]!;
    const cost = dw.claimsExempt[d] ? 0 : regCost;

    if (dw.principalRes[d]) {
      if (uniform(seed, d, tick, Purpose.PR_REVIEW) >= prReview) continue;
      const uList =
        zones[zi]!.ascPr +
        prBeta * (derived.strNet[zi]! - cost) +
        sigma * gumbel(seed, d, tick, Purpose.PR_CHOICE, 1);
      const uNot = sigma * gumbel(seed, d, tick, Purpose.PR_CHOICE, 0);
      const list = uList > uNot;
      if (!list && t === Tenure.STR) dw.registered[d] = RegStatus.NONE;
      dw.tenure[d] = list ? Tenure.STR : Tenure.OWNER_OCC;
      continue;
    }

    if (t === Tenure.LTR && dw.tenant[d]! >= 0) continue;
    const due = dw.due[d] === 1;
    dw.due[d] = 0;
    if (!due && uniform(seed, d, tick, Purpose.HOST_REVIEW) >= pReview) continue;

    const c = dw.hostClass[d]!;
    const beta = classBeta(params, c);
    const illegal = derived.coveredNow[zi]!;
    const strAvailable = !(illegal && dw.compliant[d]);
    const uLtr = beta * derived.ltrNet[zi]! + sigma * gumbel(seed, d, tick, Purpose.HOST_CHOICE, 0);
    let uStr = Number.NEGATIVE_INFINITY;
    if (strAvailable) {
      const penalty = illegal
        ? illegalPenalty(state, zi, dw.claimsExempt[d] === 1)
        : anticipatedPenalty(state, zi);
      uStr =
        zones[zi]!.ascStr[c]! +
        beta * (derived.strNet[zi]! - penalty - cost) +
        sigma * gumbel(seed, d, tick, Purpose.HOST_CHOICE, 1);
    }
    if (uStr > uLtr) {
      dw.tenure[d] = Tenure.STR;
    } else if (t === Tenure.STR) {
      dw.tenure[d] = Tenure.LTR;
      dw.tenant[d] = -1;
      dw.registered[d] = RegStatus.NONE;
    }
  }
}

/**
 * Investor entry (PLAN §5.4 spillover): in zones where the rule does not bind, a non-listing
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
    if (dw.tenure[d] !== Tenure.OWNER_OCC) continue;
    const pz = p[dw.zone[d]!]!;
    if (pz <= 0 || uniform(seed, d, tick, Purpose.INVESTOR_ENTRY) >= pz) continue;
    dw.principalRes[d] = 0;
    dw.hostClass[d] = HostClass.COMMERCIAL;
    dw.compliant[d] =
      uniform(seed, d, 0, Purpose.HOST_COMPLIANT) < classCompliance(params, HostClass.COMMERCIAL)
        ? 1
        : 0;
    dw.tenure[d] = Tenure.LTR;
    dw.tenant[d] = -1;
    dw.due[d] = 1;
  }
}
