"""Calibration report: fit table, identification diagnostics, figures (docs/CALIBRATION.md)."""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from common import Prior, get_moment  # noqa: E402
from simbridge import evaluate  # noqa: E402

# Okabe-Ito
C_DATA, C_SIM, C_PRIOR, C_BAND = "#000000", "#0072B2", "#999999", "#E69F00"


def q(x, p):
    return float(np.quantile(np.asarray(x, dtype=float), p))


def identification_label(contraction: float) -> str:
    if contraction >= 0.5:
        return "identified"
    if contraction >= 0.2:
        return "partly identified"
    return "weakly identified"


def summarise_ensemble(results: list[dict], targets: list[dict]) -> list[dict]:
    """Per-target ensemble mean / 5-95% interval and a pass flag (|mean - target| <= 2 se)."""
    rows = []
    for t in targets:
        vals = [get_moment(r, t["moment"]) for r in results]
        if any(v is None for v in vals):
            continue
        arr = np.array(vals, dtype=float)
        row = {"id": t["id"], "moment": t["moment"], "role": t["role"]}
        if arr.ndim == 2 and "ticks" in t:  # paths: summarise the last point and the RMS deviation
            target = np.asarray(t["value"], dtype=float)
            mean_path = arr.mean(axis=0)
            row.update({
                "target": float(target[-1]), "mean": float(mean_path[-1]),
                "lo": q(arr[:, -1], 0.05), "hi": q(arr[:, -1], 0.95),
                "rmse_path": float(np.sqrt(np.mean((mean_path - target) ** 2))),
                "path_target": target.tolist(), "path_mean": mean_path.tolist(),
                "path_lo": np.quantile(arr, 0.05, axis=0).tolist(), "path_hi": np.quantile(arr, 0.95, axis=0).tolist(),
            })
            if "se" in t:
                row["pass"] = bool(abs(row["mean"] - row["target"]) <= 2 * t["se"])
        elif "band" in t:
            lo, hi = t["band"]
            row.update({"target": f"[{lo}, {hi}]", "mean": float(arr.mean()), "lo": q(arr, 0.05), "hi": q(arr, 0.95),
                        "share_in_band": float(np.mean((arr >= lo) & (arr <= hi)))})
        else:
            row.update({"target": float(np.asarray(t["value"], dtype=float).reshape(-1)[0]) if np.ndim(t["value"]) == 0 else t["value"],
                        "mean": arr.mean(axis=0).tolist() if arr.ndim > 1 else float(arr.mean()),
                        "lo": q(arr, 0.05) if arr.ndim == 1 else None, "hi": q(arr, 0.95) if arr.ndim == 1 else None})
            if "se" in t and arr.ndim == 1:
                row["pass"] = bool(abs(row["mean"] - row["target"]) <= 2 * t["se"])
        rows.append(row)
    return rows


def parameter_table(priors: list[Prior], U_ens: np.ndarray) -> list[dict]:
    rows = []
    for j, p in enumerate(priors):
        u = U_ens[:, j]
        x = p.from_unit(u)
        contraction = 1.0 - float(np.var(u)) / (1.0 / 12.0)
        rows.append({
            "name": p.name, "prior": f"{p.dist}[{p.lo:g}, {p.hi:g}]",
            "median": float(np.median(x)), "lo": q(x, 0.05), "hi": q(x, 0.95),
            "contraction": round(contraction, 3), "label": identification_label(contraction),
        })
    return rows


def fmt(x, nd=3):
    if isinstance(x, str):
        return x
    if x is None:
        return "-"
    return f"{x:.{nd}f}"


def write_calibration_report(*, priors, targets, meta, sets, U_ens, stage, out_dir: Path, seeds):
    out_dir.mkdir(parents=True, exist_ok=True)
    print("  evaluating the ensemble with paired no-policy counterfactuals...", flush=True)
    results = evaluate(sets, seeds=seeds, counterfactual=True)
    fit = summarise_ensemble(results, targets)
    params = parameter_table(priors, U_ens)
    corr = np.corrcoef(U_ens, rowvar=False) if len(U_ens) > 2 else np.eye(len(priors))
    pairs = sorted(
        ((abs(corr[i, j]), priors[i].name, priors[j].name, corr[i, j])
         for i in range(len(priors)) for j in range(i + 1, len(priors))),
        reverse=True,
    )[:6]
    effects = {k: [r["effects"][k] for r in results] for k in results[0]["effects"]}

    # ---- figures
    fig, axes = plt.subplots(1, 3, figsize=(13, 3.8))
    ticks = targets[[t["id"] for t in targets].index("T3")]["ticks"]
    for ax, tid, title in zip(axes, ["T3", "T4", "H1"], ["Covered areas (fit)", "Never-covered areas (fit)", "Salt Spring (held out)"]):
        row = next(r for r in fit if r["id"] == tid)
        ax.fill_between(ticks, np.exp(row["path_lo"]) * 100, np.exp(row["path_hi"]) * 100, color=C_SIM, alpha=0.2, label="Sim 5-95%")
        ax.plot(ticks, np.exp(row["path_mean"]) * 100, color=C_SIM, lw=2, label="Sim mean")
        ax.plot(ticks, np.exp(row["path_target"]) * 100, "o--", color=C_DATA, label="Data (Inside Airbnb)")
        for x, lab in [(8, "P1"), (20, "P2")]:
            ax.axvline(x, color=C_PRIOR, ls=":")
            ax.text(x + 0.3, ax.get_ylim()[1] if False else 102, lab, color=C_PRIOR, fontsize=8)
        ax.set_title(title)
        ax.set_xlabel("months since Sep 2023")
        ax.set_ylabel("entire-home listings (Aug 2023 = 100)")
    axes[0].legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_dir / "paths.png", dpi=130)
    plt.close(fig)

    n = len(priors)
    cols = 4
    fig, axes = plt.subplots(-(-n // cols), cols, figsize=(13, 2.4 * -(-n // cols)))
    for ax, p, j in zip(axes.flat, priors, range(n)):
        ax.hist(U_ens[:, j], bins=20, range=(0, 1), color=C_SIM, alpha=0.8, density=True)
        ax.axhline(1.0, color=C_PRIOR, ls="--", lw=1)
        ax.set_title(f"{p.name}\n({params[j]['label']})", fontsize=8)
        ax.set_xticks([0, 0.5, 1])
        ax.set_xticklabels([f"{p.lo:g}", f"{float(p.from_unit(np.array(0.5))):.3g}", f"{p.hi:g}"], fontsize=7)
        ax.set_yticks([])
    for ax in list(axes.flat)[n:]:
        ax.axis("off")
    fig.suptitle("Posterior (ensemble) vs uniform prior (dashed), prior units", fontsize=10)
    fig.tight_layout()
    fig.savefig(out_dir / "marginals.png", dpi=120)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(6.5, 3.4))
    ar = np.array(effects["askingRent"]) * 100
    ax.hist(ar, bins=30, color=C_SIM, alpha=0.8)
    ax.axvspan(-3.33, -0.42, color=C_BAND, alpha=0.25, label="Bound from data (S2): -3.3% to -0.4%")
    ax.set_xlabel("STR-attributable change in asking rents by Jun 2026 (%)")
    ax.set_ylabel("ensemble members")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(out_dir / "rent_effect.png", dpi=130)
    plt.close(fig)

    # ---- markdown
    L = [
        "# Calibration report",
        "",
        f"_Generated by `calibration/calibrate.py` on {meta['created']} at commit `{meta['gitCommit']}` "
        f"(sim {meta['simVersion']}). Do not edit by hand._",
        "",
        "## Run",
        "",
        f"- Method: {meta['method']}.",
        f"- Stage 1: {meta['nStage1']} Sobol draws; Stage 3: {meta['nStage3']} ABC-SMC proposals; common seeds {meta['seeds']}.",
        "- ABC-SMC generations (tolerance, ESS of the population): "
        + "; ".join(f"{g['generation']}: D <= {g['tolerance']:.1f}, ESS {g['ess']:.0f}" for g in meta.get("generations", [])) + ".",
        f"- Final tolerance D <= {meta['tolerance']}; population {meta['nAccepted']}; effective sample size {meta['ess']}; "
        f"ensemble of {len(sets)} parameter sets ({meta.get('distinctSets', '?')} distinct), resampled by importance weight.",
        f"- Best distance found: {meta['bestDistance']}. Stage-1 median distance: {np.median(stage['D1']):.1f}.",
        f"- Hashes: priors `{meta['priorsHash']}`, targets `{meta['targetsHash']}`, defaults `{meta['defaultsHash']}`, "
        f"scenario `{meta['scenarioHash']}` (checked by `packages/sim/test/ensemble.test.ts`).",
        "",
        "## Fit (ensemble mean and 5-95% range vs target)",
        "",
        "Pass = ensemble mean within 2 standard errors of the target (paths: last point).",
        "",
        "| ID | Moment | Role | Target | Sim mean | Sim 5% | Sim 95% | Path RMSE | Pass |",
        "|---|---|---|---:|---:|---:|---:|---:|---|",
    ]
    for r in fit:
        if r["id"] in ("T7",):
            continue
        L.append(f"| {r['id']} | `{r['moment']}` | {r['role']} | {fmt(r['target'])} | {fmt(r['mean'])} | {fmt(r.get('lo'))} | "
                 f"{fmt(r.get('hi'))} | {fmt(r.get('rmse_path'))} | {'yes' if r.get('pass') else ('-' if 'pass' not in r else '**no**')} |")
    t7 = next((r for r in fit if r["id"] == "T7"), None)
    if t7:
        L += ["", f"**T7 pre-trends.** Ensemble-mean event-study leads at the four pre-announcement snapshots: "
              f"{', '.join(f'{v:+.3f}' for v in t7['mean'])} (target 0; real-data leads pass with RI p = 0.92)."]
    s2 = next((r for r in fit if r["id"] == "S2"), None)
    L += [
        "",
        "## What the calibrated model says about rents (validation, not fitted)",
        "",
        f"- STR-attributable change in asking rents by Jun 2026 (paired no-policy runs): mean {np.mean(ar):.2f}%, "
        f"5-95% {q(ar, 0.05):.2f}% to {q(ar, 0.95):.2f}%. Share of the ensemble inside the S2 bound (-3.3% to -0.4%): "
        f"{(s2 or {}).get('share_in_band', float('nan')) * 100:.0f}%.",
        f"- Same for the CPI-style (all-tenant) index: mean {np.mean(effects['cpiRent']) * 100:.2f}%. Either way the effect is "
        "small relative to the +19.5% CPI rise (S1), i.e. too small to detect in CPI data.",
        f"- True causal effect of the policy on covered-area listings (paired runs): mean {np.mean(effects['coveredListings']):.3f} log points; "
        f"on never-covered listings {np.mean(effects['exemptListings']):+.3f} (spillover).",
        "",
        "![Rent effect](rent_effect.png)",
        "",
        "## Paths",
        "",
        "![Listing paths](paths.png)",
        "",
        "## Parameters and identification",
        "",
        "Contraction = 1 - Var(posterior)/Var(prior) on the unit-cube scale. Labels: >= 0.5 identified, "
        "0.2-0.5 partly identified, < 0.2 weakly identified. Weakly identified parameters carry their "
        "uncertainty into the game through the ensemble.",
        "",
        "| Parameter | Prior | Median | 5% | 95% | Contraction | Label |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for p in params:
        L.append(f"| `{p['name']}` | {p['prior']} | {p['median']:.4g} | {p['lo']:.4g} | {p['hi']:.4g} | {p['contraction']:.2f} | {p['label']} |")
    L += ["", "Strongest posterior correlations (trade-offs the data cannot separate):", ""]
    for _, a, b, c in pairs:
        L.append(f"- `{a}` vs `{b}`: {c:+.2f}")
    L += ["", "![Marginals](marginals.png)", ""]
    (out_dir / "calibration.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    (out_dir / "calibration_results.json").write_text(
        json.dumps({"meta": meta, "fit": fit, "parameters": params, "effects_summary": {
            k: {"mean": float(np.mean(v)), "p05": q(v, 0.05), "p95": q(v, 0.95)} for k, v in effects.items()}},
            indent=1) + "\n", encoding="utf-8", newline="\n")
    print(f"  wrote {out_dir / 'calibration.md'}")
