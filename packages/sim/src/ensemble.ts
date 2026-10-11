/**
 * The calibrated parameter ensemble (PLAN §7.2). Written by calibration/calibrate.py; never edit
 * by hand. Each set is a ParamOverrides object applied on top of DEFAULT_PARAMS. The game samples
 * one set per seed, so weakly identified parameters show up as run-to-run uncertainty.
 */
import ensemble from './params/ensemble.json' with { type: 'json' };
import type { ParamOverrides } from './params.ts';
import { DEFAULT_PARAMS, mergeParams } from './params.ts';
import { hash32 } from './rng.ts';
import type { Params } from './types.ts';

export interface EnsembleFile {
  meta: {
    simVersion: string;
    created: string;
    gitCommit: string;
    scenario: string;
    priorsHash: string;
    targetsHash: string;
    defaultsHash: string;
    scenarioHash: string;
    seeds: number[];
    method: string;
    nStage1: number;
    nStage3: number;
    tolerance: number;
    nAccepted: number;
    ess: number;
    bestDistance: number;
    smoke: boolean;
  };
  sets: ParamOverrides[];
}

export const ENSEMBLE: Readonly<EnsembleFile> = ensemble as EnsembleFile;

/** Parameters of ensemble member `index` (wraps around). */
export function ensembleParams(index: number, base: Readonly<Params> = DEFAULT_PARAMS): Params {
  const n = ENSEMBLE.sets.length;
  if (n === 0) return mergeParams(base, {});
  return mergeParams(base, ENSEMBLE.sets[((index % n) + n) % n]!);
}

/** Deterministic ensemble member for a game seed. */
export function ensembleIndexForSeed(seed: number): number {
  const n = Math.max(1, ENSEMBLE.sets.length);
  return hash32(seed >>> 0, 0, 0, 255) % n;
}
