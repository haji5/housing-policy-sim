# ADR 0004: Victoria scenario, host classes, registry and calibration mechanics (M3)

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m3

## Context

M3 calibrates the model to the Bill 35 estimates (CALIBRATION.md). That needs the real geography, the
Phase 2 registry, host classes for target T5, a spillover channel for the exempt-area path (T4),
and pre-policy months to test for spurious pre-trends (T7). Two defects in the M1 model showed up
on the 8-zone geography and are fixed here.

## Decision

1. **Victoria scenario, 8 zones.** The 29 Inside Airbnb neighbourhoods of the CRD are grouped into
   5 covered zones, 2 never-covered zones (Juan de Fuca, Southern Gulf Islands) and Salt Spring
   Island (exempt until its opt-in at tick 26 = Nov 2025). Listing counts are the Aug 2023
   snapshot and sum exactly to the first project's 3,133 covered / 500 never-covered.
   `tools/scenario/build-victoria.mjs` builds the file; ASSUMPTIONS V1-V12 record provenance.
2. **Host classes.** Investor units are SINGLE, MULTI or COMMERCIAL. A share of investor units is
   multi-listing, chosen so the multi-host share of all listings matches the Aug 2023 data
   (46.05%); PR hosts are single. Multi-listing hosts' compliance is shifted by
   `multiComplianceShift`. Commercial operators have a revenue-sensitivity multiplier.
   Per-class ASCs keep the start stationary.
3. **The registry applies everywhere.** Under regime 2 every listing needs a registration, including
   in exempt areas (as the first project notes). Hosts with a fixed "claims exempt" trait show
   "Exempt" and are not de-listed. Legal listings register at monthly rate `regTakeup`; illegal
   ones cannot. Platforms de-list unregistered listings at `delistProb` per month, starting one
   month after the registry opens (registry 1 May 2025, platform validation 1 Jun 2025).
4. **Anticipation as early exit.** Between the announcement (Oct 2023) and Phase 1, compliant
   investor hosts in zones that will be covered exit with monthly hazard `anticipation`. A pure
   expected-penalty term could not produce the −0.12 anticipation estimate.
5. **Spillover channels.** (a) A share `demandSpillover` of tourist demand displaced from covered
   zones moves to exempt zones (from M1). (b) Investor entry: in zones without the rule,
   non-listing owner-occupied homes are bought by commercial investors at rate
   `investorEntry × max(0, strNet/strNet₀ − 1)`. (c) A common tourist-demand trend
   `demandGrowthAnnual` from tick 0. In principle T3, T4 and T1 separate (c) from (a)+(b).
6. **Pre-ticks.** Runs may start before tick 0 (`preTicks`). Calibration runs Jun 2022 to Jun 2026
   (ticks −15 to 33) so the event study has the same four pre-announcement leads as the real data.
7. **Moments in TypeScript.** `moments.ts` reproduces the first project's S2a DiD and event study on
   the sim's zone × snapshot panel (log(1 + listings/scale), zone and month fixed effects,
   opted-in zones dropped from control). It runs inside the `batch` CLI because Python would
   otherwise parse ~30k full run outputs. `validate.py` checks it against pyfixest to 1e-6.
8. **Fix: cross-zone search.** M1 picked "another zone" uniformly. With zones of 368 and 25,000
   renters this flooded small zones with searchers and left big zones with excess vacancy, which
   created a spurious covered-vs-exempt listing trend (+0.07 placebo "effect"). Other-zone search
   is now proportional to renter stock; the placebo effect is 0.01 (noise).
9. **Fix: lease anniversaries** are now set relative to the first simulated tick.

## Consequences

- SIM_VERSION 0.3.0. The ensemble records hashes of the priors, targets, defaults and scenario
  plus the sim version, and a test fails when any of them changes (re-run `pnpm calibrate`).
- Known limitation: search-zone choice ignores relative rents, so zone vacancies differ
  persistently (≈2-5%). It is roughly balanced between covered and exempt zones, so listing
  moments are unaffected. Revisit in M5 with the developer/zoning mechanics.
- ODD.md §2, §3, §5, §6, §7.1-7.3 and ASSUMPTIONS.md V1-V13 and A36-A46 were added (A6, A13, A20, A25 re-tagged).
