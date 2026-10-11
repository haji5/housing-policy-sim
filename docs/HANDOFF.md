# Handoff: where the build stands and exactly what to do next

_Last updated 2026-10-10 ~20:30 (end of the third session), for the next session. Read this, then
`WORKING_AGREEMENTS.md` and `docs/PLAN.md`._

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

| Milestone                 | Status                                                                     | Tag  |
| ------------------------- | -------------------------------------------------------------------------- | ---- |
| M0-M4                     | done                                                                       | m0-4 |
| **M5 full mechanics**     | **committed (`eb2ed3b`); validate + Sobol + docs left, then tag (§3)**     | -    |
| **M6 art pass**           | **committed as WIP (`m6 (WIP)` commit); small polish left, then tag (§4)** | -    |
| **M7 debrief/onboarding** | **drafted, not wired into the UI (§5)**                                    | -    |
| M8 polish, docs, launch   | not started (§6)                                                           | -    |

Git: `main`, no remote (GitHub MCP auth fails; nothing pushed; Pages deploy untested).
Order of commits this session: `eb2ed3b` m5 → `m6 (WIP)` → `m7 (WIP)` drafts + this file.

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

## 3. M5: what is left

Done and committed in `eb2ed3b`: web UI for the full game (start screen + mandates, budget and
political capital, six levers + data purchase with costs/cooldowns/refusals, researcher-view
charts, shock cards, scorecard vs the paired no-policy run), sim exports of the playtest API,
batch `--counterfactual` now also outputs `rentBurden` and `completions`, the M5 calibration
(written up in CALIBRATION.md: same passes/misses as M3, T5 worse, ESS 21, 179 distinct sets),
8-seed playtests + known limitations (VALIDATION.md §4-5), `calibration/sobol.py` + `pnpm
sobol`, e2e + screenshots (`docs/screenshots/m5`, 3 rounds).

Remaining, in order:

1. **`pnpm validate` was started at ~20:00 in the background** (output →
   `calibration/reports/validate.log`, ends with a `real ...` line from `time`). If the log has
   no `real` line and no python/node workers are running, re-run `pnpm validate` (~35 min).
   Then update VALIDATION.md §1.1 (estimator check, recovery 3 cases × 16 params,
   one-at-a-time sensitivity) and §2 (H1, S2, S1) from `calibration/reports/validation.md`.
   Known from calibration already: H1 −0.38 (miss), S2 78% inside the bound, asking-rent
   effect −0.48% (5-95% −0.66 to −0.30), CPI-style −0.24%.
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

## 4. M6: what is left (committed as WIP)

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

## 5. M7: drafted, not wired (committed as `m7 (WIP)`)

New files (typecheck and lint clean, **not imported by App yet**):

- `workers/debrief.worker.ts` + `game/debrief.ts`: replays the player's decisions in 32 model
  variants (spread through the ensemble; includes the player's own) on a pool of up to 4
  workers, each paired with a no-policy run (same seed + shocks), returning per-tick effect
  paths; `fan()` quantiles; `didCard()` = the researcher's DiD in the player's world (scraped
  snapshots, flagged dropped, `twoWayFE`) vs the exact paired truth; `ruleOnFrom(events)`.
  PLAN asked for N=200 in < 10 s; 32 variants keeps it to a few seconds — state the deviation.
- `ui/Debrief.tsx`: cards for "your term vs no policy" (fan charts), "what you could have
  known" (scraped vs true, CPI vs asking), the DiD card, the Bill 35 lesson card (numbers checked
  against bc-str-ban-analysis `README.md`: −0.390 / 32%, RI p = 0.011, 1.7% of renter
  households, rent cap −0.4% to −3.3%, dashboard https://haji5.github.io/bc-str-ban-analysis/),
  and a share link `?seed=N&mandate=id`.
- `ui/evidence.ts` (badge levels per lever from ASSUMPTIONS tags + glossary), `ui/Tips.tsx`
  (`Badge`, `Term` accessible tooltips), `ui/Tutorial.tsx` (4 tips, skippable, localStorage),
  `ui/debrief.css` (import it from `main.tsx` or App).
- Already changed: `LineChart` supports `bands` (fans) and `zero`; worker `finish` returns
  `runs: {policyRun, baseRun}` (in `Final` and `FinalResult`); `UiState.events` collects the
  player's policy events; `?mandate=` preselects the mandate.
- `apps/web/e2e-pending/a11y.spec.ts`: keyboard-only play to the debrief, reduced motion,
  protan/deutan/tritan screenshots → `docs/screenshots/m7`. Move it into `e2e/` once wired
  (it expects a "Skip the tutorial" button, a "Open the debrief" button and `data-testid`s
  `tutorial`, `debrief`, `did-card`).

To finish M7:

1. Wire into `ui/App.tsx`: `<Tutorial turn={g.turn} />` above the charts while playing;
   `<Badge>` next to each lever legend in `Levers.tsx` (from `LEVER_EVIDENCE`) and on the two
   charts (listings: measured; rents: assumed); `<Term>` in key labels; when `phase === 'over'`
   add an "Open the debrief" button that swaps the main column for `<Debrief state={state} />`.
2. Check the debrief numbers in a run (the player's own variant's path in the fan should match
   "your world"; DiD error should be of the order VALIDATION §3 reports).
3. Accessibility checklist (PLAN §6.7) → `docs/ACCESSIBILITY.md`: Okabe-Ito + shapes ✓, keyboard
   (map keys, native controls) ✓, focus visible, reduced motion ✓, ARIA on charts/canvas ✓.
   **Known gap: `small`/`.muted` text is 14px and chart ticks ~12px, below PLAN's 16px minimum**
   — fix or document.
4. e2e (move a11y spec), 3 screenshot rounds, ADR 0011 (debrief design, N=32 choice), commit,
   tag `m7`.

## 6. M8 reminders

README per PLAN §12 (pitch, GIF, 3 headline results, link to the first project, model summary,
limitations, "not policy advice; not affiliated with the Government of BC", reproduce steps,
licences + data attribution: Inside Airbnb CC BY 4.0, StatCan OGL-Canada, Bank of Canada, CMHC);
docs complete (ODD, ASSUMPTIONS, CALIBRATION, VALIDATION); performance budgets (PLAN §11: bundle
< 400 KB gz — currently ~23 KB + 154 KB worker; atlas < 300 KB — 6.4 KB); Lighthouse; attribution
page; GitHub remote + Pages need the user (create the repo / authorise GitHub).

## 7. Open issues to report to the user

- M5 calibration ESS 21 (M3: 146); T5/T6a misses got worse; H1 miss −0.38 vs data −0.02.
- Tenant protection is strong under the current points scales (game-design constants, ADR 0009).
- Uncalibrated levels: rent burden ~68%, stress ~15% of renters over 6 years (scored only as
  changes vs the no-policy run). Held-empty stock +16% over 6 years with no policy.
- VERIFY items unchanged: fine, registration cost, incomes, BC rent caps by year, assessed value,
  CRD census counts, construction rates.

## 8. Useful commands

```bash
pnpm lint && pnpm typecheck && pnpm test     # sim tests include an 85% line-coverage gate
pnpm build && pnpm e2e                       # Playwright (hello, play, map specs)
pnpm art                                     # regenerate the atlas (+ --preview <dir> via node tools/art/src/build.ts)
pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json
pnpm calibrate | pnpm validate | pnpm sobol | pnpm did-recovery
```
