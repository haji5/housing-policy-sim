/// <reference lib="webworker" />
/**
 * Debrief runner (PLAN §6.4): replays the player's decisions under other calibrated model
 * variants, each paired with its own no-policy run (same seed and shocks, common random numbers),
 * and returns the effect paths for the fan charts. Several of these workers share the members.
 */
import { addPolicyEvents, collectOutput, createSim, ensembleParams, stepSim } from '@zoned-out/sim';
import type { PolicyEvent, RunOutput } from '@zoned-out/sim';

declare const self: DedicatedWorkerGlobalScope;

export interface DebriefRequest {
  id: number;
  scenario: string;
  seed: number;
  ticks: number;
  /** Player's decisions and the shock cards (shocks also go to the no-policy run). */
  decisions: PolicyEvent[];
  shocks: PolicyEvent[];
  members: number[];
}

/** One member's effect paths, one value per tick. */
export interface MemberPaths {
  member: number;
  /** log(covered listings with policy / without). */
  covered: number[];
  /** log(exempt listings with policy / without) (spillover). */
  exempt: number[];
  /** Asking-rent index gap, percent. */
  asking: number[];
  /** Rent-burden share gap, percentage points. */
  burden: number[];
}

export type DebriefResponse =
  | { id: number; type: 'member'; paths: MemberPaths }
  | { id: number; type: 'done' }
  | { id: number; type: 'error'; message: string };

function run(req: DebriefRequest, member: number, withPolicy: boolean): RunOutput {
  const s = createSim({
    scenario: req.scenario,
    params: ensembleParams(member),
    seed: req.seed,
    policy: [],
  });
  addPolicyEvents(s, withPolicy ? [...req.shocks, ...req.decisions] : req.shocks);
  for (let t = 0; t < req.ticks; t++) stepSim(s);
  return collectOutput(s);
}

function paths(member: number, pol: RunOutput, base: RunOutput): MemberPaths {
  const n = pol.series.tick.length;
  const sum = (o: RunOutput, covered: boolean, i: number) =>
    o.series.zones.reduce((a, z) => (z.covered === covered ? a + z.strListings[i]! : a), 0);
  const out: MemberPaths = { member, covered: [], exempt: [], asking: [], burden: [] };
  for (let i = 0; i < n; i++) {
    out.covered.push(Math.log(Math.max(1, sum(pol, true, i)) / Math.max(1, sum(base, true, i))));
    out.exempt.push(Math.log(Math.max(1, sum(pol, false, i)) / Math.max(1, sum(base, false, i))));
    out.asking.push(pol.series.askingRentIndex[i]! - base.series.askingRentIndex[i]!);
    out.burden.push(100 * (pol.series.rentBurdenShare[i]! - base.series.rentBurdenShare[i]!));
  }
  return out;
}

self.onmessage = (ev: MessageEvent<DebriefRequest>) => {
  const req = ev.data;
  try {
    for (const m of req.members) {
      const p = paths(m, run(req, m, true), run(req, m, false));
      self.postMessage({ id: req.id, type: 'member', paths: p } satisfies DebriefResponse);
    }
    self.postMessage({ id: req.id, type: 'done' } satisfies DebriefResponse);
  } catch (err) {
    self.postMessage({
      id: req.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies DebriefResponse);
  }
};
