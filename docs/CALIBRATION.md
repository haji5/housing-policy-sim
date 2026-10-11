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
   ([`calibration/priors.json`](../calibration/priors.json), 14 parameters).
4. **Stage 2.** Nelder-Mead from the 4 best points (reported; centres the next stage).
5. **Stage 3.** ABC importance sampling: 4,096 draws from a Gaussian proposal fitted to the best
   points. The ~600 closest are accepted, weighted by prior/proposal density and resampled into
   an ensemble of 300 parameter sets.
6. **Product.** [`packages/sim/src/params/ensemble.json`](../packages/sim/src/params/ensemble.json)
   with metadata: sim version, git commit, and hashes of the priors, targets, default parameters
   and scenario. `packages/sim/test/ensemble.test.ts` fails if any of them change without
   re-calibrating. The game plays one ensemble member per seed.

No parameter is tuned by hand to hit a target: everything not in `priors.json` stays at the
documented defaults (ASSUMPTIONS.md).

## Reproduce

```bash
pnpm calibrate          # ~15-20 min on 16 cores; writes ensemble.json and calibration/reports/
pnpm validate           # estimator cross-check, parameter recovery, held-out checks, sensitivity
pnpm calibrate:smoke    # 1-minute version used in CI (does not touch the committed ensemble)
```

The pipeline uses Python 3.11 with the package versions of the first project
(`calibration/requirements.txt`). `node scripts/py.mjs setup` creates `calibration/.venv`.

## Results

See [`calibration/reports/calibration.md`](../calibration/reports/calibration.md) and the summary
below (filled in after each full calibration run).

<!-- results-summary -->
