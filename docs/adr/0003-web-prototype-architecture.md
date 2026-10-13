# ADR 0003: Web prototype architecture (M2)

- **Status:** accepted
- **Date:** 2026-10-10
- **Milestone:** m2

## Context

M2 needs a playable loop with the sim running off the main thread .

## Decision

1. **The worker owns the sim state.** `workers/sim.worker.ts` holds one `SimState`. The UI sends
   `init {scenario, seed}` and `advance {events, ticks}`. The worker appends the player's lever
   changes as policy events at the current tick (`addPolicyEvents`), steps 3 ticks, and returns a
   snapshot: series so far, lever state, and per-dwelling tenure/occupancy as transferred typed
   arrays. The replay-equality test in `packages/sim` guarantees this incremental mode gives the
   same result as a batch run with the same events.
2. **Seeds.** `?seed=N` in the URL fixes the seed; otherwise the UI draws one with
   `crypto.getRandomValues`. That is fine in the UI; randomness stays out of the sim core.
3. **No D3 yet.** Two placeholder line charts are hand-written SVG (`ui/LineChart.tsx`), so no
   dependency is added. The project plan named D3; revisit when the M7 fan charts need it.
4. **Placeholder map.** Canvas 2D, one small square per dwelling, in a fixed hashed shuffle per
   zone. Colours are Okabe-Ito with distinct luminance. Shapes and the isometric renderer come in
   M6.
5. **Laptop-first layout.** At 1366×768 the charts (the main feedback) must be visible without
   scrolling. Playwright runs at that viewport and saves screenshots to `docs/screenshots/m2/`.

## Consequences

- No model change: ODD.md and ASSUMPTIONS.md are unaffected.
- The UI shows the true ("god view") series. The researcher view with measurement noise
  arrives in M5.
