"""Sobol sensitivity indices (docs/VALIDATION.md §1.1) -> calibration/reports/sobol.{md,json}

Variance-based global sensitivity of four outputs of the historical-policy run to the 18
calibrated parameters, each varied uniformly over its posterior 5-95% range (in the prior's own
scale: log for log-uniform priors). Uses scipy.stats.sobol_indices (Saltelli sampling with the
Jansen / Saltelli estimators), n * (d + 2) model evaluations.

Outputs (calibration window, mean over the seeds, common seeds for every draw):
  coveredEffect   log(covered listings, historical / no policy) at the last snapshot
  askingEffect    log(asking-rent index, historical / no policy) at the last snapshot
  rentBurden      share of renters paying > 30% of income at the end (historical run)
  completions     homes completed over the window (historical run, real units)

Caveats (written into the report): the box ignores posterior correlations, so it is wider than
the joint posterior; with few seeds, simulation noise counts as unexplained variance (it lowers
first-order indices and raises 1 - sum(S1)).

Usage (via run.py): sobol [--n 256] [--seeds 1,2]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time

import numpy as np
from scipy import stats

from common import ENSEMBLE_PATH, REPORTS, git_commit, load_priors, to_overrides
from simbridge import evaluate

OUTPUTS = [
    ("coveredEffect", "coveredListings", "Covered-listings effect (log points)"),
    ("askingEffect", "askingRent", "Asking-rent effect (log points)"),
    ("rentBurden", "rentBurden", "Rent-burden share at the end"),
    ("completions", "completions", "Completions over the window"),
]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=256, help="base sample size (power of 2)")
    ap.add_argument("--seeds", default="1,2")
    args = ap.parse_args(argv)
    seeds = tuple(int(s) for s in args.seeds.split(","))
    priors = load_priors()
    sets = json.loads(ENSEMBLE_PATH.read_text(encoding="utf-8"))["sets"]
    if not sets:
        raise SystemExit("ensemble.json is empty: run pnpm calibrate first")
    # Posterior 5-95% box in each prior's unit scale.
    box = []
    for p in priors:
        g, k = p.name.split(".")
        u = p.to_unit(np.array([s[g][k] for s in sets], dtype=float))
        box.append((float(np.quantile(u, 0.05)), float(np.quantile(u, 0.95))))
    dists = [stats.uniform(loc=lo, scale=max(hi - lo, 1e-9)) for lo, hi in box]

    calls = {"n": 0}
    t0 = time.time()

    def func(x: np.ndarray) -> np.ndarray:
        draws = [to_overrides(priors, x[:, j]) for j in range(x.shape[1])]
        res = evaluate(draws, seeds=seeds, counterfactual=True)
        calls["n"] += len(draws)
        print(f"  evaluated {calls['n']} draws ({time.time() - t0:.0f} s)", flush=True)
        return np.array([[r["effects"][key] for r in res] for _, key, _ in OUTPUTS])

    rng = np.random.default_rng(20261011)
    out = stats.sobol_indices(func=func, n=args.n, dists=dists, rng=rng)
    boot = out.bootstrap(confidence_level=0.9, n_resamples=999)
    s1, st = np.asarray(out.first_order), np.asarray(out.total_order)
    s1_ci = np.asarray(boot.first_order.confidence_interval)
    st_ci = np.asarray(boot.total_order.confidence_interval)

    names = [p.name for p in priors]
    result = {
        "meta": {
            "date": dt.date.today().isoformat(),
            "git": git_commit(),
            "n": args.n,
            "evaluations": calls["n"],
            "seeds": list(seeds),
            "seconds": round(time.time() - t0, 1),
            "box": {n: [round(lo, 4), round(hi, 4)] for n, (lo, hi) in zip(names, box)},
        },
        "outputs": {},
    }
    for o, (oid, _, label) in enumerate(OUTPUTS):
        rows = []
        for i, name in enumerate(names):
            rows.append({
                "param": name,
                "S1": float(s1[o, i]), "S1_lo": float(s1_ci[0][o, i]), "S1_hi": float(s1_ci[1][o, i]),
                "ST": float(st[o, i]), "ST_lo": float(st_ci[0][o, i]), "ST_hi": float(st_ci[1][o, i]),
            })
        rows.sort(key=lambda r: -r["ST"])
        result["outputs"][oid] = {"label": label, "sumS1": float(np.sum(s1[o])), "rows": rows}

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "sobol.json").write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8", newline="\n")
    md = [
        "# Sobol sensitivity indices",
        "",
        f"{result['meta']['date']}, commit {result['meta']['git']}, n = {args.n} "
        f"({calls['n']} parameter draws, seeds {', '.join(map(str, seeds))}, "
        f"{result['meta']['seconds']:.0f} s). Each parameter varies uniformly over its posterior 5-95% range "
        "(log scale for log-uniform priors). 90% bootstrap intervals in brackets. "
        "S1 = first-order index (share of output variance explained by the parameter alone); "
        "ST = total index (including interactions). The box ignores posterior correlations, and "
        "simulation noise across seeds counts as unexplained variance.",
        "",
    ]
    for oid, o in result["outputs"].items():
        md += [f"## {o['label']}", "", f"Sum of S1 = {o['sumS1']:.2f}.", "",
               "| Parameter | S1 | ST |", "| --- | --- | --- |"]
        for r in o["rows"]:
            md.append(f"| {r['param']} | {r['S1']:.2f} [{r['S1_lo']:.2f}, {r['S1_hi']:.2f}] "
                      f"| {r['ST']:.2f} [{r['ST_lo']:.2f}, {r['ST_hi']:.2f}] |")
        md.append("")
    (REPORTS / "sobol.md").write_text("\n".join(md), encoding="utf-8", newline="\n")
    print(f"wrote {REPORTS / 'sobol.md'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
