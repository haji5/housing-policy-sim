# calibration/

Python calibration and validation pipeline ([CALIBRATION.md](../docs/CALIBRATION.md),
[VALIDATION.md](../docs/VALIDATION.md)). It drives the TypeScript sim through its Node CLI
(`packages/sim/src/cli.ts batch | panel`, JSON lines in and out), in parallel worker processes.

Set up once with `node scripts/py.mjs setup` (creates `calibration/.venv` from the pinned
`requirements.txt`; Python 3.10-3.13). Then, from the repository root:

| Command             | Script            | Writes                                                                  | Time    |
| ------------------- | ----------------- | ----------------------------------------------------------------------- | ------- |
| `pnpm calibrate`    | `calibrate.py`    | `packages/sim/src/params/ensemble.json`, `reports/calibration.md`       | ~2.5 h  |
| `pnpm validate`     | `validate.py`     | `reports/validation.md`: estimator check, parameter recovery, OAT       | ~35 min |
| `pnpm sobol`        | `sobol.py`        | `reports/sobol.md`: Sobol indices over the posterior box                | ~15 min |
| `pnpm did-recovery` | `did_recovery.py` | `reports/did_recovery.md`: DiD vs truth across spillover strengths      | ~10 min |
| `pnpm robustness`   | `robustness.py`   | `reports/robustness.md`: ensemble fit, duplicates, rent-assumption grid | ~5 min  |

Inputs: `priors.json` (free parameters), `inputs/targets.json` (calibration targets, each with
its provenance in the first project, bc-str-ban-analysis). Shared helpers (paths, file hashes,
distance) are in `common.py`; `simbridge.py` runs the sim. `pnpm calibrate` caches Stages 1-2 and
each ABC-SMC generation in `reports/.cache/` (not committed), keyed by every input including a
hash of the sim sources, so an interrupted or repeated run resumes; `--no-cache` recomputes.

The ensemble records hashes of the priors, targets, default parameters and scenario, and
`packages/sim/test/ensemble.test.ts` fails if any of them changes without a re-calibration.
Generated reports carry the ensemble's creation date and commit; re-run the downstream reports
(validate, sobol, did-recovery, robustness) after every calibration.
