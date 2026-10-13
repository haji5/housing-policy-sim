# Sobol sensitivity indices

2026-10-12, commit c3d6dc7, n = 256 (5120 parameter draws, seeds 1, 2, 821 s). Each parameter varies uniformly over its posterior 5-95% range (log scale for log-uniform priors). 90% bootstrap intervals in brackets. S1 = first-order index (share of output variance explained by the parameter alone); ST = total index (including interactions). The box ignores posterior correlations, and simulation noise across seeds counts as unexplained variance.

## Covered-listings effect (log points)

Sum of S1 = 0.90.

| Parameter | S1 | ST |
| --- | --- | --- |
| host.prShare | 0.30 [0.23, 0.38] | 0.31 [0.26, 0.37] |
| enforcement.delistProb | 0.25 [0.18, 0.33] | 0.29 [0.24, 0.34] |
| host.pReview | 0.13 [0.08, 0.18] | 0.14 [0.12, 0.18] |
| enforcement.detectMax | 0.10 [0.05, 0.14] | 0.12 [0.10, 0.15] |
| enforcement.regTakeup | 0.06 [0.02, 0.09] | 0.08 [0.06, 0.09] |
| host.complianceBase | 0.04 [0.00, 0.07] | 0.06 [0.05, 0.08] |
| host.beta | 0.01 [-0.02, 0.03] | 0.03 [0.03, 0.04] |
| host.vacantHeldShare | -0.02 [-0.05, 0.00] | 0.03 [0.02, 0.03] |
| str.demandGrowthAnnual | -0.00 [-0.02, 0.02] | 0.01 [0.01, 0.02] |
| host.multiComplianceShift | 0.02 [0.00, 0.03] | 0.01 [0.01, 0.02] |
| host.sellRateAnnual | -0.00 [-0.02, 0.01] | 0.01 [0.01, 0.01] |
| rental.arrivalVacancySemiElasticity | 0.00 [-0.01, 0.02] | 0.01 [0.01, 0.01] |
| rental.kappa | 0.02 [0.00, 0.03] | 0.01 [0.01, 0.01] |
| rental.arrivalRentElasticity | 0.00 [-0.01, 0.01] | 0.01 [0.01, 0.01] |
| host.investorEntry | 0.01 [-0.01, 0.02] | 0.01 [0.01, 0.01] |
| enforcement.exemptClaimShare | 0.00 [-0.01, 0.01] | 0.01 [0.01, 0.01] |
| host.anticipation | -0.00 [-0.01, 0.01] | 0.00 [0.00, 0.01] |
| str.demandSpillover | 0.00 [-0.00, 0.01] | 0.00 [0.00, 0.00] |

## Asking-rent effect (log points)

Sum of S1 = 0.52.

| Parameter | S1 | ST |
| --- | --- | --- |
| rental.kappa | 0.29 [0.21, 0.37] | 0.44 [0.36, 0.55] |
| rental.arrivalVacancySemiElasticity | 0.23 [0.13, 0.33] | 0.39 [0.32, 0.49] |
| rental.arrivalRentElasticity | 0.05 [0.00, 0.10] | 0.19 [0.11, 0.44] |
| host.pReview | -0.01 [-0.08, 0.03] | 0.11 [0.07, 0.25] |
| host.sellRateAnnual | -0.02 [-0.06, 0.02] | 0.09 [0.07, 0.13] |
| host.prShare | 0.04 [-0.00, 0.09] | 0.09 [0.07, 0.12] |
| host.vacantHeldShare | 0.00 [-0.03, 0.04] | 0.07 [0.05, 0.10] |
| host.beta | -0.03 [-0.07, 0.02] | 0.06 [0.05, 0.08] |
| host.investorEntry | -0.03 [-0.07, 0.01] | 0.05 [0.04, 0.06] |
| str.demandGrowthAnnual | -0.01 [-0.05, 0.03] | 0.05 [0.04, 0.08] |
| host.complianceBase | -0.00 [-0.03, 0.02] | 0.04 [0.03, 0.07] |
| enforcement.detectMax | 0.01 [-0.02, 0.04] | 0.03 [0.02, 0.04] |
| enforcement.delistProb | 0.02 [-0.01, 0.06] | 0.02 [0.02, 0.03] |
| host.anticipation | -0.00 [-0.02, 0.02] | 0.01 [0.01, 0.02] |
| host.multiComplianceShift | -0.01 [-0.02, 0.01] | 0.01 [0.01, 0.02] |
| str.demandSpillover | -0.00 [-0.01, 0.01] | 0.00 [0.00, 0.01] |
| enforcement.regTakeup | -0.01 [-0.01, -0.00] | 0.00 [0.00, 0.00] |
| enforcement.exemptClaimShare | -0.00 [-0.01, 0.00] | 0.00 [0.00, 0.00] |

## Rent-burden share at the end

Sum of S1 = 0.82.

| Parameter | S1 | ST |
| --- | --- | --- |
| rental.arrivalVacancySemiElasticity | 0.42 [0.32, 0.53] | 0.54 [0.46, 0.66] |
| rental.kappa | 0.32 [0.25, 0.39] | 0.42 [0.34, 0.51] |
| rental.arrivalRentElasticity | 0.06 [0.01, 0.11] | 0.11 [0.08, 0.15] |
| host.vacantHeldShare | 0.02 [-0.02, 0.06] | 0.05 [0.04, 0.06] |
| host.beta | 0.01 [-0.02, 0.06] | 0.05 [0.04, 0.06] |
| host.pReview | -0.02 [-0.04, 0.02] | 0.05 [0.04, 0.06] |
| host.sellRateAnnual | 0.02 [-0.02, 0.05] | 0.04 [0.04, 0.05] |
| host.prShare | -0.01 [-0.04, 0.01] | 0.04 [0.03, 0.04] |
| host.investorEntry | -0.00 [-0.02, 0.03] | 0.03 [0.02, 0.04] |
| host.complianceBase | 0.00 [-0.02, 0.02] | 0.02 [0.02, 0.03] |
| host.anticipation | 0.01 [-0.01, 0.03] | 0.02 [0.02, 0.02] |
| enforcement.detectMax | 0.01 [-0.01, 0.03] | 0.02 [0.01, 0.02] |
| host.multiComplianceShift | 0.00 [-0.01, 0.02] | 0.02 [0.01, 0.02] |
| str.demandGrowthAnnual | 0.00 [-0.02, 0.02] | 0.01 [0.01, 0.02] |
| str.demandSpillover | -0.01 [-0.03, 0.01] | 0.01 [0.01, 0.01] |
| enforcement.delistProb | -0.00 [-0.01, 0.01] | 0.01 [0.01, 0.01] |
| enforcement.exemptClaimShare | -0.00 [-0.01, 0.01] | 0.01 [0.01, 0.01] |
| enforcement.regTakeup | -0.01 [-0.02, 0.00] | 0.01 [0.01, 0.01] |

## Completions over the window

Sum of S1 = 0.83.

| Parameter | S1 | ST |
| --- | --- | --- |
| rental.kappa | 0.59 [0.48, 0.69] | 0.70 [0.60, 0.83] |
| rental.arrivalVacancySemiElasticity | 0.20 [0.12, 0.29] | 0.32 [0.26, 0.40] |
| host.vacantHeldShare | -0.02 [-0.07, 0.02] | 0.11 [0.09, 0.14] |
| host.sellRateAnnual | 0.04 [-0.00, 0.08] | 0.09 [0.08, 0.11] |
| host.prShare | -0.05 [-0.09, -0.01] | 0.08 [0.06, 0.09] |
| host.pReview | 0.01 [-0.03, 0.04] | 0.07 [0.06, 0.09] |
| rental.arrivalRentElasticity | 0.04 [-0.00, 0.08] | 0.07 [0.06, 0.10] |
| host.beta | -0.00 [-0.04, 0.04] | 0.07 [0.06, 0.09] |
| host.investorEntry | 0.03 [0.00, 0.06] | 0.03 [0.03, 0.04] |
| host.complianceBase | 0.00 [-0.01, 0.01] | 0.00 [0.00, 0.00] |
| host.anticipation | 0.00 [-0.00, 0.01] | 0.00 [0.00, 0.00] |
| host.multiComplianceShift | 0.01 [0.00, 0.01] | 0.00 [0.00, 0.00] |
| enforcement.detectMax | 0.00 [-0.00, 0.01] | 0.00 [0.00, 0.00] |
| str.demandGrowthAnnual | -0.00 [-0.00, -0.00] | 0.00 [0.00, 0.00] |
| str.demandSpillover | 0.00 [0.00, 0.00] | 0.00 [0.00, 0.00] |
| enforcement.delistProb | 0.00 [nan, nan] | 0.00 [nan, nan] |
| enforcement.regTakeup | 0.00 [nan, nan] | 0.00 [nan, nan] |
| enforcement.exemptClaimShare | 0.00 [nan, nan] | 0.00 [nan, nan] |
