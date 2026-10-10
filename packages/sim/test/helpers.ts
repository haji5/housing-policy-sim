import { createSim, DEFAULT_PARAMS, runSim, stepSim } from '../src/index.ts';
import type { Params, PolicyEvent, RunOutput, SimState } from '../src/index.ts';

export const SCENARIO = 'two-zone';

export function run(
  seed: number,
  policy: PolicyEvent[] | string,
  ticks = 60,
  params: Params = DEFAULT_PARAMS,
): RunOutput {
  return runSim({ scenario: SCENARIO, params, seed, policy, ticks });
}

export function sim(seed: number, policy: PolicyEvent[] | string = 'none'): SimState {
  return createSim({ scenario: SCENARIO, params: DEFAULT_PARAMS, seed, policy });
}

export function stepN(state: SimState, n: number): SimState {
  for (let i = 0; i < n; i++) stepSim(state);
  return state;
}

export function last(xs: readonly number[]): number {
  const v = xs[xs.length - 1];
  if (v === undefined) throw new Error('empty series');
  return v;
}

export function mean(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function variance(xs: readonly number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}
