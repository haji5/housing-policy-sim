import { shockCard } from './shocks.ts';
import type { LeverState, PolicyEvent, StrRegimeCode } from './types.ts';
import { RentCap, StrRegime } from './types.ts';

/**
 * Policy calendar of the Historical Bill 35 preset, in ticks from Sep 2023 (PLAN §2):
 * Oct 2023 announced (t=1), May 2024 Phase 1 (t=8), May 2025 Phase 2 (t=20).
 * Salt Spring's Nov 2025 opt-in is a zone attribute (optInTick) in the Victoria scenario.
 */
export const HISTORICAL_TICKS = { announced: 1, phase1: 8, phase2: 20 } as const;

export const DEFAULT_LEVERS: Readonly<LeverState> = {
  strRegime: StrRegime.OPEN,
  enforcement: 2,
  announced: 0,
  vacancyTax: 0,
  rentCap: RentCap.MEDIUM,
  upzone: [],
  nonMarket: 0,
  shocks: [],
};

export const POLICY_PRESETS = {
  none: [],
  historical: [
    { tick: HISTORICAL_TICKS.announced, lever: 'announced', value: 1 },
    { tick: HISTORICAL_TICKS.phase1, lever: 'strRegime', value: StrRegime.PRINCIPAL_RESIDENCE },
    { tick: HISTORICAL_TICKS.phase2, lever: 'strRegime', value: StrRegime.PR_REGISTRY },
  ],
} satisfies Record<string, PolicyEvent[]>;

export function resolvePolicy(policy: PolicyEvent[] | string): PolicyEvent[] {
  if (typeof policy !== 'string') return policy;
  const p = (POLICY_PRESETS as Record<string, PolicyEvent[] | undefined>)[policy];
  if (!p)
    throw new Error(
      `Unknown policy preset "${policy}". Known: ${Object.keys(POLICY_PRESETS).join(', ')}`,
    );
  return p;
}

/** Stable order: by tick, then by original position (events at the same tick apply in order). */
export function sortEvents(events: readonly PolicyEvent[]): PolicyEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.tick - b.e.tick || a.i - b.i)
    .map(({ e }) => ({ ...e }));
}

/** Lever state in force at `tick`: defaults overridden by every event with event.tick <= tick. */
export function leversAt(events: readonly PolicyEvent[], tick: number): LeverState {
  const s: LeverState = { ...DEFAULT_LEVERS, upzone: [], shocks: [] };
  for (const e of events) {
    if (e.tick > tick) break;
    switch (e.lever) {
      case 'strRegime':
        s.strRegime = clampInt(e.value, 0, 2) as StrRegimeCode;
        break;
      case 'enforcement':
        s.enforcement = clampInt(e.value, 0, 5);
        break;
      case 'announced':
        s.announced = e.value ? 1 : 0;
        break;
      case 'vacancyTax':
        s.vacancyTax = clampInt(e.value, 0, 3);
        break;
      case 'rentCap':
        s.rentCap = clampInt(e.value, 0, 2);
        break;
      case 'upzone': {
        const z = e.zone ?? -1;
        if (!Number.isInteger(z) || z < 0) throw new Error('upzone event needs a zone index');
        while (s.upzone.length <= z) s.upzone.push(0);
        s.upzone[z] = clampInt(e.value, 0, 2);
        break;
      }
      case 'nonMarket':
        s.nonMarket = Math.max(0, Math.round(e.value));
        break;
      case 'shock':
        if (tick < e.tick + shockCard(e.value).durationTicks) s.shocks.push(e.value);
        break;
    }
  }
  return s;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(v)));
}
