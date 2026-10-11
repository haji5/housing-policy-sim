# Sobol sensitivity indices

2026-10-10, commit f60a6e0, n = 256 (4608 parameter draws, seeds 1, 2, 929 s). Each parameter varies uniformly over its posterior 5-95% range (log scale for log-uniform priors). 90% bootstrap intervals in brackets. S1 = first-order index (share of output variance explained by the parameter alone); ST = total index (including interactions). The box ignores posterior correlations, and simulation noise across seeds counts as unexplained variance.

## Covered-listings effect (log points)

Sum of S1 = 0.92.

| Parameter | S1 | ST |
| --- | --- | --- |
| enforcement.delistProb | 0.29 [0.21, 0.37] | 0.31 [0.26, 0.37] |
| host.prShare | 0.23 [0.16, 0.30] | 0.25 [0.21, 0.30] |
| host.pReview | 0.15 [0.09, 0.21] | 0.19 [0.15, 0.22] |
| enforcement.detectMax | 0.07 [0.02, 0.12] | 0.12 [0.10, 0.15] |
| host.complianceBase | 0.07 [0.03, 0.11] | 0.10 [0.08, 0.12] |
| enforcement.regTakeup | 0.08 [0.03, 0.13] | 0.10 [0.08, 0.12] |
| host.beta | -0.01 [-0.04, 0.01] | 0.03 [0.03, 0.04] |
| host.vacantHeldShare | 0.01 [-0.02, 0.03] | 0.02 [0.02, 0.03] |
| str.demandGrowthAnnual | 0.00 [-0.02, 0.01] | 0.01 [0.01, 0.01] |
| host.multiComplianceShift | 0.02 [0.00, 0.03] | 0.01 [0.01, 0.01] |
| host.sellRateAnnual | 0.01 [-0.01, 0.02] | 0.01 [0.01, 0.01] |
| enforcement.exemptClaimShare | 0.01 [-0.01, 0.02] | 0.01 [0.01, 0.01] |
| host.investorEntry | 0.01 [-0.00, 0.02] | 0.01 [0.01, 0.01] |
| rental.arrivalRentElasticity | -0.01 [-0.02, 0.01] | 0.01 [0.01, 0.01] |
| host.anticipation | -0.00 [-0.01, 0.01] | 0.00 [0.00, 0.00] |
| str.demandSpillover | -0.00 [-0.01, 0.01] | 0.00 [0.00, 0.00] |

## Asking-rent effect (log points)

Sum of S1 = 0.90.

| Parameter | S1 | ST |
| --- | --- | --- |
| host.prShare | 0.16 [0.07, 0.24] | 0.31 [0.26, 0.40] |
| host.complianceBase | 0.17 [0.11, 0.24] | 0.24 [0.19, 0.31] |
| host.sellRateAnnual | 0.17 [0.11, 0.25] | 0.24 [0.20, 0.29] |
| host.pReview | 0.09 [0.03, 0.16] | 0.22 [0.18, 0.27] |
| host.vacantHeldShare | -0.03 [-0.10, 0.03] | 0.18 [0.15, 0.23] |
| rental.arrivalRentElasticity | 0.05 [-0.01, 0.12] | 0.15 [0.13, 0.18] |
| host.beta | 0.00 [-0.05, 0.05] | 0.14 [0.11, 0.17] |
| host.investorEntry | -0.00 [-0.04, 0.05] | 0.12 [0.10, 0.16] |
| enforcement.detectMax | 0.06 [0.01, 0.10] | 0.12 [0.09, 0.15] |
| str.demandGrowthAnnual | 0.03 [-0.02, 0.08] | 0.10 [0.08, 0.13] |
| enforcement.delistProb | 0.08 [0.04, 0.12] | 0.07 [0.06, 0.09] |
| host.anticipation | 0.06 [0.04, 0.09] | 0.06 [0.04, 0.07] |
| host.multiComplianceShift | 0.05 [0.02, 0.07] | 0.03 [0.03, 0.04] |
| str.demandSpillover | 0.01 [-0.01, 0.02] | 0.01 [0.01, 0.01] |
| enforcement.exemptClaimShare | 0.00 [-0.00, 0.01] | 0.01 [0.00, 0.01] |
| enforcement.regTakeup | 0.00 [-0.01, 0.01] | 0.00 [0.00, 0.00] |

## Rent-burden share at the end

Sum of S1 = 0.69.

| Parameter | S1 | ST |
| --- | --- | --- |
| rental.arrivalRentElasticity | 0.39 [0.28, 0.50] | 0.57 [0.50, 0.67] |
| host.pReview | 0.11 [0.01, 0.21] | 0.46 [0.39, 0.53] |
| host.vacantHeldShare | 0.21 [0.11, 0.30] | 0.42 [0.36, 0.49] |
| host.prShare | 0.04 [-0.04, 0.13] | 0.40 [0.34, 0.47] |
| host.beta | 0.08 [-0.00, 0.15] | 0.35 [0.29, 0.42] |
| host.sellRateAnnual | -0.02 [-0.10, 0.07] | 0.29 [0.25, 0.33] |
| host.investorEntry | -0.04 [-0.11, 0.03] | 0.25 [0.22, 0.31] |
| host.anticipation | -0.05 [-0.11, 0.02] | 0.20 [0.17, 0.23] |
| host.complianceBase | -0.01 [-0.06, 0.05] | 0.18 [0.15, 0.22] |
| enforcement.detectMax | -0.03 [-0.08, 0.02] | 0.16 [0.13, 0.20] |
| host.multiComplianceShift | 0.00 [-0.05, 0.06] | 0.16 [0.13, 0.19] |
| str.demandGrowthAnnual | 0.01 [-0.05, 0.06] | 0.14 [0.11, 0.16] |
| str.demandSpillover | 0.01 [-0.03, 0.05] | 0.09 [0.07, 0.10] |
| enforcement.delistProb | 0.01 [-0.03, 0.05] | 0.08 [0.07, 0.10] |
| enforcement.exemptClaimShare | -0.01 [-0.05, 0.03] | 0.06 [0.05, 0.07] |
| enforcement.regTakeup | -0.01 [-0.04, 0.03] | 0.06 [0.05, 0.07] |

## Completions over the window

Sum of S1 = 0.35.

| Parameter | S1 | ST |
| --- | --- | --- |
| host.vacantHeldShare | 0.18 [0.08, 0.28] | 0.68 [0.59, 0.77] |
| host.sellRateAnnual | 0.07 [-0.02, 0.17] | 0.56 [0.48, 0.66] |
| host.pReview | 0.08 [-0.00, 0.18] | 0.52 [0.44, 0.63] |
| host.beta | -0.02 [-0.11, 0.06] | 0.44 [0.38, 0.54] |
| host.prShare | 0.08 [-0.01, 0.17] | 0.43 [0.37, 0.51] |
| rental.arrivalRentElasticity | -0.02 [-0.08, 0.03] | 0.18 [0.15, 0.21] |
| host.investorEntry | -0.02 [-0.06, 0.03] | 0.15 [0.12, 0.17] |
| host.complianceBase | -0.00 [-0.02, 0.02] | 0.02 [0.02, 0.03] |
| host.anticipation | 0.01 [-0.01, 0.02] | 0.01 [0.01, 0.02] |
| host.multiComplianceShift | -0.01 [-0.02, 0.01] | 0.01 [0.01, 0.01] |
| enforcement.detectMax | -0.00 [-0.01, 0.01] | 0.00 [0.00, 0.01] |
| str.demandGrowthAnnual | 0.00 [-0.00, 0.01] | 0.00 [0.00, 0.00] |
| enforcement.delistProb | 0.00 [nan, nan] | 0.00 [nan, nan] |
| enforcement.regTakeup | 0.00 [nan, nan] | 0.00 [nan, nan] |
| enforcement.exemptClaimShare | 0.00 [nan, nan] | 0.00 [nan, nan] |
| str.demandSpillover | 0.00 [nan, nan] | 0.00 [nan, nan] |
