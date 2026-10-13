# ODD protocol: Zoned Out housing-policy ABM

Overview, Design concepts, Details (Grimm et al. ODD protocol). This document describes the model
**as implemented**. Every modelling change needs an ADR in `docs/adr/` and an update here and in
`ASSUMPTIONS.md` (IDs like `A12` refer to that file).

_Implemented through ADRs 0002, 0004-0009 and 0013. SIM_VERSION 0.6.0._

## 1. Purpose and patterns

The model asks how short-term-rental (STR) regulation and other housing levers change the use of
the housing stock and, through that, renter outcomes, in a stylised city with covered and exempt
zones. It must reproduce these patterns (calibration targets from M3; CALIBRATION.md):

- covered-zone entire-home listings fall sharply after a principal-residence rule, while exempt
  zones are flat or rising;
- no listing pre-trends before the rule is announced;
- the STR-attributable rent effect is small (within or near −0.4% to −3.3%).

The other levers (vacancy tax, upzoning, rent cap, non-market homes) are not calibrated to
outcome data; their mechanisms and magnitudes are documented assumptions (ADRs 0007-0009).

## 2. Entities, state variables and scales

**Dwellings** (struct-of-arrays; the array grows with construction): `key` (stable RNG key: the
index for the starting stock, a birth key for construction), `zone`, `tenure` ∈ {OWNER_OCC, LTR,
STR, VACANT (held off the market), CONSTRUCTION}, `principalRes` (owner lives here), `hostClass` ∈
{SINGLE, MULTI, COMMERCIAL}, `compliant` (fixed compliance draw), `claimsExempt` (fixed draw: shows
"Exempt" on the registry), `quality q`, `rent` (sitting-tenant rent), `tenant`, `leaseStart`,
`registered` ∈ {NONE, REGISTERED, EXEMPT_CLAIM}, `due` (must decide this tick; 2 = just removed
from the platforms), `completeTick` and `forOwner` (construction), `rentalKind` ∈ {INVESTOR,
NON_MARKET, PURPOSE_BUILT}, `buyTick` (when an owner-occupied home will be bought by an investor).

Dwelling types:

- **Owner-occupied** (`principalRes = 1`): OWNER_OCC, or STR when the owner lists their home.
  Always legal; needs registration under the registry regime.
- **Investor** (`principalRes = 0`, `rentalKind = INVESTOR`): LTR (occupied or vacant), STR or
  VACANT. Investor units can be sold to owner-occupiers, and owner-occupied homes can be bought by
  investors (§7.1).
- **Purpose-built rental** and **non-market** (`rentalKind` ≠ 0): completed construction; always
  LTR, never reviewed (§7.9).
- **Under construction**: CONSTRUCTION until `completeTick`.

**Households** (renters only): `income` ($k/month, real), `dwelling`, `status` ∈ {HOUSED,
SEARCHING, DOUBLED_UP, GONE, LEFT, BOUGHT}, `searchMonths`, `prefZone`. Owner-occupiers are not
agents; a renter who buys a home an investor sold leaves the agent set as BOUGHT (§7.1, ADR 0013).

**Zones**: spec (covered, opt-in tick, counts, rents, STR prices), `marketRent m_z` (real asking
rent for new leases), STR demand `D_z` (start value `D_z0`), occupancy, matching efficiency `A_z`,
constants `ASC_str,z,c` (per host class), `ASC_pr,z`, `ASC_vac,z`, `ASC_sell,z`, purchase
probability `buyProb_z`, baseline starts `startsBase_z`, developers' reference rent `m_ref,z` and
the zone's rental share of completions `rentalShare_z` (= renter households / dwellings).

**Scales**: one tick = one month (tick 0 = Sep 2023 in the Victoria scenario); one agent =
1/`scale` real units (A1). Money is in real (constant Sep 2023) $k/month; only the rent cap is
nominal. Runs may start before tick 0 (`preTicks`).

## 3. Process overview and scheduling

Each tick runs in fixed order (`step.ts`), and agents are iterated in ascending id:

1. **Exogenous** (`systems/exogenous.ts`): tenant turnover (exit to LEFT or internal move to
   SEARCHING; the vacated unit becomes `due`), then renter arrivals.
2. **Policy** (`systems/enforcement.ts`): resolve levers and shock cards from the event list;
   recompute coverage, occupancy, detection probability, expected revenues (with the rent-cap
   factor), the policy rate, the vacancy tax and the upzoning multipliers in force; enforce
   (anticipatory exits, compliant exits, detection with fines, registration, de-listing).
3. **Hosts** (`systems/hosts.ts`): purchases from owner-occupiers, investor entry, then use
   decisions (a sale may free the rental of a renter who buys it).
4. **Developers** (`systems/developers.ts`): completions, then market and non-market starts.
5. **Rental market** (`systems/rentalMarket.ts`): matching, asking-rent update, sitting-tenant
   anniversaries.
6. **Households** (`systems/households.ts`): search-duration stress transitions.
7. **Observe** (`observe.ts`): record the true state.

## 4. Design concepts

- **Stochasticity and common random numbers.** Every draw is `hash(seed, key, tick, purpose, sub)`
  (`rng.ts`). Runs that share a seed share every agent's draws, so counterfactuals are paired
  (ADR 0002). New dwellings get a birth key (start tick, zone, order within the tick), so one
  extra start in one arm does not shift the draws of every later unit. Tested: prefix identity,
  variance reduction six months after a rule, exempt-zone invariance when markets are decoupled.
- **Adaptation.** Hosts choose the use with the highest random utility (logit). Searchers take
  affordable units. Developers respond to rents, the policy rate, zoning and the rent cap.
- **Emergence.** Market rents, occupancy, vacancy, construction and housing stress emerge from
  agent decisions.
- **Observation.** The god view is recorded each tick. A separate researcher view (§7.8, ADR 0006) turns it into what an analyst would see: noisy, sometimes truncated quarterly listing
  snapshots and a noisy CPI. It is post-processing only and never feeds back into the model.
  The game's isometric map (ADR 0010) is a third, purely visual read of the god view: each
  building shows one home of its zone sampled from a fixed hashed order of the starting stock
  (new construction fills reserved lots in id order), so the share of buildings in each state
  matches the zone's share of homes. A delisting stamp marks sampled homes that were STRs at the
  previous quarter's snapshot and are not now. It is never used by the model or the scorecard.
- **Exogenous shocks.** Shock cards (§7.10) change rates, arrivals, incomes, enforcement or
  tourist demand for a fixed period. They are events, applied identically to a player's run and
  its no-policy counterfactual.

## 5. Initialisation

The world is built at its first simulated tick, `−preTicks − spinUpMonths`, so every scheduled
event (pipeline completions, purchases, lease anniversaries) runs on one clock.

`world.ts` builds each zone from scenario counts × `scale`, in this order: owner-occupied units, PR
STR, investor STR, occupied LTR, vacant LTR (`round(O·v*/(1−v*))`), held-vacant investor units
(`round(vacantHeldShare · (O + V + S_inv))`), then a steady-state construction pipeline of
`startsBase_z · E[lag]` units with length-biased lags and uniform ages. The PR share of listings
is the zone's value or, if absent, the calibrated `prShare`.

Host classes: investor units are multi-listing with probability
`m = multiHostShare · S_total / S_investor` (so the scenario's multi-host share of all listings
holds at the start), and within those COMMERCIAL with probability `commercialShareOfMulti`.
Compliance is a fixed draw `u < complianceBase (+ multiComplianceShift for MULTI/COMMERCIAL)`;
`claimsExempt` is a fixed draw `u < exemptClaimShare`.

Sitting rents are `m_z·q·(1 − sittingDiscount·u)`, with lease anniversaries staggered over 12
months. Initial searchers are `initialSearchingShare × renters`. Incomes are lognormal.

The investor ASCs are solved so the start is flow-balanced (ADR 0007): with reviewers per month
`R = r(S + V + H) + h·O` (h = move + exit hazard + the renter-buyer hazard of ADR 0013), the logit shares of STR, held-vacant and sell among reviewers equal
`rS/R`, `rH/R` and `(sellRateAnnual/12)·Inv/R`, the rest LTR. `buyProb_z` makes purchases equal
sales. Matching efficiency and baseline arrivals are solved as in ADR 0002, with renters who buy
homes counted as turnover: the renter-buyer hazard is
`renterBuyerShare · (sellRateAnnual/12) · Inv / O` (steady-state sales by renters, spread over all
renter households), and baseline arrivals replace it as well as ordinary exits.

**Spin-up** (ADR 0005, extended by ADR 0007). If the scenario sets `spinUpMonths` (Victoria: 24),
the model runs that many months with no policy before the first recorded tick. After each month
the controllers move by 0.3 × (logit(target) − logit(current)): `ASC_str` (investor STR share),
`ASC_pr` (PR listing share), `ASC_vac` (held-vacant share of investor units) and `ASC_sell`
(opposite sign, investor share of the stock); `A_z *= exp(3·(v_z − v*))`. The constants then
freeze, history is cleared, the reported indices are rebased to 100 and developers' reference
rents are set to the current asking rents.

## 6. Input data

- `two-zone`: stylised test city (A2), used by unit tests.
- `victoria`: 8 zones of the Capital Regional District (ADR 0004; ASSUMPTIONS V1-V12). Listing
  counts, multi-host share and nightly price are Aug 2023 Inside Airbnb aggregates from
  `bc-str-ban-analysis`. Dwellings and renter households are 2021 Census-based totals allocated
  to zones (partly ASSUMED).
- `params/policyRate.json`: Bank of Canada policy rate, monthly 2019-2026 (DATA, from the first
  project's fixture); held flat afterwards.
- `params/shocks.json`: shock-card deck (ASSUMED effects).
- Calibration targets: `calibration/inputs/targets.json`, each with its source file and field in
  `bc-str-ban-analysis`.

## 7. Submodels

### 7.1 Host decisions (ADR 0007)

Investor units that are STR, vacant LTR or held vacant review with probability `pReview`; `due`
units always decide. Choices use Gumbel-max (exact logit). For host class c with `β_c = β`
(× `commercialBetaMult` for COMMERCIAL):

```
strNet_z = occ_z · nightly_z · 30 · (1 − strCostShare) − strUpkeep
ltrNet_z = m_z · (1 − v_z) · capFactor_z − ltrUpkeep
U_LTR  = β_c ltrNet_z + σ G₀
U_STR  = ASC_str,z,c + β_c (strNet_z − penalty − regCost) + σ G₁   (if available)
U_VAC  = ASC_vac,z − β_c · vacancyTax + σ G₂
U_SELL = ASC_sell,z + σ G₃
penalty = dp·fine + (1 − (1 − dp)(1 − delist))·strNet_z   (non-compliant host, covered zone;
                                                           delist = 0 if the host claims exempt)
        = anticipation × (dp·fine + dp·strNet_z)          (announced, not yet in force)
regCost = registrationCost under the registry regime, 0 for hosts claiming exempt
vacancyTax = rate × assessedValue / 12
capFactor_z = max(0.5, 1 − capPenaltyYears · max(0, π + max(0, g_z) − cap))
```

where π is general inflation, `cap` the nominal rent cap in force and `g_z` the zone's real asking
rent growth over the past 12 months. STR is unavailable to compliant hosts while the rule binds
and, for one month, to a unit just removed from the platforms. SELL turns the unit into an
owner-occupied home (it leaves the investor stock).

**Renter buyers** (ADR 0013). With probability `renterBuyerShare` the buyer of a sold investor home
is a renter household already housed in the region, drawn uniformly (region-wide, keyed by the
sold dwelling and tick; not income-selected, so the renter income distribution stays stationary). It becomes BOUGHT and its rental becomes
vacant and `due`. Otherwise the buyer comes from outside the rental market.

PR owners review with probability
`prReview`: `U_list = ASC_pr + β_pr (strNet_z − regCost) + σG₁` vs `U_not = σG₀`.

**Purchases.** Each owner-occupied, non-listing home is bought by a small investor after a
geometric waiting time with monthly probability `buyProb_z` (drawn once when it becomes
owner-occupied). The unit becomes a vacant investor rental that decides its use at once.

**Investor entry** (spillover, unchanged). In zones where the rule does not bind, each
non-listing owner-occupied home is bought by a commercial investor with monthly probability
`investorEntry · max(0, strNet_z / max(0.1, strNet_z0) − 1)`.

### 7.2 Enforcement

`dp(L) = detectMax (1 − e^(−detectK (L+1))) × detectMult`, L ∈ 0..5, where `detectMult` is 0.5
during a court-challenge card. Each month, for every STR listing:

- **Anticipation** (announced, regime still OPEN): a compliant investor host in a zone the rule
  will cover exits with probability `anticipation`.
- **Rule** (regime ≥ 1): an investor STR in a covered zone is illegal (any registration is void).
  It is removed if the host is compliant, or if detected (probability dp; fined `fine`).
- **Registry** (regime 2, all zones): an unregistered listing whose host claims exempt becomes
  EXEMPT_CLAIM. Otherwise, if legal, it registers with probability `regTakeup`. From
  `delistLagTicks` after the registry opens, an unregistered, non-exempt listing is de-listed with
  probability `delistProb`.

A removed investor unit becomes `due` (choosing LTR, VACANT or SELL this month); a removed PR
listing reverts to OWNER_OCC. A zone is covered when the regime is not OPEN and (`spec.covered`
or `tick ≥ optInTick`).

### 7.3 STR occupancy

`D_z(t) = D_z0 · exp(demandGrowthAnnual · max(0, t)/12) · strDemandMult` (common trend from tick
0; the multiplier comes from shock cards); `occ_z = occMax · D_z/(D_z + S_z)`. For zones where the
rule does not bind, `D_z += demandSpillover · Σ_covered max(0, served₀·growth − served) ·
D_z/ΣD_exempt`.

### 7.4 Rental market

Searchers target `prefZone`, or with probability `searchOtherZoneProb` another zone chosen in
proportion to renter stock. Per zone, `M = min(S, V, round_stoch(A_z √(S V)))`. Searchers are taken
in hashed order and take the first unit whose new-lease rent is at most `maxRentShare × income ×
incomeMult` from a hashed start index. The new-lease rent is `m_z q_d` (× `nonMarketRentShare` for
non-market homes).

Asking rents: `m_z ← m_z · exp(κ (v* − v_z) + ln(1+drift)/12)` (drift = 0 in Victoria).

Sitting tenants, on each 12-month anniversary (real terms, nominal cap; ADR 0007):
`wanted = (1+π)(1 + φ·(target/rent − 1)) − 1`, `allowed = min(cap, max(0, wanted))`,
`rent ← rent · (1 + allowed)/(1 + π)`, where `target` is the unit's new-lease rent and `cap` is
`rentCapLow`, `rentCapAnnual` or `rentCapHigh`.

### 7.5 Households

Turnover per housed household per month: exit with `exitHazard` (LEFT); otherwise move with
`moveHazard · exp(−k · discount)`, where `discount = max(0, 1 − rent/new-lease rent)`. Renters
also leave the rental market by buying sold investor homes (BOUGHT, §7.1).

Arrivals: `Poisson((λ₀ + λ_c) · askIdx^(−ε) · e^(η (v − v*)) · arrivalsMult)`, where `λ_c` is the
baseline flow of new rental homes (rental completions at reference conditions), `askIdx` the
fixed-weight asking rent relative to the start and `v` the renter-weighted vacancy. Shock
multipliers apply with a one-month lag.

Searching longer than `kDouble` months → DOUBLED_UP; longer than `kLeave` → GONE.

### 7.6 Outputs

Per tick and zone: STR listings (total, PR, illegal, registered, "Exempt", multi-host), LTR
occupied/vacant, owner-occupied, held vacant, under construction, starts, completions, sales,
non-market homes, dwellings, asking rent, occupancy. City-wide: household statuses, CPI-style
index (mean quality-adjusted sitting rent, = 100 at start), asking index (fixed weights), share of
housed renters paying > 30% of income, fines, vacancy-tax revenue, policy rate.

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

### 7.9 Developers (`systems/developers.ts`, ADR 0008)

Completions first: a unit whose `completeTick` has come becomes owner-occupied (`forOwner`) or a
vacant rental of its `rentalKind` (purpose-built at market rent, or non-market). Then market
starts in zone z are `Poisson(λ_z)`:

```
λ_z = startsBase_z · (m_z/m_ref,z)^ρ · exp(−h (rate − rateRef)) · upzone_z
      · (1 − rentalShare_z + rentalShare_z · capFactor_z^capElasticity)
startsBase_z = startsAnnualShare · dwellings_z / 12
```

`rate` is the policy rate (DATA path + shock shift), `upzone_z` the starts multiplier of the
zone's upzoning decided at least `permitDelayTicks` ago (1, `upzoneModerate` or
`upzoneAggressive`). A start is a rental with probability
`rentalShare·capFactor^capElasticity / (1 − rentalShare + rentalShare·capFactor^capElasticity)`
and completes after `lag ~ U{lagMin..lagMax}` months. Non-market starts are the lever's homes per
quarter × `scale`/3 per month (stochastically rounded), placed in zones in proportion to renter
stock.

### 7.10 Shock cards (`shocks.ts`, `params/shocks.json`, ADR 0009)

A `shock` event switches a card's effects on for `durationTicks` months: a policy-rate shift
(rate hike +1 pt), multipliers on renter arrivals (migration surge ×1.3, recession ×0.9,
wildfire ×1.1), on incomes in affordability and burden (recession ×0.95), on detection (court
challenge ×0.5) and on tourist STR demand (tourism boom ×1.25, recession ×0.9, wildfire ×0.7).
Overlapping cards add shifts and multiply multipliers.

### 7.11 Scorecard (`metrics.ts`, ADR 0009)

The game scores the effect of the player's policy against the paired no-policy run (same seed,
parameters and shocks): change in the rent-burden share, in the housing-stress rate
(`(newly GONE + DOUBLED_UP) / (housed + stressed)`), extra completions, the fiscal balance
relative to the status quo, the change in STR listings (visitor capacity) and political capital
left. Points per objective use ASSUMED game-design scales; mandates weight them.
