import { ENSEMBLE, researcherPanel, twoWayFE } from '@zoned-out/sim';
import type { PanelRow, PolicyEvent, RunOutput } from '@zoned-out/sim';
import type { DebriefRequest, DebriefResponse, MemberPaths } from '../workers/debrief.worker.ts';

/** Model variants replayed in the debrief (spread evenly through the ensemble). */
export const DEBRIEF_MEMBERS = 32;
const WORKERS = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));

export function debriefMembers(player: number): number[] {
  const n = ENSEMBLE.sets.length;
  if (n === 0) return [];
  const k = Math.min(DEBRIEF_MEMBERS, n);
  const out = Array.from({ length: k }, (_, i) => Math.floor((i * n) / k));
  if (player >= 0 && !out.includes(player)) out[0] = player;
  return out;
}

/**
 * Replay the player's decisions under each member on a small worker pool. Calls onProgress with
 * every finished member; resolves with all of them.
 */
export function runDebrief(
  req: Omit<DebriefRequest, 'id' | 'members'>,
  members: number[],
  onProgress: (done: number, total: number) => void,
): Promise<MemberPaths[]> {
  const chunks: number[][] = Array.from({ length: WORKERS }, () => []);
  members.forEach((m, i) => chunks[i % WORKERS]!.push(m));
  const results: MemberPaths[] = [];
  const workers: Worker[] = [];
  return new Promise<MemberPaths[]>((resolve, reject) => {
    let finished = 0;
    const active = chunks.filter((c) => c.length > 0);
    active.forEach((chunk, w) => {
      const worker = new Worker(new URL('../workers/debrief.worker.ts', import.meta.url), {
        type: 'module',
      });
      workers.push(worker);
      worker.onmessage = (ev: MessageEvent<DebriefResponse>) => {
        const msg = ev.data;
        if (msg.type === 'member') {
          results.push(msg.paths);
          onProgress(results.length, members.length);
        } else if (msg.type === 'done') {
          worker.terminate();
          if (++finished === active.length) resolve(results.sort((a, b) => a.member - b.member));
        } else {
          workers.forEach((x) => x.terminate());
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        workers.forEach((x) => x.terminate());
        reject(new Error(e.message));
      };
      worker.postMessage({ ...req, id: w, members: chunk } satisfies DebriefRequest);
    });
  });
}

/** Per-tick quantiles of a set of equal-length paths. */
export function fan(paths: number[][], qs: readonly number[]): number[][] {
  const n = paths[0]?.length ?? 0;
  return qs.map((q) =>
    Array.from({ length: n }, (_, i) => {
      const v = paths.map((p) => p[i]!).sort((a, b) => a - b);
      const pos = q * (v.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      return v[lo]! + (v[hi]! - v[lo]!) * (pos - lo);
    }),
  );
}

export interface DidCard {
  /** False when there is nothing to estimate or the DiD is not identified (see `reason`). */
  applicable: boolean;
  /**
   * Why not: 'no-rule' = the STR rule was never on (long enough); 'no-pre' = no complete snapshot
   * before the rule, so "covered × rule in force" is collinear with the zone fixed effects.
   */
  reason: 'no-rule' | 'no-pre' | null;
  estimate: number;
  truth: number;
  /** Change in exempt-area listings caused by the policy (spillover), log points. */
  spillover: number;
  snapshots: number;
  dropped: number;
}

/**
 * The researcher's DiD in the player's own world (VALIDATION §3, ADR 0006): quarterly scraped
 * snapshots, flagged ones dropped, log(1 + listings) on "covered × rule in force" with zone and
 * snapshot fixed effects. The truth is the mean policy-minus-no-policy log gap in covered
 * listings over the snapshots with the rule in force (paired runs, so it is exact).
 */
export function didCard(
  policy: RunOutput,
  base: RunOutput,
  seed: number,
  ruleOnFrom: number | null,
): DidCard {
  const ticks = policy.series.tick;
  const last = ticks[ticks.length - 1] ?? 0;
  const snaps: number[] = [];
  for (let t = 0; t <= last; t += 3) snaps.push(t);
  const empty = (reason: 'no-rule' | 'no-pre'): DidCard => ({
    applicable: false,
    reason,
    estimate: 0,
    truth: 0,
    spillover: 0,
    snapshots: snaps.length,
    dropped: 0,
  });
  if (ruleOnFrom === null || ruleOnFrom > last - 3) return empty('no-rule');
  const panel = researcherPanel(policy, seed, snaps);
  const kept = snaps.filter((_, k) => !panel.incomplete[k]);
  if (!kept.some((t) => t < ruleOnFrom)) return empty('no-pre');
  if (!kept.some((t) => t >= ruleOnFrom)) return empty('no-rule');
  const zones = policy.series.zones;
  const rows: PanelRow[] = [];
  snaps.forEach((t, k) => {
    if (panel.incomplete[k]) return;
    zones.forEach((z, zi) => {
      rows.push({
        unit: zi,
        time: t,
        y: Math.log(1 + panel.observed[zi]![k]!),
        x: [z.covered && t >= ruleOnFrom ? 1 : 0],
      });
    });
  });
  const estimate = twoWayFE(rows, 1)[0]!;
  const f = policy.meta.firstTick;
  const sum = (o: RunOutput, covered: boolean, t: number) =>
    o.series.zones.reduce((a, z) => (z.covered === covered ? a + z.strListings[t - f]! : a), 0);
  const post = snaps.filter((t) => t >= ruleOnFrom);
  const gap = (covered: boolean) =>
    post.reduce(
      (a, t) =>
        a + Math.log(Math.max(1, sum(policy, covered, t)) / Math.max(1, sum(base, covered, t))),
      0,
    ) / post.length;
  return {
    applicable: true,
    reason: null,
    estimate,
    truth: gap(true),
    spillover: gap(false),
    snapshots: snaps.length,
    dropped: panel.incomplete.filter(Boolean).length,
  };
}

/** First tick at which the STR rule was switched on and stayed on, from the decision events. */
export function ruleOnFrom(events: readonly PolicyEvent[]): number | null {
  let from: number | null = null;
  for (const e of [...events].sort((a, b) => a.tick - b.tick)) {
    if (e.lever !== 'strRegime') continue;
    if (e.value > 0 && from === null) from = e.tick;
    if (e.value === 0) from = null;
  }
  return from;
}
