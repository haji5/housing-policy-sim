import { stepSim } from './step.ts';
import { updateDerived } from './systems/enforcement.ts';
import type { RunConfig, SimState } from './types.ts';
import { Tenure } from './types.ts';
import { buildWorld, emptyAcc, logit } from './world.ts';

/** Feedback gains of the spin-up controllers (per month). */
const ASC_GAIN = 0.3;
const MATCH_GAIN = 3.0;

/**
 * Build a world and, if the scenario asks for it, spin it up (ADR 0005).
 *
 * Spin-up runs `scenario.spinUpMonths` months before the first recorded tick with no policy.
 * Each month two controllers nudge derived constants toward the scenario's observed start:
 *   - investor and PR STR ASCs move by ASC_GAIN × (logit(target share) − logit(current share)),
 *   - the held-vacant ASC likewise targets the starting held-vacant share of investor units,
 *   - the sell ASC targets the starting investor share of the stock (sales balance purchases),
 *   - matching efficiency moves by exp(MATCH_GAIN × (vacancy − v*)).
 * At the freeze, developers' reference rents are set to the current asking rents (ADR 0008).
 * The constants are then frozen, history is cleared and the reported indices are rebased, so
 * every run starts from the model's own steady state rather than an analytical approximation.
 */
export function createSim(config: RunConfig): SimState {
  const state = buildWorld(config);
  const months = Math.max(0, Math.floor(state.scenario.spinUpMonths ?? 0));
  if (months > 0) spinUp(state, months);
  return state;
}

function shares(state: SimState) {
  const nZ = state.zones.length;
  const inv = new Array<number>(nZ).fill(0);
  const held = new Array<number>(nZ).fill(0);
  const invStr = new Array<number>(nZ).fill(0);
  const own = new Array<number>(nZ).fill(0);
  const ownStr = new Array<number>(nZ).fill(0);
  const ltr = new Array<number>(nZ).fill(0);
  const vac = new Array<number>(nZ).fill(0);
  const dw = state.dwellings;
  for (let d = 0; d < dw.n; d++) {
    const z = dw.zone[d]!;
    const t = dw.tenure[d];
    if (t === Tenure.CONSTRUCTION || dw.rentalKind[d]) continue;
    if (dw.principalRes[d]) {
      own[z]!++;
      if (t === Tenure.STR) ownStr[z]!++;
    } else {
      inv[z]!++;
      if (t === Tenure.STR) invStr[z]!++;
      else if (t === Tenure.VACANT) held[z]!++;
      else if (t === Tenure.LTR) {
        ltr[z]!++;
        if (dw.tenant[d]! < 0) vac[z]!++;
      }
    }
  }
  return {
    inv: invStr.map((s, z) => s / Math.max(1, inv[z]!)),
    pr: ownStr.map((s, z) => s / Math.max(1, own[z]!)),
    held: held.map((s, z) => s / Math.max(1, inv[z]!)),
    invStock: inv.map((s, z) => s / Math.max(1, s + own[z]!)),
    vac: vac.map((v, z) => v / Math.max(1, ltr[z]!)),
  };
}

function spinUp(state: SimState, months: number): void {
  const target = shares(state);
  const policy = state.policy;
  state.policy = [];
  const dw = state.dwellings;
  const vStar = state.params.rental.vStar;
  for (let i = 0; i < months; i++) {
    stepSim(state);
    const now = shares(state);
    state.zones.forEach((z, zi) => {
      const dInv = ASC_GAIN * (logit(target.inv[zi]!) - logit(now.inv[zi]!));
      z.ascStr = z.ascStr.map((a) => a + dInv);
      z.ascPr += ASC_GAIN * (logit(target.pr[zi]!) - logit(now.pr[zi]!));
      z.ascVac += ASC_GAIN * (logit(target.held[zi]!) - logit(now.held[zi]!));
      z.ascSell += ASC_GAIN * (logit(now.invStock[zi]!) - logit(target.invStock[zi]!));
      z.matchEff *= Math.exp(MATCH_GAIN * (now.vac[zi]! - vStar));
    });
  }
  // Freeze: restore the policy schedule, clear history, rebase the reported indices.
  state.policy = policy;
  state.history = [];
  state.acc = emptyAcc(state.zones.length);
  updateDerived(state);
  let qRent = 0;
  let occupied = 0;
  for (let d = 0; d < dw.n; d++) {
    if (dw.tenant[d]! >= 0) {
      qRent += dw.rent[d]! / dw.quality[d]!;
      occupied++;
    }
  }
  state.base.cpiIndexBase = qRent / Math.max(1, occupied);
  state.base.askingIndexBase = state.zones.reduce(
    (a, z, zi) => a + z.marketRent * state.base.renterWeights[zi]!,
    0,
  );
  state.zones.forEach((z, zi) => {
    z.strNet0 = state.derived.strNet[zi]!;
    z.baselineServedStr = z.occupancy * countStr(state, zi);
    z.rentRef = z.marketRent;
  });
}

function countStr(state: SimState, zi: number): number {
  const dw = state.dwellings;
  let n = 0;
  for (let d = 0; d < dw.n; d++) if (dw.zone[d] === zi && dw.tenure[d] === Tenure.STR) n++;
  return n;
}
