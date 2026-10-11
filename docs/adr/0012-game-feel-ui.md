# ADR 0012: Game-feel UI pass (HUD, city-hall tabs, briefing, title and results screens)

- **Status:** accepted
- **Date:** 2026-10-11
- **Milestone:** post-m8 (UI only)

## Context

After launch the owner asked for the game to "feel more like a game and less of a simulation",
and reported tooltips clipped at the screen edge. PLAN §6.1 asks for a quarterly briefing with
"stakeholder headlines (generated from templates)", and §6.6 for a tabbed right-hand panel and a
top bar with the turn, date, budget and political capital. Neither the headlines nor the tabs
existed. The rest of the screen was a white document layout with pixel-art borders.

Acceptance criteria (restated before implementing):

1. Every tooltip opens fully inside the viewport and is never clipped by a scrolling column
   (e2e, 1366×768 and 1024×700; the test fails on the old code).
2. A game HUD: resource counters with atlas icons, political capital as 12 pips that preview the
   draft's cost, the term as 20 quarter segments, and the change in budget and capital floating
   up after each turn (no movement under `prefers-reduced-motion`; announced in a live region).
3. The right-hand panel as tabs (Policies, City, Log) with WAI-ARIA keyboard behaviour; each
   lever a card with its icon, cost and a text "Changed" tag while the draft differs.
4. A quarterly front page with stakeholder reactions, built only from the player's decisions and
   the data the player can already see.
5. A title screen with a pixel diorama and mandate cards, and a results card with a verdict,
   per-objective bars and a per-browser best score.
6. No change to `packages/sim`; axe finds no WCAG 2.1 AA violations; all text at least 16 px;
   at 1366×768 the charts still start above the fold with the tutorial and the paper showing
   (ADR 0003).

## Decision

1. **Tooltips** render through a portal on `<body>` with fixed coordinates from `placeTip`:
   below the trigger, shifted left to stay on screen, flipped above when there is no room below.
   `preact/compat` (part of the existing `preact` package) provides `createPortal`; no new
   dependency.
2. **The briefing is flavour, not model output.** `game/news.ts` picks the headline from the
   biggest decision of the turn, or else from the scraped listing snapshots (the change between
   the last two complete snapshots, or a note that the latest was flagged incomplete), and adds
   the published rent index's quarterly move, labelled as noisy. It never reads the true series,
   so it cannot leak what the debrief reveals. Reactions (tenants, hosts, tourism, builders,
   treasury, homeowners; generic names, no real organisations) are fixed opinions about the
   direction of a decision, not claims about its effect, and they do not feed the score or
   political capital. The paper's name, "The Daily Zoning", is invented.
3. **Layout kept charts-first.** Putting the isometric map beside the charts would make it more
   prominent but shrinks each chart to about 360 px (tick labels near 10 px). ADR 0003's rule
   (charts visible without scrolling at 1366×768) stands; the map stays below the charts. A
   map-first layout is left to the owner as an option.
4. **Seed and model variant** moved from the top bar to the City tab, so the HUD fits on one
   row down to 1024 px; the logo and the word "Political" are dropped below 1250 px.
5. **New art** (tools/art, within the 32-colour palette): icons for the rent cap, upzoning
   (crane), non-market homes and bought data, a trophy, a calendar, three stakeholder faces that
   differ by mouth shape (art test), and dark HUD, cream card and green "go" frames.
6. **Best score** per seed and mandate is kept in local storage (a per-viewer convenience,
   wrapped in try/catch); the About page's privacy section says so.

## Consequences

- No modelling change: ODD.md and ASSUMPTIONS.md are unaffected; determinism tests unchanged.
- e2e: new `tooltips.spec.ts` and `game-ui.spec.ts` (screenshots in
  `docs/screenshots/game-ui/`); `play.spec.ts` and `debrief.spec.ts` open the Log and City tabs
  where the decision log and the CPI glossary term now live.
- The floating deltas stay fully opaque and are removed on `animationend`: a fading text fails
  contrast while it fades (axe caught one mid-fade).
- Focus rings on dark surfaces use the palette yellow (9:1) instead of orange (3.1:1 there).
