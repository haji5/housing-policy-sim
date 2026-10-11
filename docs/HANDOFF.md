# Handoff: where the build stands and exactly what to do next

_Last updated 2026-10-11 (fifth session: deployed, m8 tagged; all milestones done). Read this,
then `WORKING_AGREEMENTS.md` and `docs/PLAN.md`._

## 0. What the user asked for (standing instructions)

- Build the simulator in `docs/PLAN.md` following `WORKING_AGREEMENTS.md` strictly: determinism, tests first
  for invariants, ADR + ODD + ASSUMPTIONS for every modelling change, no dependency without a
  one-line justification in the commit message, VERIFY tags for unverified real-world numbers.
- **Goal: finish the project (M0-M8)** autonomously; do not pause to ask unless genuinely blocked.
- End of each milestone: lint, typecheck, tests (+ Playwright screenshots, 3 review rounds for
  UI), commit, tag (`m5`, `m6`, ...), summarise what changed / what's tested / what could not be
  verified. Keep this file updated after each milestone.
- **`D:\Tools\Projects\bc-str-ban-analysis` is verified: its numbers are DATA** (cite the file).
  Respect its own flags (CMHC 2022-23 rows `unverified`). Never modify that repo.
- Don't hand-tune model parameters to hit targets; report diagnostics. Rents: say "too small to
  detect", never "no effect".
- "Plan mode" = write acceptance criteria + files before implementing, without stopping.

## 1. Milestone status

| Milestone               | Status                                                                | Tag  |
| ----------------------- | --------------------------------------------------------------------- | ---- |
| M0-M4                   | done                                                                  | m0-4 |
| M5 full mechanics       | done: validation + Sobol written up in VALIDATION.md §1.1-2 (§3)      | m5   |
| M6 art pass             | done: icons, delisting stamp, dust, 1:1 canvas fix, review round (§4) | m6   |
| M7 debrief/onboarding   | done: wired, a11y checklist, ADR 0011, 3 review rounds (§5)           | m7   |
| M8 polish, docs, launch | done: deployed, live URL checked from a clean browser (§6)            | m8   |

Git: `main` and tags `m0`-`m8` pushed to `origin` = https://github.com/haji5/housing-policy-sim.
Live site: https://haji5.github.io/housing-policy-sim/ (Pages, source "GitHub Actions"; every
push to `main` redeploys). Use `gh` for GitHub; the GitHub MCP server fails to authenticate.

## 2. Environment facts (important, learned the hard way)

- Windows 11; Node 24.14 (runs `.ts` natively by type stripping: **no TS parameter properties**,
  no enums); pnpm 12.11. Workspace: `packages/*`, `apps/*`, `tools/*`.
- **pnpm minimum-release-age gate**: if `pnpm install` adds a package to
  `minimumReleaseAgeExclude`, revert and pin the previous release (ADR 0001). `pnpm install
--offline` works for workspace-only changes.
- TypeScript pinned to 6.0.3 (typescript-eslint does not support TS 7).
- **Python**: no `uv`. `calibration/.venv` (Python 3.11, pinned deps). `node scripts/py.mjs
<task>` runs `calibration/run.py <task>`: `setup`, `calibrate`, `smoke`, `validate`, `did`,
  `sobol`. `python` is not on PATH in Bash; use `calibration/.venv/Scripts/python.exe`.
- **Never edit `packages/sim/src` while calibrate/validate/sobol runs**: the pipeline spawns
  `node packages/sim/src/cli.ts batch` processes that load the current sources. Check with
  `tasklist | grep -E "node|python"` (16 node workers of ~270 MB = a run in progress).
- Python buffers stdout: `calibrate.log`/`validate.log` stay empty until a stage ends. `*.log`
  is gitignored.
- **Ensemble hash covers exact bytes** of `calibration/priors.json`,
  `calibration/inputs/targets.json`, `packages/sim/src/params/defaults.json`,
  `packages/sim/src/scenarios/victoria.json` (+ SIM_VERSION). They are in `.prettierignore`.
  Editing them (or SIM_VERSION) means re-calibrating (~45 min).
- `apps/web/public/atlas/` is generated (`pnpm art`) and prettier-ignored; the PNG is committed.
- ESLint ignores `**/.venv/**`, `calibration/reports/**`.
- Shell pitfalls: Bash `node -e` with template literals gets mangled; heredocs break on
  apostrophes. Use Write/Edit or a script file. **When patching a file with string replace,
  check the anchor exists** (prettier re-wraps lines; one edit this session truncated a file
  because `indexOf` returned -1).
- StatCan blocks automated access; Census numbers stay VERIFY.
- **The in-app browser pane may not render** (screenshot timeouts). Use Playwright specs
  (headless) for visual review: `cd apps/web && npx playwright test e2e/<spec>.ts`, then Read the
  PNGs. The Playwright webServer runs `pnpm build && pnpm preview` itself.
- Timings: Victoria run ~0.23 s (24 spin-up + 49 months); full calibration 44 min; validate
  ~35 min; playtests (8 seeds × 5 strategies) 28 s; e2e ~10 s.

## 3. M5: done (tagged `m5`, 2026-10-10)

Items 1-4 below are done: VALIDATION.md §1.1-2 summarise `calibration/reports/validation.md`
(recovery 79% coverage; all 10 misses are truths in the outer 10% of their prior) and
`calibration/reports/sobol.md` (15.5 min run). Gate note: on a busy machine the sim suite's
timing tests can fail when test files run in parallel under coverage; `npx vitest run --coverage
--no-file-parallelism` in `packages/sim` passes (the perf test now takes the best of 3 runs;
the 8-seed moments test has a 120 s timeout). Item 5 (larger ABC stage 3) was not run.

Original list, for the record:

Done and committed in `eb2ed3b`: web UI for the full game (start screen + mandates, budget and
political capital, six levers + data purchase with costs/cooldowns/refusals, researcher-view
charts, shock cards, scorecard vs the paired no-policy run), sim exports of the playtest API,
batch `--counterfactual` now also outputs `rentBurden` and `completions`, the M5 calibration
(written up in CALIBRATION.md: same passes/misses as M3, T5 worse, ESS 21, 179 distinct sets),
8-seed playtests + known limitations (VALIDATION.md §4-5), `calibration/sobol.py` + `pnpm
sobol`, e2e + screenshots (`docs/screenshots/m5`, 3 rounds).

Remaining, in order:

1. **`pnpm validate` finished** (2026-10-10, 28.9 min, exit 0, sim 0.5.0 ensemble); reports
   committed in `calibration/reports/validation.{md,json}`. Update VALIDATION.md §1.1 (estimator
   check, recovery 3 cases × 16 params, one-at-a-time sensitivity) and §2 (H1, S2, S1) from
   `calibration/reports/validation.md`; do not re-run it. Known from calibration: H1 −0.38
   (miss), S2 78% inside the bound, asking-rent effect −0.48% (5-95% −0.66 to −0.30),
   CPI-style −0.24%.
2. **Sobol**: `pnpm sobol` (default n=256, seeds 1,2; ~4,600 draws, roughly 10 min). Writes
   `calibration/reports/sobol.{md,json}`. Summarise in VALIDATION.md §1.1 (replace the line
   "Sobol indices ... are planned for M5"). Caveats are in the script docstring.
3. Re-run the full gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
4. Commit the reports + docs, **tag `m5` on that commit** (it will sit after the m6/m7 WIP
   commits; that is fine — note it in the tag message).
5. Optional (report as limitation if skipped): a larger ABC stage 3 (e.g. `pnpm calibrate
--stage3 16384`, ~3 h) to raise the ESS from 21.

Playtest result to quote: no single strategy dominates; only the crackdown is Pareto-dominated
(by the balanced mix). Tenant protection wins Budget (8/8 seeds) and Affordability (6/8);
supply wins Tourism (7/8) and Balanced on 5/8 seeds (tenant protection's Balanced mean is lifted
by seed 8). Vacancy-tax revenue (~$160M/term at 1 point per $10M) drives tenant protection's
score; points scales were not re-tuned.

## 4. M6: done (tagged `m6`)

Finished this session: top-bar budget/capital icons and the shock-card icon (`AtlasSprite`);
`stamp_delist` on lots whose sampled home was an STR last quarter and is not now (IsoMap keeps
the previous snapshot; drawn at screen size on the overview and STR overlay); `dust0-2` on
construction lots. Review round found a real defect: the map canvas backing store (922 px) was
drawn into 906 CSS px (frame padding), dropping pixel columns ("RJLE", "EXEMFT"); fixed by
measuring the content box, with an e2e check that `canvas.width === clientWidth`. ODD §4 notes
the map's sampling rule; ADR 0010 updated. Note: `play.spec.ts` regenerates `screenshots/m6/0*`
with the current UI, so they show the M7 tutorial.

Original list, for the record:

Done: `tools/art` (workspace package, `pnpm art`, 11 tests, no deps: own PNG encoder on
`node:zlib`), atlas + `art-preview.html`, isometric map `apps/web/src/render/iso/`
(`city.ts` layout, `atlas.ts` loader + pixel text, `IsoMap.tsx` renderer with pan/zoom/overlays/
reduced motion), pixel UI kit via CSS border-image (`public/atlas/ui/*.png`), pixel-font `Logo`,
ADR 0010, `e2e/map.spec.ts`, screenshots in `docs/screenshots/m6` (map: 3 review rounds; UI
chrome: 2 rounds).

Left before tagging `m6`:

1. Use the remaining assets (optional but in PLAN §9.3): `ui/AtlasSprite.tsx` exists (with
   `SHOCK_ICON` map) but is not used yet — show `icon_budget`/`icon_capital` in the top bar and
   the shock icon on the shock card; draw `stamp_delist` on lots that were STR last quarter and
   are not now (needs the previous snapshot's tenure in IsoMap); `dust0-2` on construction lots.
2. One more UI review round (start screen + 1366×768 game screen) with the pixel UI kit, and a
   2×/3× check of the art preview page.
3. ODD/ASSUMPTIONS: no model change, so nothing required; mention the map's sampling rule in
   ODD's UI/observation note if there is one.
4. Gate, commit, tag `m6`.

## 5. M7: done (tagged `m7`)

Wired: `<Tutorial>` above the charts while playing; evidence `<Badge>`s in every lever legend
(the first legend of a disabled fieldset stays focusable) and on both charts (LineChart `badge`
prop); `<Term>` glossary tooltips (top bar "model variant", shock card, KPIs, chart notes);
"Open the debrief" / "Back to the city" when the term is over (swaps `<main>`); `debrief.css`
imported in `main.tsx`.

Checks and fixes:

- Debrief self-check: `data-own-variant-gap` = max |player's variant replayed in the debrief
  worker − live game| on the covered-listings path; e2e requires < 1e-9 (passes).
- DiD card in a seed-1 run: estimate −0.507 vs truth −0.484 (error −0.023, spillover +0.063),
  the size VALIDATION §3 reports. **Bug fixed:** rule switched on in turn 1 = no pre-period =
  singular regression, which crashed the debrief; `didCard` now returns `reason: 'no-pre'` and
  the card explains it (covered by the keyboard e2e).
- Debrief time: 32 variants × 2 runs on 4 workers = 8.0-9.6 s alone, 12.4 s with another e2e
  test in parallel (busy machine). N=200 would be ~50-60 s: N=32 is the documented deviation
  (ADR 0011).
- Accessibility (`docs/ACCESSIBILITY.md`): all HTML text raised to ≥ 16 px; chart ticks 14 SVG
  units (documented exception, text summaries carry the content); tutorial text no longer names
  lines by colour only; tutorial secondary text contrast 4.2 → white. Not done: screen-reader
  session, Lighthouse/axe (M8).
- e2e: `a11y.spec.ts` moved into `e2e/`; new `debrief.spec.ts` (tutorial, badges, tooltips,
  debrief numbers, honesty rule, screenshots `docs/screenshots/m7`).

## 6. M8: done (tagged `m8`)

Done (committed after `m7`):

- README per PLAN §12: pitch, GIF (`docs/media/zoned-out.gif`, from `e2e/media.spec.ts` with
  `MEDIA=1` + `scripts/make_gif.py`, Pillow from the calibration venv), hook, three headline
  results with figures (calibration fit, listings-vs-rents, DiD bias), link to the first
  project, ten-line model summary, limitations + disclaimer, reproduce steps, performance table,
  tech stack, licences and data attribution. Bill 35 numbers re-checked against
  `bc-str-ban-analysis/README.md` (−0.390, 32%, p = 0.011, 1.7%, −0.4% to −3.3%, 3,133 → 2,033).
- `apps/web/public/about.html` (disclaimer, privacy, data attribution, licences), linked from
  the start screen; meta description.
- Accessibility: `e2e/axe.spec.ts` (new dev dependency `@axe-core/playwright` 4.13.0, pinned;
  no release-age exclusion needed): zero WCAG 2.1 A/AA violations on start, About, game,
  end of term and debrief. Fix it forced: framed elements get a solid background of the image
  fill colour under the CSS `border-image`.
- Budgets (`e2e/budgets.spec.ts`): start screen interactive 74 ms, city built 0.9 s, a turn
  0.11 s; only same-origin requests (privacy). JS 47 KB gz + 2 × 29 KB gz workers; atlas 6.4 KB.
  **Not met:** Victoria run 361-404 ms vs PLAN's 150 ms (75k agents incl. 24-month spin-up;
  the 10k-agent M1 budget passes); debrief N=32 in 8-13 s vs PLAN's 200 in < 10 s.
- Docs: VALIDATION §1 test table completed (moments, researcher, mechanics, game, e2e);
  ACCESSIBILITY axe results; ASSUMPTIONS' VERIFY definition matches practice.
- Pages base path checked: a `BASE_PATH=/housing-policy-sim/` build prefixes JS, CSS and the
  CSS `url()` atlas paths correctly (in Git Bash set `MSYS_NO_PATHCONV=1`, or the path gets
  rewritten to `C:/Program Files/Git/...`).

Status 2026-10-11: the repo exists (`origin` = https://github.com/haji5/housing-policy-sim) and
`main` was pushed, but the tags were not. The first CI run failed only on the perf test (timed
inside the coverage suite; fixed in `f0c9bff`: it now runs alone via `vitest.perf.config.ts`);
the Pages run failed because Pages was not yet enabled (Settings → Pages → Source: GitHub
Actions). CI's e2e and calibration-smoke steps had not run yet.

Fifth session (2026-10-11): the owner enabled Pages. CI run 38121510113 passed every step on
GitHub for the first time, including e2e (8 passed, 1 skipped = media; no retries; debrief 13.6 s
on the runner) and the calibration smoke test (venv built from requirements.txt). Pages run
38121510134 deployed. `apps/web/e2e-live/deployed.spec.ts` (`pnpm e2e:live`, own config
`playwright.live.config.ts`, not part of `pnpm e2e`; LIVE_URL overrides the address) checks the
live site in a fresh headless context: start screen, every stylesheet `url()` resolves under
`/housing-policy-sim/` and returns image/png, atlas fetched, a full 20-turn term, the debrief
(ready in 8.0 s, own-variant gap < 1e-9, "too small to detect"), the About page and its link
back, the art preview (atlas drawn), no console errors, no failed or non-2xx responses, and no
request outside the site's origin and base path. Passed; screenshots
`docs/screenshots/m8/live-*.png` reviewed (no defects found; the debrief's share link uses the
Pages URL). README's "Play it" note updated.

Not started (stretch, owner to choose): Vancouver scenario, daily seed via URL, phone layout,
lazy-loading the debrief, a larger ABC stage 3. Housekeeping: GitHub warns that actions on
Node 20 (checkout@v4, setup-node@v4, setup-python@v5, pnpm/action-setup@v4, configure-pages@v5,
upload-pages-artifact@v3, deploy-pages@v4) are forced onto Node 24, and `ubuntu-latest` moves to
Ubuntu 26 from 2026-10-19; neither breaks anything today.

## 6b. Game-feel UI pass (after m8; ADR 0012)

Owner's request (2026-10-11): make it feel more like a game, and fix tooltips clipping off
screen. Done, UI only (`packages/sim` untouched):

- Tooltip fix (own commit): tips render on `<body>` via `preact/compat` `createPortal`, placed
  by `placeTip` (Tips.tsx) inside the viewport. `e2e/tooltips.spec.ts` fails on the old code.
- HUD (`ui/Hud.tsx`): dark bar, icon counters, 12 capital pips (striped = draft's cost), 20-segment
  term track, floating budget/capital deltas (opaque, removed on animationend; axe flagged a
  fading one). Seed and model variant moved to the City tab so the HUD fits one row at 1024 px.
- Right panel = WAI-ARIA tabs (`ui/Tabs.tsx`): Policies (lever cards with icons, cost chips,
  "Changed" tags), City (former "Since you took office"), Log (decisions + past front pages).
- Quarterly paper "The Daily Zoning" (`game/news.ts`, `ui/Briefing.tsx`): headline from the
  biggest decision or the scraped data, rent-index line labelled noisy, two stakeholder
  reactions. Uses only the researcher view, never the truth; flavour, not scored.
- Title screen with an animated pixel diorama (`ui/TitleScene.tsx`) and mandate cards; results
  card with verdict, per-objective bars and a best score per seed and mandate (local storage;
  About page updated).
- New sprites in tools/art (rent cap, crane, non-market, data, trophy, calendar, 3 faces, dark
  HUD / card / go frames) + an art test that the faces differ by shape.
- 3 screenshot review rounds (`docs/screenshots/game-ui/`); README GIF and debrief stills
  regenerated (`MEDIA=1`).
- Not done, offered to the owner: a map-first layout (would supersede ADR 0003's charts-above-
  the-fold rule), sound, a turn-transition animation.
- Pitfall: in a JS `String.replace` replacement, `$$` becomes `$`; one patch dropped the "$"
  from lever costs. Use `split(a).join(b)` or a replacer function.

## 7. Open issues to report to the user

- M5 calibration ESS 21 (M3: 146); T5/T6a misses got worse; H1 miss −0.38 vs data −0.02.
- Tenant protection is strong under the current points scales (game-design constants, ADR 0009).
- Uncalibrated levels: rent burden ~68%, stress ~15% of renters over 6 years (scored only as
  changes vs the no-policy run). Held-empty stock +16% over 6 years with no policy.
- VERIFY items unchanged: fine, registration cost, incomes, BC rent caps by year, assessed value,
  CRD census counts, construction rates.
- Parameter recovery (M5 ensemble): 79% coverage; misses are truths at prior edges (VALIDATION §1.1).
- `pnpm test` can fail `perf.test.ts` on a busy machine when test files run in parallel under
  coverage; `npx vitest run --coverage --no-file-parallelism` in `packages/sim` passes.
- Debrief uses 32 variants, not PLAN's 200 (ADR 0011).
- In some ensemble members the rule takes effect almost at once: switching it on in turn 1 cuts
  covered listings 41% in the first month (seed 5, member 183) because `complianceBase` (weakly
  identified, up to ~0.79) makes many hosts comply immediately. Consistent with the quarterly
  calibration data, but it makes turn-1 play look abrupt.

## 8. Useful commands

```bash
pnpm lint && pnpm typecheck && pnpm test     # sim tests include an 85% line-coverage gate
pnpm build && pnpm e2e                       # Playwright: hello, play, map, a11y, debrief, axe, budgets
(cd packages/sim && npx vitest run --coverage --no-file-parallelism)   # if perf flakes under load
pnpm art                                     # regenerate the atlas (+ --preview <dir> via node tools/art/src/build.ts)
pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json
pnpm calibrate | pnpm validate | pnpm sobol | pnpm did-recovery
```
