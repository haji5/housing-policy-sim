/**
 * Headless play (PLAN §10 M5 balance playtests, ADR 0009): play a full term turn by turn under the
 * game rules, next to the paired no-policy run (same seed, same parameter set, same shocks), and
 * score it. The web worker uses the same functions, so headless and in-browser play agree.
 */
import { createSim } from './create.ts';
import { ensembleIndexForSeed, ensembleParams, ENSEMBLE } from './ensemble.ts';
import type { Decision, GameState, MandateId } from './game.ts';
import {
  commitTurn,
  compositeScore,
  fiscalBalance,
  MANDATES,
  newGame,
  quote,
  RULES,
  settleTurn,
  shockEvents,
} from './game.ts';
import type { Scorecard } from './metrics.ts';
import { outcomes, scorecard } from './metrics.ts';
import { DEFAULT_PARAMS } from './params.ts';
import { addPolicyEvents, collectOutput } from './run.ts';
import { stepSim } from './step.ts';
import type { Params, RunOutput, SimState } from './types.ts';

/** A strategy proposes the levers for the coming turn. */
export type Strategy = (game: GameState) => Decision;

export interface PlayResult {
  seed: number;
  member: number;
  card: Scorecard;
  composite: Record<MandateId, number>;
  /** Turns where the strategy's proposal was refused (resources, cooldowns) and kept the levers. */
  refused: number;
  game: GameState;
  policyRun: RunOutput;
  baseRun: RunOutput;
}

/** Calibrated parameters for a seed (or the defaults when there is no ensemble). */
export function paramsForSeed(seed: number): { params: Params; member: number } {
  if (ENSEMBLE.sets.length === 0) return { params: DEFAULT_PARAMS, member: -1 };
  const member = ensembleIndexForSeed(seed);
  return { params: ensembleParams(member), member };
}

/** Revenue of the last `ticks` months of a sim, $M. */
export function recentRevenue(state: SimState, ticks: number): number {
  const H = state.history.slice(-ticks);
  return H.reduce((a, r) => a + r.fines + r.vacancyTaxRevenue, 0) / state.params.scale / 1000;
}

export function playGame(
  strategy: Strategy,
  seed: number,
  scenario = 'victoria',
  mandate: MandateId = 'balanced',
): PlayResult {
  const { params, member } = paramsForSeed(seed);
  const player = createSim({ scenario, params, seed, policy: [] });
  const base = createSim({ scenario, params, seed, policy: [] });
  let game = newGame(seed, mandate, player.zones.length);
  addPolicyEvents(player, shockEvents(game));
  addPolicyEvents(base, shockEvents(game));
  let refused = 0;
  for (let t = 0; t < RULES.turns; t++) {
    let draft = strategy(game);
    if (quote(game, draft).errors.length > 0) {
      refused++;
      draft = { ...game.current, buyData: false };
      if (quote(game, draft).errors.length > 0) draft = { ...draft, enforcement: 0, nonMarket: 0 };
    }
    const committed = commitTurn(game, draft);
    addPolicyEvents(player, committed.events);
    for (let i = 0; i < RULES.ticksPerTurn; i++) {
      stepSim(player);
      stepSim(base);
    }
    game = settleTurn(committed.game, recentRevenue(player, RULES.ticksPerTurn));
  }
  const policyRun = collectOutput(player);
  const baseRun = collectOutput(base);
  const card = scorecard({
    policy: outcomes(policyRun),
    base: outcomes(baseRun),
    fiscalBalance: fiscalBalance(game),
    capital: game.capital,
  });
  const composite = Object.fromEntries(
    (Object.keys(MANDATES) as MandateId[]).map((m) => [m, compositeScore(card, m)]),
  ) as Record<MandateId, number>;
  return { seed, member, card, composite, refused, game, policyRun, baseRun };
}

// --------------------------------------------------------------------------------------------
// The five balance-playtest strategies (Victoria zone order: 0 Downtown, 1 Inner Victoria,
// 2 Saanich & Oak Bay, 3 Westshore & Sooke, 4 Saanich Peninsula, 5-7 exempt areas).

const withUpzone = (d: Decision, zones: number[], level: number): Decision => {
  const upzone = [...d.upzone];
  for (const z of zones) upzone[z] = Math.max(upzone[z] ?? 0, level);
  return { ...d, upzone };
};

export const STRATEGIES: Record<string, { label: string; play: Strategy }> = {
  statusQuo: { label: 'Status quo', play: (g) => ({ ...g.current }) },
  crackdown: {
    label: 'STR crackdown (rule + registry, max enforcement)',
    play: (g) => ({ ...g.current, strRegime: 2, enforcement: 5 }),
  },
  supply: {
    label: 'Supply push (aggressive upzoning + non-market homes)',
    play: (g) => {
      // One zone per turn as political capital allows, largest renter zones first.
      const order = [1, 2, 3, 0, 4];
      const next = order.find((z) => (g.current.upzone[z] ?? 0) < 2);
      let d: Decision = { ...g.current, nonMarket: 10 };
      if (next !== undefined && g.capital >= 2) d = withUpzone(d, [next], 2);
      return d;
    },
  },
  tenants: {
    label: 'Tenant protection (low rent cap, 3% vacancy tax, PR rule)',
    play: (g) => {
      if (g.turn === 0) return { ...g.current, rentCap: 0, vacancyTax: 3 };
      if (g.turn === 1) return { ...g.current, strRegime: 1 };
      return { ...g.current };
    },
  },
  balanced: {
    label: 'Balanced (rule + registry, 1% vacancy tax, moderate upzoning, data)',
    play: (g) => {
      if (g.turn === 0) return { ...g.current, strRegime: 2, enforcement: 3, buyData: true };
      if (g.turn === 2)
        return withUpzone({ ...g.current, vacancyTax: 1, buyData: true }, [1, 2], 1);
      if (g.turn === 4) return withUpzone({ ...g.current, buyData: true }, [3, 0], 1);
      return { ...g.current, buyData: true };
    },
  },
};
