# Validation

Internal validation, external validation and the DiD-recovery experiment.

## 1. Internal validation (automated, `packages/sim/test/`)

| Property                                                                                                                                                                                                                                                                                           | Test                                                                               | Since   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| RNG is a pure function of its keys, uniform, uncorrelated across agents; normal/Gumbel/Poisson moments                                                                                                                                                                                             | `rng.test.ts` (fast-check + moment checks)                                         | m1      |
| Conservation: every dwelling in one valid tenure, every household in one valid status, tenant ↔ dwelling links consistent, rents/incomes finite and positive, fixed dwelling stock                                                                                                                 | `invariants.test.ts` (fast-check over seeds × random policy schedules, every tick) | m1      |
| Determinism: same seed + params + policy ⇒ byte-identical output; no NaN/Infinity                                                                                                                                                                                                                  | `determinism.test.ts`                                                              | m1      |
| Replay equality: events given up front ≡ events added at the tick they occur (the game's mode)                                                                                                                                                                                                     | `determinism.test.ts`                                                              | m1      |
| CRN: a policy change at tick T leaves all outputs before T unchanged                                                                                                                                                                                                                               | `crn.test.ts`                                                                      | m1      |
| CRN: paired effect estimates have < ½ the variance of unpaired ones                                                                                                                                                                                                                                | `crn.test.ts`                                                                      | m1      |
| CRN: with markets decoupled, exempt-zone outcomes are identical under any covered-zone policy                                                                                                                                                                                                      | `crn.test.ts`                                                                      | m1      |
| Monotonicity: OPEN > PR rule ≥ PR + registry in covered listings (every seed)                                                                                                                                                                                                                      | `monotonicity.test.ts`                                                             | m1      |
| Monotonicity: illegal listings fall with enforcement level 0..5                                                                                                                                                                                                                                    | `monotonicity.test.ts`                                                             | m1      |
| Exempt zone does not lose listings when only covered zones are regulated                                                                                                                                                                                                                           | `monotonicity.test.ts`                                                             | m1      |
| Renter buyers (ADR 0013): none at share 0; invariants every tick; no-policy renter population, asking rent and rent-burden share unchanged by buyers; buyers deepen the rule's rent effect                                                                                                         | `renterBuyers.test.ts`                                                             | post-m8 |
| Golden snapshot of a fixed small run                                                                                                                                                                                                                                                               | `golden.test.ts`                                                                   | m1      |
| Performance: ~10k agents × 60 ticks within budget                                                                                                                                                                                                                                                  | `perf.test.ts`; `pnpm sim bench`                                                   | m1      |
| Ensemble metadata matches the current priors, targets, defaults, scenario and SIM_VERSION                                                                                                                                                                                                          | `ensemble.test.ts`                                                                 | m3      |
| Two-way fixed-effects OLS recovers effects on noiseless (also unbalanced) panels; no-policy runs show no listing effect or pre-trends (T7, 8 seeds); the historical policy cuts covered listings relative to exempt ones                                                                           | `moments.test.ts`                                                                  | m3      |
| Researcher view: deterministic, never changes model output, shares draws across paired runs, unbiased scrape noise, configured truncation and CPI noise, the first project's 75% flag rule                                                                                                         | `researcher.test.ts`                                                               | m4      |
| Face validity of M5 mechanics: vacancy tax monotone in held-empty stock; upzoning acts only after the permit delay; rate hikes cut starts; 18-30 month completion lag; rent cap holds sitting-tenant rents; each shock card moves its target; every lever on Victoria without invariant violations | `mechanics.test.ts`                                                                | m5      |
| Game rules and scorecard: reproducible shock schedule, costs, cooldowns, irreversible upzoning, budget; a policy equal to the counterfactual scores zero; deterministic headless play                                                                                                              | `game.test.ts`                                                                     | m5      |
| UI (Playwright): full terms by mouse and keyboard only; debrief self-check (player's variant replays the live game exactly); DiD card; axe WCAG 2.1 AA audit of every screen; no third-party requests; first-interaction budget                                                                    | `apps/web/e2e/*.spec.ts`                                                           | m7-m8   |

### 1.1 Calibration pipeline checks (`pnpm validate`)

The generated report is [`calibration/reports/validation.md`](../calibration/reports/validation.md)
(raw numbers in `validation_results.json`). It was re-run on 2026-10-12 against the current
ensemble (sim 0.6.0, 18 calibrated parameters, ADR 0013). Validation uses seeds 101-104;
calibration used 1-4. Earlier results are in git history (tags `m3`, `m5`).

- **Estimator cross-check: pass.** The TypeScript DiD that produces the calibration moments equals
  pyfixest `feols(y ~ antic + p1 + p2 | zone + month)` (the first project's estimator) on the same
  simulated panel: largest absolute difference 5.6e-15 over the three coefficients (118 cells).
- **Parameter recovery: 87% coverage, every miss at a prior edge.** Three ensemble members were
  used as known truths: their moments on the validation seeds became pseudo-targets, and a reduced
  calibration (1,024 Sobol draws + Nelder-Mead + 2 ABC-SMC generations of 768) re-estimated all 18
  parameters. The truth lay inside the recovered 5-95% interval in 47 of 54 parameter-cases (M5
  ensemble: 38 of 48). Case 1 missed `prShare`, `demandGrowthAnnual` and `sellRateAnnual`; case 2
  missed `investorEntry`; case 3 missed `pReview`, `kappa` and `eta`. In all seven misses the true
  value sits in the outer 4% of its prior range (in the prior's own scale), and the interval edge
  is 0.02-0.06 of the range away. That is what a weakly informative posterior does to an extreme
  truth: when the moments barely move a parameter, its recovered interval stays close to the
  prior's central 90% and cannot reach the tails. So the check finds no systematic bias for
  central truths, but intervals are too narrow at the edges of the priors. Intervals stay wide:
  0.55-0.69 of the prior range for `delistProb`, `regTakeup` and `exemptClaimShare`, 0.75-0.89 for
  the rest. Three cases cannot test calibration of the interval width itself.
- **One-at-a-time sensitivity** (each parameter from its posterior 5% to 95% quantile, the others at
  their medians; paired no-policy runs). At the medians the true effect on covered listings is
  −0.587 log points and on asking rents −0.58%. The covered-listings effect is most sensitive to
  `delistProb` (−0.38), `detectMax` (−0.28), `prShare` (+0.26), `pReview` (+0.22) and
  `complianceBase` (−0.17); the exempt (spillover) effect to `demandSpillover` (+0.16), `beta`
  (+0.11) and `investorEntry` (+0.08). The asking-rent effect is moved most by `eta` (+0.82
  points) and `kappa` (−0.68); no host or enforcement parameter moves it by more than 0.26 points.
  `delistProb` changes the true effect by −0.38 but the Phase 1 DiD by 0.000, as it should:
  de-listing only starts in Phase 2.

- **Sobol indices** (`pnpm sobol`, [`calibration/reports/sobol.md`](../calibration/reports/sobol.md);
  2026-10-12, n = 256, 5,120 draws × seeds 1-2, 14 min). Each of the 18 parameters varies
  uniformly over its posterior 5-95% range (log scale for log-uniform priors), over the
  calibration window under the historical policy, each draw paired with its no-policy run. S1 is
  the share of output variance a parameter explains alone, ST includes its interactions; 90%
  bootstrap intervals are ±0.03-0.12. Slightly negative S1 values are estimator noise.
  - _Covered-listings effect_: almost additive (ΣS1 = 0.90). `prShare` (S1 0.30), `delistProb`
    (0.25) and `pReview` (0.13) explain two thirds of the variance; with `detectMax` (0.10),
    `regTakeup` (0.06) and `complianceBase` (0.04) six parameters explain nearly all of it. The
    spillover parameters (`demandSpillover`, `investorEntry`) explain ≤ 1%.
  - _Asking-rent effect_: led by the rent-dynamics parameters now in the ensemble: `kappa` (S1
    0.29, ST 0.44) and `eta` (0.23 / 0.39), then `arrivalRentElasticity` (ST 0.19). Host-side
    parameters matter through interactions (`pReview`, `sellRateAnnual`, `prShare`: ST 0.09-0.11).
    ΣS1 = 0.52, so interactions are strong. All three leaders are weakly identified by the listing
    data, which is why the game shows rents with an "Assumed" badge.
  - _Rent-burden share (level)_: `eta` (S1 0.42) and `kappa` (0.32). The level is not calibrated
    (§5), and the game scores only changes against the no-policy run.
  - _Completions_: `kappa` (S1 0.59) and `eta` (0.20), which act through asking rents and so
    through developers' starts.
  - _Caveats_: the box ignores posterior correlations, so it is wider than the joint posterior;
    with two seeds, simulation noise counts as unexplained variance (it lowers ΣS1); the sample
    (n = 256) gives intervals of up to ±0.12.

## 2. External validation (current ensemble)

- **Held-out Salt Spring Island (H1): miss.** Data: 258 listings in Aug 2023, 252 in Jun 2026 (log
  change −0.024). Sim: −0.426 (5-95% −0.661 to −0.196); M5 was −0.382 and M3 −0.261. The model
  applies the full principal-residence rule from the Nov 2025 opt-in, so Salt Spring's
  non-principal-residence listings fall as the covered areas' did in 2024; the data show almost no
  fall by Jun 2026. Only two post-opt-in snapshots exist, and the explanation could be slower
  enforcement on the islands, a transition period, or hosts already registered as exempt. It is
  reported, not fitted.
- **Rent bound (S2): partly inside.** The STR-attributable change in asking rents is −0.57% (5-95%
  −1.52% to −0.14%); 60% of the ensemble lies inside the first project's −3.3% to −0.4% bound
  (M5: 78%, with a much narrower range). Since ADR 0013 the range includes the uncertainty in the
  asking-rent adjustment speed (`kappa`) and the vacancy pull on arrivals (`eta`), which the
  listing data cannot pin down and which drive most of it. The members outside the bound have
  smaller effects (closer to zero) than the bound allows. Either way the effect is too small to
  detect in the CPI data. The bound check is weak evidence about the rent effect's size; the model
  does not measure it.
- **CPI sanity (S1): not comparable by design.** Real CPI rented accommodation rose 19.5% (Sep 2023
  to Jun 2026); the sim's CPI-style index changed by −0.3%. The sim has no macro rent inflation
  (`rentDriftAnnual = 0`) because it isolates the STR channel. The STR-attributable part of the
  CPI-style index is −0.30% (calibration report), too small to detect: the first project's
  Phase 1 rent estimate (CPI level DiD, BC metros vs Ottawa) has a standard error of 1.1 points.
- **In-sample misses** (T2, T3 at its last point, T5, T6a) are diagnosed in
  [CALIBRATION.md](CALIBRATION.md#results).

## 3. DiD-recovery experiment (M4; re-run on the current ensemble)

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

_Re-run on 2026-10-12 against the current ensemble (ADR 0013). The M5-ensemble version (truth
−0.385, DiD −0.425 at 1×, 10% overstatement) is in git history; the version committed with M4 had
been generated from the M3 ensemble._

| Spillover | True effect | DiD estimate |  Mean bias | Bias, 5-95% of runs | Control-group spillover | 95% CI covers truth |
| --------: | ----------: | -----------: | ---------: | ------------------: | ----------------------: | ------------------: |
|        0× |      −0.364 |       −0.340 |     +0.024 |    −0.095 to +0.150 |                  −0.002 |                 92% |
|      0.5× |      −0.366 |       −0.361 |     +0.005 |    −0.103 to +0.128 |                  +0.013 |                 90% |
|    **1×** |  **−0.366** |   **−0.377** | **−0.011** |    −0.126 to +0.091 |                  +0.029 |                 88% |
|        2× |      −0.371 |       −0.417 |     −0.046 |    −0.155 to +0.061 |                  +0.054 |                 83% |
|        3× |      −0.367 |       −0.434 |     −0.067 |    −0.175 to +0.030 |                  +0.069 |                 78% |

Control-group spillover is the policy's true effect on listings in the zones the regression uses
as controls: Juan de Fuca, the Southern Gulf Islands and Salt Spring before its opt-in, over the
Phase 1 window.

**What "2×" and "3×" mean.** Each level multiplies `demandSpillover` and `investorEntry`, but
`demandSpillover` cannot exceed 1. At 2× it is capped for 53% of the members, and at 3× for 72%.
`investorEntry` then goes beyond the calibration prior's maximum (0.01) for 60% and 78% of them.
So the upper levels mostly test investor entry outside the prior; they are stress tests, not
plausible worlds.

**Plain answer: at plausible spillover strengths the DiD is close to unbiased.** At the calibrated
strength the covered-vs-exempt DiD estimates −0.377 against a true effect of −0.366: it overstates
the fall in covered listings by 0.011 log points, 3% of the true effect. With no spillover it
understates the fall by 7% (+0.024); at half strength it is within 1%. Only spillover well
beyond the calibrated range produces a sizeable overstatement (−0.046 at 2×, −0.067 at 3×).

**Data check on spillover strength.** The calibration barely identifies spillover (contraction
0.05 for `demandSpillover` and 0.13 for `investorEntry`; CALIBRATION.md). But the control areas'
own listing path before Salt Spring's opt-in is direct evidence. The report compares the simulated
control-group path at ticks 3-24 with the observed one (targets T4 + H1):

| Spillover | Mean gap, sim − data |  RMSE |
| --------: | -------------------: | ----: |
|        0× |               −0.030 | 0.086 |
|      0.5× |               −0.012 | 0.078 |
|        1× |               +0.005 | 0.078 |
|        2× |               +0.041 | 0.090 |
|        3× |               +0.055 | 0.102 |

Half and full calibrated strength fit equally well; no spillover fits slightly worse, and 2× and
3× clearly worse. The differences are small relative to snapshot noise, so this is weak evidence.
The observed path also includes a common trend the model attributes to tourist demand growth.
Salt Spring alone points the other way: before its opt-in the model has its listings rising
(spillover), while the data show −0.07 to +0.04 (CALIBRATION.md, H1). (On the M5 ensemble, half
strength fitted best and the overstatement at full strength was 10%.)

**Read back onto the real estimate.** T1 = −0.390 corresponds to a true Phase 1 effect of about
−0.38 at the calibrated spillover (3% overstatement), about −0.40 at half strength and about −0.42
with no spillover. The true effect is plausibly within about 7% of −0.390, in either direction.

What drives it, and what does not:

- **Spillover into the control group is most of it.** The DiD subtracts the control group's
  policy-driven rise as if it were the counterfactual trend. The mean bias tracks that rise closely
  from 0.5× to 3×. With no spillover, the regression's equal zone weighting and log(1 + n) form
  leave a small bias in the other direction (+0.024).
- **Measurement noise adds almost no bias.** The same regression on the noise-free true panel
  gives nearly the same mean (−0.382 vs −0.377 at 1×). Scrape noise and truncation add a run-level
  SD of about 0.03. The first project's 75% rule catches nearly all truncated snapshots (0.02 missed
  per run) and drops a complete snapshot in about 3-5% of runs, when the policy's own sharp fall
  trips it.
- **Single-run error is large compared with the bias.** Across runs the bias has an SD of about
  0.07 at every level: with three small control areas, idiosyncratic swings in the control zones
  move a single estimate a lot. The zone-clustered 95% CI covers the truth 88-92% of the time up
  to 1×, falling to 78% at 3× as bias grows relative to the SE.
- **Inference.** The RI p-value sits at its floor of 1/56 = 0.018 in the median run at every
  level. The true covered-area effect is far larger than any placebo assignment, so RI cannot
  rank runs further. The real data's RI p was 0.011, with 29 neighbourhoods. The existence of a
  large effect is robust.

**Caveats.** This is a property of the model, not proof about the real world. The spillover
mechanisms are ASSUMED functional forms: tourist demand shifts in proportion to exempt demand, and
investor purchases respond to STR profits. The truth here is the Phase 1 window average, which
differs from the June 2026 effect quoted elsewhere (−0.640, rule plus registry). The first
project's Phase 2 term is not examined.

## 4. Balance playtests

**Question.** With all six levers, the scorecard and the mandates, does any single
strategy dominate? Five scripted strategies (`packages/sim/src/playtest.ts`) play full 20-turn
terms under the game rules, each against its paired no-policy run (same seed, same ensemble
member, same shock cards), on seeds 1-8 with the current ensemble (re-run 2026-10-12):
`pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json`.

| Strategy                                                   | Rent burden (pp) | Stress rate (pp) | Completions | STR listings | Asking rent (pts) | Fiscal ($M) |
| ---------------------------------------------------------- | ---------------: | ---------------: | ----------: | -----------: | ----------------: | ----------: |
| Status quo                                                 |             0.00 |             0.00 |           0 |           0% |              0.00 |         0.0 |
| STR crackdown (rule + registry, max enforcement)           |            −0.11 |            −0.01 |         −66 |         −40% |             +0.25 |       −17.3 |
| Supply push (aggressive upzoning + 10 non-market/qtr)      |            −0.15 |            −0.16 |      +6,781 |          +2% |             −1.06 |       −30.0 |
| Tenant protection (1% cap, 3% vacancy tax, PR rule)        |            −2.74 |            −0.09 |        −577 |         −25% |             −0.37 |      +148.5 |
| Balanced (rule + registry, 1% vacancy tax, upzoning, data) |            −0.80 |            −0.14 |      +1,772 |         −38% |             −1.25 |       +71.8 |

Effects are means over the 8 seeds, versus the paired no-policy run. Asking rent is the gap in
the asking-rent index (start = 100) at the end of the term.

**Mandate scores** (mean points; per-seed winners in brackets):

| Strategy          |           Balanced |      Affordability |    Balanced budget |            Tourism |
| ----------------- | -----------------: | -----------------: | -----------------: | -----------------: |
| Status quo        |              +2.00 |              +0.92 |              +1.85 |              +1.38 |
| STR crackdown     |              −1.59 |              −0.62 |              −1.10 |              −6.59 |
| Supply push       | **+4.30** (5 of 8) |     +3.54 (2 of 8) |     +2.63 (1 of 8) | **+3.12** (7 of 8) |
| Tenant protection |     +4.16 (3 of 8) | **+4.56** (6 of 8) | **+7.34** (7 of 8) |     +0.06 (1 of 8) |
| Balanced          |              +1.40 |              +1.97 |              +3.36 |              −3.84 |

**Plain answer: no single strategy dominates, but tenant protection is strong.**

- **Pareto check over the six objectives:** only the STR crackdown is dominated (by the balanced
  mix, which does at least as well on every objective). Status quo, supply, tenant protection
  and balanced are each best or second-best on something.
- **Winners differ by mandate and by seed.** Supply wins the tourism mandate and 5 of 8 seeds of
  the balanced one; tenant protection wins the budget mandate on 7 of 8 seeds and affordability
  on 6 of 8.
- **Why tenant protection scores well:** the 3% vacancy tax raises about $150M over the term,
  and the fiscal objective is worth 1 point per $10M (ASSUMED, ADR 0009). Its supply cost is
  real but modest in points (−577 completions ≈ −1 point). Its results vary most across model
  variants (balanced-mandate score 0.9 to 6.5 across seeds), so it is also the riskiest
  strategy. The revenue rests on the held-vacant share, which the calibration barely identifies:
  on a discarded intermediate ensemble (ADR 0013) the same strategy raised about $94M and supply
  won three mandates. Points scales were not re-tuned.
- **The STR crackdown loses on every mandate.** It cuts listings by 40% (a large visitor-capacity
  cost) and moves rents and stress by amounts too small to detect in a real data set
  (asking rents +0.25 points; the stress rate unchanged). That is the Bill 35 lesson the game is
  built around.

## 5. Known limitations

Measured with the current ensemble (members 0, 50, …, 250; seed 7; no policy; 72 months):

- **Held-empty stock grows with the housing stock.** It rises by 5-25% over six years, while the
  total stock grows 12% through construction; as a share of investor units it is flat (it moves by
  −0.5 to +0.7 points). An earlier version of this list called this a drift; it is not one.
- **Housing-stress levels are not calibrated.** The rent-burden share is about 69% and stays there,
  and the households who double up or leave over six years equal about 20-24% of the starting
  renter households (mostly arrivals who cannot afford any unit): income (ASSUMPTIONS A31) and
  `maxRentShare` are VERIFY/ASSUMED, and rents are not matched to incomes (a low-income household
  takes any unit it can afford). The scorecard therefore uses changes against the no-policy run,
  never levels.
- **Real asking rents drift down** by 1-4% over six years with no policy, while real-world rents
  rose; the model has no macro rent trend (`rentDriftAnnual = 0`) and is built to isolate the STR
  channel (S1).
- **Long-run rent sign (IIA leakage).** With the principal-residence rule from turn 1 (30 members
  × seeds 1-2, 60 months), the asking-rent gap to no policy is −0.34 points at month 33 (6 of 60
  runs positive) but −0.11 at month 59 (22 of 60 positive; 5-95% −0.81 to +0.58). Owner-occupied
  stock ends 1,160 homes higher on average (5-95% 135 to 2,895). Cause: the investor logit (ADR 0007) has the IIA property, so removing the STR option raises the SELL odds of every reviewing
  investor unit in covered zones, not only of former STRs, while purchases from owner-occupiers
  do not respond. Rentals leak to owner-occupation, the households drawn in by the early rental
  gain compete for the same stock, and rents can end above the no-policy run. The direction is
  economically plausible (the STR option's value is capitalised; some investors sell); its size
  rests on IIA and is not measured. A nested choice set or return-sensitive purchases would change
  it (needs an ADR and re-calibration). The headline rent effect is quoted at Jun 2026 (month 33).
- **Placebo drift.** With no policy, the covered-minus-exempt listing gap drifts within about ±0.05
  log points over 64 months (ADR 0005), so small in-game DiD readings are noise.
- **ESS about 63** in the current calibration (CALIBRATION.md; M5: 21): the game's 300 parameter
  sets contain 174 distinct ones, the most frequent 26 times.
