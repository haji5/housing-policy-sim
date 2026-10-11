# ODD protocol: Zoned Out housing-policy ABM

Overview, Design concepts, Details (Grimm et al. ODD protocol). This document describes the model
**as implemented**; PLAN.md §5 holds the original proposals. Every modelling change needs an ADR
in `docs/adr/` and an update here and in `ASSUMPTIONS.md` (IDs like `A12` refer to that file).

_Implemented through: M3 (ADRs 0002, 0004, 0005)._

## 1. Purpose and patterns

The model asks how short-term-rental (STR) regulation changes the use of the housing stock and,
through that, renter outcomes, in a stylised city with covered and exempt zones. It must
reproduce these patterns (calibration targets from M3, PLAN §2):

- covered-zone entire-home listings fall sharply after a principal-residence rule, while exempt
  zones are flat or rising;
- no listing pre-trends before the rule is announced;
- the STR-attributable rent effect is small (within or near −0.4% to −3.3%).

## 2. Entities, state variables and scales

**Dwellings** (struct-of-arrays, fixed count until M5): `zone`, `tenure` ∈ {OWNER_OCC, LTR, STR,
VACANT, CONSTRUCTION} (only the first three are used so far), `principalRes` (owner lives here),
`hostClass` ∈ {SINGLE, MULTI, COMMERCIAL}, `compliant` (fixed compliance draw), `claimsExempt`
(fixed draw: shows "Exempt" on the registry), `quality q`, `rent` (sitting-tenant rent), `tenant`,
`leaseStart`, `registered` ∈ {NONE, REGISTERED, EXEMPT_CLAIM}, `due` (must decide this tick).

Dwelling types:

- **Owner-occupied** (`principalRes = 1`): OWNER_OCC, or STR when the owner lists their home.
  This is always legal; it needs registration under the registry regime.
- **Investor** (`principalRes = 0`): LTR (occupied or vacant) or STR. An owner-occupied home can
  become an investor unit through investor entry (§7.1).

**Households** (renters only): `income` ($k/month), `dwelling`, `status` ∈ {HOUSED, SEARCHING,
DOUBLED_UP, GONE, LEFT}, `searchMonths`, `prefZone`. Owner-occupiers are not modelled as agents.

**Zones**: spec (covered, opt-in tick, counts, rents, STR prices), `marketRent m_z` (asking rent for
new leases), STR demand `D_z` (and its start value `D_z0`), occupancy, matching efficiency `A_z`,
constants `ASC_z,c` (per host class) and `ASC_pr,z`, starting net STR revenue `strNet_z0`.

**Scales**: one tick = one month (tick 0 = Sep 2023 in the Victoria scenario); one agent =
1/`scale` real units (A1). Money is in $k/month. Runs may start before tick 0 (`preTicks`).

## 3. Process overview and scheduling

Each tick runs in fixed order (`step.ts`), and agents are iterated in ascending id:

1. **Exogenous** (`systems/exogenous.ts`): tenant turnover (exit to LEFT or internal move to
   SEARCHING; the vacated unit becomes `due`), then renter arrivals.
2. **Policy** (`systems/enforcement.ts`): resolve levers from the event list; recompute coverage,
   occupancy (with common demand growth), detection probability and expected revenues; enforce
   (anticipatory exits, compliant exits, detection with fines, registration, platform de-listing).
3. **Hosts** (`systems/hosts.ts`): investor entry, then use decisions.
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
- **Observation.** The god view is recorded each tick. A separate researcher view (§7.8, ADR 0006) turns it into what an analyst would see: noisy, sometimes truncated quarterly listing
  snapshots and a noisy CPI. It is post-processing only and never feeds back into the model.

## 5. Initialisation

`world.ts` builds each zone from scenario counts × `scale`. Owner-occupied units, PR STR, investor
STR, occupied LTR and vacant LTR are created in that order. Vacant LTR is
`round(O·v*/(1−v*))`. The PR share of listings is the zone's value or, if absent, the calibrated
`prShare`.

Host classes: investor units are multi-listing with probability
`m = multiHostShare · S_total / S_investor` (so the scenario's multi-host share of all listings
holds at the start), and within those COMMERCIAL with probability `commercialShareOfMulti`.
Compliance is a fixed draw `u < complianceBase (+ multiComplianceShift for MULTI/COMMERCIAL)`;
`claimsExempt` is a fixed draw `u < exemptClaimShare`.

Sitting rents are `m_z·q·(1 − sittingDiscount·u)`, with lease anniversaries staggered over 12
months. Initial searchers are `initialSearchingShare × renters`. Incomes are lognormal.

ASCs (per host class, using that class's β), matching efficiency and baseline arrivals are solved
so the start is a steady state (ADR 0002 §1, §6, §7). Searchers arriving from other zones are
counted in proportion to renter stock when solving `A_z`.

**Spin-up** (ADR 0005). If the scenario sets `spinUpMonths` (Victoria: 24), the model then runs
that many months with no policy before the first recorded tick. After each month,
`ASC_z,c += 0.3·(logit(s*_z) − logit(s_z))` (investor STR share), likewise `ASC_pr,z` for PR
listings, and `A_z *= exp(3·(v_z − v*))`, where `s*` are the observed starting shares. The
constants then freeze, history is cleared and the reported indices are rebased to 100.

## 6. Input data

- `two-zone`: stylised test city (A2), used by unit tests.
- `victoria`: 8 zones of the Capital Regional District (ADR 0004; ASSUMPTIONS V1-V12). Listing
  counts, multi-host share and nightly price are Aug 2023 Inside Airbnb aggregates from
  `bc-str-ban-analysis`. Dwellings and renter households are 2021 Census-based totals allocated
  to zones (partly ASSUMED).
- Calibration targets: `calibration/inputs/targets.json`, each with its source file and field in
  `bc-str-ban-analysis`.

## 7. Submodels

### 7.1 Host decisions

Investor units that are STR or vacant LTR review with probability `pReview`; `due` units always
decide. Choices use Gumbel-max (exact logit). For host class c with `β_c = β` (× `commercialBetaMult`
for COMMERCIAL):

```
strNet_z = occ_z · nightly_z · 30 · (1 − strCostShare) − strUpkeep
ltrNet_z = m_z · (1 − v_z) − ltrUpkeep
U_STR = ASC_z,c + β_c (strNet_z − penalty − regCost) + σ G₁
U_LTR = β_c ltrNet_z + σ G₀
penalty = dp·fine + (1 − (1 − dp)(1 − delist))·strNet_z   (non-compliant host, covered zone;
                                                           delist = 0 if the host claims exempt)
        = anticipation × (dp·fine + dp·strNet_z)          (announced, not yet in force)
regCost = registrationCost under the registry regime, 0 for hosts claiming exempt
```

Compliant hosts cannot choose STR while the rule binds. PR owners review with probability
`prReview`: `U_list = ASC_pr + β_pr (strNet_z − regCost) + σG₁` vs `U_not = σG₀`.

**Investor entry.** In zones where the rule does not bind, each non-listing owner-occupied home is
bought by a commercial investor with monthly probability
`investorEntry · max(0, strNet_z / max(0.1, strNet_z0) − 1)`; the unit becomes investor-owned
(vacant LTR, `due`) and its new owner decides its use at once.

### 7.2 Enforcement

`dp(L) = detectMax (1 − e^(−detectK (L+1)))`, L ∈ 0..5. Each month, for every STR listing:

- **Anticipation** (announced, regime still OPEN): a compliant investor host in a zone the rule
  will cover exits with probability `anticipation`.
- **Rule** (regime ≥ 1): an investor STR in a covered zone is illegal (any registration is void).
  It is removed if the host is compliant, or if detected (probability dp; fined `fine`).
- **Registry** (regime 2, all zones): an unregistered listing whose host claims exempt becomes
  EXEMPT_CLAIM. Otherwise, if legal, it registers with probability `regTakeup`. From
  `delistLagTicks` after the registry opens, an unregistered, non-exempt listing is de-listed with
  probability `delistProb`.

A removed investor unit becomes vacant LTR; a removed PR listing reverts to OWNER_OCC.

A zone is covered when the regime is not OPEN and (`spec.covered` or `tick ≥ optInTick`).

### 7.3 STR occupancy

`D_z(t) = D_z0 · exp(demandGrowthAnnual · max(0, t)/12)` (common trend from tick 0);
`occ_z = occMax · D_z/(D_z + S_z)`. For zones where the rule does not bind,
`D_z += demandSpillover · Σ_covered max(0, served₀·growth − served) · D_z/ΣD_exempt`.

### 7.4 Rental market

Searchers target `prefZone`, or with probability `searchOtherZoneProb` another zone chosen in
proportion to renter stock. Per zone,
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
income, fines collected. Per zone also: registered, "Exempt"-claiming and multi-host listings.

### 7.7 Calibration moments (`moments.ts`)

On the zone × snapshot-month panel (Inside Airbnb snapshot months, Jun 2022 to Jun 2026, Mar 2026
excluded): the S2a DiD `log(1 + n/scale) ~ antic + phase1 + phase2 | zone + month` (covered vs
exempt; an opted-in zone leaves the control group), an event study with reference Aug 2023 whose
four pre-announcement coefficients are the T7 leads, log level paths of covered, never-covered and
opt-in zones relative to Aug 2023, and the multi-host and registry shares in Jun 2026.

### 7.8 Researcher view (`researcher.ts`, ADR 0006)

At each snapshot tick, observed listings in zone z are
`m_zt = round(n_zt · c_t · exp(σ_z ε_zt − σ_z²/2) · k_zt)`, where `n_zt` is true listings in real
units, `c_t = clamp(N(0.97, 0.02), 0.5, 1)` is scrape completeness common to all zones,
`σ_z = 0.04`, and `k_zt ~ U(0.4, 0.7)` only in a truncated snapshot (probability 4/52), else 1. A
snapshot is flagged and dropped when its total is below 0.75 × the larger of its neighbours'
totals (the first project's rule). Quarterly CPI readings are the CPI-style index times
`exp(0.024 ε_t)`. Draws are keyed by run seed, zone and tick with their own purposes, so paired
runs share observation noise. Parameters: `params/observation.json` (ASSUMPTIONS O1-O8).
