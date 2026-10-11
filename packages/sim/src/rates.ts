/**
 * Bank of Canada policy rate path (DATA, params/policyRate.json, from the first project's
 * fixture). Before the first month the first value applies; after the last month the rate is
 * held flat (ASSUMED).
 */
import path from './params/policyRate.json' with { type: 'json' };
import type { YearMonth } from './calendar.ts';
import { tickToYearMonth } from './calendar.ts';

const PATH = path as { start: YearMonth; values: number[] };

export function policyRateAt(scenarioStart: YearMonth, tick: number): number {
  const ym = tickToYearMonth(scenarioStart, tick);
  const i = ym.year * 12 + ym.month - (PATH.start.year * 12 + PATH.start.month);
  const k = Math.min(PATH.values.length - 1, Math.max(0, i));
  return PATH.values[k]!;
}
