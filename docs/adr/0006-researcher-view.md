# ADR 0006: Researcher view (observation layer)

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m4

## Context

PLAN §5.10 and §8.3 need a "researcher view": what an analyst with Inside Airbnb snapshots and a
CPI series would see, as distinct from the true state. The DiD-recovery experiment (M4) estimates
the first project's design on this view and compares the estimate with the true effect from
paired runs. The game (M5) shows the player this view, not the truth.

The first project documents the measurement problems that matter: snapshots are roughly quarterly,
scrape coverage varies, 4 of its 52 snapshots were truncated (unevenly across neighbourhoods), and
a snapshot is flagged and dropped when it holds fewer than 75% of the larger of its neighbours'
listings (`queries/02_aggregate_monthly.sql`). CPI rented accommodation is noisy month to month.

## Decision

`packages/sim/src/researcher.ts` post-processes a finished run. It never feeds back into the model,
so model dynamics, the calibration moments and the ensemble hash are unchanged. Its parameters live
in `params/observation.json`, separate from `defaults.json`.

For snapshot tick `t` and zone `z` (true listings `n_zt` in real units):

- completeness `c_t = clamp(N(μ_c, σ_c), 0.5, 1)`, common to all zones (scrape coverage);
- zone noise `η_zt = exp(σ_z ε_zt − σ_z²/2)` (mean one);
- with probability `p_trunc` the snapshot is truncated: zone `z` keeps a share
  `k_zt ~ U(k_min, k_max)`, so truncation is uneven across zones;
- observed `m_zt = round(n_zt · c_t · η_zt · k_zt)` (`k = 1` when not truncated);
- flag: `M_t < 0.75 · max(M_{t−1}, M_{t+1})` with `M_t = Σ_z m_zt` (the first project's rule; a
  missing neighbour falls back to the other one). Flagged snapshots are dropped, never interpolated.

CPI: quarterly readings (ticks ≡ 0 mod 3) of the CPI-style index times `exp(σ_cpi ε_t / 100)`,
with `σ_cpi` in percent.

Draws use new append-only RNG purposes `OBS_COMPLETE` (25), `OBS_ZONE` (26), `OBS_TRUNCATED` (27)
and `OBS_CPI` (28), keyed by the run seed, zone and tick. Paired runs with the same seed therefore
share their observation noise (CRN), so measured differences reflect the policy, not the scrape.

A new CLI command `panel` runs `historical` and `none` with the same seed over the calibration
window and writes the observed panel, both true panels and the flags (`calibration/did_recovery.py`
consumes it).

## Consequences

- No model change: SIM_VERSION, `defaults.json` and the ensemble are unchanged. Tests check that
  observing a run does not change it, determinism, CRN of observation draws, the flag rule,
  unbiased zone noise, the truncation rate and the CPI noise SD.
- `σ_cpi = 2.4%` and `p_trunc = 4/52` are DATA from the first project; completeness and zone noise
  are ASSUMED (ASSUMPTIONS O1-O8).
- The asking-rent "data purchase" and in-game display arrive with M5.
- ODD §4 (Observation) and §7.8; ASSUMPTIONS "Observation layer (M4)".
