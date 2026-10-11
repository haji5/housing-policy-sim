import type { Scenario } from '../types.ts';
import twoZone from './two-zone.json' with { type: 'json' };
import victoria from './victoria.json' with { type: 'json' };

export const SCENARIOS: Readonly<Record<string, Scenario>> = {
  'two-zone': twoZone as Scenario,
  victoria: victoria as Scenario,
};

export function loadScenario(id: string): Scenario {
  const s = SCENARIOS[id];
  if (!s) throw new Error(`Unknown scenario "${id}". Known: ${Object.keys(SCENARIOS).join(', ')}`);
  return s;
}
