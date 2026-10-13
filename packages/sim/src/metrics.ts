/**
 * Outcomes and the scorecard (ADR 0009). Every objective is measured against the
 * paired no-policy run (same seed, same shocks), so the score is the effect of the player's
 * policy, not the level of a quantity the player cannot influence (e.g. the baseline flow of
 * households who leave because nothing is affordable to them).
 */
import type { RunOutput } from './types.ts';

/** Raw outcomes of a run over [from, to] (indices into the series), in real units. */
export interface Outcomes {
  /** Share of housed renter households paying more than 30% of income, at the end. */
  rentBurden: number;
  /** Households that doubled up or left because of housing stress during the window. */
  stressed: number;
  /**
   * stressed / (housed at the end + stressed). A rate, so that a policy that draws more people to
   * the region is not penalised for the arrivals who then cannot find a home.
   */
  stressRate: number;
  /** Homes completed during the window. */
  completions: number;
  /** Active entire-home STR listings at the end (all zones). */
  strListings: number;
  /** Asking-rent index at the end (start = 100). */
  askingRent: number;
  /** All-tenant (CPI-style) rent index at the end. */
  cpiRent: number;
  /** Fines and vacancy tax collected during the window, $M. */
  revenue: number;
}

export function outcomes(out: RunOutput, from = 0, to = out.series.tick.length - 1): Outcomes {
  const s = out.series;
  const sc = out.meta.scale;
  const sumRange = (xs: readonly number[]) => xs.slice(from + 1, to + 1).reduce((a, b) => a + b, 0);
  const zoneSum = (k: 'completions' | 'strListings', i?: number) =>
    s.zones.reduce((a, z) => a + (i === undefined ? sumRange(z[k]) : z[k][i]!), 0);
  // Money in the sim is $k per agent; real $M = $k / scale / 1000.
  const money = (xs: readonly number[]) => sumRange(xs) / sc / 1000;
  const stressed = (s.gone[to]! - s.gone[from]! + s.doubledUp[to]!) / sc;
  return {
    rentBurden: s.rentBurdenShare[to]!,
    stressed,
    stressRate: stressed / Math.max(1, s.housed[to]! / sc + stressed),
    completions: zoneSum('completions') / sc,
    strListings: zoneSum('strListings', to) / sc,
    askingRent: (100 * s.askingRentIndex[to]!) / s.askingRentIndex[from]!,
    cpiRent: (100 * s.cpiRentIndex[to]!) / s.cpiRentIndex[from]!,
    revenue: money(s.fines) + money(s.vacancyTaxRevenue),
  };
}

export const OBJECTIVES = [
  'affordability',
  'stress',
  'supply',
  'fiscal',
  'visitors',
  'capital',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export interface ScoreInputs {
  /** Your run and the paired no-policy run. */
  policy: Outcomes;
  base: Outcomes;
  /** Net fiscal balance of the term, $M (revenue minus discretionary spending). */
  fiscalBalance: number;
  /** Political capital left at the end. */
  capital: number;
}

export interface Scorecard {
  /** Effects versus no policy, in natural units. */
  effects: {
    /** Change in the rent-burden share, percentage points (negative is good). */
    rentBurdenPp: number;
    /** Change in stressed households (count; can rise when more people arrive). */
    stressed: number;
    /** Change in the stress rate, percentage points (negative is good; scored). */
    stressRatePp: number;
    /** Extra completions. */
    completions: number;
    /** Change in STR listings, percent (visitor capacity). */
    strListingsPct: number;
    /** Change in asking rents, percent. */
    askingRentPct: number;
  };
  fiscalBalance: number;
  capital: number;
  /** Per-objective points on a common scale (positive is good; about ±10 for big effects). */
  points: Record<Objective, number>;
}

/**
 * Points convert each effect into a common scale (ASSUMED game-design constants, ADR 0009):
 * 1 point per 0.25 pp of rent burden, 0.1 pp of the stress rate, 500 completions, $10M of fiscal
 * balance, 2% of STR listings and 1 unit of political capital left.
 */
export function scorecard(x: ScoreInputs): Scorecard {
  const effects = {
    rentBurdenPp: 100 * (x.policy.rentBurden - x.base.rentBurden),
    stressed: x.policy.stressed - x.base.stressed,
    stressRatePp: 100 * (x.policy.stressRate - x.base.stressRate),
    completions: x.policy.completions - x.base.completions,
    strListingsPct: 100 * (x.policy.strListings / Math.max(1, x.base.strListings) - 1),
    askingRentPct: x.policy.askingRent - x.base.askingRent,
  };
  return {
    effects,
    fiscalBalance: x.fiscalBalance,
    capital: x.capital,
    points: {
      affordability: -effects.rentBurdenPp / 0.25,
      stress: -effects.stressRatePp / 0.1,
      supply: effects.completions / 500,
      fiscal: x.fiscalBalance / 10,
      visitors: effects.strListingsPct / 2,
      capital: x.capital,
    },
  };
}
