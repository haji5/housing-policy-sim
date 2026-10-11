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

| Milestone                             | Status                                          | Tag     |
| ------------------------------------- | ----------------------------------------------- | ------- |
| M0 scaffold                           | done                                            | `m0`    |
| M1 headless sim v0                    | done                                            | `m1`    |
| M2 ugly playable prototype            | done (screenshots in `docs/screenshots/m2/`)    | `m2`    |
| **M3 calibration + validation**       | **~85% done; committed as WIP (see §3)**        | not yet |
| M4 DiD-recovery experiment            | Python script written; sim side staged (see §4) | -       |
| M5 full mechanics                     | designed only (see §5)                          | -       |
| M6 art pass                           | not started                                     | -       |
| M7 debrief / evidence UI / onboarding | not started                                     | -       |
| M8 polish, docs, launch               | not started                                     | -       |

Git: branch `main`, no remote configured (the GitHub MCP connector failed to authenticate in
this session; nothing has been pushed; Pages deploy is untested).

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
- Full Victoria calibration takes ~25 min on this 20-thread machine (16 workers). A sim run is
  ~0.15 s (60k agents, 24 spin-up + 49 recorded months).

## 3. M3: what is done and the exact remaining steps

### Done (all in the working tree; commit them)

- **Model** (ADRs 0004, 0005; ODD, ASSUMPTIONS updated; SIM_VERSION 0.4.0):
  - Victoria 8-zone scenario `packages/sim/src/scenarios/victoria.json`, built by
    `tools/scenario/build-victoria.mjs`. Listings sum exactly to 3,133 covered / 500 exempt.
  - Host classes; registry everywhere with exempt claims, regTakeup and a 1-month de-listing lag.
  - Anticipation as early exit; investor entry; common demand growth; `preTicks`.
  - Cross-zone search fix; 24-month spin-up with adaptive ASCs and matching (`create.ts`).
- **Moments** `packages/sim/src/moments.ts` (S2a DiD, event-study leads, paths, shares) and the
  `batch` CLI command (`cli.ts`). `params.ts` has `DEFAULT_PARAMS` and a validated `mergeParams`.
- **Python pipeline** in `calibration/`: `common.py` (FNV hash identical to TS, verified),
  `simbridge.py`, `calibrate.py` (Sobol 8192 → Nelder-Mead → ABC importance sampling → 300-member
  ensemble), `report.py`, `validate.py` (written, **never run yet**), `did_recovery.py` (M4,
  needs the `panel` CLI command). `inputs/targets.json` has provenance for every number;
  `priors.json` has 14 parameters.
- `packages/sim/src/ensemble.ts` + `test/ensemble.test.ts`: the hash-check drift test (priors,
  targets, defaults, scenario hashes + simVersion).
- The web game now uses the Victoria scenario and one ensemble member per seed (worker), with
  covered/exempt aggregate charts and a wrapping 8-zone map. **Not yet e2e-tested or
  screenshot-reviewed after this change.**
- CI: calibration smoke step added (`node scripts/py.mjs smoke`).
- Docs: `docs/CALIBRATION.md` (method; results section has a `<!-- results-summary -->`
  placeholder), ADR 0004, ADR 0005.

### The second calibration (spin-up model, SIM_VERSION 0.4.0): FINISHED, committed

`pnpm calibrate` finished at handoff (exit 0, 28.6 min). It wrote `ensemble.json` (300 sets,
600 accepted, ESS 146, tolerance D <= 45.1, best D 19.7) and `calibration/reports/*`. All 32 sim
tests pass, including the ensemble hash test. Results (ensemble mean vs target, pass = within 2 SE):

- **Pass:** T1 -0.374 vs -0.390; T1a -0.100 vs -0.124; T3 covered path (endpoint -0.506 vs
  -0.432, path RMSE 0.055); T4 exempt path; T6b exempt claims 7.7% vs 9.4%.
- **Fail:** T2 Phase 2 -0.228 vs -0.115 (just outside 2 SE; down-weighted target, RI p = 0.27
  in data); T5 multi-host share 31.2% vs 37.6%; T6a registered 62.4% vs 70.0%.
- **T7 leads:** -0.016, -0.034, +0.004, -0.017 (much better than the first run's -0.04/-0.06).
- **H1 Salt Spring holdout:** -0.26 vs -0.02 (miss; report it).
- **S2 rent effect:** -0.61% (5-95% -0.92% to -0.09%); 83% of the ensemble inside the bound.
  S1 not comparable (no macro rent inflation).
- **Identified (contraction >= 0.5):** prShare, detectMax, delistProb, regTakeup,
  exemptClaimShare. Partly: pReview, complianceBase, multiComplianceShift. Weakly: beta,
  anticipation, investorEntry, demandSpillover, demandGrowthAnnual, arrivalRentElasticity.

Do not re-run unless the model changes. The M3 acceptance ("fits T1, T3-T6 within tolerance")
is **not fully met**: T5 and T6a miss. Per the user's M3 instruction, report the diagnostics.
Do not hand-tune. Possible _structural_ (ADR-worthy) causes to investigate, not parameter tweaks:

- T5: multi-host share is uniform across zones at the start; real exempt areas may have more
  multi-hosts.
- T6a: unregistered illegal survivors in covered zones.

### Remaining M3 steps, in order

1. Read `calibration/reports/calibration.md` (fit table, identification table, figures).
2. (Done at handoff: sim tests pass with the new ensemble.)
3. `pnpm validate` (first ever run of `calibration/validate.py`; expect to debug it). It does a
   pyfixest cross-check of the TS DiD (must agree to 1e-6), 3 parameter-recovery cases (~10 min),
   the Salt Spring holdout, S1/S2, and one-at-a-time sensitivity → `calibration/reports/validation.md`.
4. Fill in `docs/CALIBRATION.md` (results summary) and `docs/VALIDATION.md` §2-3 from the reports.
   Add the ADR 0005 residual-drift note and the known misses (below) honestly.
5. Web: `pnpm e2e`, then look at `docs/screenshots/m2/*.png` regenerated with Victoria. Do 3 rounds
   of defect fixing (the 8-zone map layout is new and unreviewed). Consider moving screenshots to
   `docs/screenshots/m3/` (edit `apps/web/e2e/play.spec.ts`).
6. `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e`.
7. Commit. Message: list the new dependencies for the Python side (numpy, pandas, scipy,
   pyfixest, matplotlib: reuse of the first project's estimator stack, PLAN §3). The golden
   snapshot was updated deliberately (registry everywhere, host classes, search weighting).
   Then tag `m3` and give the milestone summary.

### Results of the first (pre-spin-up) calibration, for comparison

- **Pass:** T1 −0.370 vs −0.390; T1a −0.085 vs −0.124; T2 −0.202 vs −0.115 (within 2 SE);
  T4 exempt path; T6b exempt claims 7.5% vs 9.4%.
- **Fail:** T3 endpoint −0.54 vs −0.43 (path RMSE 0.056 is good; the Jun 2026 data point jumps
  up, and the first project documents a vintage break there: Victoria totals +23% vs Dec 2025);
  T5 multi-host share 31% vs 37.6%; T6a registered 63% vs 70%.
- **Holdout H1 (Salt Spring) misses:** sim −0.36 vs data −0.02. The model applies the full rule
  at the Nov 2025 opt-in; the data show almost no fall. Report it, don't fit it.
- **S2:** STR-attributable asking-rent effect −0.79% (97% of the ensemble inside −3.3%..−0.4%).
  **S1** not comparable (no macro rent inflation in the sim; rentDriftAnnual = 0). Say why.
- **Identified:** pReview, prShare, detectMax, delistProb, regTakeup, exemptClaimShare.
  **Weakly identified:** beta, complianceBase, investorEntry, demandSpillover,
  demandGrowthAnnual, arrivalRentElasticity. This is expected and is the M4 story.
- The user instruction for M3: **do not hand-tune parameters to hit targets; if the fit fails,
  show the diagnostics.** Do not loosen target SEs after seeing results.

### Known limitations to carry into docs

- Zone vacancies differ (search-zone choice ignores relative rents); spin-up reduces this. The
  residual no-policy covered-minus-exempt drift is within ±0.05 log points over 64 months.
- Housing-stress exits (GONE) are high in the baseline (~1,500 households by 2026 at full
  scale), and the rent-burden share is ~68%. Neither is calibrated: income (A31) and maxRentShare
  are VERIFY/ASSUMED. Address in M5 (scorecard) and say so.
- `fine`, `registrationCost`, `incomeMedian`, `rentCapAnnual`, CRD populations/dwellings are
  VERIFY (see ASSUMPTIONS.md).

## 4. M4: DiD-recovery experiment (next after M3)

Acceptance (PLAN §10 M4): researcher-view panel generation, `did_recovery.py`, spillover sweep,
figure + VALIDATION.md section; "a figure shows estimated vs true effect across spillover
strengths with intervals". Follow-up prompt: "State plainly if DiD is biased and by how much."

Already written: `calibration/did_recovery.py` (runs `pnpm did-recovery`). It needs a new CLI
command. Steps:

1. Copy `docs/handoff/staged/researcher.ts.txt` → `packages/sim/src/researcher.ts` and
   `docs/handoff/staged/observation.json` → `packages/sim/src/params/observation.json` (separate
   from defaults.json, so the ensemble hash stays valid). Its values:
   - `cpiNoiseSd` = 2.4: **DATA**, residual SD of Victoria CPI rented accommodation around a
     13-month moving average, computed from the first project's `data/fixtures/cpi_18100004.csv`
     (2.3-2.5 points).
   - `truncationProb` = 0.077: 4 truncated of 52 snapshots in the first project (DATA).
   - `flagThreshold` = 0.75: the first project's rule (DATA).
   - Completeness and zone noise are ASSUMED.
2. Append Purpose codes to `rng.ts` (append-only; never renumber): `OBS_COMPLETE: 25`,
   `OBS_ZONE: 26`, `OBS_TRUNCATED: 27`, `OBS_CPI: 28`. Export `researcherPanel`,
   `researcherCpi` and `DEFAULT_OBSERVATION` from `index.ts`. Tests first: determinism, the
   flagging rule, noise moments, and that model output is unchanged.
3. Add CLI command `panel` in `cli.ts`. Input lines are `{id, params, seed}`. For each line, run
   `historical` and `none` with `ticks 49, preTicks 15` (same seed). Output one line
   `{id, snapshotTicks, zones:[{name,covered,optInTick?}], observed:[[zone][snap]],
hist:[[...]], none:[[...]], incomplete:[bool]}`, counts in real units (n/scale). Snapshot
   ticks come from `scenario.observation.snapshotTicks`. Use `researcherPanel(histRun, seed, …)`
   for `observed`.
4. `pnpm did-recovery` → `calibration/reports/did_recovery.{md,png,json}`. Add a VALIDATION.md §3
   summary and a README figure later (M8). ADR 0006 for the observation layer, plus ODD §4 and
   ASSUMPTIONS O1-O8. Commit, tag `m4`.

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
