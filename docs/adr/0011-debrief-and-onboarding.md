# ADR 0011: Debrief, evidence badges and onboarding (M7)

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** m7

## Context

PLAN §6.3-6.5 asks for evidence badges on every lever and displayed effect, a glossary, a
skippable four-turn tutorial, and a debrief: the player's term against the no-policy
counterfactual with fan charts across N = 200 replications in a Web Worker (< 10 s across 4
workers, PLAN §11), "what you could have known" (researcher view against god view), the Bill 35
lesson card, a DiD-recovery card for the player's own world, and a shareable seed string.

## Decision

1. **Fans from model variants, N = 32.** The debrief replays the player's exact decisions and the
   game's shock cards under 32 calibrated parameter sets spread evenly through the ensemble
   (`debriefMembers`; the player's own set replaces the first slot), each paired with its own
   no-policy run on the same seed (common random numbers). It runs on a pool of up to 4 module
   workers (`workers/debrief.worker.ts`), streaming each finished variant. Measured in the e2e
   run on the development machine (busy, Chromium headless): 8.0-9.6 s for 32 × 2 runs
   alone, 12.4 s with another e2e test running in parallel. N = 200 would take about 50-60 s
   there, far over PLAN's 10 s budget, so **N = 32 is a deliberate
   deviation from PLAN §6.4**. With 300 sets of which 179 were distinct (ESS 21 at the time; 174 and about 63 since ADR 0013),
   32 evenly spaced members already span the ensemble; the fan shows 5-95% and 25-75% bands
   and the median, which 32 paths estimate adequately for a teaching display (not for inference).
   What varies across the fan is model uncertainty (parameters), not seed noise: every variant
   uses the player's seed.
2. **Self-check.** The player's own variant, replayed in the debrief worker with all events given
   up front, must reproduce the live game exactly (the replay-equality property of the sim,
   `determinism.test.ts`). The debrief exposes the largest gap as `data-own-variant-gap`; the
   e2e test requires it to be < 1e-9.
3. **DiD card in the player's world.** The researcher's regression from ADR 0006 (scraped
   quarterly snapshots, flagged ones dropped, `log(1 + n)` on "covered × rule in force" with zone
   and snapshot fixed effects, `twoWayFE` in TypeScript) against the exact paired truth (mean
   policy-minus-no-policy log gap in covered listings over the post-rule snapshots), plus the
   spillover into exempt areas. If the rule never ran, or it started before any complete
   snapshot (no pre-period: the treatment dummy is collinear with the zone effects), the card
   says why instead of estimating. The second case crashed the first draft; it is now an e2e
   test (keyboard-only play switches the rule on in turn 1).
4. **Evidence levels from ASSUMPTIONS tags.** `ui/evidence.ts`: STR rules and enforcement are
   "Measured here" (calibrated to T1-T7); vacancy tax, rent cap, upzoning and non-market homes
   are "Assumed". The listings chart is "Measured here" and every rent display is "Assumed". No
   lever is "Literature" yet: where a literature result informs a parameter, its size here is
   still assumed, and the tooltip names the source. Badges and glossary terms are buttons with
   tooltips on hover, focus and click (Escape closes; `aria-describedby`).
5. **Tutorial.** One tip per turn for turns 1-4, "Got it" per tip, "Skip the tutorial"
   remembered in `localStorage` (wrapped in try/catch; a convenience, not game state).
6. **Share link** `?seed=N&mandate=id`: the seed fixes the model variant and the shock cards, so
   anyone opening it gets the same city.

## Consequences

- No model change: ODD.md and ASSUMPTIONS.md are unaffected (the debrief only replays the
  existing sim and the existing researcher view).
- The main bundle now includes the ensemble (the debrief picks members from it): 48 KB gzipped
  for the page script, plus the sim and debrief workers. Still far inside the 400 KB budget.
- Rent language follows the honesty rule: the debrief says "too small to detect", never "no
  effect" (checked by the e2e test).
