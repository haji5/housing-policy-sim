# Validation

Internal validation, external validation and the DiD-recovery experiment (PLAN §8).

## 1. Internal validation (automated, `packages/sim/test/`)

| Property                                                                                                                                                                           | Test                                                                               | Since |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| RNG is a pure function of its keys, uniform, uncorrelated across agents; normal/Gumbel/Poisson moments                                                                             | `rng.test.ts` (fast-check + moment checks)                                         | m1    |
| Conservation: every dwelling in one valid tenure, every household in one valid status, tenant ↔ dwelling links consistent, rents/incomes finite and positive, fixed dwelling stock | `invariants.test.ts` (fast-check over seeds × random policy schedules, every tick) | m1    |
| Determinism: same seed + params + policy ⇒ byte-identical output; no NaN/Infinity                                                                                                  | `determinism.test.ts`                                                              | m1    |
| Replay equality: events given up front ≡ events added at the tick they occur (the game's mode)                                                                                     | `determinism.test.ts`                                                              | m1    |
| CRN: a policy change at tick T leaves all outputs before T unchanged                                                                                                               | `crn.test.ts`                                                                      | m1    |
| CRN: paired effect estimates have < ½ the variance of unpaired ones                                                                                                                | `crn.test.ts`                                                                      | m1    |
| CRN: with markets decoupled, exempt-zone outcomes are identical under any covered-zone policy                                                                                      | `crn.test.ts`                                                                      | m1    |
| Monotonicity: OPEN > PR rule ≥ PR + registry in covered listings (every seed)                                                                                                      | `monotonicity.test.ts`                                                             | m1    |
| Monotonicity: illegal listings fall with enforcement level 0..5                                                                                                                    | `monotonicity.test.ts`                                                             | m1    |
| Exempt zone does not lose listings when only covered zones are regulated                                                                                                           | `monotonicity.test.ts`                                                             | m1    |
| Golden snapshot of a fixed small run                                                                                                                                               | `golden.test.ts`                                                                   | m1    |
| Performance: ~10k agents × 60 ticks within budget                                                                                                                                  | `perf.test.ts`; `pnpm sim bench`                                                   | m1    |

Sensitivity analysis and parameter recovery: M3/M5.

## 2. External validation

M3 onwards.

## 3. DiD-recovery experiment

M4.
