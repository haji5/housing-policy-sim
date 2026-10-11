# Validation

Internal validation, external validation and the DiD-recovery experiment (PLAN §8).

## 1. Internal validation (automated, `packages/sim/test/`)

| Property                                                                                                                                                                                                                                                                                           | Test                                                                               | Since |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----- |
| RNG is a pure function of its keys, uniform, uncorrelated across agents; normal/Gumbel/Poisson moments                                                                                                                                                                                             | `rng.test.ts` (fast-check + moment checks)                                         | m1    |
| Conservation: every dwelling in one valid tenure, every household in one valid status, tenant ↔ dwelling links consistent, rents/incomes finite and positive, fixed dwelling stock                                                                                                                 | `invariants.test.ts` (fast-check over seeds × random policy schedules, every tick) | m1    |
| Determinism: same seed + params + policy ⇒ byte-identical output; no NaN/Infinity                                                                                                                                                                                                                  | `determinism.test.ts`                                                              | m1    |
| Replay equality: events given up front ≡ events added at the tick they occur (the game's mode)                                                                                                                                                                                                     | `determinism.test.ts`                                                              | m1    |
| CRN: a policy change at tick T leaves all outputs before T unchanged                                                                                                                                                                                                                               | `crn.test.ts`                                                                      | m1    |
| CRN: paired effect estimates have < ½ the variance of unpaired ones                                                                                                                                                                                                                                | `crn.test.ts`                                                                      | m1    |
| CRN: with markets decoupled, exempt-zone outcomes are identical under any covered-zone policy                                                                                                                                                                                                      | `crn.test.ts`                                                                      | m1    |
| Monotonicity: OPEN > PR rule ≥ PR + registry in covered listings (every seed)                                                                                                                                                                                                                      | `monotonicity.test.ts`                                                             | m1    |
| Monotonicity: illegal listings fall with enforcement level 0..5                                                                                                                                                                                                                                    | `monotonicity.test.ts`                                                             | m1    |
| Exempt zone does not lose listings when only covered zones are regulated                                                                                                                                                                                                                           | `monotonicity.test.ts`                                                             | m1    |
| Golden snapshot of a fixed small run                                                                                                                                                                                                                                                               | `golden.test.ts`                                                                   | m1    |
| Performance: ~10k agents × 60 ticks within budget                                                                                                                                                                                                                                                  | `perf.test.ts`; `pnpm sim bench`                                                   | m1    |
| Ensemble metadata matches the current priors, targets, defaults, scenario and SIM_VERSION                                                                                                                                                                                                          | `ensemble.test.ts`                                                                 | m3    |
| Two-way fixed-effects OLS recovers effects on noiseless (also unbalanced) panels; no-policy runs show no listing effect or pre-trends (T7, 8 seeds); the historical policy cuts covered listings relative to exempt ones                                                                           | `moments.test.ts`                                                                  | m3    |
| Researcher view: deterministic, never changes model output, shares draws across paired runs, unbiased scrape noise, configured truncation and CPI noise, the first project's 75% flag rule                                                                                                         | `researcher.test.ts`                                                               | m4    |
| Face validity of M5 mechanics: vacancy tax monotone in held-empty stock; upzoning acts only after the permit delay; rate hikes cut starts; 18-30 month completion lag; rent cap holds sitting-tenant rents; each shock card moves its target; every lever on Victoria without invariant violations | `mechanics.test.ts`                                                                | m5    |
| Game rules and scorecard: reproducible shock schedule, costs, cooldowns, irreversible upzoning, budget; a policy equal to the counterfactual scores zero; deterministic headless play                                                                                                              | `game.test.ts`                                                                     | m5    |
| UI (Playwright): full terms by mouse and keyboard only; debrief self-check (player's variant replays the live game exactly); DiD card; axe WCAG 2.1 AA audit of every screen; no third-party requests; first-interaction budget                                                                    | `apps/web/e2e/*.spec.ts`                                                           | m7-m8 |

### 1.1 Calibration pipeline checks (`pnpm validate`)

The generated report is [`calibration/reports/validation.md`](../calibration/reports/validation.md)
(raw numbers in `validation_results.json`). It was re-run on 2026-10-10 against the M5 ensemble
(sim 0.5.0, 16 calibrated parameters; 28.9 min). Validation uses seeds 101-104; calibration used
1-4. The M3 results it replaces are in git history (tag `m3`).

- **Estimator cross-check: pass.** The TypeScript DiD that produces the calibration moments equals
  pyfixest `feols(y ~ antic + p1 + p2 | zone + month)` (the first project's estimator) on the same
  simulated panel: largest absolute difference 9.8e-15 over the three coefficients (118 cells).
- **Parameter recovery: 79% coverage, every miss at a prior edge.** Three ensemble members
  (indices 75, 150, 224) were used as known truths: their moments on the validation seeds became
  pseudo-targets, and a reduced calibration (1,024 Sobol + Nelder-Mead + 1,024 ABC draws)
  re-estimated all 16 parameters. The truth lay inside the recovered 5-95% interval in 38 of 48
  parameter-cases (M3: 42 of 42 with 14 parameters). Case 1 covered all 16; case 2 missed 6
  (`pReview`, `prShare`, `investorEntry`, `detectMax`, `regTakeup`, `vacantHeldShare`) and case 3
  missed 4 (`investorEntry`, `regTakeup`, `demandGrowthAnnual`, `sellRateAnnual`). In all ten
  misses the true value sits in the outer 10% of its prior range (in the prior's own scale: at
  0.00-0.10 or 0.94-0.99 of the range), and the interval edge is 0.001-0.14 of the range away. That
  is what a weakly informative posterior does to an extreme truth: when the moments barely move a
  parameter, its recovered 5-95% interval stays close to the prior's central 90% and cannot reach
  the tails. The M5 ensemble contains such extreme members because its ESS is low (21; CALIBRATION.md).
  So the check finds no systematic bias for central truths, but it does say the intervals are
  too narrow at the edges of the priors. Intervals stay wide: 0.37 of the prior range for
  `delistProb`, 0.49-0.64 for `detectMax`, `exemptClaimShare` and `regTakeup`, 0.68-0.92 for the
  rest. Three cases cannot test calibration of the interval width itself.
- **One-at-a-time sensitivity** (each parameter from its posterior 5% to 95% quantile, the others at
  their medians; paired no-policy runs). At the medians the true effect on covered listings is
  −0.475 log points and on asking rents −0.54%. The covered-listings effect is most sensitive to
  `delistProb` (−0.38), `detectMax` (−0.30), `pReview` (+0.26), `complianceBase` (−0.26) and
  `prShare` (+0.20); the exempt (spillover) effect to `demandSpillover` (+0.14), `beta` (+0.09),
  `detectMax` (+0.09) and `complianceBase` (+0.08). No single parameter moves the asking-rent
  effect by more than 0.32 percentage points across its posterior range, so the rent effect stays
  small across the ensemble. `delistProb` changes the true effect by −0.38 but the Phase 1 DiD by
  0.000, as it should: de-listing only starts in Phase 2.

- **Sobol indices** (`pnpm sobol`, [`calibration/reports/sobol.md`](../calibration/reports/sobol.md);
  2026-10-10, n = 256, 4,608 draws × seeds 1-2, 15.5 min). Each of the 16 parameters varies
  uniformly over its posterior 5-95% range (log scale for log-uniform priors), over the
  calibration window under the historical policy, each draw paired with its no-policy run. S1 is
  the share of output variance a parameter explains alone, ST includes its interactions; 90%
  bootstrap intervals are ±0.03-0.10. Slightly negative S1 values are estimator noise.
  - _Covered-listings effect_: almost additive (ΣS1 = 0.92). `delistProb` (S1 0.29), `prShare`
    (0.23) and `pReview` (0.15) explain two thirds of the variance; with `detectMax`,
    `complianceBase` and `regTakeup` (0.07-0.08 each) six parameters explain nearly all of it.
    The spillover parameters (`demandSpillover`, `investorEntry`) explain ≤ 1%.
  - _Asking-rent effect_: ΣS1 = 0.90, but led by the host-side parameters that decide where
    displaced units go and how many there are: `prShare` (ST 0.31), `complianceBase` (0.24),
    `sellRateAnnual` (0.24), `pReview` (0.22), then `vacantHeldShare` (ST 0.18 with S1 ≈ 0, so
    only through interactions) and `arrivalRentElasticity` (0.15). Enforcement parameters matter
    less for rents (ST ≤ 0.12) than for listings. Of the six leaders only `sellRateAnnual` is
    identified by the M5 calibration; the others are partly or weakly identified
    (CALIBRATION.md). So the rent effect's spread is driven by what the listing data cannot pin
    down, which is why the game shows rents with an "Assumed" badge. The whole spread is
    still small: one-at-a-time, no parameter moves it by more than 0.32 points (above).
  - _Rent-burden share (level)_: `arrivalRentElasticity` (S1 0.39, ST 0.57) and
    `vacantHeldShare` (0.21 / 0.42); strong interactions (ΣS1 = 0.69). The level is not
    calibrated (§5), and the game scores only changes against the no-policy run.
  - _Completions_: mostly interactions (ΣS1 = 0.35): `vacantHeldShare` (ST 0.68),
    `sellRateAnnual` (0.56), `pReview` (0.52), `beta` (0.44), `prShare` (0.43), which act through
    rents and the stock available to developers. `delistProb`, `regTakeup`, `exemptClaimShare`
    and `demandSpillover` leave completions in the window exactly unchanged (zero variance, so
    their bootstrap intervals are undefined).
  - _Caveats_: the box ignores posterior correlations, so it is wider than the joint posterior;
    with two seeds, simulation noise counts as unexplained variance (it lowers ΣS1); the sample
    (n = 256) gives intervals of up to ±0.10.

## 2. External validation (M5 ensemble)

- **Held-out Salt Spring Island (H1): miss.** Data: 258 listings in Aug 2023, 252 in Jun 2026 (log
  change −0.024). Sim: −0.382 (5-95% −0.715 to −0.172); M3 was −0.261, so the miss grew. The model
  applies the full principal-residence rule from the Nov 2025 opt-in, so Salt Spring's
  non-principal-residence listings fall as the covered areas' did in 2024; the data show almost no
  fall by Jun 2026. Only two post-opt-in snapshots exist, and the explanation could be slower
  enforcement on the islands, a transition period, or hosts already registered as exempt. It is
  reported, not fitted.
- **Rent bound (S2): mostly inside.** The STR-attributable change in asking rents is −0.48% (5-95%
  −0.66% to −0.30%); 78% of the ensemble lies inside the first project's −3.3% to −0.4% bound
  (M3: 83%). The 5-95% range never reaches the −3.3% end, so the members outside the bound are
  ones with smaller effects (closer to zero) than the bound allows. Either way the effect is too
  small to detect in the CPI data.
- **CPI sanity (S1): not comparable by design.** Real CPI rented accommodation rose 19.5% (Sep 2023
  to Jun 2026); the sim's CPI-style index changed by −0.3%. The sim has no macro rent inflation
  (`rentDriftAnnual = 0`) because it isolates the STR channel. The STR-attributable part of the
  CPI-style index is −0.24% (calibration report), too small to detect against CPI noise
  (ASSUMPTIONS O7: 2.4% month-to-month).
- **In-sample misses** (T2, T5, T6a) are diagnosed in [CALIBRATION.md](CALIBRATION.md#results).

## 3. DiD-recovery experiment (M4)

**Question.** The first project's headline estimate (T1: Phase 1 cut covered-area entire-home
listings by −0.390 log points) compares covered areas with three small exempt areas. If the rule
pushes STR demand and investors into those exempt areas, the control group is itself treated
(a SUTVA violation) and the DiD overstates the effect. Inside the model the truth is known, so we
can measure the bias.

**Design** ([`calibration/did_recovery.py`](../calibration/did_recovery.py), report
[`calibration/reports/did_recovery.md`](../calibration/reports/did_recovery.md)). For 60 ensemble
members × 5 spillover strengths (0, 0.5, 1, 2, 3 × each member's calibrated `demandSpillover` and
`investorEntry`), the sim runs the Historical Bill 35 policy and no policy on the same seed
(common random numbers). The **truth** is the mean over the Phase 1 snapshots (Jun 2024-Mar 2025)
of log covered listings with the policy minus without it. The **estimate** is the first project's
regression, `log(1+n) ~ antic + phase1 + phase2 | zone + month` with zone-clustered SEs, run with
pyfixest on the researcher view (ADR 0006): quarterly snapshots with scrape noise, 7.7% truncated
snapshots, and the first project's 75% flag rule. Salt Spring leaves the control group at its
opt-in, as in the first project. Ten members per level also get placebo-in-space randomization
inference over all 56 three-zone control groups.

![DiD recovery](../calibration/reports/did_recovery.png)

| Spillover | True effect | DiD estimate |  Mean bias | Bias, 5-95% of runs | 95% CI covers truth |
| --------: | ----------: | -----------: | ---------: | ------------------: | ------------------: |
|        0× |      −0.346 |       −0.339 |     +0.007 |    −0.108 to +0.150 |                 93% |
|      0.5× |      −0.350 |       −0.361 |     −0.010 |    −0.146 to +0.141 |                 93% |
|    **1×** |  **−0.348** |   **−0.384** | **−0.037** |    −0.165 to +0.086 |                 92% |
|        2× |      −0.356 |       −0.410 |     −0.054 |    −0.196 to +0.064 |                 87% |
|        3× |      −0.356 |       −0.437 |     −0.080 |    −0.221 to +0.042 |                 75% |

**Plain answer: yes, the DiD is biased, and in the direction that overstates the effect.** At the
calibrated spillover strength the covered-vs-exempt DiD estimates −0.384 against a true effect of
−0.348. It overstates the fall in covered listings by 0.037 log points, about 11% of the true
effect. The bias grows roughly linearly with spillover: about zero (+0.007) with no spillover,
−0.054 at twice the calibrated strength and −0.080 at three times (23% of the true effect). Read
back onto the real estimate, T1 = −0.390 would correspond to a true effect of about −0.35 at the
calibrated spillover, and anywhere from about −0.40 (no spillover) to −0.31 (3×).

What drives it, and what does not:

- **Spillover into the control group is most of it.** In a 24-member check at 1×, the policy
  raised listings in the control zones by +0.028 log points (equal weight per zone, as in the
  regression); at 3× by +0.062. The DiD subtracts that rise as if it were the counterfactual
  trend. The remaining ~0.01-0.02 comes from the regression's equal zone weighting and its
  pre-period baseline (it is about −0.01 even with no spillover).
- **Measurement noise adds almost no bias.** The same regression on the noise-free true panel
  gives nearly the same mean (−0.388 vs −0.384 at 1×). Scrape noise and truncation add a run-level
  SD of about 0.03. The first project's 75% rule catches nearly all truncated snapshots (0.02 missed
  per run), but it also drops a complete snapshot in about 7% of runs, when the policy's own sharp
  fall trips it. Runs with a false flag are not more biased (mean bias +0.015 vs −0.040 at 1×).
- **Single-run error is large compared with the bias.** Even with no spillover the bias ranges
  from −0.11 to +0.15 across runs (SD 0.085): with three small control areas, idiosyncratic swings
  in the control zones move a single estimate a lot. The zone-clustered 95% CI still covers the
  truth 92-93% of the time up to 1×, falling to 75% at 3× as bias grows relative to the SE.
- **Inference.** The RI p-value sits at its floor of 1/56 = 0.018 in the median run at every level:
  the true covered-area effect is far larger than any placebo assignment. The real data's RI p was
  0.011. So the existence of a large effect is robust; its size is overstated by roughly 0-0.08 log
  points depending on spillover.

**Why this cannot be settled with the listings data.** Spillover strength is weakly identified by
the calibration (contraction −0.04 for `demandSpillover` and 0.10 for `investorEntry`,
CALIBRATION.md). Within the model, the first project's estimate is more likely to overstate the
fall than to understate it: the true effect is plausibly 0-20% smaller than −0.390.

**Caveats.** This is a property of the model, not proof about the real world: the spillover
mechanisms (tourist demand shifting in proportion to exempt demand; investor purchases responding to
STR profits) are ASSUMED functional forms. The truth here is the Phase 1 window average; the
first project's Phase 2 term is not examined.

## 4. Balance playtests (M5)

**Question (PLAN §10 M5).** With all six levers, the scorecard and the mandates, does any single
strategy dominate? Five scripted strategies (`packages/sim/src/playtest.ts`) play full 20-turn
terms under the game rules, each against its paired no-policy run (same seed, same ensemble
member, same shock cards), on seeds 1-8 with the M5 ensemble:
`pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json`.

| Strategy                                                   | Rent burden (pp) | Stress rate (pp) | Completions | STR listings | Asking rent (pts) | Fiscal ($M) |
| ---------------------------------------------------------- | ---------------: | ---------------: | ----------: | -----------: | ----------------: | ----------: |
| Status quo                                                 |             0.00 |             0.00 |           0 |           0% |              0.00 |         0.0 |
| STR crackdown (rule + registry, max enforcement)           |            −0.22 |            +0.04 |         −40 |         −40% |             −0.32 |       −17.8 |
| Supply push (aggressive upzoning + 10 non-market/qtr)      |            −0.22 |            −0.15 |      +6,809 |          +1% |             −0.84 |       −30.0 |
| Tenant protection (1% cap, 3% vacancy tax, PR rule)        |            −2.73 |            −0.15 |        −513 |         −24% |             −0.75 |      +162.6 |
| Balanced (rule + registry, 1% vacancy tax, upzoning, data) |            −0.74 |            −0.06 |      +1,824 |         −38% |             −1.35 |       +83.6 |

Effects are means over the 8 seeds, versus the paired no-policy run. Asking rent is the gap in
the asking-rent index (start = 100) at the end of the term.

**Mandate scores** (mean points; per-seed winners in brackets):

| Strategy          |           Balanced |      Affordability |    Balanced budget |            Tourism |
| ----------------- | -----------------: | -----------------: | -----------------: | -----------------: |
| Status quo        |              +2.00 |              +0.92 |              +1.85 |              +1.38 |
| STR crackdown     |              −1.60 |              −0.64 |              −1.12 |              −6.62 |
| Supply push       |     +4.28 (5 of 8) |     +3.57 (2 of 8) |              +2.61 | **+3.02** (7 of 8) |
| Tenant protection | **+4.58** (3 of 8) | **+4.90** (6 of 8) | **+8.01** (8 of 8) |     +0.53 (1 of 8) |
| Balanced          |              +1.42 |              +1.77 |              +3.70 |              −3.84 |

**Plain answer: no single strategy dominates, but tenant protection is strong.**

- **Pareto check over the six objectives:** only the STR crackdown is dominated (by the balanced
  mix, which does at least as well on every objective). Status quo, supply, tenant protection
  and balanced are each best or second-best on something.
- **Winners differ by mandate and by seed.** Supply wins the tourism mandate and most seeds of the
  balanced one; tenant protection wins the budget mandate on every seed and affordability on 6 of 8. Its balanced-mandate mean (+4.58) beats supply's (+4.28) only because of one seed (seed 8,
  +10.7); per seed, supply wins 5 of 8.
- **Why tenant protection scores well:** the 3% vacancy tax raises about $160M over the term,
  and the fiscal objective is worth 1 point per $10M (ASSUMED, ADR 0009). Its supply cost is
  real but modest in points (−513 completions ≈ −1 point). Its results vary most across model
  variants (balanced-mandate score 2.0 to 10.7 across seeds), so it is also the riskiest
  strategy. Points scales were not re-tuned after this run.
- **The STR crackdown loses on every mandate.** It cuts listings by 40% (a large visitor-capacity
  cost) and moves rents and stress by amounts too small to detect in a real data set
  (asking rents −0.3 points; the stress rate slightly up). That is the Bill 35 lesson the game is
  built around.

## 5. Known limitations (M5)

Measured with the M5 ensemble (members 0, 50, …, 250; seed 7; no policy; 72 months):

- **Held-empty stock creeps up** by about 16% over six years with no policy
  (`host.vacantHeldShare` is weakly identified). Games are scored against the paired no-policy
  run, so the drift cancels in the score but shows on the map.
- **Housing-stress levels are not calibrated.** The rent-burden share is about 68% and about 15% of
  renter households double up or leave over six years: income (ASSUMPTIONS A31) and
  `maxRentShare` are VERIFY/ASSUMED. The scorecard therefore uses changes in the stress rate
  against the no-policy run, never the level.
- **Placebo drift.** With no policy, the covered-minus-exempt listing gap drifts within about ±0.05
  log points over 64 months (ADR 0005), so small in-game DiD readings are noise.
- **ESS 21** in the M5 calibration (CALIBRATION.md): the game's 300 parameter sets contain 179
  distinct ones.
