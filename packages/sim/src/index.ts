/** Public entry point of the simulation core. */
import defaults from './params/defaults.json' with { type: 'json' };
import type { Params } from './types.ts';

export const SIM_VERSION = '0.1.0';
export const DEFAULT_PARAMS: Readonly<Params> = defaults as Params;

export * from './types.ts';
export { createSim } from './world.ts';
export { stepSim } from './step.ts';
export { runSim, collectOutput, addPolicyEvents } from './run.ts';
export type { RunSimConfig } from './run.ts';
export { checkInvariants } from './invariants.ts';
export { POLICY_PRESETS, HISTORICAL_TICKS, DEFAULT_LEVERS, leversAt } from './policy.ts';
export { loadScenario, SCENARIOS } from './scenarios/index.ts';
export { tickToLabel, tickToYearMonth, yearMonthToTick } from './calendar.ts';
export { hashObject, stableStringify } from './hash.ts';
export { hash32 } from './rng.ts';
export { detectProb } from './systems/enforcement.ts';
