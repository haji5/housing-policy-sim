"""Simulated method of moments / ABC calibration (PLAN §7).

Stage 1  Scrambled Sobol sample of the prior (unit cube), every draw run on common seeds.
Stage 2  Nelder-Mead from the best Stage-1 points (local refinement; reported, and used to
         centre the Stage-3 proposal).
Stage 3  ABC-SMC (population Monte Carlo; Beaumont, Cornuet, Marin & Robert 2009). Generation 0 is
         the best `accept` Stage-1 draws (prior draws, equal weights). Each later generation
         perturbs the previous population with a Gaussian kernel (its weighted covariance,
         truncated to the prior's unit cube), keeps the best `accept` proposals (an adaptive,
         rank-based tolerance) and weights them by prior / proposal density. The final population
         is resampled into the ensemble. The ensemble, not a point estimate, is the product.
         Generations stop once the tolerance is at most `tolerance` (default 93.3, the ABC
         tolerance of the previous, M5 ensemble, so successive ensembles meet the same fit
         standard), or after `generations`. Simulation noise in the distance sets a floor near
         D = 91: below it, rank-based selection keeps lucky draws and the weights degenerate.
         (Until 2026-10-12 Stage 3 was one importance-sampling step from a Gaussian fitted to the
         best points; its weights were degenerate, ESS 21 of 600.)

Stages 1-2 and each ABC-SMC generation (with the RNG state) are cached in calibration/reports/.cache/
under a key of every input (priors, targets, defaults, scenario, sim sources, seeds, budgets), so a
re-run resumes instead of repeating them.

Usage (via run.py):  calibrate [--stage1 8192] [--stage3 2048] [--generations 12] [--tolerance 93.3]
                               [--kernel-scale 1] [--ensemble 300] [--smoke]
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from scipy import optimize
from scipy.special import logsumexp
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
    fnv1a64,
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


def weighted_cov(U: np.ndarray, w: np.ndarray) -> np.ndarray:
    m = w @ U
    X = U - m
    return (X * w[:, None]).T @ X / (1.0 - np.sum(w**2))


def ess_of(w: np.ndarray) -> float:
    w = w / w.sum()
    return float(1.0 / np.sum(w**2))


def smc_generation(priors, U_prev, W_prev, n_draws, n_keep, targets, seeds, rng, label, kernel_scale=2.0):
    """One ABC-PMC generation. Returns the kept points, their normalised weights and distances,
    the tolerance (distance of the last kept point), and every proposal's distance."""
    d = U_prev.shape[1]
    cov = kernel_scale * weighted_cov(U_prev, W_prev) + np.eye(d) * 1e-8
    L = np.linalg.cholesky(cov)
    # Kernel mass inside the unit cube for each particle (Monte Carlo, common normal draws), so the
    # proposal density of the truncated kernel is exact up to Monte Carlo error.
    E = rng.standard_normal((4000, d)) @ L.T
    Z = np.array([np.mean(np.all((u + E >= 0) & (u + E <= 1), axis=1)) for u in U_prev])
    Z = np.maximum(Z, 1.0 / len(E))
    # Draw: pick a particle by weight, perturb, keep the draw if it lands inside the prior support.
    out = []
    while sum(len(o) for o in out) < n_draws:
        j = rng.choice(len(U_prev), size=n_draws, p=W_prev)
        x = U_prev[j] + rng.standard_normal((n_draws, d)) @ L.T
        out.append(x[np.all((x >= 0) & (x <= 1), axis=1)])
    U = np.concatenate(out)[:n_draws]
    _, D = run_points(priors, U, targets, seeds, label)
    keep = np.argsort(D)[:n_keep]
    tol = float(D[keep[-1]])
    # Importance weights: uniform prior on the cube / mixture-of-truncated-Gaussians proposal.
    Linv = np.linalg.inv(L)
    logdet = 2.0 * np.sum(np.log(np.diag(L)))
    z = (U[keep][:, None, :] - U_prev[None, :, :]) @ Linv.T
    logk = -0.5 * np.sum(z * z, axis=2) - 0.5 * (d * np.log(2 * np.pi) + logdet)
    logq = logsumexp(logk + np.log(W_prev)[None, :] - np.log(Z)[None, :], axis=1)
    w = np.exp(-logq + logq.min())
    w /= w.sum()
    return U[keep], w, D[keep], tol, D


def sim_sources_hash() -> str:
    """Hash of every sim source the CLI loads (the ensemble file does not affect batch runs)."""
    src = Path(__file__).resolve().parents[1] / "packages/sim/src"
    files = sorted(f for f in src.rglob("*") if f.suffix in (".ts", ".json") and f.name != "ensemble.json")
    return fnv1a64("".join(f.relative_to(src).as_posix() + file_hash(f) for f in files))


def systematic_resample(weights: np.ndarray, k: int, rng) -> np.ndarray:
    w = weights / weights.sum()
    positions = (rng.random() + np.arange(k)) / k
    return np.searchsorted(np.cumsum(w), positions).clip(0, len(w) - 1)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage1", type=int, default=8192)
    ap.add_argument("--stage2-starts", type=int, default=4)
    ap.add_argument("--stage2-maxfev", type=int, default=150)
    ap.add_argument("--stage3", type=int, default=2048, help="ABC-SMC proposals per generation")
    ap.add_argument("--generations", type=int, default=12, help="maximum ABC-SMC generations after generation 0")
    ap.add_argument("--tolerance", type=float, default=93.3,
                    help="stop once the ABC tolerance is at most this (0: run every generation)")
    ap.add_argument("--kernel-scale", type=float, default=1.0, help="perturbation kernel = scale x population covariance")
    ap.add_argument("--no-cache", action="store_true", help="recompute Stages 1-2 even if cached")
    ap.add_argument("--ensemble", type=int, default=300)
    ap.add_argument("--accept", type=int, default=0,
                    help="ABC-SMC population size (default 2x ensemble, capped at a third of each generation's draws)")
    ap.add_argument("--seeds", type=str, default=",".join(map(str, CAL_SEEDS)))
    ap.add_argument("--targets", type=Path, default=TARGETS_PATH)
    ap.add_argument("--out", type=Path, default=ENSEMBLE_PATH)
    ap.add_argument("--report-dir", type=Path, default=REPORTS)
    ap.add_argument("--smoke", action="store_true", help="tiny run for CI; writes to a temp location")
    args = ap.parse_args(argv)
    if args.smoke:
        args.stage1, args.stage2_starts, args.stage2_maxfev, args.stage3, args.ensemble = 64, 1, 8, 64, 20
        args.generations = 1
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

    key = fnv1a64(json.dumps([file_hash(PRIORS_PATH), file_hash(args.targets), file_hash(DEFAULTS_PATH),
                              file_hash(SCENARIO_PATH), sim_sources_hash(), list(seeds), args.stage1,
                              args.stage2_starts, args.stage2_maxfev, RNG_SEED]))
    cache = args.report_dir / ".cache" / f"stages12-{key}.npz"
    if cache.exists() and not args.no_cache:
        z = np.load(cache)
        U1, D1, U2, D2 = z["U1"], z["D1"], z["U2"], z["D2"]
        print(f"  stages 1-2: loaded from {cache.name}; best D = {min(D1.min(), D2.min()):.2f}, "
              f"stage-1 median D = {np.median(D1):.1f}", flush=True)
    else:
        # ---- Stage 1
        sobol = qmc.Sobol(d, scramble=True, seed=RNG_SEED)
        U1 = sobol.random(args.stage1)
        _, D1 = run_points(priors, U1, targets, seeds, "stage 1 (Sobol)")

        # ---- Stage 2
        starts = np.argsort(D1)[: args.stage2_starts]
        print(f"  stage 2: Nelder-Mead from {len(starts)} starts (max {args.stage2_maxfev} evaluations each)", flush=True)
        with ThreadPoolExecutor(max_workers=len(starts)) as ex:
            nm = list(ex.map(lambda i: nelder_mead(priors, U1[i], targets, seeds, args.stage2_maxfev), starts))
        U2 = np.array([u for u, _ in nm])
        D2 = np.array([f for _, f in nm])
        print(f"  stage 2: best D = {D2.min():.2f} (stage-1 best {D1.min():.2f})", flush=True)
        if not args.smoke:
            cache.parent.mkdir(parents=True, exist_ok=True)
            np.savez(cache, U1=U1, D1=D1, U2=U2, D2=D2)

    # ---- Stage 3: ABC-SMC
    per_gen = max(1, args.stage3)
    best = float(min(D1.min(), D2.min()))
    n_pop = min(args.accept or 2 * args.ensemble, max(2, per_gen // 3), len(U1))
    order1 = np.argsort(D1)[:n_pop]
    U_pop, W_pop, D_pop = U1[order1], np.full(n_pop, 1.0 / n_pop), D1[order1]
    gens = [{"generation": 0, "draws": int(len(U1)), "tolerance": round(float(D_pop[-1]), 4), "ess": float(n_pop)}]
    print(f"  stage 3: ABC-SMC, population {n_pop}; generation 0 = best Stage-1 draws, D <= {D_pop[-1]:.2f}", flush=True)
    D3 = D1
    for g in range(1, args.generations + 1):
        ckpt = cache.parent / f"smc-{key}-k{args.kernel_scale:g}-n{per_gen}-p{n_pop}-g{g}.npz"
        if ckpt.exists() and not args.no_cache:
            z = np.load(ckpt)
            U_pop, W_pop, D_pop, tol_g, D3 = z["U"], z["W"], z["Dk"], float(z["tol"]), z["D"]
            rng.bit_generator.state = json.loads(str(z["rng"]))
            print(f"  stage 3 generation {g}: loaded from cache", flush=True)
        else:
            U_pop, W_pop, D_pop, tol_g, D3 = smc_generation(
                priors, U_pop, W_pop, per_gen, n_pop, targets, seeds, rng, f"stage 3 generation {g}", args.kernel_scale)
            if not args.smoke:
                np.savez(ckpt, U=U_pop, W=W_pop, Dk=D_pop, tol=tol_g, D=D3,
                         rng=np.array(json.dumps(rng.bit_generator.state)))
        best = min(best, float(D3.min()))
        gens.append({"generation": g, "draws": int(per_gen), "tolerance": round(tol_g, 4), "ess": round(ess_of(W_pop), 1)})
        print(f"  stage 3 generation {g}: tolerance D <= {tol_g:.2f}; ESS {ess_of(W_pop):.0f} of {n_pop}", flush=True)
        if args.tolerance > 0 and tol_g <= args.tolerance:
            print(f"  stage 3: tolerance at or below {args.tolerance:g}; stopping", flush=True)
            break
    tol = float(D_pop.max())
    ess = ess_of(W_pop)
    pick = systematic_resample(W_pop, args.ensemble, rng)
    U_ens = U_pop[pick]
    print(f"  stage 3: final tolerance D <= {tol:.2f}; ESS {ess:.0f}; ensemble {len(pick)} "
          f"({len(set(pick.tolist()))} distinct)", flush=True)

    sets = [to_overrides(priors, u) for u in U_ens]
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
        "method": "Sobol stage 1 -> Nelder-Mead stage 2 (diagnostic) -> ABC-SMC stage 3 (population Monte Carlo)",
        "nStage1": int(args.stage1),
        "nStage3": int(per_gen * (len(gens) - 1)),
        "kernelScale": args.kernel_scale,
        "targetTolerance": args.tolerance,
        "generations": gens,
        "tolerance": round(tol, 4),
        "nAccepted": int(n_pop),
        "ess": round(ess, 1),
        "bestDistance": round(best, 4),
        "distinctSets": int(len(set(pick.tolist()))),
        "smoke": bool(args.smoke),
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps({"meta": meta, "sets": sets}, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"  wrote {args.out}")

    report.write_calibration_report(
        priors=priors, targets=targets, meta=meta, sets=sets, U_ens=U_ens,
        stage={"U1": U1, "D1": D1, "D2": D2, "D3": D3, "tol": tol},
        out_dir=args.report_dir, seeds=seeds,
    )
    print(f"Done in {(time.perf_counter() - t_start) / 60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
