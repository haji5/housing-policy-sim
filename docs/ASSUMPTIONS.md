# Assumptions register

Every number or functional form used by the model is listed here with a provenance tag:

| Tag            | Meaning                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **DATA**       | Taken from a dataset or from `bc-str-ban-analysis`, verified against that repo, with a pointer. |
| **LITERATURE** | From a cited published source.                                                                  |
| **ASSUMED**    | A modelling choice or placeholder with no direct empirical anchor. Expect wide uncertainty.     |
| **VERIFY**     | A real-world number that has not yet been checked. Must not ship in calibrated results.         |

Money is in $k per month unless stated. "Calibrated in M3" means the value is a placeholder that
the calibration will replace with an ensemble.

## Structure and scale

| ID  | Quantity                                 | Value                                                              | Tag     | Source / note                                                                                                                   | Introduced |
| --- | ---------------------------------------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A1  | `scale` (agents per real unit)           | 0.2                                                                | ASSUMED | PLAN D3. Revisit after noise checks.                                                                                            | m1         |
| A2  | `two-zone` scenario counts               | Core 30k dwellings / 12k renters / 1,500 STR; Fringe 5k / 1k / 250 | ASSUMED | Stylised test city, **not** Victoria. Replaced by the Victoria scenario in M3.                                                  | m1         |
| A3  | Two-zone rents, nightly rates, occupancy | Core $2.0k, $200, 55%; Fringe $1.7k, $180, 50%                     | ASSUMED | Placeholders of a plausible order of magnitude.                                                                                 | m1         |
| A4  | PR share of listings                     | Core 0.4, Fringe 0.5                                               | ASSUMED | Placeholder; Victoria value to be derived from the first project in M3.                                                         | m1         |
| A5  | Tick = 1 month, turn = 1 quarter         | –                                                                  | ASSUMED | PLAN §4.                                                                                                                        | m1         |
| A6  | Policy calendar ticks                    | announce t=1, Phase 1 t=8, Phase 2 t=20                            | VERIFY  | From PLAN §2 (Oct 2023, May 2024, May 2025, start Sep 2023). To be checked against `bc-str-ban-analysis` `src/config.py` in M3. | m1         |

## Host behaviour

| ID  | Quantity                        | Value     | Tag     | Source / note                                                               | Introduced |
| --- | ------------------------------- | --------- | ------- | --------------------------------------------------------------------------- | ---------- |
| A7  | `pReview` (monthly)             | 0.10      | ASSUMED | Calibrated in M3 (sets speed of the Phase 1 response).                      | m1         |
| A8  | `beta` (utility per $k/mo)      | 1.5       | ASSUMED | Calibrated in M3.                                                           | m1         |
| A9  | `gumbelScale`                   | 1.0       | ASSUMED | Normalisation; only `beta/σ` is identified.                                 | m1         |
| A10 | `complianceBase`                | 0.2       | ASSUMED | Calibrated in M3.                                                           | m1         |
| A11 | `strCostShare`                  | 0.35      | ASSUMED | Platform fees, cleaning, management as a share of gross.                    | m1         |
| A12 | `strUpkeep`, `ltrUpkeep`        | 0.4, 0.25 | ASSUMED | Absorbed by the ASC at baseline; matter only for responses.                 | m1         |
| A13 | `anticipation`                  | 0         | ASSUMED | No anticipation in M1; candidate free parameter in M3.                      | m1         |
| A14 | `prReview`, `prBeta`            | 0.05, 0.5 | ASSUMED | PR hosts are less revenue-sensitive than investors.                         | m1         |
| A15 | Logit functional form           | –         | ASSUMED | PLAN §5.4; ADR 0002.                                                        | m1         |
| A16 | Steady-state ASCs               | –         | ASSUMED | Derived so the start is a steady state (ADR 0002 §1). Not a free parameter. | m1         |
| A17 | No conversion of tenanted units | –         | ASSUMED | ADR 0002 §2; motivated by BC tenancy protections (not modelled in detail).  | m1         |

## Enforcement

| ID  | Quantity                       | Value     | Tag     | Source / note                                                                                                                | Introduced |
| --- | ------------------------------ | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A18 | `detectMax`, `detectK`         | 0.3, 0.4  | ASSUMED | Diminishing-returns detection curve; calibrated in M3.                                                                       | m1         |
| A19 | `fine` per detection           | $1.5k     | VERIFY  | Placeholder. Real BC/municipal STR fine schedules not yet checked; only `dp × fine` is identified.                           | m1         |
| A20 | `delistProb` (registry regime) | 0.85/mo   | ASSUMED | PLAN §5.4 says "near 1"; T6 (~21% of listings show neither a registry number nor "Exempt") suggests lower. Calibrated in M3. | m1         |
| A21 | `registrationCost`             | $0.02k/mo | VERIFY  | Placeholder for the provincial host registration fee, not yet checked.                                                       | m1         |
| A22 | Default enforcement level      | 2 of 0–5  | ASSUMED | Mid-range.                                                                                                                   | m1         |

## STR market

| ID  | Quantity          | Value | Tag     | Source / note                                      | Introduced |
| --- | ----------------- | ----- | ------- | -------------------------------------------------- | ---------- |
| A23 | `occMax`          | 0.85  | ASSUMED | Ceiling on occupancy.                              | m1         |
| A24 | `demandSpillover` | 0.2   | ASSUMED | Weakly identified; swept in the M4 DiD experiment. | m1         |

## Rental market and households

| ID  | Quantity                                  | Value           | Tag        | Source / note                                                                                                               | Introduced |
| --- | ----------------------------------------- | --------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| A25 | `vStar` natural vacancy                   | 0.03            | VERIFY     | PLAN §5.5 ("CMHC-informed, ~3%; Victoria 2025 was 3.3% in the first project's fixtures"). Check against the fixtures in M3. | m1         |
| A26 | `kappa` rent response                     | 0.1             | ASSUMED    | 1 pp vacancy gap ⇒ ~1.2%/yr asking-rent change.                                                                             | m1         |
| A27 | `rentCapAnnual`                           | 0.03            | VERIFY     | Placeholder. BC's allowable increase changes each year (open item in PLAN §16).                                             | m1         |
| A28 | `phi`, `sittingDiscount`, `qualitySpread` | 0.5, 0.15, 0.25 | ASSUMED    | Rent-stickiness and heterogeneity.                                                                                          | m1         |
| A29 | `maxRentShare`                            | 0.6             | ASSUMED    | Highest rent-to-income share a searcher will accept.                                                                        | m1         |
| A30 | `moveHazard`, `exitHazard`                | 0.012, 0.008    | ASSUMED    | ~24%/yr renter turnover; not yet checked against CMHC/Census mobility data.                                                 | m1         |
| A31 | `incomeMedian`, `incomeSigma`             | $4.6k/mo, 0.6   | VERIFY     | ≈ $55k/yr renter median placeholder; to be checked against the 2021 Census (Victoria CMA renters).                          | m1         |
| A32 | `kDouble`, `kLeave`                       | 3, 12 months    | ASSUMED    | Stress thresholds.                                                                                                          | m1         |
| A33 | Arrival elasticities `ε`, `η`             | 2, 25           | ASSUMED    | ADR 0002 §7. `ε` drives the STR-attributable rent effect, so S2 constrains it in M3.                                        | m1         |
| A34 | Rent-burden threshold                     | 30% of income   | LITERATURE | Standard CMHC affordability benchmark.                                                                                      | m1         |
| A35 | `searchOtherZoneProb`                     | 0.25            | ASSUMED    | Cross-zone search.                                                                                                          | m1         |
