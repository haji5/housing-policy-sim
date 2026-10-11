import { tickToLabel } from './calendar.ts';
import { hashObject } from './hash.ts';
import { sortEvents } from './policy.ts';
import { stepSim } from './step.ts';
import type { PolicyEvent, RunConfig, RunOutput, SimState } from './types.ts';
import { createSim } from './create.ts';

export interface RunSimConfig extends RunConfig {
  ticks: number;
}

/** Add policy events (e.g. a player's lever changes). Events in the past are rejected. */
export function addPolicyEvents(state: SimState, events: readonly PolicyEvent[]): void {
  if (events.length === 0) return;
  for (const e of events) {
    if (e.tick < state.tick)
      throw new Error(`Policy event at tick ${e.tick} is in the past (now ${state.tick})`);
  }
  state.policy = sortEvents([...state.policy, ...events]);
}

/** Columnar time series of everything recorded so far. */
export function collectOutput(state: SimState): RunOutput {
  const H = state.history;
  // History starts at the first simulated tick (negative when the run has pre-ticks).
  const t0 = state.tick - H.length;
  const col = <T>(f: (r: (typeof H)[number]) => T) => H.map(f);
  return {
    meta: {
      scenario: state.scenario.id,
      seed: state.seed,
      ticks: H.length,
      scale: state.params.scale,
      agents: state.dwellings.n + state.households.n,
      paramsHash: hashObject(state.params),
      policy: state.policy,
      firstTick: t0,
      ...(state.scenario.observation ? { observation: state.scenario.observation } : {}),
    },
    series: {
      tick: H.map((_, i) => t0 + i),
      date: H.map((_, i) => tickToLabel(state.scenario.start, t0 + i)),
      zones: state.zones.map((z, zi) => ({
        name: z.spec.name,
        covered: z.spec.covered,
        ...(z.spec.optInTick !== undefined ? { optInTick: z.spec.optInTick } : {}),
        strListings: col((r) => r.zones[zi]!.strListings),
        strPrincipal: col((r) => r.zones[zi]!.strPrincipal),
        strIllegal: col((r) => r.zones[zi]!.strIllegal),
        ltrOccupied: col((r) => r.zones[zi]!.ltrOccupied),
        ltrVacant: col((r) => r.zones[zi]!.ltrVacant),
        ownerOcc: col((r) => r.zones[zi]!.ownerOcc),
        marketRent: col((r) => r.zones[zi]!.marketRent),
        occupancy: col((r) => r.zones[zi]!.occupancy),
        strRegistered: col((r) => r.zones[zi]!.strRegistered),
        strExemptClaim: col((r) => r.zones[zi]!.strExemptClaim),
        strMulti: col((r) => r.zones[zi]!.strMulti),
      })),
      housed: col((r) => r.housed),
      searching: col((r) => r.searching),
      doubledUp: col((r) => r.doubledUp),
      gone: col((r) => r.gone),
      left: col((r) => r.left),
      cpiRentIndex: col((r) => r.cpiRentIndex),
      askingRentIndex: col((r) => r.askingRentIndex),
      rentBurdenShare: col((r) => r.rentBurdenShare),
      fines: col((r) => r.fines),
    },
  };
}

/** Build a world and run it for `ticks` months. */
export function runSim(config: RunSimConfig): RunOutput {
  const state = createSim(config);
  for (let i = 0; i < config.ticks; i++) stepSim(state);
  return collectOutput(state);
}
