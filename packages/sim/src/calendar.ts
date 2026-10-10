/** Tick <-> calendar conversion. One tick is one month; no Date objects in the sim core. */

export interface YearMonth {
  year: number;
  month: number; // 1..12
}

export function tickToYearMonth(start: YearMonth, tick: number): YearMonth {
  const m0 = start.year * 12 + (start.month - 1) + tick;
  return { year: Math.floor(m0 / 12), month: (((m0 % 12) + 12) % 12) + 1 };
}

export function tickToLabel(start: YearMonth, tick: number): string {
  const { year, month } = tickToYearMonth(start, tick);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function yearMonthToTick(start: YearMonth, at: YearMonth): number {
  return at.year * 12 + (at.month - 1) - (start.year * 12 + (start.month - 1));
}
