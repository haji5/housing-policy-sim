import { describe, expect, it } from 'vitest';
import {
  commitTurn,
  compositeScore,
  fiscalBalance,
  MANDATES,
  newGame,
  outcomes,
  quote,
  RULES,
  scorecard,
  settleTurn,
  shockEvents,
  shockSchedule,
  SHOCK_CARDS,
} from '../src/index.ts';
import type { Decision } from '../src/index.ts';
import { run } from './helpers.ts';

const Z = 2;

describe('game rules (ADR 0009)', () => {
  it('draws a reproducible shock schedule with no repeated card', () => {
    for (const seed of [1, 2, 3, 99]) {
      const a = shockSchedule(seed);
      expect(shockSchedule(seed)).toEqual(a);
      expect(new Set(a.map((s) => s.code)).size).toBe(a.length);
      for (const s of a) {
        expect(s.turn).toBeGreaterThanOrEqual(RULES.shockFromTurn);
        expect(s.turn).toBeLessThan(RULES.turns);
        expect(SHOCK_CARDS.map((c) => c.code)).toContain(s.code);
      }
    }
    const n = Array.from({ length: 400 }, (_, i) => shockSchedule(i).length);
    const mean = n.reduce((a, b) => a + b, 0) / n.length;
    // ~17 eligible turns x 0.25, slightly fewer because cards do not repeat.
    expect(mean).toBeGreaterThan(3);
    expect(mean).toBeLessThan(4.5);
  });

  it('shock events land at the first tick of their turn', () => {
    const g = newGame(7, 'balanced', Z);
    expect(shockEvents(g)).toEqual(
      g.shocks.map((s) => ({ tick: s.turn * 3, lever: 'shock', value: s.code })),
    );
  });

  it('prices lever changes in political capital and running costs in budget', () => {
    const g = newGame(1, 'balanced', Z);
    const draft: Decision = { ...g.current, strRegime: 1, vacancyTax: 2, upzone: [2, 0] };
    const q = quote(g, draft);
    expect(q.capital).toBe(RULES.capitalCost.strRegime + 2 * RULES.capitalCost.vacancyTax + 2);
    expect(q.errors).toEqual(['Not enough political capital.']);
    const ok = quote(g, { ...g.current, strRegime: 1 });
    expect(ok.errors).toEqual([]);
    expect(ok.fiscal).toBeCloseTo(2 * RULES.enforcementCostPerLevel);
  });

  it('enforces cooldowns, irreversible upzoning and the budget', () => {
    let g = newGame(1, 'balanced', Z);
    ({ game: g } = commitTurn(g, { ...g.current, strRegime: 1, upzone: [1, 0] }));
    g = settleTurn(g, 0);
    expect(quote(g, { ...g.current, strRegime: 2 }).errors[0]).toMatch(/recently/);
    expect(quote(g, { ...g.current, upzone: [0, 0] }).errors).toContain(
      'Upzoning cannot be reversed.',
    );
    expect(quote(g, { ...g.current, nonMarket: 1000 }).errors).toContain(
      'Not enough budget this quarter.',
    );
    for (let i = 0; i < RULES.cooldownTurns.strRegime - 1; i++) {
      ({ game: g } = commitTurn(g, g.current));
      g = settleTurn(g, 0);
    }
    expect(quote(g, { ...g.current, strRegime: 2 }).errors).toEqual([]);
  });

  it('commits events at the turn start and settles resources', () => {
    let g = settleTurn(newGame(1, 'balanced', Z), 0);
    const { game, events } = commitTurn(g, { ...g.current, vacancyTax: 1, upzone: [0, 1] });
    expect(events).toEqual([
      { tick: 3, lever: 'vacancyTax', value: 1 },
      { tick: 3, lever: 'upzone', value: 1, zone: 1 },
    ]);
    expect(game.capital).toBe(g.capital - 2);
    g = settleTurn(game, 1.5);
    expect(g.turn).toBe(2);
    expect(g.revenue).toBe(1.5);
    let capped = g;
    for (let i = 0; i < 10; i++) capped = settleTurn(capped, 0);
    expect(capped.capital).toBe(RULES.maxCapital);
  });

  it('the status quo has a zero fiscal balance relative to itself', () => {
    let g = newGame(1, 'balanced', Z);
    for (let i = 0; i < 5; i++) {
      ({ game: g } = commitTurn(g, g.current));
      g = settleTurn(g, 0);
    }
    expect(fiscalBalance(g)).toBeCloseTo(0, 10);
  });
});

describe('scorecard (metrics.ts)', () => {
  const base = outcomes(run(3, 'none', 30));
  it('a policy identical to the counterfactual scores zero on every model objective', () => {
    const c = scorecard({ policy: base, base, fiscalBalance: 0, capital: 0 });
    for (const v of Object.values(c.points)) expect(v).toBeCloseTo(0, 10);
  });

  it('counts revenue in $M from fines and the vacancy tax', () => {
    const taxed = outcomes(run(3, [{ tick: 0, lever: 'vacancyTax', value: 3 }], 30));
    expect(base.revenue).toBe(0);
    expect(taxed.revenue).toBeGreaterThan(0);
  });

  it('mandate scores are weighted means of the points', () => {
    const policy = {
      ...base,
      completions: base.completions + 2500,
      rentBurden: base.rentBurden - 0.0125,
    };
    const c = scorecard({ policy, base, fiscalBalance: -20, capital: 2 });
    expect(c.points.supply).toBeCloseTo(5);
    expect(c.points.affordability).toBeCloseTo(5);
    expect(c.points.fiscal).toBeCloseTo(-2);
    const w = MANDATES.balanced.weights;
    const expected =
      Object.entries(c.points).reduce((a, [k, v]) => a + w[k as keyof typeof w] * v, 0) /
      Object.values(w).reduce((a, b) => a + b, 0);
    expect(compositeScore(c, 'balanced')).toBeCloseTo(expected);
    expect(compositeScore(c, 'affordability')).toBeGreaterThan(compositeScore(c, 'budget'));
  });
});

describe('headless play (playtest.ts)', () => {
  it('plays a full term deterministically and scores it against the paired no-policy run', async () => {
    const { playGame, STRATEGIES } = await import('../src/playtest.ts');
    const a = playGame(STRATEGIES.crackdown!.play, 4, 'two-zone');
    const b = playGame(STRATEGIES.crackdown!.play, 4, 'two-zone');
    expect(a.card).toEqual(b.card);
    expect(a.game.turn).toBe(RULES.turns);
    expect(a.policyRun.series.tick.length).toBe(RULES.turns * RULES.ticksPerTurn);
    // Same shocks in both arms; the crackdown cuts covered-zone listings.
    expect(a.card.effects.strListingsPct).toBeLessThan(0);
    const sq = playGame(STRATEGIES.statusQuo!.play, 4, 'two-zone');
    expect(sq.card.effects.completions).toBe(0);
    expect(sq.card.fiscalBalance).toBeCloseTo(0, 10);
    const t = playGame(STRATEGIES.tenants!.play, 4, 'two-zone');
    expect(t.refused).toBe(0);
    expect(t.card.fiscalBalance).toBeGreaterThan(0); // vacancy-tax revenue
  });
});
