/** Public entry point of the simulation core. */

export const SIM_VERSION = '0.5.0';

export * from './types.ts';
export { createSim } from './create.ts';
export { stepSim } from './step.ts';
export { runSim, collectOutput, addPolicyEvents } from './run.ts';
export type { RunSimConfig } from './run.ts';
export { checkInvariants } from './invariants.ts';
export { POLICY_PRESETS, HISTORICAL_TICKS, DEFAULT_LEVERS, leversAt } from './policy.ts';
export { loadScenario, SCENARIOS } from './scenarios/index.ts';
export { tickToLabel, tickToYearMonth, yearMonthToTick } from './calendar.ts';
export { fnv1a64, hashObject, stableStringify } from './hash.ts';
export { hash32 } from './rng.ts';
export { detectProb } from './systems/enforcement.ts';
export { computeMoments, twoWayFE } from './moments.ts';
export type { Moments, PanelRow } from './moments.ts';
export { DEFAULT_PARAMS, mergeParams } from './params.ts';
export { ENSEMBLE, ensembleIndexForSeed, ensembleParams } from './ensemble.ts';
export type { EnsembleFile } from './ensemble.ts';
export type { ParamOverrides } from './params.ts';
export {
  DEFAULT_OBSERVATION,
  flagIncomplete,
  researcherCpi,
  researcherPanel,
} from './researcher.ts';
export type { ObservationParams, ResearcherPanel } from './researcher.ts';
export { SHOCK_CARDS, combineShocks, shockCard } from './shocks.ts';
export type { ShockCard } from './shocks.ts';
export { policyRateAt } from './rates.ts';
export { rentCapValue, upzoneMultiplier } from './systems/enforcement.ts';
export { OBJECTIVES, outcomes, scorecard } from './metrics.ts';
export type { Objective, Outcomes, ScoreInputs, Scorecard } from './metrics.ts';
export {
  MANDATES,
  RULES,
  commitTurn,
  compositeScore,
  fiscalBalance,
  newGame,
  quote,
  runningCost,
  settleTurn,
  shockEvents,
  shockSchedule,
  statusQuo,
} from './game.ts';
export type { CooldownLever, Decision, GameState, MandateId, Quote } from './game.ts';
export { STRATEGIES, paramsForSeed, playGame, recentRevenue } from './playtest.ts';
export type { PlayResult, Strategy } from './playtest.ts';
