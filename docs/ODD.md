# ODD protocol: Zoned Out housing-policy ABM

Overview, Design concepts, Details (Grimm et al. ODD protocol). This document describes the model
**as implemented**; PLAN.md §5 holds the original proposals. Every modelling change needs an ADR
in `docs/adr/` and an update here and in `ASSUMPTIONS.md` (IDs like `A12` refer to that file).

_Implemented through: M1 (ADR 0002)._

## 1. Purpose and patterns

The model asks how short-term-rental (STR) regulation changes the use of the housing stock and,
through that, renter outcomes, in a stylised city with covered and exempt zones. It must
reproduce these patterns (calibration targets from M3, PLAN §2):

- covered-zone entire-home listings fall sharply after a principal-residence rule, while exempt
  zones are flat or rising;
- no listing pre-trends before the rule is announced;
- the STR-attributable rent effect is small (within or near −0.4% to −3.3%).

## 2. Entities, state variables and scales

**Dwellings** (struct-of-arrays, fixed count in M1): `zone`, `tenure` ∈ {OWNER_OCC, LTR, STR,
VACANT, CONSTRUCTION} (only the first three are used in M1), `principalRes` (owner lives here),
`compliant` (fixed compliance draw), `quality q`, `rent` (sitting-tenant rent), `tenant`,
`leaseStart`, `registered`, `due` (must decide this tick).

Dwelling types:

- **Owner-occupied** (`principalRes = 1`): OWNER_OCC, or STR when the owner lists their home.
  This is always legal; it needs registration under the registry regime.
- **Investor** (`principalRes = 0`): LTR (occupied or vacant) or STR.

**Households** (renters only): `income` ($k/month), `dwelling`, `status` ∈ {HOUSED, SEARCHING,
DOUBLED_UP, GONE, LEFT}, `searchMonths`, `prefZone`. Owner-occupiers are not modelled as agents.

**Zones**: spec (covered, opt-in tick, counts, rents, STR prices), `marketRent m_z` (asking rent for
new leases), STR demand `D_z`, occupancy, matching efficiency `A_z`, constants `ASC_z`, `ASC_pr,z`.

**Scales**: one tick = one month; one agent = 1/`scale` real units (A1). Money is in $k/month.

## 3. Process overview and scheduling

Each tick runs in fixed order (`step.ts`), and agents are iterated in ascending id:

1. **Exogenous** (`systems/exogenous.ts`): tenant turnover (exit to LEFT or internal move to
   SEARCHING; the vacated unit becomes `due`), then renter arrivals.
2. **Policy** (`systems/enforcement.ts`): resolve levers from the event list; recompute coverage,
   occupancy, detection probability and expected revenues; enforce (compliant exits, detection
   with fines, platform de-listing); registration of PR listings.
3. **Hosts** (`systems/hosts.ts`): use decisions.
4. _Developers: M5._
5. **Rental market** (`systems/rentalMarket.ts`): matching, asking-rent update, sitting-tenant
   anniversaries.
6. **Households** (`systems/households.ts`): search-duration stress transitions.
7. **Observe** (`observe.ts`): record the true state.

## 4. Design concepts

- **Stochasticity and common random numbers.** Every draw is `hash(seed, agentId, tick, purpose,
sub)` (`rng.ts`). Runs that share a seed share every agent's draws, so counterfactuals are
  paired (PLAN §5.1). Tested: prefix identity, variance reduction, exempt-zone invariance when
  markets are decoupled.
- **Adaptation.** Hosts choose the use with the highest random utility (logit). Searchers take
  affordable units.
- **Emergence.** Market rents, occupancy, vacancy and housing stress emerge from agent decisions.
- **Observation.** The god view is recorded each tick. The noisy researcher view follows in M5.

## 5. Initialisation

`world.ts` builds each zone from scenario counts × `scale`. Owner-occupied units, PR STR, investor
STR, occupied LTR and vacant LTR are created in that order. Vacant LTR is
`round(O·v*/(1−v*))`.

Sitting rents are `m_z·q·(1 − sittingDiscount·u)`, with lease anniversaries staggered over 12
months. Initial searchers are `initialSearchingShare × renters`. Incomes are lognormal.

ASCs, matching efficiency and baseline arrivals are solved so the start is a steady state
(ADR 0002 §1, §6, §7).

## 6. Input data

M1 uses the stylised `two-zone` scenario (A2). The Victoria scenario and calibration targets are
introduced in M3, with provenance from `bc-str-ban-analysis`.

## 7. Submodels

### 7.1 Host decisions

Investor units that are STR or vacant LTR review with probability `pReview`; `due` units always
decide. Choices use Gumbel-max (exact logit):

```
strNet_z = occ_z · nightly_z · 30 · (1 − strCostShare) − strUpkeep
ltrNet_z = m_z · (1 − v_z) − ltrUpkeep
U_STR = ASC_z + β (strNet_z − penalty_z) + σ G₁
U_LTR = β ltrNet_z + σ G₀
penalty_z = dp·fine + (1 − (1 − dp)(1 − delist))·strNet_z   (non-compliant host, covered zone)
          = anticipation × (dp·fine + dp·strNet_z)          (announced, not yet in force)
```

Compliant hosts cannot choose STR while the rule binds. PR owners review with probability
`prReview`: `U_list = ASC_pr + β_pr (strNet_z − regCost) + σG₁` vs `U_not = σG₀`.

### 7.2 Enforcement

`dp(L) = detectMax (1 − e^(−detectK (L+1)))`, L ∈ 0..5. Each month, every investor STR in a
covered zone under the rule is removed if the host is compliant; otherwise it is removed if
detected (fined `fine`), or under the registry regime if de-listed (`delistProb`). A removed unit
becomes vacant LTR.

A zone is covered when the regime is not OPEN and (`spec.covered` or `tick ≥ optInTick`).

### 7.3 STR occupancy

`occ_z = occMax · D_z/(D_z + S_z)`. For exempt zones,
`D_z += demandSpillover · Σ_covered max(0, served₀ − served) · D_z/ΣD_exempt`.

### 7.4 Rental market

Searchers target `prefZone`, or another zone with probability `searchOtherZoneProb`. Per zone,
`M = min(S, V, round_stoch(A_z √(S V)))`. Searchers are taken in hashed order and take the first
affordable vacant unit from a hashed start index; the new lease is at `m_z q_d`.

Asking rents: `m_z ← m_z · exp(κ (v* − v_z) + ln(1+drift)/12)`.

Sitting tenants, on each 12-month anniversary:
`rent ← rent · (1 + min(cap, max(0, φ (m_z q_d / rent − 1))))`.

### 7.5 Households

Turnover per housed household per month: exit with `exitHazard` (LEFT), else move with
`moveHazard`.

Arrivals: `Poisson(λ₀ · askIdx^(−ε) · e^(η (v − v*)))`, where `askIdx` is the fixed-weight asking
rent relative to the start and `v` is the renter-weighted vacancy.

Searching longer than `kDouble` months → DOUBLED_UP; longer than `kLeave` → GONE.

### 7.6 Outputs

Per tick and zone: STR listings (total, PR, illegal), LTR occupied/vacant, owner-occupied, asking
rent, occupancy. City-wide: household statuses, CPI-style index (mean quality-adjusted sitting
rent, = 100 at start), asking index (fixed weights), share of housed renters paying > 30% of
income, fines collected.
