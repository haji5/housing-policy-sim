/**
 * Game rules (PLAN §5.8-5.9, §6.1-6.2; ADR 0009): resources, lever costs and cooldowns, the seeded
 * shock-card schedule and mandates. Pure functions, so the web game and the headless playtests use
 * exactly the same rules. All money is $M per quarter-turn; political capital is in points. The
 * constants are ASSUMED game-design choices, not model parameters.
 */
import type { Objective, Scorecard } from './metrics.ts';
import { OBJECTIVES } from './metrics.ts';
import { DEFAULT_LEVERS } from './policy.ts';
import { Purpose, uniform } from './rng.ts';
import { SHOCK_CARDS } from './shocks.ts';
import type { PolicyEvent } from './types.ts';
import { Upzone } from './types.ts';

export const RULES = {
  turns: 20,
  ticksPerTurn: 3,
  startBudget: 8,
  budgetPerTurn: 2,
  startCapital: 6,
  capitalPerTurn: 2,
  maxCapital: 12,
  /** Enforcement spending per level per quarter ($M). The status quo (level 2) costs 0.8. */
  enforcementCostPerLevel: 0.4,
  /** Public subsidy per non-market home started ($M). */
  nonMarketSubsidy: 0.15,
  /** Cost of buying the asking-rent data for one quarter ($M). */
  dataCost: 0.25,
  capitalCost: {
    strRegime: 3,
    /** Per percentage point of change. */
    vacancyTax: 1,
    rentCap: 2,
    /** Per upzoning step in a zone (Moderate = 1 step, Aggressive = 2). */
    upzone: 1,
  },
  /** Turns before the same lever can change again (legislation lag). */
  cooldownTurns: { strRegime: 4, vacancyTax: 4, rentCap: 4 },
  /** Shocks can be drawn from this turn on, with this probability per turn. */
  shockFromTurn: 3,
  shockProb: 0.25,
} as const;

/** The levers a player sets each turn, plus the data purchase. */
export interface Decision {
  strRegime: number;
  enforcement: number;
  vacancyTax: number;
  rentCap: number;
  upzone: number[];
  /** Non-market homes started per quarter (real units). */
  nonMarket: number;
  buyData: boolean;
}

export type CooldownLever = keyof typeof RULES.cooldownTurns;

export interface GameState {
  seed: number;
  mandate: MandateId;
  /** Turns completed (0..RULES.turns). */
  turn: number;
  budget: number;
  capital: number;
  /** Levers in force. */
  current: Decision;
  /** Turn at which each cooldown lever last changed (-Infinity = never). */
  lastChanged: Record<CooldownLever, number>;
  /** Discretionary spending and revenue so far, $M. */
  spent: number;
  revenue: number;
  /** Shock cards and the turn at the start of which each is revealed. */
  shocks: { turn: number; code: number }[];
}

export interface Quote {
  fiscal: number;
  capital: number;
  errors: string[];
}

export function statusQuo(nZones: number): Decision {
  return {
    strRegime: DEFAULT_LEVERS.strRegime,
    enforcement: DEFAULT_LEVERS.enforcement,
    vacancyTax: DEFAULT_LEVERS.vacancyTax,
    rentCap: DEFAULT_LEVERS.rentCap,
    upzone: new Array<number>(nZones).fill(Upzone.NONE),
    nonMarket: 0,
    buyData: false,
  };
}

/**
 * Shock schedule for a seed: from shockFromTurn on, each turn draws a card with probability
 * shockProb (uniform over the deck, never the same card twice in one term).
 */
export function shockSchedule(seed: number): { turn: number; code: number }[] {
  const out: { turn: number; code: number }[] = [];
  const used = new Set<number>();
  for (let turn = RULES.shockFromTurn; turn < RULES.turns; turn++) {
    if (uniform(seed, 0, turn, Purpose.SHOCK_DRAW, 0) >= RULES.shockProb) continue;
    const left = SHOCK_CARDS.filter((c) => !used.has(c.code));
    if (left.length === 0) break;
    const card = left[Math.floor(uniform(seed, 0, turn, Purpose.SHOCK_DRAW, 1) * left.length)]!;
    used.add(card.code);
    out.push({ turn, code: card.code });
  }
  return out;
}

/** Shock events for the sim (the same for the player's run and the no-policy counterfactual). */
export function shockEvents(game: Pick<GameState, 'shocks'>): PolicyEvent[] {
  return game.shocks.map((s) => ({
    tick: s.turn * RULES.ticksPerTurn,
    lever: 'shock' as const,
    value: s.code,
  }));
}

export function newGame(seed: number, mandate: MandateId, nZones: number): GameState {
  return {
    seed,
    mandate,
    turn: 0,
    budget: RULES.startBudget,
    capital: RULES.startCapital,
    current: statusQuo(nZones),
    lastChanged: { strRegime: -Infinity, vacancyTax: -Infinity, rentCap: -Infinity },
    spent: 0,
    revenue: 0,
    shocks: shockSchedule(seed),
  };
}

/** Recurring cost of a decision for one quarter ($M). */
export function runningCost(d: Decision): number {
  return (
    d.enforcement * RULES.enforcementCostPerLevel +
    d.nonMarket * RULES.nonMarketSubsidy +
    (d.buyData ? RULES.dataCost : 0)
  );
}

/** Cost of moving from the levers in force to `draft` this turn, and why it is not allowed. */
export function quote(game: GameState, draft: Decision): Quote {
  const cur = game.current;
  const errors: string[] = [];
  let capital = 0;
  const cooled = (lever: CooldownLever) =>
    game.turn - game.lastChanged[lever] < RULES.cooldownTurns[lever];
  if (draft.strRegime !== cur.strRegime) {
    capital += RULES.capitalCost.strRegime;
    if (cooled('strRegime'))
      errors.push('The STR rules changed recently; wait before changing them again.');
  }
  if (draft.vacancyTax !== cur.vacancyTax) {
    capital += RULES.capitalCost.vacancyTax * Math.abs(draft.vacancyTax - cur.vacancyTax);
    if (cooled('vacancyTax'))
      errors.push('The vacancy tax changed recently; wait before changing it again.');
  }
  if (draft.rentCap !== cur.rentCap) {
    capital += RULES.capitalCost.rentCap;
    if (cooled('rentCap'))
      errors.push('The rent cap changed recently; wait before changing it again.');
  }
  draft.upzone.forEach((u, zi) => {
    const before = cur.upzone[zi] ?? Upzone.NONE;
    if (u < before) errors.push('Upzoning cannot be reversed.');
    else capital += RULES.capitalCost.upzone * (u - before);
  });
  const fiscal = runningCost(draft);
  if (capital > game.capital) errors.push('Not enough political capital.');
  if (fiscal > game.budget) errors.push('Not enough budget this quarter.');
  return { fiscal, capital, errors: [...new Set(errors)] };
}

/**
 * Commit the player's decision for the coming turn. Returns the updated game and the policy events
 * to add to the sim, effective at the first tick of the turn. Throws if the quote has errors.
 */
export function commitTurn(
  game: GameState,
  draft: Decision,
): { game: GameState; events: PolicyEvent[] } {
  const q = quote(game, draft);
  if (q.errors.length > 0) throw new Error(q.errors.join(' '));
  const tick = game.turn * RULES.ticksPerTurn;
  const cur = game.current;
  const events: PolicyEvent[] = [];
  const lastChanged = { ...game.lastChanged };
  if (draft.strRegime !== cur.strRegime) {
    events.push({ tick, lever: 'strRegime', value: draft.strRegime });
    lastChanged.strRegime = game.turn;
  }
  if (draft.enforcement !== cur.enforcement)
    events.push({ tick, lever: 'enforcement', value: draft.enforcement });
  if (draft.vacancyTax !== cur.vacancyTax) {
    events.push({ tick, lever: 'vacancyTax', value: draft.vacancyTax });
    lastChanged.vacancyTax = game.turn;
  }
  if (draft.rentCap !== cur.rentCap) {
    events.push({ tick, lever: 'rentCap', value: draft.rentCap });
    lastChanged.rentCap = game.turn;
  }
  draft.upzone.forEach((u, zone) => {
    if (u !== (cur.upzone[zone] ?? Upzone.NONE))
      events.push({ tick, lever: 'upzone', value: u, zone });
  });
  if (draft.nonMarket !== cur.nonMarket)
    events.push({ tick, lever: 'nonMarket', value: draft.nonMarket });
  return {
    game: {
      ...game,
      budget: game.budget - q.fiscal,
      capital: game.capital - q.capital,
      spent: game.spent + q.fiscal,
      current: { ...draft, upzone: [...draft.upzone] },
      lastChanged,
    },
    events,
  };
}

/** After the turn's months have been simulated: add revenue and the next quarter's resources. */
export function settleTurn(game: GameState, revenue: number): GameState {
  return {
    ...game,
    turn: game.turn + 1,
    budget: game.budget + revenue + RULES.budgetPerTurn,
    capital: Math.min(RULES.maxCapital, game.capital + RULES.capitalPerTurn),
    revenue: game.revenue + revenue,
  };
}

/** Net fiscal balance of a term relative to running the status quo for the same turns, $M. */
export function fiscalBalance(game: GameState): number {
  const sq = runningCost(statusQuo(game.current.upzone.length)) * game.turn;
  return game.revenue - game.spent + sq;
}

// --------------------------------------------------------------------------------------------
// Mandates (PLAN §6.2): weights over the scorecard's objectives.

export const MANDATES = {
  balanced: {
    name: 'Balanced',
    text: 'Every objective counts the same.',
    weights: { affordability: 1, stress: 1, supply: 1, fiscal: 1, visitors: 1, capital: 1 },
  },
  affordability: {
    name: 'Affordability first',
    text: 'Renters come first: affordability and housing stress count double.',
    weights: { affordability: 2, stress: 2, supply: 1, fiscal: 0.5, visitors: 0.5, capital: 0.5 },
  },
  budget: {
    name: 'Balanced budget',
    text: 'Treasury is watching: the fiscal balance counts most.',
    weights: {
      affordability: 0.75,
      stress: 0.75,
      supply: 0.75,
      fiscal: 2.5,
      visitors: 0.75,
      capital: 1,
    },
  },
  tourism: {
    name: 'Tourism-dependent region',
    text: 'Visitor beds keep local businesses alive: visitor capacity counts most.',
    weights: {
      affordability: 0.75,
      stress: 0.75,
      supply: 0.75,
      fiscal: 1,
      visitors: 2.5,
      capital: 0.75,
    },
  },
} as const satisfies Record<
  string,
  { name: string; text: string; weights: Record<Objective, number> }
>;

export type MandateId = keyof typeof MANDATES;

/** Weighted mean of the scorecard's points under a mandate. */
export function compositeScore(card: Scorecard, mandate: MandateId): number {
  const w = MANDATES[mandate].weights;
  let num = 0;
  let den = 0;
  for (const k of OBJECTIVES) {
    num += w[k] * card.points[k];
    den += w[k];
  }
  return num / den;
}
