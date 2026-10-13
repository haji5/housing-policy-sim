# ADR 0009: Game layer: levers, resources, shocks, scoring and mandates

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** m5

## Context

The game needs six levers, resources, shock cards and a multi-objective
scorecard with mandates. The M5 acceptance asks that no single strategy dominates in five
headless playtests. The rules must be the same in the browser and headless.

## Decision

**Levers as policy events** (`policy.ts`): `strRegime`, `enforcement` (0-5), `vacancyTax` (0-3% of
assessed value per year), `rentCap` (Low / Medium / High), `upzone` (per zone: None / Moderate /
Aggressive) and `nonMarket` (homes started per quarter), plus `shock` (card code). Every lever takes
effect at the first tick of the turn in which it is set.

**Rules** (`game.ts`, ASSUMED game-design constants, not model parameters):

| Item              | Value                                                                  |
| ----------------- | ---------------------------------------------------------------------- |
| Budget            | $8M at start, +$2M per quarter, plus fines and vacancy tax             |
| Enforcement       | $0.4M per level per quarter (status quo level 2 = $0.8M)               |
| Non-market homes  | $0.15M subsidy per home started                                        |
| Asking-rent data  | $0.25M per quarter                                                     |
| Political capital | 6 at start, +2 per quarter, max 12                                     |
| Capital costs     | STR regime 3; vacancy tax 1 per point; rent cap 2; upzoning 1 per step |
| Cooldowns         | STR regime, vacancy tax and rent cap: 4 turns                          |
| Upzoning          | irreversible                                                           |

**Shocks** (`shocks.ts`, `params/shocks.json`): six cards (rate hike, migration surge, recession,
court challenge, tourism boom, wildfire). From turn 3, each turn draws a card with probability 0.25
(no repeats), from keyed draws on the game seed. The schedule is fixed at the start of a game and
added to both the player's sim and the no-policy sim, so shocks never confound the score.

**Score** (`metrics.ts`). Each objective is the effect of the player's policy against the paired
no-policy run: change in the rent-burden share; change in the housing-stress rate (stressed /
(housed + stressed)); extra completions; fiscal balance relative to the status quo; change in STR
listings (visitor capacity); political capital left. A rate, not a count, is scored for stress:
cheaper rents draw more arrivals, some of whom cannot afford anything and leave, and a count
would penalise making the region more attractive. Points: 1 per 0.25 pp of rent burden, 0.1 pp of
the stress rate, 500 completions, $10M, 2% of listings and 1 point of capital. Mandates
(Balanced, Affordability first, Balanced budget, Tourism-dependent region) weight the points.

**Balance.** The points scales were set after a first playtest in which tenant protection won
every mandate, mostly because the rent cap had no supply cost: rental starts ignored it. The fix
was a modelling change (rental starts respond to the cap, ADR 0008), plus scales on which a large
real-world change is worth about one point. No calibrated or behavioural parameter was changed
for balance.

**Headless play** (`playtest.ts`, `pnpm sim playtest`): `playGame(strategy, seed)` plays a full
term under the same rules as the web game, against the paired no-policy run, with the ensemble
member chosen by the seed.

## Consequences

- The UI shows costs, cooldowns and refusals from `quote()`; the worker keeps a no-policy twin
  sim in lockstep for the score.
- Points scales and resource constants are design choices; they are documented here and in
  ASSUMPTIONS G1-G6, and they do not affect the model or the calibration.
- Results of the five playtests: VALIDATION.md §4.
