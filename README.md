# Zoned Out

**A housing-policy game on an agent-based model calibrated to my own causal estimates of BC's
short-term rental law.** You are the housing minister for Greater Victoria for one five-year
term. Set short-term rental rules, enforcement, a vacancy tax, a rent cap, upzoning and
non-market building; watch what the data shows you; then see what really happened.

**Play it:** https://haji5.github.io/housing-policy-sim/ (runs entirely in your browser; to run
it locally, see [Reproduce](#reproduce)).

![One term of play: the quarterly paper, listings and rent charts above the isometric city](docs/media/zoned-out.gif)

> I built a simulator calibrated to my own causal estimates, and then used it to test whether my
> difference-in-differences design recovers the true effect when displaced hosts can substitute
> into exempt areas.

## Three results

**1. The model reproduces the headline Bill 35 estimate it was calibrated to, but not every
target.** The first project estimated that BC's principal-residence rule cut entire-home listings
in Victoria's covered areas by −0.390 log points (about −32%) against the exempt areas, with no
pre-trends. The calibrated ensemble's mean is −0.399 (−0.366 averaging its 179 distinct
parameter sets equally), it tracks the covered-area listing path and it shows no pre-trends.
That is a fitted target, not an out-of-sample test. The fit is imperfect: the model overshoots
the exempt areas' growth from late 2025, and misses the multi-listing-host share, the registered
share and the weak Phase 2 term. Even the best-fitting parameter set's calibration distance is
about four times what a correctly specified model would give. The one held-out test, Salt Spring Island's November 2025
opt-in, fails. All of this is reported, not tuned away
([CALIBRATION.md](docs/CALIBRATION.md), [VALIDATION.md](docs/VALIDATION.md),
[robustness report](calibration/reports/robustness.md)).

![Simulated vs observed listing paths](calibration/reports/paths.png)

**2. The policy moves listings a lot and rents little, but how little rests on assumptions.**
Inside the model, where the counterfactual is known exactly, the rules (principal residence plus
registry) cut covered-area listings by 0.585 log points by June 2026. At the default rent-market
assumptions, asking rents fall by 0.48% (5-95% across the calibrated ensemble: −0.66% to
−0.30%) and the all-tenant CPI-style index falls by 0.24%. That ensemble range understates the
uncertainty. The listing data cannot pin down how fast rents adjust to vacancy, or how strongly
vacancy draws renters into the region, and both are fixed assumptions. Varying them over a wide
range moves the asking-rent effect from about −0.1% to −2.2%, more than all 16 calibrated
parameters together ([robustness report](calibration/reports/robustness.md)). Even the upper end
is at or below the 1-3% that the first project's CPI design cannot detect: its Phase 1 rent
estimate has a standard error of 1.1 points. So the effect is **too small to detect** in the
data, which is what the first project found. That is not the same as no effect, and the model
does not measure its size.

![STR-attributable rent effect across the ensemble](calibration/reports/rent_effect.png)

**3. Spillover into the exempt areas biases the DiD towards overstating the effect, but only
modestly.** I ran the first project's regression on simulated scraped data, where the truth is
known. Over the Phase 1 window, at the calibrated spillover strength, it estimates −0.425 against
a true −0.385, overstating the fall by 0.039 log points (10%). With no spillover it understates
the fall by 5%. Spillover strength is barely identified by the calibration, so I also checked
it directly against the data: the control areas, including Salt Spring before its opt-in, are
untreated until late 2025. Their observed listing path fits half the calibrated spillover
slightly better than the full strength, though the evidence is weak. At half strength the
overstatement is about 3%. Read back onto the real estimate, the true Phase 1 effect is
plausibly within about 10% of −0.390, more likely smaller than larger
([VALIDATION.md §3](docs/VALIDATION.md#3-did-recovery-experiment-m4)).

![DiD estimate vs true effect across spillover strengths](calibration/reports/did_recovery.png)

## How it connects to the first project

[bc-str-ban-analysis](https://github.com/haji5/bc-str-ban-analysis)
([dashboard](https://haji5.github.io/bc-str-ban-analysis/)) estimated the effect of Bill 35 with
a covered-vs-exempt difference-in-differences on Inside Airbnb snapshots. Its estimates are this
project's calibration targets (`calibration/inputs/targets.json`, each with provenance), and its
estimator (pyfixest) is reused to check the simulator's own TypeScript DiD to 1e-14. This project
asks what that design cannot: where the displaced homes went, what that did to rents, and
whether the estimate itself is biased.

## The model in ten lines

- Monthly ticks; a game turn is a quarter; a term is 20 turns from September 2023.
- About 39,000 dwellings and 13,000 renter households in eight zones of the Capital Regional
  District (1 agent per 5 real units: about 198,000 homes and 66,000 renter households;
  owner-occupiers are a tenure, not agents); five zones are covered by the rule, three are exempt.
- Investors choose short-term rental, long-term rental, holding empty or selling by a
  multinomial logit; hosts of their own principal residence stay legal.
- Enforcement detects and fines illegal listings; a registry de-lists unregistered ones.
- Market rents adjust to vacancy; sitting tenants' rents follow a cap on lease anniversaries.
- Developers start homes on margin, the policy rate and zoning headroom; completions lag 18-30
  months.
- Households search, double up or leave the region when they cannot find a home.
- A noisy "researcher view" (scraped snapshots, a noisy CPI) is what the player sees.
- 16 behavioural parameters are calibrated by simulated method of moments and ABC; the game
  draws from a 300-member ensemble (179 distinct parameter sets; effective sample size 21), so
  different seeds usually play different plausible models.
- Fully deterministic: a counter-based hashed RNG gives common random numbers, so every effect is
  a paired comparison with a no-policy run of the same city and luck.

Details: [ODD protocol](docs/ODD.md), [assumptions register](docs/ASSUMPTIONS.md) (every number
tagged DATA / LITERATURE / ASSUMED / VERIFY), [calibration](docs/CALIBRATION.md),
[validation](docs/VALIDATION.md), [decision records](docs/adr/),
[accessibility](docs/ACCESSIBILITY.md).

## Limitations

- **Not a forecast and not policy advice. Not affiliated with or commissioned by the Government
  of British Columbia.** It is a calibrated, simplified model, not a digital twin of Victoria.
- The listing response is calibrated; the rent, vacancy-tax, rent-cap, upzoning and
  non-market responses are assumptions (shown with "Assumed" badges in the game).
- The calibration's effective sample size is low (21; 179 distinct parameter sets among 300, one
  of them repeated 62 times), its 5-95% ranges are indicative only, and several targets and the
  Salt Spring hold-out are missed ([CALIBRATION.md](docs/CALIBRATION.md)).
- The rent effect's size is set by assumed rent dynamics (above), and homes sold to
  owner-occupiers house no one from the rental market in the model (it has no owner households),
  which pushes the rent effect towards zero.
- Enforcement levels other than the default are an extrapolation: detection at the default
  level is calibrated, but how it scales with the level is assumed.
- Levels of rent burden and housing stress are not calibrated; the game scores only changes
  against the no-policy run.
- Some real-world inputs are tagged VERIFY in [ASSUMPTIONS.md](docs/ASSUMPTIONS.md) (Census
  counts, incomes, construction rates, fine size, registration cost, BC rent caps by year): they
  have not been checked at source.
- The debrief replays 32 model variants rather than 200, to stay near 10 seconds
  ([ADR 0011](docs/adr/0011-debrief-and-onboarding.md)).

## Reproduce

Requires Node ≥ 24 and pnpm; Python 3.11 for calibration.

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # sim tests include an 85% line-coverage gate
pnpm build && pnpm e2e                     # Playwright: play, keyboard-only, axe audit, budgets
pnpm e2e:live                              # smoke test of the deployed site (needs network)
pnpm dev                                   # http://localhost:5173
```

Calibration and validation (Python, `calibration/`; see [calibration/README.md](calibration/README.md)):

```bash
node scripts/py.mjs setup     # create calibration/.venv with the pinned requirements
pnpm calibrate                # ~45 min; writes the ensemble and calibration/reports/
pnpm validate                 # ~30 min: estimator check, parameter recovery, sensitivity
pnpm sobol                    # ~15 min: Sobol indices
pnpm did-recovery             # the DiD-recovery experiment
pnpm robustness               # ~3 min: ensemble fit diagnostics, rent-assumption sensitivity
pnpm sim playtest --seeds 1,2,3,4,5,6,7,8 --out calibration/reports/playtest.json
```

Art is generated, not drawn: `pnpm art` rebuilds the sprite atlas. README media:
`MEDIA=1 npx playwright test e2e/media.spec.ts` (in `apps/web`), then
`calibration/.venv/Scripts/python.exe scripts/make_gif.py`.

## Performance

Measured on the development laptop, otherwise idle (Node, headless Chromium), against the
[PLAN §11](docs/PLAN.md) budgets:

| Budget                                     | Target     | Measured                                                          |
| ------------------------------------------ | ---------- | ----------------------------------------------------------------- |
| Page script (gzipped)                      | < 400 KB   | 57 KB, plus two workers of 29 KB each                             |
| Sprite atlas                               | < 300 KB   | 6.7 KB PNG + 17.7 KB JSON                                         |
| First interaction                          | < 2 s      | start screen interactive at 76 ms; city built in 0.4 s            |
| One turn                                   | -          | 0.10 s (player and no-policy runs)                                |
| 10k agents × 60 ticks in Node              | < 150 ms   | 37 ms best, 39 ms median (12.7k agents)                           |
| Victoria run (75k agents, 24 + 60 months)  | < 150 ms   | **not met**: 284 ms best, 293 ms median (`pnpm sim bench`)        |
| Debrief ensemble in the browser, 4 workers | 200 < 10 s | **32 variants × 2 runs: 6.0 s** (N = 200 not attempted, ADR 0011) |

## Tech stack

TypeScript (strict) in a pnpm workspace: a DOM-free simulation core (`packages/sim`) that runs
in Node for calibration and in Web Workers in the game; Preact for the UI, Canvas 2D for the
isometric map, hand-written SVG charts; Vitest and fast-check for invariants, Playwright and
axe-core for the UI. Calibration in Python with NumPy, SciPy, pandas, pyfixest and matplotlib.
All art is procedurally generated by `tools/art` (no image libraries). No analytics, no server.

## Licences and data attribution

- Code: MIT ([LICENSE](LICENSE)). Generated art, including the pixel font: CC BY 4.0.
- **Inside Airbnb** listing data (via the first project's aggregates): CC BY 4.0.
- **Statistics Canada** (CPI, Census): contains information licensed under the Open Government
  Licence – Canada.
- **CMHC** rental market survey benchmarks and the **Bank of Canada** neutral-rate range, via
  the first project's fixtures and published figures.

Only aggregate calibration targets are used; no raw listing data is in this repository. See the
in-game [About page](apps/web/public/about.html).
