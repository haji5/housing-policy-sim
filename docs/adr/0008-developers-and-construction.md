# ADR 0008: Developers, construction pipeline, upzoning and non-market homes

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** m5

## Context

PLAN §5.6 and §10 M5 ask for developers with a permit lag and a construction pipeline, zoning
that can be relaxed, and non-market building. The dwelling stock was fixed until M4.

## Decision

**Stock grows.** Dwelling arrays grow on demand. New units are CONSTRUCTION until `completeTick`.
Each new unit gets a birth key (start tick, zone, order within the tick) for its random draws,
so paired runs stay paired even when their numbers of starts differ.

**Starts.** In zone z, `Poisson(λ_z)` per month with

```
λ_z = startsBase_z · (m_z/m_ref,z)^ρ · exp(−h (rate − rateRef)) · upzone_z
      · (1 − rentalShare_z + rentalShare_z · capFactor_z^capElasticity)
```

- `startsBase_z = startsAnnualShare · dwellings_z / 12`, with `startsAnnualShare = 2.2%` (VERIFY:
  roughly CMHC completions in the Victoria CMA relative to stock).
- `ρ = 1` (ASSUMED); `m_ref` is the asking rent at the end of spin-up.
- `rate` is the Bank of Canada policy rate (DATA, first project's fixture; flat after Oct 2026)
  plus any rate-hike shock; `h = 0.1` per point (ASSUMED); `rateRef = 2.75` (VERIFY: middle of the
  BoC's published neutral-rate range).
- `capElasticity = 3` (ASSUMED magnitude; the direction, rent control reducing rental supply, is
  LITERATURE: Diamond, McQuade & Qian 2019).
- Lags are uniform on 18-30 months (VERIFY; PLAN §5.6).

**Completions.** A start is for an owner-occupier, or a rental, with the rental share
`rentalShare_z = renterHouseholds_z / dwellings_z` (adjusted by the cap factor). Rental completions
are **purpose-built rentals**: always long-term rented at market rent, never converted to STR or
sold. Without this, new rentals (concentrated in covered zones, where the renter share is high)
fed the investor stock and drifted covered-zone listings up by ~0.05 log points in no-policy runs.
Recent Victoria completions are largely purpose-built rental buildings (VERIFY), which do not list on
STR platforms.

**Arrivals** grow with the baseline flow of rental completions at reference conditions, so a
no-policy baseline keeps its vacancy near v*.

**Upzoning** is a per-zone starts multiplier (Moderate ×1.4, Aggressive ×2.0) that takes effect
`permitDelayTicks = 12` months after the decision. ASSUMED magnitudes, informed by Auckland's
2016 upzoning, which roughly doubled consents on upzoned land (VERIFY). It is irreversible in the
game. A capacity-headroom model (PLAN §5.6) was tried first and rejected: with 110% capacity and
~2%/yr growth, headroom ran out within the game's horizon in the baseline, so starts collapsed
regardless of policy.

**Non-market homes.** The lever's homes per quarter start each month (× scale / 3, stochastically
rounded), in zones in proportion to renter stock; on completion they are long-term rentals at
`nonMarketRentShare = 70%` of market rent (ASSUMED).

**Pipeline at the start.** `startsBase_z · E[lag]` units with length-biased lags and uniform ages,
so completions flow from the first month.

## Consequences

- Runs are ~50% slower (~0.23 s for the calibration window); calibration ~45-60 min.
- The scenario's `capacity` field is no longer used.
- Upzoning effects show up only after the permit delay plus the construction lag (≥ 30 months),
  inside a 60-month term: the player feels the lag, as PLAN §5.6 intends.
- ODD §2, §3, §5, §7.9; ASSUMPTIONS D1-D10.
