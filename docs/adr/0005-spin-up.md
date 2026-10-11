# ADR 0005: Model spin-up with adaptive constants

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m3

## Context

ADR 0002 solved the host ASCs and matching efficiencies analytically, so that the starting state
is a flow-balanced steady state. On the 8-zone Victoria geography this approximation breaks down.
The zones differ by two orders of magnitude in size and settle at different LTR vacancies (≈2-5%,
against v* = 3%). With the review rates the first calibration preferred (~0.16/month), units then
drifted between LTR and STR before any policy. Covered zones trended up against exempt ones, and
the ensemble's pre-announcement leads were −0.04 and −0.06: a spurious pre-trend (target T7).
Starting earlier (a plain burn-in of 27 months) did not help, because the drift is persistent,
not a transient.

## Decision

Scenarios can set `spinUpMonths` (Victoria: 24). `createSim` builds the world, then runs that
many months before the first recorded tick with no policy. After each month two controllers act:

- `ASC_z,c += 0.3 · (logit(s*_z) − logit(s_z))` for investor units (and likewise `ASC_pr,z` for
  PR hosts), where `s*` is the scenario's observed starting share;
- `A_z ← A_z · exp(3 · (v_z − v*))` for the matching efficiency.

Then the constants freeze, history is cleared and the reported rent indices are rebased to 100.
Renter arrivals keep their original reference rent.

The constants are now properties of the model's own steady state, not of an approximation. They
are still not free parameters: the targets are the observed starting counts.

## Consequences

- LTR vacancy starts near v* in every zone. With no policy, the covered-minus-exempt listing
  difference over 64 months is within ±0.05 log points across spin-up lengths of 24-72 months
  (sign varies, ~2 simulation SEs). That is comparable to the real leads' SE (~0.05) and is
  documented as residual noise, not removed by tuning.
- Runs cost ~50% more (24 extra months). The two-zone test scenario has no spin-up, so unit tests
  and the golden snapshot are unaffected by this ADR.
- SIM_VERSION 0.4.0; the ensemble was re-calibrated (`pnpm calibrate`).
- ODD.md §5 updated.
