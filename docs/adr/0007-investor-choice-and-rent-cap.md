# ADR 0007: Investor tenure choice (STR / LTR / VACANT / SELL) and a real-terms rent cap

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** m5

## Context

PLAN §5.4 asks where displaced STR units go. The first project does not identify it, so the
destination simplex (long-term rental, held vacant, sold to an owner-occupier) must be explicit
and uncertain. Through M4 investor units could only be STR or LTR. The vacancy-tax lever (§5.8)
needs a VACANT use to act on, and the rent-cap lever needs a reason to matter: with no inflation in
the model, a nominal cap of 3% hardly bound.

## Decision

**Choice set.** Investor units reviewing (STR, vacant LTR, held vacant; or `due`) choose by logit:

```
U_LTR  = β_c ltrNet_z
U_STR  = ASC_str,z,c + β_c (strNet_z − penalty − regCost)       (if available)
U_VAC  = ASC_vac,z − β_c · rate × assessedValue / 12
U_SELL = ASC_sell,z
```

SELL makes the unit owner-occupied. A unit removed from the platforms is `due` with STR
unavailable this month, so it chooses among LTR, VACANT and SELL at once (before, it simply became
vacant LTR).

**Purchases.** Owner-occupied homes are bought by small investors with monthly probability
`buyProb_z = (sellRateAnnual/12)·Inv_z / Own_z`, which balances sales at the start. To keep the cost
down, each home draws a geometric waiting time when it becomes owner-occupied (statistically
identical, CRN-safe). Investor entry (the spillover channel) is unchanged.

**Steady state.** At build, the ASCs are solved so that the shares of reviewers choosing STR, VACANT
and SELL equal the outflow shares of each stock (`rS/R`, `rH/R`, `(sellRateAnnual/12)·Inv/R`).
Spin-up (ADR 0005) gains two controllers: `ASC_vac` targets the starting held-vacant share and
`ASC_sell` the starting investor share of the stock. The world is now built at its first simulated
tick (`−preTicks − spinUpMonths`), so scheduled events run on one clock. (Building it at
`−preTicks` and rewinding made purchases scheduled at build fire only after the spin-up, which
grew the investor stock by 2 pp in the baseline.)

**Calibrated.** `vacantHeldShare` (prior U(0.005, 0.08)) and `sellRateAnnual` (prior U(0.02, 0.10))
join the priors, so the ensemble carries destination uncertainty into the game (PLAN §5.4).

**Real-terms rent cap.** The model stays in real terms; general inflation `π = 2.65%/yr` (DATA:
Victoria all-items CPI, Sep 2023 to Jun 2026, first project's fixture) separates nominal from
real. On a lease anniversary the landlord wants
`(1+π)(1 + φ·gap) − 1` nominal, gets it clamped to `[0, cap]`, and the real rent becomes
`rent·(1 + allowed)/(1 + π)`. Caps: Low 1%, Medium 3% (`rentCapAnnual`, the status quo), High 6%.
A cap below inflation erodes sitting rents in real terms. Investors weigh it:
`ltrNet ×= capFactor = max(0.5, 1 − capPenaltyYears·max(0, π + g − cap))`, with g the zone's real
asking-rent growth over 12 months.

**Mobility.** Tenants with a below-market rent move less:
`moveHazard·exp(−k·discount)`, k = 3 (ASSUMED).

## Consequences

- Displaced units can now be sold or held vacant, so the rent effect of an STR rule depends on
  weakly identified parameters, as PLAN intends.
- Paired-run variance reduction (CRN) fades over long horizons: once a rule removes the investor
  STR stock in one arm, the churn of that stock in the other arm (reviews, sales, purchases) is not
  shared. The CRN test now measures the effect six months after the rule (variance ratio ~0.3).
- The rent cap now binds when it is below inflation. Its supply cost acts through investors
  (`capFactor`) and rental construction (ADR 0008).
- SIM_VERSION 0.5.0; recalibrated. ODD §5, §7.1, §7.4, §7.5; ASSUMPTIONS I1-I8.
