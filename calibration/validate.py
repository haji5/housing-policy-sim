"""Validation (PLAN §8.1-8.2) -> calibration/reports/validation.md

1. Estimator cross-check: the TypeScript DiD (packages/sim/src/moments.ts) equals pyfixest's feols
   on the same simulated zone x snapshot panel (the estimator the first project used).
2. Parameter recovery: simulate pseudo-data at known parameters theta*, re-run a reduced
   calibration against them, and check theta* lies inside the recovered 5-95% intervals.
3. External validation: the held-out Salt Spring path (H1), the rent bound (S2), CPI sanity (S1).
4. One-at-a-time sensitivity of key outputs to each parameter across its posterior 5-95% range.

Usage (via run.py): validate [--recovery-cases 3] [--skip-recovery]
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pyfixest as pf

import calibrate
from common import (
    ENSEMBLE_PATH,
    REPORTS,
    ROOT,
    TARGETS_PATH,
    VALIDATION_SEEDS,
    load_priors,
    load_targets,
)
from simbridge import CLI, evaluate

HIST = {"announced": 1, "phase1": 8, "phase2": 20}


def load_ensemble() -> dict:
    return json.loads(ENSEMBLE_PATH.read_text(encoding="utf-8"))


# --------------------------------------------------------------------------- 1. estimator check


def sim_panel(overrides: dict, seed: int) -> tuple[pd.DataFrame, dict]:
    with tempfile.TemporaryDirectory() as tmp:
        ov = Path(tmp) / "o.json"
        out = Path(tmp) / "out.json"
        ov.write_text(json.dumps(overrides), encoding="utf-8")
        subprocess.run(["node", str(CLI), "run", "--scenario", "victoria", "--seed", str(seed), "--policy", "historical",
                        "--ticks", "49", "--pre", "15", "--overrides", str(ov), "--out", str(out)], cwd=ROOT, check=True)
        run = json.loads(out.read_text(encoding="utf-8"))
    obs = run["meta"]["observation"]
    f0, scale = run["meta"]["firstTick"], run["meta"]["scale"]
    rows = []
    for zi, z in enumerate(run["series"]["zones"]):
        for t in obs["snapshotTicks"]:
            opt = z.get("optInTick")
            if not z["covered"] and opt is not None and t >= opt:
                continue  # opted-in zones leave the control group
            tr = 1 if z["covered"] else 0
            rows.append({
                "zone": zi, "month": t, "y": float(np.log(1 + z["strListings"][t - f0] / scale)),
                "antic": tr * int(HIST["announced"] <= t < HIST["phase1"]),
                "p1": tr * int(t >= HIST["phase1"]), "p2": tr * int(t >= HIST["phase2"]),
            })
    return pd.DataFrame(rows), run


def estimator_check(ens: dict) -> dict:
    overrides, seed = ens["sets"][0], VALIDATION_SEEDS[0]
    df, _ = sim_panel(overrides, seed)
    fit = pf.feols("y ~ antic + p1 + p2 | zone + month", data=df, vcov={"CRV1": "zone"})
    coef = fit.coef()
    ts = evaluate([overrides], seeds=(seed,), workers=1)[0]["moments"]
    rows = []
    for name, key in [("antic", "didAntic"), ("p1", "didP1"), ("p2", "didP2")]:
        rows.append({"term": name, "pyfixest": float(coef[name]), "typescript": float(ts[key]),
                     "abs_diff": abs(float(coef[name]) - float(ts[key])), "se_crv1": float(fit.se()[name])})
    return {"rows": rows, "max_abs_diff": max(r["abs_diff"] for r in rows), "nobs": int(fit._N)}


# --------------------------------------------------------------------------- 2. recovery


def recovery(ens: dict, cases: int, tmp: Path) -> list[dict]:
    priors = load_priors()
    targets_doc = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
    n = len(ens["sets"])
    picks = [int(round(i)) for i in np.linspace(0, n - 1, cases + 2)[1:-1]]
    out = []
    for k, idx in enumerate(picks):
        truth = ens["sets"][idx]
        sim = evaluate([truth], seeds=VALIDATION_SEEDS)[0]
        doc = json.loads(json.dumps(targets_doc))
        for t in doc["targets"]:
            if t["role"] in ("fit", "constraint"):
                v = sim["moments"][t["moment"]]
                t["value"] = v
        tpath = tmp / f"targets_case{k}.json"
        tpath.write_text(json.dumps(doc, indent=1), encoding="utf-8", newline="\n")
        epath = tmp / f"ensemble_case{k}.json"
        print(f"Recovery case {k + 1}/{cases} (ensemble member {idx})", flush=True)
        calibrate.main(["--targets", str(tpath), "--out", str(epath), "--report-dir", str(tmp / f"case{k}"),
                        "--stage1", "1024", "--stage2-starts", "2", "--stage2-maxfev", "60",
                        "--stage3", "768", "--generations", "2", "--tolerance", "0", "--accept", "256", "--ensemble", "200"])
        rec = json.loads(epath.read_text(encoding="utf-8"))["sets"]
        for p in priors:
            g, key = p.name.split(".")
            xs = np.array([s[g][key] for s in rec])
            lo, hi = np.quantile(xs, [0.05, 0.95])
            out.append({"case": k + 1, "param": p.name, "truth": truth[g][key], "lo": float(lo), "hi": float(hi),
                        "covered": bool(lo <= truth[g][key] <= hi),
                        "width_vs_prior": float((hi - lo) / (p.hi - p.lo)) if p.dist == "uniform"
                        else float((np.log(hi) - np.log(lo)) / (np.log(p.hi) - np.log(p.lo)))})
    return out


# --------------------------------------------------------------------------- 4. sensitivity


def sensitivity(ens: dict) -> list[dict]:
    priors = load_priors()
    sets = ens["sets"]
    med = {}
    for p in priors:
        g, k = p.name.split(".")
        med.setdefault(g, {})[k] = float(np.median([s[g][k] for s in sets]))
    draws = [med]
    labels = [("median", "", "")]
    for p in priors:
        g, k = p.name.split(".")
        xs = np.array([s[g][k] for s in sets])
        for side, qv in (("low", 0.05), ("high", 0.95)):
            d = json.loads(json.dumps(med))
            d[g][k] = float(np.quantile(xs, qv))
            draws.append(d)
            labels.append((p.name, side, d[g][k]))
    res = evaluate(draws, seeds=VALIDATION_SEEDS, counterfactual=True)
    base = res[0]
    rows = []
    for i in range(1, len(res), 2):
        lo, hi = res[i], res[i + 1]
        rows.append({
            "param": labels[i][0], "low": labels[i][2], "high": labels[i + 1][2],
            "d_coveredEffect": hi["effects"]["coveredListings"] - lo["effects"]["coveredListings"],
            "d_askingRentEffect_pp": 100 * (hi["effects"]["askingRent"] - lo["effects"]["askingRent"]),
            "d_didP1": hi["moments"]["didP1"] - lo["moments"]["didP1"],
            "d_exemptEffect": hi["effects"]["exemptListings"] - lo["effects"]["exemptListings"],
        })
    rows.sort(key=lambda r: -abs(r["d_coveredEffect"]))
    return [{"base": base["effects"]}, *rows]


# --------------------------------------------------------------------------- report


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--recovery-cases", type=int, default=3)
    ap.add_argument("--skip-recovery", action="store_true")
    args = ap.parse_args(argv)
    ens = load_ensemble()
    REPORTS.mkdir(parents=True, exist_ok=True)
    targets = {t["id"]: t for t in load_targets()}
    cal = json.loads((REPORTS / "calibration_results.json").read_text(encoding="utf-8"))
    fit = {r["id"]: r for r in cal["fit"]}

    print("1/4 estimator cross-check (pyfixest vs TypeScript)", flush=True)
    est = estimator_check(ens)
    print("2/4 parameter recovery", flush=True)
    rec = [] if args.skip_recovery else recovery(ens, args.recovery_cases, Path(tempfile.mkdtemp(prefix="zo-recovery-")))
    print("3/4 sensitivity (one at a time)", flush=True)
    sens = sensitivity(ens)
    print("4/4 writing report", flush=True)

    L = ["# Validation report", "",
         f"_Generated by `calibration/validate.py` against ensemble created {ens['meta']['created']} "
         f"(commit `{ens['meta']['gitCommit']}`). Validation seeds {list(VALIDATION_SEEDS)} differ from the calibration "
         "seeds. Do not edit by hand._", "",
         "## 1. Estimator cross-check", "",
         f"The TypeScript DiD used for calibration moments matches pyfixest `feols(y ~ antic + p1 + p2 | zone + month)` "
         f"on the same simulated panel ({est['nobs']} zone-snapshot cells): max |difference| = {est['max_abs_diff']:.2e}.", "",
         "| Term | pyfixest | TypeScript | Abs. diff | CRV1 SE (zone) |", "|---|---:|---:|---:|---:|"]
    for r in est["rows"]:
        L.append(f"| {r['term']} | {r['pyfixest']:.6f} | {r['typescript']:.6f} | {r['abs_diff']:.1e} | {r['se_crv1']:.4f} |")

    L += ["", "## 2. Parameter recovery", ""]
    if rec:
        df = pd.DataFrame(rec)
        cov = df.groupby("param")["covered"].mean()
        width = df.groupby("param")["width_vs_prior"].mean()
        L += [f"{len(df['case'].unique())} cases: pseudo-data simulated at known parameters (ensemble members) on the validation "
              "seeds, then a reduced calibration (1,024 Sobol draws + 2 ABC-SMC generations of 768) re-estimated them. Coverage = share of cases where the "
              "truth lies in the recovered 5-95% interval; width = interval width as a share of the prior range "
              "(1 = nothing learned).", "",
              f"Overall coverage: {df['covered'].mean() * 100:.0f}% of {len(df)} parameter-cases.", "",
              "| Parameter | Coverage | Mean interval width / prior |", "|---|---:|---:|"]
        for p in cov.index:
            L.append(f"| `{p}` | {cov[p] * 100:.0f}% | {width[p]:.2f} |")
    else:
        L.append("Skipped (--skip-recovery).")

    h1, s1, s2 = fit.get("H1"), fit.get("S1"), fit.get("S2")
    L += ["", "## 3. External validation", "",
          f"- **Held-out Salt Spring Island (H1).** Data: {targets['H1']['ref_level']} listings in Aug 2023, "
          f"{targets['H1']['levels']['33']} in Jun 2026 (log change {h1['target']:+.3f}). Sim (ensemble mean): "
          f"{h1['mean']:+.3f} (5-95% {h1['lo']:+.3f} to {h1['hi']:+.3f}). "
          + ("The sim's response is within range." if h1["lo"] <= h1["target"] <= h1["hi"] else
             "**Miss.** The model applies the full principal-residence rule from the Nov 2025 opt-in, so Salt Spring's "
             "non-PR listings fall as covered areas' did in 2024. The data show almost no fall by Jun 2026 (one "
             "snapshot after the opt-in matters most). Plausible reasons outside the model: slower enforcement on the "
             "islands, transition time, or hosts already registered as exempt. This is reported, not fitted."),
          f"- **Rent bound (S2).** STR-attributable asking-rent change: mean {s2['mean'] * 100:.2f}% "
          f"(5-95% {s2['lo'] * 100:.2f}% to {s2['hi'] * 100:.2f}%); {s2['share_in_band'] * 100:.0f}% of the ensemble lies "
          "inside the -3.3% to -0.4% bound from the first project.",
          f"- **CPI sanity (S1).** Real CPI rented accommodation rose {np.expm1(s1['target']) * 100:.1f}% (Sep 2023 to "
          f"Jun 2026); the sim's CPI-style index rose {np.expm1(s1['mean']) * 100:.1f}%. The sim contains no "
          "macro rent inflation (rentDriftAnnual = 0): it is built to isolate the STR channel, so it is not expected to "
          "match. The STR-attributable part is the S2 number above, which is too small to detect against CPI noise.",
          "", "## 4. Sensitivity (one at a time)", "",
          "Each parameter moved from its posterior 5% to 95% quantile with the others at their posterior medians "
          "(validation seeds, paired no-policy runs). Sorted by impact on the true covered-listings effect.", "",
          f"Base (medians): covered-listings effect {sens[0]['base']['coveredListings']:+.3f} log points, asking-rent "
          f"effect {sens[0]['base']['askingRent'] * 100:+.2f}%.", "",
          "| Parameter | 5% -> 95% | Δ covered effect | Δ DiD P1 | Δ exempt effect | Δ rent effect (pp) |",
          "|---|---|---:|---:|---:|---:|"]
    for r in sens[1:]:
        L.append(f"| `{r['param']}` | {r['low']:.3g} -> {r['high']:.3g} | {r['d_coveredEffect']:+.3f} | {r['d_didP1']:+.3f} | "
                 f"{r['d_exemptEffect']:+.3f} | {r['d_askingRentEffect_pp']:+.2f} |")
    (REPORTS / "validation.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    (REPORTS / "validation_results.json").write_text(
        json.dumps({"estimator": est, "recovery": rec, "sensitivity": sens}, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"wrote {REPORTS / 'validation.md'}")
    if est["max_abs_diff"] > 1e-6:
        print("ERROR: TypeScript and pyfixest DiD disagree")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
