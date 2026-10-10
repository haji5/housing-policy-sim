import { describe, expect, it } from 'vitest';
import {
  addPolicyEvents,
  collectOutput,
  createSim,
  DEFAULT_PARAMS,
  POLICY_PRESETS,
  stepSim,
} from '../src/index.ts';
import { run, SCENARIO } from './helpers.ts';

describe('determinism', () => {
  it('same seed + params + policy gives identical output', () => {
    const a = run(123, 'historical');
    const b = run(123, 'historical');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different seeds give different output', () => {
    const a = run(1, 'historical');
    const b = run(2, 'historical');
    expect(JSON.stringify(a.series)).not.toBe(JSON.stringify(b.series));
  });

  it('output contains no NaN or Infinity', () => {
    const out = JSON.stringify(run(9, 'historical'));
    expect(out).not.toMatch(/NaN|Infinity|null/);
  });

  it('replay: events supplied up front equal events supplied at the tick they happen', () => {
    const events = POLICY_PRESETS.historical;
    const upFront = run(77, events);

    const s = createSim({ scenario: SCENARIO, params: DEFAULT_PARAMS, seed: 77, policy: [] });
    for (let t = 0; t < 60; t++) {
      addPolicyEvents(
        s,
        events.filter((e) => e.tick === t),
      );
      stepSim(s);
    }
    expect(JSON.stringify(collectOutput(s))).toBe(JSON.stringify(upFront));
  });
});
