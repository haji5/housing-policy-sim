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

| Ensemble metadata matches the current priors, targets, defaults, scenario and SIM_VERSION | `ensemble.test.ts` | m3 |

### 1.1 Calibration pipeline checks (`pnpm validate`, M3)

The generated report is [`calibration/reports/validation.md`](../calibration/reports/validation.md).
Validation uses seeds 101-104; calibration used 1-4.

- **Estimator cross-check.** The TypeScript DiD that produces the calibration moments equals
  pyfixest `feols(y ~ antic + p1 + p2 | zone + month)` (the first project's estimator) on the same
  simulated panel: largest absolute difference 1.4e-14 over the three coefficients (118 cells).
- **Parameter recovery.** Three ensemble members (indices 75, 150, 224) were used as known truths:
  their moments on the validation seeds became pseudo-targets, and a reduced calibration (1,024
  Sobol + 2 Nelder-Mead starts + 1,024 ABC draws, ~6 min each) re-estimated all 14 parameters. The
  truth lay inside the recovered 5-95% interval in all 42 parameter-cases. That is a pass, but a
  weak one: the reduced runs' intervals are wide, from 34% of the prior range for `delistProb` to
  60-65% for `detectMax`, `regTakeup` and `exemptClaimShare`, and 73-88% for everything else. Wide
  intervals cover the truth easily. What the check does show is that the pipeline is not biased
  away from the truth for any parameter, and that the parameters the full calibration labels
  "identified" are also the ones the reduced runs narrow most. Three cases cannot test
  calibration of the interval width itself.
- **One-at-a-time sensitivity** (each parameter from its posterior 5% to 95% quantile, the others at
  their medians; paired no-policy runs). At the medians the true effect on covered listings is
  −0.461 log points and on asking rents −0.64%. The covered-listings effect is most sensitive to
  `detectMax` (−0.24), `delistProb` (−0.24), `pReview` (+0.22) and `prShare` (+0.21); the exempt
  (spillover) effect to `demandSpillover` (+0.16) and `beta` (+0.11). No single parameter moves
  the asking-rent effect by more than 0.45 percentage points across its posterior range, so the
  rent effect stays small across the ensemble. `delistProb` changes the true effect by −0.24 but
  the Phase 1 DiD by 0.000, as it should: de-listing only starts in Phase 2.

Sobol indices over the full ensemble are planned for M5, after the model gains its full mechanics.

## 2. External validation (M3)

- **Held-out Salt Spring Island (H1): miss.** Data: 258 listings in Aug 2023, 252 in Jun 2026 (log
  change −0.024). Sim: −0.261 (5-95% −0.494 to −0.105). The model applies the full
  principal-residence rule from the Nov 2025 opt-in, so Salt Spring's non-principal-residence
  listings fall as the covered areas' did in 2024; the data show almost no fall by Jun 2026. Only
  two post-opt-in snapshots exist, and the explanation could be slower enforcement on the islands,
  a transition period, or hosts already registered as exempt. It is reported, not fitted.
- **Rent bound (S2): mostly inside.** The STR-attributable change in asking rents is −0.61% (5-95%
  −0.92% to −0.09%); 83% of the ensemble lies inside the first project's −3.3% to −0.4% bound. The 5-95%
  range never reaches the −3.3% end, so the members outside the bound are mainly ones with smaller
  effects (closer to zero) than the bound allows.
- **CPI sanity (S1): not comparable by design.** Real CPI rented accommodation rose 19.5% (Sep 2023
  to Jun 2026); the sim's CPI-style index rose 1.3%. The sim has no macro rent inflation
  (`rentDriftAnnual = 0`) because it isolates the STR channel. The STR-attributable part (S2) is
  too small to detect against CPI noise (ASSUMPTIONS O7: 2.4% month-to-month).
- **In-sample misses** (T2, T5, T6a) are diagnosed in [CALIBRATION.md](CALIBRATION.md#results).

## 3. DiD-recovery experiment

M4.
