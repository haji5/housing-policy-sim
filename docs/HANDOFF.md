# Handoff: where the build stands and exactly what to do next

_Written 2026-10-10 at the end of a the coding agent session, for the next session. Read this, then
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

| Milestone                             | Status                                                      | Tag  |
| ------------------------------------- | ----------------------------------------------------------- | ---- |
| M0 scaffold                           | done                                                        | `m0` |
| M1 headless sim v0                    | done                                                        | `m1` |
| M2 ugly playable prototype            | done (screenshots in `docs/screenshots/m2/`)                | `m2` |
| M3 calibration + validation           | done; acceptance partly met (T5, T6a miss; see CALIBRATION) | `m3` |
| M4 DiD-recovery experiment            | done (VALIDATION.md §3)                                     | `m4` |
| **M5 full mechanics**                 | **next** (designed in §5)                                   | -    |
| M6 art pass                           | not started                                                 | -    |
| M7 debrief / evidence UI / onboarding | not started                                                 | -    |
| M8 polish, docs, launch               | not started                                                 | -    |

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
- Full Victoria calibration takes ~25 min on this 20-thread machine (16 workers). A sim run is
  ~0.15 s (60k agents, 24 spin-up + 49 recorded months).

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

## 5. M5 design notes (full mechanics; re-calibrate afterwards)

PLAN §5.5-5.10 and §10 M5. Proposed design (each needs an ADR):

- **Investor choice → STR / LTR / VACANT / SELL logit.**
  - VACANT: `ASC_vac − β·vacancyTaxMonthly` (tax = rate × assessed value / 12; the assessed
    value is VERIFY).
  - SELL: unit → OWNER_OCC (principalRes 1); `ASC_sell − k·(r_t − r_0)`.
  - Spin-up controllers target the starting vacant-held share (ASSUMED) and measure the
    baseline sales rate.
  - Owner→investor purchases run at the baseline sales rate, multiplied by
    `(1 + investorEntry·max(0, strNet/strNet0 − 1))` in zones without the rule. This replaces
    the current investor-entry formula; recalibrate.
  - These give the displaced-unit destination simplex (LTR/Sell/Vacant) the plan wants to show
    as uncertain.
- **Developers.**
  - Starts: `starts_z ~ Poisson(s0_z · exp(ρ·log(m_z/m_z0) − h·(r_t − r_0)) · headroom_z/headroom_z0)`.
  - Pipeline: CONSTRUCTION tenure with `completionTick` ~ U(18,30) months (VERIFY); completions
    enter as LTR or OWNER_OCC by `rentalShare`.
  - Dwelling arrays need spare capacity (they are fixed-size now; invariants test assumes fixed n
    for two-zone, so update it).
  - BoC policy rate path: DATA in the first project's `data/fixtures/boc_policy_rate_monthly.csv`.
  - Renter arrivals need a growth term so baseline completions are absorbed.
- **Levers:**
  - Upzoning per zone (capacity ×1.1 / ×1.25 after a 12-month permit delay).
  - Vacancy tax 0-3%.
  - Rent cap Low/Medium/High (BC caps by year are VERIFY; the open item in PLAN §16).
  - Non-market build (stretch).
  - Resources: fiscal budget and political capital per turn, costs and cooldowns (PLAN §5.8).
- **Shock cards** (PLAN §5.9), seeded deck in JSON: rate hike, migration surge, recession,
  court challenge (enforcement ×0.5 for 4 quarters), tourism boom, wildfire.
- **Scoring** (PLAN §6.2): renter affordability, stress (doubled-up + gone), net completions,
  fiscal balance, visitor capacity (STR beds) and political capital, plus mandates.
- **Fog of data in the game:** the researcher view from M4 (noisy quarterly snapshots, noisy CPI).
  The asking-rent index is visible only after a paid "data purchase".
- Then: re-run `pnpm calibrate` (must still pass M3 acceptance), Sobol sensitivity indices into
  VALIDATION.md, and 5 headless "playtest" policies scored to show no dominant strategy.

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
