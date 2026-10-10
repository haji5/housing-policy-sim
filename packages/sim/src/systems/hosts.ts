import { gumbel, Purpose, uniform } from '../rng.ts';
import type { SimState } from '../types.ts';
import { StrRegime, Tenure } from '../types.ts';
import { anticipatedPenalty, illegalPenalty } from './enforcement.ts';

/**
 * Host decisions (PLAN §5.4), M1 subset: investor-owned units choose STR vs LTR; principal-residence
 * owners choose whether to list their home. Choices are multinomial logit, implemented with keyed
 * Gumbel draws (argmax of U_k + scale * G_k) so draws are common across counterfactual runs.
 *
 * Who decides this tick:
 *  - investor STR units and vacant investor LTR units review with probability pReview;
 *  - occupied LTR units do not review (sitting tenants are not displaced for STR conversion);
 *  - a unit whose tenant just left is `due` and decides with probability 1.
 */
export function hostDecisions(state: SimState): void {
  const { dwellings: dw, params, seed, tick, zones, derived } = state;
  const { beta, gumbelScale: sigma, pReview, prReview, prBeta } = params.host;
  const regCost = params.enforcement.registrationCost;

  for (let d = 0; d < dw.n; d++) {
    const t = dw.tenure[d];
    const zi = dw.zone[d]!;

    if (dw.principalRes[d]) {
      if (uniform(seed, d, tick, Purpose.PR_REVIEW) >= prReview) continue;
      const registryCost =
        state.levers.strRegime >= StrRegime.PR_REGISTRY && derived.coveredNow[zi] ? regCost : 0;
      const uList =
        zones[zi]!.ascPr +
        prBeta * (derived.strNet[zi]! - registryCost) +
        sigma * gumbel(seed, d, tick, Purpose.PR_CHOICE, 1);
      const uNot = sigma * gumbel(seed, d, tick, Purpose.PR_CHOICE, 0);
      dw.tenure[d] = uList > uNot ? Tenure.STR : Tenure.OWNER_OCC;
      dw.registered[d] = dw.tenure[d] === Tenure.STR && registryCost > 0 ? 1 : 0;
      continue;
    }

    if (t === Tenure.LTR && dw.tenant[d]! >= 0) continue;
    const due = dw.due[d] === 1;
    dw.due[d] = 0;
    if (!due && uniform(seed, d, tick, Purpose.HOST_REVIEW) >= pReview) continue;

    const illegal = derived.coveredNow[zi];
    const strAvailable = !(illegal && dw.compliant[d]);
    const uLtr = beta * derived.ltrNet[zi]! + sigma * gumbel(seed, d, tick, Purpose.HOST_CHOICE, 0);
    let uStr = Number.NEGATIVE_INFINITY;
    if (strAvailable) {
      const penalty = illegal ? illegalPenalty(state, zi) : anticipatedPenalty(state, zi);
      uStr =
        zones[zi]!.ascStr +
        beta * (derived.strNet[zi]! - penalty) +
        sigma * gumbel(seed, d, tick, Purpose.HOST_CHOICE, 1);
    }
    if (uStr > uLtr) {
      dw.tenure[d] = Tenure.STR;
    } else if (t === Tenure.STR) {
      dw.tenure[d] = Tenure.LTR;
      dw.tenant[d] = -1;
    }
  }
}
