import defaults from './params/defaults.json' with { type: 'json' };
import type { Params } from './types.ts';

/** Default (uncalibrated) parameters. Calibrated sets live in the ensemble (ensemble.ts). */
export const DEFAULT_PARAMS: Readonly<Params> = defaults as Params;

/** A partial parameter set: any subset of groups and fields of Params. */
export type ParamOverrides = {
  [G in keyof Params]?: Params[G] extends object ? Partial<Params[G]> : Params[G];
};

/**
 * Apply overrides to a base parameter set. Unknown groups or fields throw, so that a typo in a
 * calibration draw or ensemble file can never be silently ignored.
 */
export function mergeParams(base: Readonly<Params>, overrides: ParamOverrides): Params {
  const out = structuredClone(base) as Params;
  const target = out as unknown as Record<string, unknown>;
  for (const [group, value] of Object.entries(overrides)) {
    if (!(group in target)) throw new Error(`Unknown parameter group "${group}"`);
    const current = target[group];
    if (typeof current !== 'object' || current === null) {
      if (typeof value !== 'number') throw new Error(`Parameter "${group}" must be a number`);
      target[group] = value;
      continue;
    }
    const g = current as Record<string, unknown>;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!(k in g)) throw new Error(`Unknown parameter "${group}.${k}"`);
      if (typeof v !== 'number' || !Number.isFinite(v))
        throw new Error(`Parameter "${group}.${k}" must be a finite number`);
      g[k] = v;
    }
  }
  return out;
}
