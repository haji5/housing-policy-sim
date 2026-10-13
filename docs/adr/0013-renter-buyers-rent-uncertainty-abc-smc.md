# ADR 0013: Renter buyers, rent-dynamics uncertainty in the ensemble, and ABC-SMC

- **Status:** accepted
- **Date:** 2026-10-12
- **Milestone:** post-m8 (review fixes)

## Context

A skeptical review (HANDOFF §6c-7) left three objections that the documentation could only
caveat:

1. **Sold homes housed no one from the rental market.** When an investor sold a unit to an
   owner-occupier, the buyer came from nowhere. In reality many buyers are local renters whose
   move frees a rental, so the model was biased towards a smaller rent effect. That is the
   direction of the headline conclusion ("too small to detect"), which makes the bias look
   self-serving even if it is small.
2. **The headline rent range was overconfident.** The ensemble held the asking-rent adjustment
   speed `kappa` (A26) and the arrival semi-elasticity to vacancy `eta` (A33) fixed. The
   robustness report showed that varying them moves the rent effect from about −0.1% to −2.2%,
   more than all 16 calibrated parameters, so the ensemble's 5-95% range (−0.66% to −0.30%)
   understated the uncertainty, and so did the game, which samples the ensemble.
3. **The ABC posterior was degenerate.** Stage 3 drew 4,096 proposals from one Gaussian fitted to
   the best Stage-1 points and weighted the 600 closest by prior/proposal. The weights were very
   unequal (ESS 21 of 600; one parameter set was 62 of the 300 ensemble members), so each tail of
   a 5-95% range rested on about one effective draw.

## Decision

**Renter buyers.** When an investor unit is sold to an owner-occupier (U_SELL wins), with
probability `renterBuyerShare` (default 0.4, VERIFY) the buyer is a renter household already
housed in the region: of 4 housed renters drawn at random region-wide (keyed by the sold
dwelling and the tick), the one with the highest income. It gets the new status BOUGHT (leaves
the rental market; not scored), and its rental becomes vacant and `due`, as after any move-out.
Otherwise the buyer comes from outside the rental market, as before.

The steady state accounts for it: the renter-buyer hazard
`h_b = renterBuyerShare · (sellRateAnnual/12) · Inv / O` (steady-state sales bought by renters,
spread over all O renter households) is added to tenant turnover when the investor ASCs and
matching efficiencies are solved, and baseline arrivals replace it as they replace ordinary exits.
Sellers of owner-occupied homes bought by investors do not become renter agents (R5).

`renterBuyerShare` is not calibrated: over 0, 0.2, 0.4 and 0.6 the historical policy's Jun 2026
asking-rent effect is −0.383%, −0.378%, −0.377% and −0.377% (mean of 8 ensemble members × 2
seeds of the previous ensemble), because the rule causes only a few hundred extra sales and
investor purchases offset most of them (net owner-occupied stock moves by −40 to +230 homes,
against 600-1,000 displaced units that become occupied long-term rentals). The omission was real
but quantitatively negligible. What sets the rent effect is how far extra rentals draw new
households in (`eta`) versus lower rents (`kappa`).

**`kappa` and `eta` in the ensemble.** Both join `calibration/priors.json`: `kappa` log-uniform
0.03-0.3, `eta` uniform 0-50 (the ranges the robustness report tested). They are barely
identified by listing moments, so their posterior is close to the prior, and the ensemble, the
reported rent range and the game now carry that uncertainty by construction instead of in a side
report. 18 parameters are calibrated.

**ABC-SMC Stage 3** (population Monte Carlo; Beaumont, Cornuet, Marin & Robert 2009). Generation
0 is the best 600 of the 8,192 Stage-1 Sobol draws (prior draws, equal weights). Each generation
draws 2,048 proposals: pick a particle by weight, perturb it with a Gaussian kernel with the
population's weighted covariance, and keep the draw if it lies inside the prior's unit cube. The
best 600 are kept (an adaptive, rank-based tolerance) and weighted by

```
w_i ∝ prior(θ_i) / Σ_j W_j N(θ_i; θ_j, Σ) / Z_j
```

where `Z_j` is the kernel's mass inside the cube around particle j (Monte Carlo, 4,000 common
draws), so the truncated proposal density is exact up to Monte Carlo error. Generations stop once
the tolerance is at most 93.3, the ABC tolerance of the previous (M5) ensemble, so the new
ensemble meets the same fit standard and its ESS can be compared with the old one directly; at
most 12 generations. The final population is resampled into 300 members. Stage 2 (Nelder-Mead)
is kept as a diagnostic of the best distance. Stages 1-2 and every generation (with the RNG
state) are cached under a key of every input, including a hash of the sim sources, so a re-run
resumes instead of repeating work.

On a 4-D toy problem with two unidentified dimensions and one posterior at a prior edge, the SMC
population matched a brute-force rejection sample at the same tolerance in every mean and SD (to
0.01) with ESS of about 575 of 600.

**Stopping rules that were tried and discarded** (same seeds; reported so the choice is not a
hidden degree of freedom):

1. Beaumont's kernel of twice the covariance shrank the tolerance only from 180 to 171 in its
   first generation: in 18 dimensions most wide perturbations land outside the accepted region.
   The kernel was narrowed to the covariance itself (Filippi, Barnes, Cornebise & Stumpf 2013
   show tighter kernels are more efficient; the weights are exact for any kernel).
2. Stopping at twice the best distance found. The tolerance went 180, 151, 137, 124, 122, 112,
   105, 98, 92, 92, 91, 96, 97 over 12 generations, with ESS between 22 and 158. It plateaus near
   D = 91, the noise floor of the 4-seed distance: there, keeping the 600 best proposals selects
   lucky simulations rather than better parameters, and the weights degenerate. The best distance
   the rule chased (32.6) was itself a lucky draw, so the rule never fired; the run ended at ESS 44.
3. Stopping when the tolerance falls by less than 2% in one generation. It fired on a stall at
   generation 4 (124 to 122), leaving a looser fit than the old ensemble (T3 failed). Any
   per-step threshold chosen after seeing trajectory 2 would be tuned to it, so a target fixed in
   advance (the old tolerance) was used instead.

## Consequences

- `SIM_VERSION` 0.6.0; re-calibrated; every downstream report re-run (validate, Sobol,
  DiD recovery, robustness, playtests) before any number is quoted (HANDOFF §6c rule).
- The golden snapshot changed (renter buyers with the default share). The CRN decoupling test
  also switches renter buyers off, because they are drawn region-wide and couple the zones.
- New tests: `test/renterBuyers.test.ts` (no buyers at share 0; invariants every tick; no-policy
  renter population within 2% and asking rent within 1% of the share-0 run; the rule lowers
  asking rents by more with buyers).
- Parameter recovery (validate.py) now runs 2 SMC generations of 768 proposals with a population
  of 256 per case (no tolerance target: a fixed budget per case).
- ODD §2, §3, §5, §7.1, §7.5; ASSUMPTIONS A26, A33, R1-R5; CALIBRATION method and results.

## Results

Filled in from the re-calibration below.
