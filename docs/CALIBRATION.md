# Calibration

How the model is calibrated to the Bill 35 evidence (PLAN §7). The generated report with every
number and figure is [`calibration/reports/calibration.md`](../calibration/reports/calibration.md).

## Targets

All targets come from the first project, [bc-str-ban-analysis](https://github.com/haji5/bc-str-ban-analysis)
(local copy at commit `ec77fe1`). Each one is in
[`calibration/inputs/targets.json`](../calibration/inputs/targets.json) with the file and field it
was read from.

| ID  | What                                                                           | Value                           | Role                                             |
| --- | ------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------ |
| T1  | Phase 1 DiD, covered vs exempt, log active entire-home listings                | −0.390 (SE 0.054), RI p = 0.011 | fit                                              |
| T1a | Anticipation term of the same regression (Oct 2023-Apr 2024)                   | −0.124 (SE 0.034)               | fit                                              |
| T2  | Phase 2 incremental DiD                                                        | −0.115 (SE 0.046), RI p = 0.27  | fit, weight ¼ (not distinguishable from placebo) |
| T3  | Covered-area listings path, Aug 2023 = 3,133 → Jun 2026 = 2,033                | 10 snapshots                    | fit                                              |
| T4  | Never-covered listings path, 500 → 532                                         | 10 snapshots                    | fit                                              |
| T5  | Multi-listing-host share, Victoria entire homes                                | 46.05% → 37.59%                 | fit (end)                                        |
| T6  | Share with a provincial registration number / showing "Exempt", Jun 2026       | 70.0% / 9.4%                    | fit                                              |
| T7  | Pre-announcement event-study leads                                             | ≈ 0 (Wald p = 0.29)             | soft constraint                                  |
| H1  | Salt Spring Island path (opt-in Nov 2025), 258 → 252                           | 10 snapshots                    | **held out**                                     |
| S1  | CPI rented accommodation, Victoria, Sep 2023 → Jun 2026                        | +19.5%                          | sanity only                                      |
| S2  | STR-attributable rent effect bound (1,100 listings / 66,000 renter households) | −0.4% to −3.3%                  | validation                                       |

Standard errors exist for the regression estimates only. Tolerances for paths and shares are
ASSUMED and marked `se_source: assumed` (ASSUMPTIONS A45).

## Method

Simulated method of moments / approximate Bayesian computation (`calibration/calibrate.py`):

1. **Moments.** For a parameter draw θ, the sim runs the Historical Bill 35 policy from Jun 2022
   (tick −15) to Jun 2026 (tick 33) on 4 common seeds. `packages/sim/src/moments.ts` computes the
   same statistics the first project estimated, on the sim's zone × snapshot-month panel without
   observation noise (ODD §7.7). They are averaged over seeds.
2. **Distance.** `D(θ) = Σ_k w_k ((m_k(θ) − target_k)/se_k)²` over fit targets (paths element-wise),
   plus the T7 leads as a soft constraint.
3. **Stage 1.** A scrambled Sobol sample of 8,192 points from the priors
   ([`calibration/priors.json`](../calibration/priors.json), 18 parameters since ADR 0013).
4. **Stage 2.** Nelder-Mead from the 4 best points (a diagnostic of the best attainable distance).
5. **Stage 3.** ABC-SMC (population Monte Carlo, ADR 0013). Generation 0 is the best 600 Stage-1
   draws. Each generation draws 2,048 proposals by perturbing the previous population with a
   Gaussian kernel (its weighted covariance, truncated to the prior support), keeps the best 600
   and weights them by prior / proposal density. Generations stop once the tolerance is at most
   93.3, the previous ensemble's, so successive ensembles meet the same fit standard (at most 12;
   ADR 0013 lists the stopping rules tried and discarded). The final population is resampled into an ensemble
   of 300 parameter sets. (Until 2026-10-12 this stage was a single importance-sampling
   step from one Gaussian, whose weights were degenerate: ESS 21.)
6. **Product.** [`packages/sim/src/params/ensemble.json`](../packages/sim/src/params/ensemble.json)
   with metadata: sim version, git commit, and hashes of the priors, targets, default parameters
   and scenario. `packages/sim/test/ensemble.test.ts` fails if any of them change without
   re-calibrating. The game plays one ensemble member per seed.

No parameter is tuned by hand to hit a target: everything not in `priors.json` stays at the
documented defaults (ASSUMPTIONS.md).

## Reproduce

```bash
pnpm calibrate          # ~30 min on 16 workers; writes ensemble.json and calibration/reports/
pnpm validate           # estimator cross-check, parameter recovery, held-out checks, sensitivity
pnpm calibrate:smoke    # 1-minute version used in CI (does not touch the committed ensemble)
```

The pipeline uses Python 3.11 with the package versions of the first project
(`calibration/requirements.txt`). `node scripts/py.mjs setup` creates `calibration/.venv`.

## Results

See [`calibration/reports/calibration.md`](../calibration/reports/calibration.md) and the summary
below (filled in after each full calibration run).

<!-- results-summary -->

### Run of 2026-10-12 (sim 0.6.0, ADR 0013: renter buyers, `kappa`/`eta` in the ensemble, ABC-SMC)

18 parameters (M5's 16 plus `rental.kappa` and `rental.arrivalVacancySemiElasticity`). Stage 1:
8,192 Sobol draws (best distance 46.9); Stage 2 Nelder-Mead 41.0. Stage 3 is now ABC-SMC:
generations of 2,048 proposals with a population of 600, stopped once the tolerance reached the
previous ensemble's (93.3), a rule fixed before this run. Tolerance path 179 → 154 → 132 → 120 →
115 → 116 → 108 → 103 → 98 → 96 → 94 → **89.4** (11 generations). **Effective sample size 63** of
600 (M5: 21); 300 members, **174 distinct**. ESS per generation ranged 33-212: it falls as the
tolerance nears the noise floor of the 4-seed distance (about D = 90), where keeping the best
proposals starts to select lucky simulations. Wall time 139 min on a busy machine. ADR 0013
reports the stopping rules tried and discarded on an earlier version of the renter-buyer rule.

**Fit, new vs M5** (ensemble mean; pass = within 2 SE, paths judged at the last point).

| ID  | Target   | New mean (5-95%)                      | M5 mean | Pass (new) |
| --- | -------- | ------------------------------------- | ------- | ---------- |
| T1  | −0.390   | −0.379 (−0.569 to −0.264)             | −0.399  | yes        |
| T1a | −0.124   | −0.093 (−0.190 to −0.024)             | −0.083  | yes        |
| T2  | −0.115   | −0.241 (−0.396 to −0.090)             | −0.220  | **no** (¼) |
| T3  | −0.432   | −0.535 (−0.698 to −0.343), RMSE 0.058 | −0.505  | **no**     |
| T4  | +0.062   | +0.176 (+0.052 to +0.327), RMSE 0.052 | +0.191  | yes        |
| T5  | 37.6%    | 26.0% (21.8% to 30.8%)                | 26.4%   | **no**     |
| T6a | 70.0%    | 59.7% (50.6% to 69.8%)                | 58.4%   | **no**     |
| T6b | 9.4%     | 8.1% (0.8% to 16.0%)                  | 7.9%    | yes        |
| T7  | leads ≈0 | −0.024, −0.015, +0.009, −0.002        | ≈0      | yes        |
| H1  | −0.024   | −0.426 (−0.661 to −0.196), held out   | −0.382  | **no**     |

Nothing was tuned by hand. The misses are those of M3 and M5 plus **T3** at its last point: the
covered-area path ends at −0.535 against −0.432, just outside 2 SE (M5 −0.505 passed). The path
as a whole fits as before (RMSE 0.058; M5 0.054): the model's covered areas keep falling a little
too long. With ESS 63, each tail of a 5-95% range rests on about three effective draws (M5:
about one).

**Identification.** Identified (contraction ≥ 0.5): `multiComplianceShift` (0.67), `detectMax`
(0.66), `delistProb` (0.88), `regTakeup` (0.73), `exemptClaimShare` (0.69), `sellRateAnnual`
(0.50). `prShare` fell from partly (0.35) to weakly identified (0.15). `kappa` (0.08) and `eta`
(0.15) are weakly identified, as expected: their posteriors stay close to their priors, which is
what carries the rent-dynamics uncertainty into the ensemble. Strongest trade-offs: `pReview` vs
`detectMax` (+0.52), `complianceBase` vs `detectMax` (−0.50), `pReview` vs `delistProb` (+0.50).

**Rents (not fitted).** STR-attributable change in asking rents by Jun 2026: −0.57% (5-95%
−1.52% to −0.14%), 60% of the ensemble inside the first project's −3.3% to −0.4% bound. On the
CPI-style index −0.30%. The range is about three times wider than M5's (−0.66% to −0.30%) because
`kappa` and `eta` now vary: it is the honest range, not a worse fit. True effect on covered
listings −0.640 log points; on never-covered listings +0.043 (spillover).

**Fit diagnostics and robustness** ([`robustness.md`](../calibration/reports/robustness.md),
`pnpm robustness`, generated from this ensemble).

- **Goodness of fit.** A correctly specified model with the right target SEs would score about 10.
  The distinct sets score 41 (best) to 89, median 77. T5 and T6a contribute about 78% of the
  excess, T3 most of the rest. Individual members miss T1 by about 1.5 SE; the mean matches it.
- **Duplicates.** The most frequent set is 26 of 300 members (9%; M5: 62). Equal weighting of the
  174 distinct sets gives nearly the same headline numbers (Phase 1 DiD −0.377 vs −0.379; asking
  rents −0.64% vs −0.57%).
- **Rent effect vs rent dynamics.** Across the ensemble the asking-rent effect correlates −0.53
  with log `kappa` and +0.52 with `eta`, and runs from −2.88% to −0.09% across distinct sets.
  Fixing both on a grid (kappa 0.03-0.3, eta 0-50) spans −2.2% to −0.1%; the listing effect
  barely moves (−0.61 to −0.60 log points).
- **Renter buyers.** Asking-rent effect −0.59%, −0.60%, −0.61% at `renterBuyerShare` 0, 0.4,
  0.6 (30 members); per member −0.02 points on average.

### Run of 2026-10-10 evening (sim 0.5.0, M5 full mechanics, ADRs 0007-0009; superseded by the run above)

Same pipeline and budget as M3: 8,192 Sobol draws, 4 Nelder-Mead starts, 4,096 ABC proposals,
16 parameters (M3's 14 plus `host.vacantHeldShare` and `host.sellRateAnnual`). 600 accepted
(D ≤ 93.3), **effective sample size 21**, ensemble of 300 sets of which 179 are distinct. Best
distance 43.4 (stage-1 median 375). Wall time 44.2 min on 16 workers (runs are ~0.23 s, up from
~0.15 s).

**Fit, M5 vs M3** (ensemble mean; pass = within 2 SE, paths judged at the last point).

| ID  | Target   | M5 sim mean (5-95%)                   | M3 sim mean | Pass (M5)  |
| --- | -------- | ------------------------------------- | ----------- | ---------- |
| T1  | −0.390   | −0.399 (−0.548 to −0.243)             | −0.374      | yes        |
| T1a | −0.124   | −0.083 (−0.185 to −0.011)             | −0.100      | yes        |
| T2  | −0.115   | −0.220 (−0.397 to −0.114)             | −0.228      | **no** (¼) |
| T3  | −0.432   | −0.505 (−0.708 to −0.341), RMSE 0.054 | −0.506      | yes        |
| T4  | +0.062   | +0.191 (+0.037 to +0.318), RMSE 0.059 | +0.181      | yes        |
| T5  | 37.6%    | 26.4% (21.4% to 31.1%)                | 31.2%       | **no**     |
| T6a | 70.0%    | 58.4% (49.9% to 69.3%)                | 62.4%       | **no**     |
| T6b | 9.4%     | 7.9% (1.5% to 15.7%)                  | 7.7%        | yes        |
| T7  | leads ≈0 | −0.026, −0.015, +0.010, −0.007        | ≈0          | yes        |
| H1  | −0.024   | −0.382 (−0.715 to −0.172), held out   | −0.261      | **no**     |

**M3's acceptance still holds in the same places.** Everything that passed in M3 passes (T1, T1a,
T3, T4, T6b, T7), and the same three targets miss (T2, T5, T6a). Nothing was tuned by hand.
What got worse:

- **Overall fit and ESS.** The best distance doubled (19.7 → 43.4) and the ABC tolerance with it
  (45 → 93). The importance weights are concentrated: ESS 21 against 146 in M3, so the 300-set
  ensemble repeats its best members (179 distinct). The ensemble still spans the posterior
  ranges below, but it is a thinner sample than M3's. A larger stage 3 (for example 16,384
  proposals, about 3 hours) would raise the ESS; it has not been run.
- **T5 (multi-host share) misses by more** (26.4% vs 31.2% in M3, target 37.6%), and **T6a**
  slightly more (58.4% vs 62.4%). In M5, non-principal-residence units can also be sold or held
  empty, and multi-listing hosts own only non-PR units, so every new exit route removes
  multi-host listings first. The mechanism that would offset this (multi-hosts complying less)
  is again pinned near its prior edge (`multiComplianceShift` 5% quantile −0.39). This is the
  same structural limitation as in M3, stronger now; it is reported, not fitted.
- **H1 (Salt Spring, held out)** misses by more (−0.38 vs −0.26 in M3; data −0.02).

**Identification changes.** `sellRateAnnual` is identified (contraction 0.61) and
`vacantHeldShare` is not (0.09). `complianceBase` fell from partly to weakly identified
(contraction −0.24: the posterior is as wide as the prior), and `prShare` from identified to
partly (0.35). The strongest trade-off is `complianceBase` vs `detectMax` (−0.58): compliance at
once and detection later produce the same listing path. Identified: `multiComplianceShift`,
`detectMax`, `delistProb`, `regTakeup`, `exemptClaimShare`, `sellRateAnnual`.

**Rents (not fitted).** STR-attributable change in asking rents by Jun 2026: −0.48% (5-95%
−0.66% to −0.30%), 78% of the ensemble inside the first project's −3.3% to −0.4% bound (83% in
M3). On the CPI-style index −0.24%: too small to detect against a +19.5% CPI rise. True effect on
covered listings −0.585 log points; on never-covered listings +0.083 (spillover).

**Fit diagnostics and robustness of the M5 ensemble (2026-10-11, [`robustness.md`](../calibration/reports/robustness.md),
`pnpm robustness`).** Generated from the shipped ensemble; no parameters changed.

- **Goodness of fit.** If the model were correctly specified and the target SEs right, the
  weighted distance would be about 10 (sum of target weight × dimensions). The ensemble's distinct
  sets score 43 (best) to 93 (tolerance), median 82. So the "pass" column above, judged one
  target at a time, flatters the joint fit. T5 and T6a contribute about two thirds of the excess.
  Individual members miss T1 by about 2 SE on average; the ensemble mean matches it.
- **Paths beyond the last point.** T3 is within 1.7 SE at every snapshot. T4 tracks the data to
  Sep 2025, then rises to +0.19 by Jun 2026 while the data stay at +0.06. The never-covered areas
  grow too much at the end, and the "pass" relies on an ASSUMED SE of 0.07. Salt Spring (H1)
  misses before its opt-in as well as after: +0.12 to +0.16 at ticks 15-24 against −0.07 to +0.04
  observed (z up to 3.1), while it was still an exempt control area. That is evidence against
  strong spillover (VALIDATION §3).
- **Duplicates.** One parameter set is 62 of the 300 members (21%). Averaging the 179 distinct
  sets equally gives a Phase 1 DiD of −0.366 instead of −0.399. With ESS ≈ 21, each tail of a
  5-95% range rests on about one effective draw: treat ranges as indicative.
- **Rent effect vs fixed assumptions.** The rent range above holds `kappa` (asking-rent
  adjustment, A26) and `arrivalVacancySemiElasticity` (A33) fixed. Over kappa 0.03-0.3 and eta
  0-50 the mean asking-rent effect runs from −0.09% to −2.2%. That is a larger spread than all 16
  calibrated parameters produce. `arrivalRentElasticity`, the parameter left free to carry rent
  uncertainty, matters much less.

### Run of 2026-10-10 (sim 0.4.0, spin-up model, ADR 0005; superseded by the M5 run above)

8,192 Sobol draws, 4 Nelder-Mead starts, 4,096 ABC proposals; 600 accepted (D ≤ 45.1), effective
sample size 146, ensemble of 300 sets. Best distance 19.7 (stage-1 median 346). Wall time 28.6 min
on 16 workers.

**Fit (ensemble mean vs target; pass = within 2 SE, paths judged at the last point).**

| ID  | Target   | Sim mean (5-95%)                      | Pass                           |
| --- | -------- | ------------------------------------- | ------------------------------ |
| T1  | −0.390   | −0.374 (−0.481 to −0.260)             | yes                            |
| T1a | −0.124   | −0.100 (−0.167 to −0.043)             | yes                            |
| T2  | −0.115   | −0.228 (−0.337 to −0.121)             | **no** (weight ¼; RI p = 0.27) |
| T3  | −0.432   | −0.506 (−0.669 to −0.380), RMSE 0.055 | yes                            |
| T4  | +0.062   | +0.181 (+0.060 to +0.321), RMSE 0.053 | yes                            |
| T5  | 37.6%    | 31.2% (27.0% to 35.6%)                | **no**                         |
| T6a | 70.0%    | 62.4% (55.3% to 69.1%)                | **no**                         |
| T6b | 9.4%     | 7.7% (1.9% to 14.5%)                  | yes                            |
| T7  | leads ≈0 | −0.016, −0.034, +0.004, −0.017        | yes (no spurious pre-trend)    |

**The M3 acceptance criterion ("fits T1, T3-T6 within tolerance") is not fully met.** T1, T3, T4,
T6b and T7 pass; T5 (multi-host share) and T6a (registered share) miss. No parameter was tuned by
hand to close the gap. Diagnostics:

- **T5.** The 95th percentile of the ensemble (35.6%) is below the target (37.6%): the model's
  multi-host share falls from 46.1% about twice as far as the data's. In the model every
  principal-residence listing is a single-host listing and every multi-host listing is a
  non-principal-residence unit, so any rule that removes non-PR listings lowers the multi share
  mechanically. The only offset is for multi-hosts to comply less, and the posterior of
  `multiComplianceShift` presses against the lower edge of its prior (5% quantile −0.389, prior
  −0.4). Multi-hosts are also spread uniformly across zones (`world.ts`). Both are structural
  choices; the first project reports neither the host mix by zone nor by PR status, so they are
  left as documented misses rather than re-specified to fit.
- **T6a.** The registered share rises only through `regTakeup` (identified, median 0.54) and
  through illegal listings leaving. Unregistered illegal survivors in covered zones, governed by a
  low `delistProb` (identified, median 0.09), hold it down. Faster de-listing would raise T6a but
  push T2 (already too negative) further from its estimate: T2, T6a and `delistProb` pull against
  each other.
- **T2.** Down-weighted on purpose. The sim's Phase 2 effect (−0.23) is twice the estimate, but the
  estimate itself is not distinguishable from placebo (RI p = 0.27).
- **T4** passes at the endpoint, but the ensemble mean (+18%) overshoots the observed +6.4%. The
  spillover parameters (`demandSpillover`, `investorEntry`) are weakly identified, so the exempt
  path is the model's least certain part. This matters for M4 (DiD recovery).

**Identification.** Identified (contraction ≥ 0.5): `prShare`, `detectMax`, `delistProb`,
`regTakeup`, `exemptClaimShare`. Partly: `pReview`, `complianceBase`, `multiComplianceShift`.
Weakly: `beta`, `anticipation`, `investorEntry`, `demandSpillover`, `demandGrowthAnnual`,
`arrivalRentElasticity`. The weakly identified ones are the behavioural responses the first
project could not measure (where displaced units go, spillover). Their uncertainty is carried into
the game through the ensemble, as PLAN §5.4 intends.

**Rents (not fitted).** The STR-attributable change in asking rents by Jun 2026 is −0.61% (5-95%
−0.92% to −0.09%); 83% of the ensemble lies inside the first project's −3.3% to −0.4% bound. On a
CPI-style all-tenant index it is −0.40%: too small to detect against a +19.5% CPI rise with
quarterly noise of a few points.

**Residual drift.** With no policy, the covered-minus-exempt listing difference still drifts within
±0.05 log points over 64 months (ADR 0005). This is about the size of the real leads' SE and is
left as noise, not removed by tuning.

### First calibration (pre-spin-up, superseded)

For comparison: T1 −0.370, T2 −0.202 (passed), T3 endpoint −0.54 (failed), T5 31%, T6a 63%, and
leads of −0.04/−0.06 (a spurious pre-trend). Spin-up (ADR 0005) fixed T3 and T7 at the cost of T2.
