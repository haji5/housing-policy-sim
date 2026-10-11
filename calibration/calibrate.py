"""Simulated method of moments / ABC calibration (PLAN §7).

Stage 1  Scrambled Sobol sample of the prior (unit cube), every draw run on common seeds.
Stage 2  Nelder-Mead from the best Stage-1 points (local refinement; reported, and used to
         centre the Stage-3 proposal).
Stage 3  ABC with importance sampling: draws from a Gaussian proposal fitted to the best points,
         accepted when the distance is within the tolerance, weighted by prior/proposal and
         resampled into the ensemble. The ensemble, not a point estimate, is the product.

Usage (via run.py):  calibrate [--stage1 8192] [--stage3 4096] [--ensemble 300] [--smoke]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from scipy import optimize, stats
from scipy.stats import qmc

import report
from common import (
    CAL_SEEDS,
    DEFAULTS_PATH,
    ENSEMBLE_PATH,
    PRIORS_PATH,
    REPORTS,
    SCENARIO_PATH,
    TARGETS_PATH,
    distance,
    file_hash,
    git_commit,
    load_priors,
    load_targets,
    to_overrides,
)
from simbridge import evaluate

RNG_SEED = 20261010


def sim_version() -> str:
    text = (Path(__file__).resolve().parents[1] / "packages/sim/src/index.ts").read_text(encoding="utf-8")
    return text.split("SIM_VERSION = '")[1].split("'")[0]


def run_points(priors, U: np.ndarray, targets, seeds, label: str) -> tuple[list[dict], np.ndarray]:
    t0 = time.perf_counter()
    res = evaluate([to_overrides(priors, u) for u in U], seeds=seeds)
    D = np.array([distance(r, targets) for r in res])
    print(f"  {label}: {len(U)} draws x {len(seeds)} seeds in {time.perf_counter() - t0:.0f} s; "
          f"best D = {np.min(D):.2f}, median D = {np.median(D):.1f}", flush=True)
    return res, D


def nelder_mead(priors, u0: np.ndarray, targets, seeds, maxfev: int) -> tuple[np.ndarray, float]:
    def f(u):
        if np.any(u < 0) or np.any(u > 1):
            return 1e6 + 1e3 * float(np.sum(np.clip(-u, 0, None) + np.clip(u - 1, 0, None)))
        r = evaluate([to_overrides(priors, u)], seeds=seeds, workers=1)[0]
        return distance(r, targets)

    sol = optimize.minimize(f, u0, method="Nelder-Mead",
                            options={"maxfev": maxfev, "xatol": 1e-3, "fatol": 0.05, "initial_simplex": None})
    return np.clip(sol.x, 0, 1), float(sol.fun)


def fit_proposal(points: np.ndarray, inflate: float, floor: float):
    mean = points.mean(axis=0)
    cov = np.cov(points, rowvar=False) * inflate + np.eye(points.shape[1]) * floor**2
    return mean, cov


def draw_truncated(mean, cov, n, rng) -> np.ndarray:
    out = []
    while sum(len(o) for o in out) < n:
        x = rng.multivariate_normal(mean, cov, size=n * 2)
        out.append(x[np.all((x >= 0) & (x <= 1), axis=1)])
    return np.concatenate(out)[:n]


def systematic_resample(weights: np.ndarray, k: int, rng) -> np.ndarray:
    w = weights / weights.sum()
    positions = (rng.random() + np.arange(k)) / k
    return np.searchsorted(np.cumsum(w), positions).clip(0, len(w) - 1)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage1", type=int, default=8192)
    ap.add_argument("--stage2-starts", type=int, default=4)
    ap.add_argument("--stage2-maxfev", type=int, default=150)
    ap.add_argument("--stage3", type=int, default=4096)
    ap.add_argument("--ensemble", type=int, default=300)
    ap.add_argument("--accept", type=int, default=0, help="accepted draws before resampling (default 2x ensemble)")
    ap.add_argument("--seeds", type=str, default=",".join(map(str, CAL_SEEDS)))
    ap.add_argument("--targets", type=Path, default=TARGETS_PATH)
    ap.add_argument("--out", type=Path, default=ENSEMBLE_PATH)
    ap.add_argument("--report-dir", type=Path, default=REPORTS)
    ap.add_argument("--smoke", action="store_true", help="tiny run for CI; writes to a temp location")
    args = ap.parse_args(argv)
    if args.smoke:
        args.stage1, args.stage2_starts, args.stage2_maxfev, args.stage3, args.ensemble = 64, 1, 8, 64, 20
        args.seeds = "1"
        args.out = REPORTS / "smoke" / "ensemble.smoke.json"
        args.report_dir = REPORTS / "smoke"

    seeds = tuple(int(s) for s in args.seeds.split(","))
    priors = load_priors()
    targets = load_targets(args.targets)
    d = len(priors)
    rng = np.random.default_rng(RNG_SEED)
    t_start = time.perf_counter()
    print(f"Calibrating {d} parameters against {sum(t['role'] == 'fit' for t in targets)} fit targets; seeds {seeds}")

    # ---- Stage 1
    sobol = qmc.Sobol(d, scramble=True, seed=RNG_SEED)
    U1 = sobol.random(args.stage1)
    res1, D1 = run_points(priors, U1, targets, seeds, "stage 1 (Sobol)")

    # ---- Stage 2
    starts = np.argsort(D1)[: args.stage2_starts]
    print(f"  stage 2: Nelder-Mead from {len(starts)} starts (max {args.stage2_maxfev} evaluations each)", flush=True)
    with ThreadPoolExecutor(max_workers=len(starts)) as ex:
        nm = list(ex.map(lambda i: nelder_mead(priors, U1[i], targets, seeds, args.stage2_maxfev), starts))
    U2 = np.array([u for u, _ in nm])
    D2 = np.array([f for _, f in nm])
    print(f"  stage 2: best D = {D2.min():.2f} (stage-1 best {D1.min():.2f})", flush=True)

    # ---- Stage 3
    k_top = max(2 * d, int(0.01 * len(U1)))
    top = np.vstack([U1[np.argsort(D1)[:k_top]], U2])
    mean, cov = fit_proposal(top, inflate=2.0, floor=0.02)
    U3 = draw_truncated(mean, cov, args.stage3, rng)
    res3, D3 = run_points(priors, U3, targets, seeds, "stage 3 (ABC proposal)")
    n_accept = args.accept or 2 * args.ensemble
    order = np.argsort(D3)
    acc = order[: min(n_accept, len(order))]
    tol = float(D3[acc[-1]])
    # Importance weights: prior is uniform on the unit cube; proposal is the truncated Gaussian.
    q = stats.multivariate_normal(mean, cov, allow_singular=True).pdf(U3[acc])
    w = 1.0 / np.maximum(q, 1e-300)
    ess = float(w.sum() ** 2 / np.sum(w**2))
    pick = acc[systematic_resample(w, args.ensemble, rng)]
    print(f"  stage 3: tolerance D <= {tol:.2f}; {len(acc)} accepted; ESS {ess:.0f}; ensemble {len(pick)}", flush=True)

    sets = [to_overrides(priors, U3[i]) for i in pick]
    meta = {
        "simVersion": sim_version(),
        "created": dt.date.today().isoformat(),
        "gitCommit": git_commit(),
        "scenario": "victoria",
        "priorsHash": file_hash(PRIORS_PATH),
        "targetsHash": file_hash(args.targets),
        "defaultsHash": file_hash(DEFAULTS_PATH),
        "scenarioHash": file_hash(SCENARIO_PATH),
        "seeds": list(seeds),
        "method": "Sobol stage 1 -> Nelder-Mead stage 2 -> ABC importance sampling stage 3 (PLAN §7.1)",
        "nStage1": int(args.stage1),
        "nStage3": int(args.stage3),
        "tolerance": round(tol, 4),
        "nAccepted": int(len(acc)),
        "ess": round(ess, 1),
        "bestDistance": round(float(min(D1.min(), D2.min(), D3.min())), 4),
        "smoke": bool(args.smoke),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"meta": meta, "sets": sets}, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"  wrote {args.out}")

    report.write_calibration_report(
        priors=priors, targets=targets, meta=meta, sets=sets, U_ens=U3[pick],
        stage={"U1": U1, "D1": D1, "D2": D2, "D3": D3, "tol": tol},
        out_dir=args.report_dir, seeds=seeds,
    )
    print(f"Done in {(time.perf_counter() - t_start) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
