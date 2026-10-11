# Handoff: where the build stands and exactly what to do next

_Last updated 2026-10-10 (second session, mid-M5), for the next session. Read this, then
`WORKING_AGREEMENTS.md` and `docs/PLAN.md`._

## 0. What the user asked for (standing instructions)

- Build the simulator in `docs/PLAN.md` following `WORKING_AGREEMENTS.md` strictly: determinism, tests first
  for invariants, ADR + ODD + ASSUMPTIONS for every modelling change, no dependency without a
  one-line justification in the commit message, VERIFY tags for unverified real-world numbers.
- **Goal: "Finish the project"** (all milestones M0-M8). This superseded the original "stop after
  M2 and ask me to playtest". Keep going; do not pause to ask unless genuinely blocked.
- At the end of each milestone: run lint, typecheck, tests (+ Playwright screenshots where
  relevant, 3 review rounds for UI), commit, tag (`m0`, `m1`, ...), and summarise what changed,
  what's tested, and what could not be verified.
- **The user said: the original repo `D:\Tools\Projects\bc-str-ban-analysis` has been verified
  and fact-checked extensively — trust anything in it.** Tag numbers from it as DATA, with the
  file/field. Where that repo flags its own rows (CMHC 2022-23 vacancy `unverified`), respect
  the flag. Never modify that repo.
- "Plan mode" was interpreted as: write the plan (acceptance criteria + files) before
  implementing each milestone, without stopping for approval.

## 1. Milestone status

| Milestone                             | Status                                                                  | Tag  |
| ------------------------------------- | ----------------------------------------------------------------------- | ---- |
| M0 scaffold                           | done                                                                    | `m0` |
| M1 headless sim v0                    | done                                                                    | `m1` |
| M2 ugly playable prototype            | done (screenshots in `docs/screenshots/m2/`)                            | `m2` |
| M3 calibration + validation           | done; acceptance partly met (T5, T6a miss; see CALIBRATION)             | `m3` |
| M4 DiD-recovery experiment            | done (VALIDATION.md §3)                                                 | `m4` |
| **M5 full mechanics**                 | **in progress: model committed; recalibration + web UI remaining (§5)** | -    |
| M6 art pass                           | not started                                                             | -    |
| M7 debrief / evidence UI / onboarding | not started                                                             | -    |
| M8 polish, docs, launch               | not started                                                             | -    |

Git: branch `main`, no remote configured (the GitHub MCP connector failed to authenticate;
nothing has been pushed; Pages deploy is untested).

## 2. Environment facts (important, learned the hard way)

- Windows 11; Node 24.14 (runs `.ts` natively via type stripping, so no tsx); pnpm 12.11.
- **pnpm minimum-release-age gate**: if `pnpm install` adds a package to
  `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, revert that and pin the previous release
  instead (ADR 0001). This happened with prettier 3.9.10 → pinned 3.9.9.
- TypeScript is pinned to 6.0.3 (typescript-eslint does not support TS 7 yet).
- **Python**: no `uv`. Calibration uses `calibration/.venv` (Python 3.11, created with `venv` +
  pip from `calibration/requirements.txt`, pinned to the first project's versions: numpy
  2.4.6, pandas 3.0.6, scipy 1.17.1, pyfixest 0.60.0, matplotlib 3.11.2).
  `node scripts/py.mjs <task>` finds a Python and runs `calibration/run.py <task>`. Tasks:
  `setup`, `calibrate`, `smoke`, `validate`, `did`.
- **Never edit `packages/sim/src` while a calibration is running**: the Python pipeline spawns
  fresh `node packages/sim/src/cli.ts batch` processes that load the current sources.
- StatCan's website shows a bot-validation interstitial ("Just a moment…") to automated access.
  Do not try to get past it. Census numbers from it stay VERIFY (secondary source: Wikipedia).
- **The ensemble hash covers exact file bytes** of `calibration/priors.json`,
  `calibration/inputs/targets.json`, `packages/sim/src/params/defaults.json` and
  `packages/sim/src/scenarios/victoria.json`. These are in `.prettierignore` because
  `pnpm format` once reformatted them and broke the hash. Edit them only on purpose (then
  re-calibrate). Their writers are: targets via Python `json.dumps(indent=2, ensure_ascii=True)`;
  priors and defaults via `JSON.stringify(x, null, 2)`; victoria via its build script.
- ESLint ignores `**/.venv/**` (pip packages ship JavaScript) and `calibration/reports/**`.
- Shell pitfalls: in Bash `node -e "..."` with JS template literals (backticks) gets mangled by
  command substitution. Use the Edit/Write tools for TS/TSX containing backticks, or write a
  script file first.
- `python` is not on PATH in the Bash tool; use `calibration/.venv/Scripts/python.exe` directly.
- Bash heredocs sometimes fail ("unexpected EOF") when the body has apostrophes, and `\n` inside
  a generated TS string can turn into a real newline. Write edit scripts with the Write tool into
  the scratchpad and run them, or use the Edit tool.
- `calibrate.log` stays empty until a stage ends (Python buffers stdout); check worker processes
  (`tasklist | grep node`) to see if it is running.
- Full Victoria calibration took ~29 min in M3 (expect ~45-60 min for the M5 model). A sim run was
  ~0.15 s in M3 and is ~0.23 s in M5 (24 spin-up + 49 recorded months).

## 3. M3: finished (tag `m3`)

- Calibration (2026-10-10, sim 0.4.0, 28.6 min): results summarised in `docs/CALIBRATION.md`
  (Results). Pass: T1, T1a, T3, T4, T6b, T7. Miss: T2 (down-weighted), T5, T6a. Diagnostics are
  written up there; nothing was hand-tuned. Do not re-run unless the model changes.
- Validation (`pnpm validate`, 18.8 min, first complete run): `calibration/reports/validation.md`,
  summarised in `docs/VALIDATION.md` §1.1-2. pyfixest = TS DiD to 1.4e-14; recovery 42/42
  covered but with wide intervals; H1 Salt Spring miss (-0.26 vs -0.02); S2 83% in band.
- Web: listing counts now in real units (`layout.scale`), map packs to fit 1366x768 with charts
  visible; e2e asserts a covered-vs-exempt DiD < -0.15 (was a two-zone threshold). Screenshots in
  `docs/screenshots/m3/`.

### Known limitations to carry into docs

- Zone vacancies differ (search-zone choice ignores relative rents); spin-up reduces this. The
  residual no-policy covered-minus-exempt drift is within ±0.05 log points over 64 months.
- Housing-stress exits (GONE) are high in the baseline (~1,500 households by 2026 at full
  scale), and the rent-burden share is ~68%. Neither is calibrated: income (A31) and maxRentShare
  are VERIFY/ASSUMED. Address in M5 (scorecard) and say so.
- `fine`, `registrationCost`, `incomeMedian`, `rentCapAnnual`, CRD populations/dwellings are
  VERIFY (see ASSUMPTIONS.md).

## 4. M4: finished (tag `m4`)

- Observation layer `packages/sim/src/researcher.ts` + `params/observation.json` (ADR 0006, ODD
  §7.8, ASSUMPTIONS O1-O8). Flag rule matches the first project exactly:
  `total < 0.75 × max(prev, next)`. CPI noise SD 2.4 is in **percent** (applied multiplicatively).
  RNG purposes 25-28 added. Model output, defaults and ensemble unchanged.
- CLI `panel` command; `pnpm did-recovery` (~1 min) writes `calibration/reports/did_recovery.*`.
- Result (VALIDATION.md §3): at calibrated spillover the DiD overstates the Phase 1 effect by
  0.037 log points (~11%); ~0 with no spillover, −0.080 at 3×. Most of it is control-zone
  spillover; measurement noise adds ~0 bias. Single-run SD of the error ~0.08.
- The 75% flag rule drops a genuine (policy-driven) snapshot in ~7% of runs. Worth a sentence in
  the game's debrief.

## 5. M5: in progress (model done and committed; recalibration + web UI remaining)

### Done

- **Model** committed in `b1ecbf3` ("m5 (WIP)"), SIM_VERSION 0.5.0. ADRs 0007 (investor
  STR/LTR/VACANT/SELL choice, purchases, real-terms rent cap, mobility), 0008 (developers,
  pipeline, purpose-built rentals, upzoning as a starts multiplier, non-market homes, BoC rate
  path), 0009 (game layer). ODD fully rewritten for M5; ASSUMPTIONS I1-I8, D1-D11, K1-K6, G1-G6.
  (The docs are in the second WIP commit; see git log.)
- New sim files: `systems/developers.ts`, `shocks.ts` + `params/shocks.json`, `rates.ts` +
  `params/policyRate.json` (DATA), `metrics.ts` (scorecard vs paired no-policy run),
  `game.ts` (resources, costs, cooldowns, seeded shock schedule, mandates), `playtest.ts`
  (`playGame`, `paramsForSeed`, `recentRevenue`, 5 `STRATEGIES`), CLI `pnpm sim playtest`.
- Two new calibrated priors: `host.vacantHeldShare`, `host.sellRateAnnual` (16 parameters).
- Tests: 60 sim tests; all pass except the 2 ensemble tests (stale until recalibration). New:
  `mechanics.test.ts`, `game.test.ts`; CRN variance test now at a 6-month horizon (explained in
  the test and ADR 0007); golden snapshot updated deliberately.
- Bugs found and fixed along the way (in ADRs): world now built at its true first tick
  (`-preTicks - spinUpMonths`), otherwise scheduled events (pipeline, purchases) fired after
  spin-up; new dwellings use stable birth keys (`dw.key`) for CRN; rental completions are
  purpose-built (removed a +0.05 covered-vs-exempt placebo drift).
- Preliminary playtest (6 seeds, OLD ensemble, so numbers will change): winners differ by mandate
  (supply wins Balanced/Tourism, tenant protection wins Affordability/Budget); only the crackdown
  is Pareto-dominated (by the balanced mix). The STR crackdown scores badly: the Bill 35 lesson.

### In flight when the session ended

- `pnpm calibrate` was started in the background at ~19:15 on 2026-10-10 against commit
  `b1ecbf3`. It was probably killed when the session closed. **Check
  `calibration/reports/calibrate.log`: if it does not end with `exit 0`, re-run
  `pnpm calibrate` (~45-60 min; runs are ~0.23 s each now).** Do not edit `packages/sim/src`
  while it runs.
- **Web UI rewrite, half done (does not typecheck yet):** `apps/web/src/game/protocol.ts`,
  `client.ts`, `useGame.ts` and `workers/sim.worker.ts` are rewritten (player sim + no-policy
  twin in lockstep, shocks, `finish` → outcomes). Still to do:
  1. Export from `packages/sim/src/index.ts`: `paramsForSeed`, `playGame`, `recentRevenue`,
     `STRATEGIES` (and types `PlayResult`, `Strategy`) from `./playtest.ts`. Only after the
     calibration has finished (index.ts is loaded by the batch workers).
  2. Rewrite `ui/App.tsx` for the new `useGame()` API (`state.phase` now starts at `'setup'`:
     a start screen choosing a mandate from `MANDATES`, then `start(seed, mandate)`). Top bar:
     turn, date, budget $M, political capital, mandate. Show the current shock card
     (`state.currentShock`, `shockCard(code)`). End of term: scorecard panel from
     `state.final` (effects, points, mandate score; "vs no-policy run, same seed and shocks").
  3. Rewrite `ui/Levers.tsx` for all six levers + "buy asking-rent data" checkbox, with the live
     `quote` (fiscal cost, capital cost, errors as role=alert; disable End turn on errors).
     Upzoning: per-zone select, irreversible note. Non-market: 0-40 per quarter, step 5.
  4. Charts = researcher view (fog of data): listings from `researcherPanel(series-as-RunOutput,
seed, ticks 0,3,6,..)` summed covered/exempt, flagged snapshots shown hollow and excluded;
     rents: `researcherCpi` always, asking index only for ticks <= `state.dataThroughTick`.
     `LineChart` needs per-point x positions and hollow markers.
  5. `render/MapCanvas.tsx`: zone array now comes from `snapshot.zone` (grows with construction;
     recompute geometry when its length changes); colours for VACANT (held) and CONSTRUCTION;
     `layout.zone` no longer exists.
  6. Update `apps/web/e2e/play.spec.ts` (start screen click, new lever labels), screenshots to
     `docs/screenshots/m5/`, 3 review rounds.

### Remaining M5 steps after that

1. When calibration finishes: `pnpm test` (ensemble tests should pass), compare the fit with M3
   (T1, T1a, T3, T4, T6b, T7 must still pass; T2, T5, T6a missed before) and write the result in
   `docs/CALIBRATION.md` (new run section). Then `pnpm validate` (~20 min) and update
   VALIDATION.md §1.1-2.
2. Sobol sensitivity (PLAN §8.1): new Python script using `scipy.stats.sobol_indices` (scipy is
   already pinned) over the posterior 5-95% box, outputs: covered-listings effect, asking-rent
   effect, rent burden, completions. Write to VALIDATION.md.
3. `pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json` with the
   new ensemble; write VALIDATION.md §4 (playtests: effects table, mandate winners, Pareto check;
   state plainly whether any strategy dominates).
4. Known limitations to document: held-vacant stock creeps up ~20% over 6 years in no-policy
   runs; placebo P1 with default params ~+0.04; GONE/doubled-up levels uncalibrated (the score
   uses the stress rate vs the no-policy run for that reason); runs ~0.45 s per 60-tick game.
5. Full gate (format, lint, typecheck, test, build, e2e), commit, tag `m5`, update this file.

### Old M5 design notes

Superseded by ADRs 0007-0009 (capacity headroom was replaced by a starts multiplier; investor
entry was kept unchanged next to the new baseline purchases).

## 6. M6-M8 reminders

- **M6:** `tools/art/` procedural palette-indexed sprites → `apps/web/public/atlas/` (PNG + JSON);
  `pnpm art` script. Dependency candidate: `pngjs` (justify in commit). Isometric 32×16 renderer
  behind a `Renderer` interface. An OFL pixel font with its licence file. Screenshot review ≥3
  rounds at 1×/2×/3×, plus a greyscale distinguishability check.
- **M7:**
  - Debrief: your term vs a no-policy counterfactual (same seed, CRN), with fan charts across
    ensemble members in the worker. Budget: 200 runs < 10 s on 4 workers. Note Victoria runs are
    ~0.15 s each with spin-up; consider caching the post-spin-up state or a reduced debrief
    ensemble.
  - DiD-recovery card, evidence badges, glossary, a skippable tutorial for the first 4 turns,
    a shareable seed string.
  - Accessibility checklist (PLAN §6.7).
  - D3 is not used yet (ADR 0003); add it only if the fan charts need it.
- **M8:** README per PLAN §12; docs complete; performance budgets; Lighthouse; attribution page;
  GitHub remote + Pages (needs the user: create the repo / authorise GitHub).
- **Rent wording rule:** never "no effect"; say "too small to detect".

## 7. Useful commands

```bash
pnpm lint && pnpm typecheck && pnpm test     # sim tests include coverage gate (85% lines)
pnpm build && pnpm e2e                       # Playwright, saves screenshots
pnpm sim run --scenario victoria --pre 15 --ticks 49 --summary
pnpm sim bench --scenario victoria --pre 15 --ticks 49 --runs 5
pnpm calibrate | pnpm calibrate:smoke | pnpm validate | pnpm did-recovery
node tools/scenario/build-victoria.mjs       # regenerates victoria.json (changes its hash → recalibrate)
```

Any change to `calibration/priors.json`, `calibration/inputs/targets.json`,
`packages/sim/src/params/defaults.json`, `packages/sim/src/scenarios/victoria.json` or
`SIM_VERSION` makes `ensemble.test.ts` fail until `pnpm calibrate` is re-run. That is by design
(PLAN §7.2).
