import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeMoments,
  ENSEMBLE,
  ensembleIndexForSeed,
  ensembleParams,
  fnv1a64,
  runSim,
  SIM_VERSION,
} from '../src/index.ts';

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const fileHash = (p: string) => fnv1a64(readFileSync(root(p), 'utf8').replace(/\r\n/g, '\n'));

interface Prior {
  name: string;
  lo: number;
  hi: number;
}

// Fail if the committed ensemble no longer matches the inputs it was calibrated on.
describe('calibrated ensemble', () => {
  it('was calibrated against the current priors, targets, defaults, scenario and model version', () => {
    const m = ENSEMBLE.meta;
    const stale = 'ensemble.json is stale: re-run `pnpm calibrate`';
    expect(m.priorsHash, stale).toBe(fileHash('calibration/priors.json'));
    expect(m.targetsHash, stale).toBe(fileHash('calibration/inputs/targets.json'));
    expect(m.defaultsHash, stale).toBe(fileHash('packages/sim/src/params/defaults.json'));
    expect(m.scenarioHash, stale).toBe(fileHash('packages/sim/src/scenarios/victoria.json'));
    expect(m.simVersion, stale).toBe(SIM_VERSION);
    expect(m.smoke).toBe(false);
  });

  it('has 200-500 members, all inside the prior support', () => {
    expect(ENSEMBLE.sets.length).toBeGreaterThanOrEqual(200);
    expect(ENSEMBLE.sets.length).toBeLessThanOrEqual(500);
    const priors = (
      JSON.parse(readFileSync(root('calibration/priors.json'), 'utf8')) as { parameters: Prior[] }
    ).parameters;
    for (const set of ENSEMBLE.sets) {
      for (const p of priors) {
        const [g, k] = p.name.split('.') as [string, string];
        const v = (set as Record<string, Record<string, number>>)[g]![k]!;
        expect(v).toBeGreaterThanOrEqual(p.lo * (1 - 1e-6));
        expect(v).toBeLessThanOrEqual(p.hi * (1 + 1e-6));
      }
      expect(() => ensembleParams(ENSEMBLE.sets.indexOf(set))).not.toThrow();
    }
  });

  it('members run deterministically and give finite moments', () => {
    const i = ensembleIndexForSeed(42);
    const run = () =>
      runSim({
        scenario: 'victoria',
        params: ensembleParams(i),
        seed: 42,
        policy: 'historical',
        ticks: 49,
        preTicks: 15,
      });
    const a = run();
    expect(JSON.stringify(run())).toBe(JSON.stringify(a));
    expect(Number.isFinite(computeMoments(a).didP1)).toBe(true);
  });
});
