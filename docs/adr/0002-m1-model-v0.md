# ADR 0002: Headless model v0 (M1)

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m1

## Context

PLAN.md §5 gives v1 proposals for the model. M1 implements a two-zone subset (STR/LTR host
choice, minimal rental market). Several details were unspecified or, implemented literally, give a
non-stationary baseline that would create spurious pre-trends (violating target T7). This ADR
records what was implemented and where it departs from §5.

## Decision

1. **Steady-state initialisation via alternative-specific constants (ASCs).** For investor units
   the logit is `U_STR = ASC_z + β(strNet_z − penalty) + σG₁`, `U_LTR = β·ltrNet_z + σG₀`. `ASC_z`
   is solved at world build so the scenario's starting STR count is a flow-balanced steady state
   with no policy change: inflow to STR `P(h·O + r·V)` equals outflow `r·S·(1−P)`, giving
   `P* = rS / (hO + rV + rS)` and `ASC_z = σ·logit(P*) − βΔ₀`, where O, V, S are occupied LTR,
   vacant LTR and investor STR units, `r = pReview`, `h = moveHazard + exitHazard`. PR hosts have
   symmetric reviews, so `ASC_pr = σ·logit(s_pr) − β_pr·strNet`.
2. **No displacement of sitting tenants.** Occupied LTR units do not review. When a tenant leaves,
   the unit is flagged `due` and its owner decides on its use that tick. (BC tenancy law makes
   converting a tenanted unit to STR hard; this also makes the conversion lag realistic.)
3. **Compliance heterogeneity.** A fixed per-dwelling draw marks a share `complianceBase` of
   investor hosts as compliant: when the rule binds they exit at once and never choose an
   illegal STR. Others weigh the expected penalty
   `dp·fine + (1 − (1−dp)(1−delist))·strNet`.
4. **Enforcement removes listings.** Each month a non-compliant illegal STR is detected with
   probability `dp(level) = detectMax·(1 − e^(−detectK·(level+1)))` (fined, removed); under the
   registry regime it is otherwise de-listed with probability `delistProb`. Removed units return to
   the LTR market.
5. **STR occupancy clears a simple demand curve.** `occ_z = occMax·D_z/(D_z + S_z)`, with `D_z`
   solved so the starting occupancy matches the scenario. A share `demandSpillover` of the tourist
   nights displaced from covered zones moves to exempt zones, in proportion to their demand.
6. **Matching function.** Per zone, `M = min(S, V, A·√(S·V))` with stochastic rounding. `A` is
   solved so matches balance vacancy creation at the start. Searchers go in hashed order; each
   takes the first affordable vacant unit (`m_z·q_d ≤ maxRentShare·income`). Units have a fixed
   quality `q_d ~ U(1−s, 1+s)`, so new-lease rent is `m_z·q_d`.
7. **Elastic renter arrivals with damping.** Arrivals are Poisson with
   `λ = λ₀·(askIdx)^(−ε)·exp(η·(v − v*))`. `λ₀` replaces ordinary exits, grossed up for the
   share of arrivals who cannot afford the cheapest unit. Fixed arrivals made rents collapse after
   STR units returned to LTR, because nobody could absorb them. Rent elasticity alone gave a
   weakly damped ~10-year rent cycle (two integrators in series); the vacancy term damps it.
8. **Two exit statuses.** `LEFT` (ordinary out-migration, exogenous hazard) is separate from
   `GONE` (left after searching longer than `kLeave`). Only `GONE` counts as housing stress.

## Consequences

- With no policy change, listings and asking rents are approximately stationary (asking index
  within ~2% over 12 years in the two-zone scenario). The CPI-style index rises a few points
  early on as below-market sitting tenants catch up under the cap; this is intended (PLAN §5.5).
- `ASC`s and matching efficiencies are derived quantities, not calibrated parameters.
- VACANT and SELL alternatives, host classes, developers, the rent-cap lever and shock cards are
  deferred (M3/M5).
- ODD.md §2–7 and ASSUMPTIONS.md entries A1–A35 were written for this ADR.
