"""DiD-recovery experiment (PLAN §8.3): does the first project's covered-vs-exempt DiD recover the
true effect inside a world where we know the truth?

For ensemble members x spillover strengths:
  1. Run the Historical Bill 35 policy and no policy on the same seed (common random numbers).
     True effect (ATT, log points) = mean over the Phase-1 snapshots (May 2024 - Mar 2025) of
     log(covered listings | policy) - log(covered listings | no policy).
  2. Take the researcher-view panel of the policy run: Inside Airbnb-style snapshots with scrape
     noise and occasional truncated snapshots (flagged and dropped as the first project did).
  3. Estimate the first project's preferred design with pyfixest:
     log(1 + n) ~ antic + phase1 + phase2 | zone + month, covered vs exempt (Salt Spring leaves the
     control group at its opt-in), plus placebo-in-space randomization inference over every
     3-zone control group.
  4. Compare estimate with truth. Spillover strength multiplies the two spillover channels
     (demandSpillover, investorEntry) of each ensemble member; 0 = no SUTVA violation.

Writes calibration/reports/did_recovery.md, did_recovery.png and did_recovery.json.
Usage (via run.py): did [--members 60] [--levels 0,0.5,1,2,3]
"""
from __future__ import annotations

import argparse
import itertools
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import pyfixest as pf  # noqa: E402

from common import ENSEMBLE_PATH, PRIORS_PATH, REPORTS, ROOT, load_targets  # noqa: E402
from simbridge import CLI, default_workers  # noqa: E402

HIST = {"announced": 1, "phase1": 8, "phase2": 20}
P1_WINDOW = (8, 20)  # ticks in [8, 20): Phase 1 only, before the registry
SEED = 101


def run_panels(draws: list[dict], workers: int) -> list[dict]:
    node = shutil.which("node")
    size = -(-len(draws) // workers)
    with tempfile.TemporaryDirectory(prefix="zo-did-") as tmp:
        procs = []
        for w in range(workers):
            chunk = draws[w * size : (w + 1) * size]
            if not chunk:
                continue
            inp, out = Path(tmp) / f"in{w}.jsonl", Path(tmp) / f"out{w}.jsonl"
            inp.write_text("".join(json.dumps({"id": w * size + i, "params": d["params"], "seed": d["seed"]}) + "\n"
                                   for i, d in enumerate(chunk)), encoding="utf-8")
            cmd = [node, str(CLI), "panel", "--scenario", "victoria", "--in", str(inp), "--out", str(out)]
            procs.append((subprocess.Popen(cmd, cwd=ROOT, stderr=subprocess.PIPE, text=True), out))
        res = {}
        for p, out in procs:
            _, err = p.communicate()
            if p.returncode:
                raise RuntimeError(err[-2000:])
            for line in out.read_text(encoding="utf-8").splitlines():
                r = json.loads(line)
                res[r["id"]] = r
    return [res[i] for i in range(len(draws))]


def panel_frame(p: dict, which: str = "observed") -> pd.DataFrame:
    """Zone x snapshot panel. The observed panel drops snapshots the analyst flags as incomplete
    (never interpolated); the true panels keep every snapshot."""
    rows = []
    for zi, z in enumerate(p["zones"]):
        for k, t in enumerate(p["snapshotTicks"]):
            if which == "observed" and p["incomplete"][k]:
                continue  # flagged snapshot: excluded, never interpolated
            opt = z.get("optInTick")
            if not z["covered"] and opt is not None and t >= opt:
                continue
            rows.append({"zone": zi, "month": t, "covered": int(z["covered"]),
                         "y": float(np.log1p(p[which][zi][k]))})
    df = pd.DataFrame(rows)
    df["antic"] = df["covered"] * ((df["month"] >= HIST["announced"]) & (df["month"] < HIST["phase1"])).astype(int)
    df["p1"] = df["covered"] * (df["month"] >= HIST["phase1"]).astype(int)
    df["p2"] = df["covered"] * (df["month"] >= HIST["phase2"]).astype(int)
    return df


def estimate(df: pd.DataFrame) -> tuple[float, float]:
    fit = pf.feols("y ~ antic + p1 + p2 | zone + month", data=df, vcov={"CRV1": "zone"})
    return float(fit.coef()["p1"]), float(fit.se()["p1"])


def ri_pvalue(df: pd.DataFrame, observed: float) -> float:
    """Placebo-in-space RI: every set of 3 zones relabelled as the control group (others treated)."""
    zones = sorted(df["zone"].unique())
    stats = []
    for ctrl in itertools.combinations(zones, 3):
        d = df.copy()
        d["covered"] = (~d["zone"].isin(ctrl)).astype(int)
        d["antic"] = d["covered"] * ((d["month"] >= HIST["announced"]) & (d["month"] < HIST["phase1"])).astype(int)
        d["p1"] = d["covered"] * (d["month"] >= HIST["phase1"]).astype(int)
        d["p2"] = d["covered"] * (d["month"] >= HIST["phase2"]).astype(int)
        try:
            stats.append(estimate(d)[0])
        except Exception:  # noqa: BLE001 - collinear placebo assignment
            continue
    stats = np.array(stats)
    return float(np.mean(np.abs(stats) >= abs(observed) - 1e-12))


def true_att(p: dict) -> float:
    ks = [k for k, t in enumerate(p["snapshotTicks"]) if P1_WINDOW[0] <= t < P1_WINDOW[1]]
    cov = [zi for zi, z in enumerate(p["zones"]) if z["covered"]]
    h = np.array([sum(p["hist"][zi][k] for zi in cov) for k in ks], dtype=float)
    n = np.array([sum(p["none"][zi][k] for zi in cov) for k in ks], dtype=float)
    return float(np.mean(np.log(h) - np.log(n)))


def control_zones(p: dict, t: int) -> list[int]:
    """Zones in the DiD control group at tick t: never covered, or opted in later (until opt-in)."""
    return [zi for zi, z in enumerate(p["zones"])
            if not z["covered"] and (z.get("optInTick") is None or t < z["optInTick"])]


def true_control(p: dict) -> float:
    """Policy effect on the control group's listings (the SUTVA violation), Phase 1 window."""
    ks = [k for k, t in enumerate(p["snapshotTicks"]) if P1_WINDOW[0] <= t < P1_WINDOW[1]]
    h = np.array([sum(p["hist"][zi][k] for zi in control_zones(p, p["snapshotTicks"][k])) for k in ks], dtype=float)
    n = np.array([sum(p["none"][zi][k] for zi in control_zones(p, p["snapshotTicks"][k])) for k in ks], dtype=float)
    return float(np.mean(np.log(h) - np.log(n)))


def control_path(p: dict, ticks: list[int], ref: int) -> np.ndarray:
    """log(control listings / control listings at ref) under the policy, for a fixed control group."""
    T = p["snapshotTicks"]
    zs = control_zones(p, max(ticks))
    lev = lambda t: sum(p["hist"][zi][T.index(t)] for zi in zs)  # noqa: E731
    return np.log(np.array([lev(t) for t in ticks], dtype=float) / lev(ref))


def data_control_path() -> tuple[list[int], np.ndarray]:
    """Observed control-group path (never-covered areas + Salt Spring before its opt-in): targets T4 + H1."""
    tg = {t["id"]: t for t in load_targets()}
    ticks = [t for t in tg["T4"]["ticks"] if t < 26]
    lev = np.array([tg["T4"]["levels"][str(t)] + tg["H1"]["levels"][str(t)] for t in ticks], dtype=float)
    return ticks, np.log(lev / (tg["T4"]["ref_level"] + tg["H1"]["ref_level"]))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", type=int, default=60)
    ap.add_argument("--levels", type=str, default="0,0.5,1,2,3")
    ap.add_argument("--ri-members", type=int, default=10, help="members per level that also get RI (slow)")
    args = ap.parse_args(argv)
    ens = json.loads(ENSEMBLE_PATH.read_text(encoding="utf-8"))
    levels = [float(x) for x in args.levels.split(",")]
    idx = np.linspace(0, len(ens["sets"]) - 1, args.members).round().astype(int)
    draws, meta = [], []
    ie_max = next(p["hi"] for p in json.loads(PRIORS_PATH.read_text(encoding="utf-8"))["parameters"]
                  if p["name"] == "host.investorEntry")
    for lv in levels:
        for i in idx:
            s = json.loads(json.dumps(ens["sets"][int(i)]))
            raw = s["str"]["demandSpillover"] * lv
            s["str"]["demandSpillover"] = float(min(1.0, raw))
            s["host"]["investorEntry"] = float(s["host"]["investorEntry"] * lv)
            draws.append({"params": s, "seed": SEED + int(i)})
            meta.append({"level": lv, "member": int(i), "spill_capped": bool(raw > 1.0),
                         "entry_beyond_prior": bool(s["host"]["investorEntry"] > ie_max)})
    print(f"DiD recovery: {len(draws)} paired runs ({len(levels)} spillover levels x {len(idx)} members)", flush=True)
    panels = run_panels(draws, default_workers())

    obs_ticks, obs_path = data_control_path()
    rows = []
    for k, (p, m) in enumerate(zip(panels, meta)):
        df = panel_frame(p)
        est, se = estimate(df)
        clean, _ = estimate(panel_frame(p, "hist"))  # same estimator on the noise-free true panel
        row = {**m, "estimate": est, "se": se, "estimate_noiseless": clean, "truth": true_att(p),
               "control_spillover": true_control(p),
               "control_rmse": float(np.sqrt(np.mean((control_path(p, obs_ticks, -1) - obs_path) ** 2))),
               "control_bias": float(np.mean(control_path(p, obs_ticks, -1) - obs_path)), "dropped_snapshots": int(sum(p["incomplete"])),
               "false_flags": int(sum(f and not t for f, t in zip(p["incomplete"], p["truncated"]))),
               "missed_truncations": int(sum(t and not f for f, t in zip(p["incomplete"], p["truncated"])))}
        if list(idx).index(m["member"]) < args.ri_members:
            row["ri_p"] = ri_pvalue(df, est)
        rows.append(row)
        if k % 50 == 0:
            print(f"  {k}/{len(panels)}", flush=True)
    res = pd.DataFrame(rows)
    res["bias"] = res["estimate"] - res["truth"]
    res["covered95"] = (res["estimate"] - 1.96 * res["se"] <= res["truth"]) & (res["truth"] <= res["estimate"] + 1.96 * res["se"])

    summ = res.groupby("level").agg(
        truth=("truth", "mean"), estimate=("estimate", "mean"), noiseless=("estimate_noiseless", "mean"),
        bias=("bias", "mean"), bias_lo=("bias", lambda x: np.quantile(x, 0.05)), bias_hi=("bias", lambda x: np.quantile(x, 0.95)),
        control=("control_spillover", "mean"), ctrl_rmse=("control_rmse", "mean"), ctrl_bias=("control_bias", "mean"),
        capped=("spill_capped", "mean"), beyond=("entry_beyond_prior", "mean"), coverage=("covered95", "mean"), ri_p=("ri_p", "median"),
        ri_reject=("ri_p", lambda x: float(np.mean(x.dropna() <= 0.05)) if x.notna().any() else float("nan")),
        false_flags=("false_flags", "mean"), missed=("missed_truncations", "mean"),
    ).reset_index()
    t1 = next(t for t in load_targets() if t["id"] == "T1")

    fig, (ax, bx) = plt.subplots(1, 2, figsize=(11, 4.2), gridspec_kw={"width_ratios": [1.15, 1]})
    for col, lab, c, mk in [("truth", "True effect on covered listings (paired runs)", "#000000", "o"),
                            ("estimate", "Covered-vs-exempt DiD estimate (researcher view)", "#0072B2", "s")]:
        g = res.groupby("level")[col]
        ax.errorbar(summ["level"] + (0.04 if col == "estimate" else -0.04), g.mean(),
                    yerr=[g.mean() - g.quantile(0.05), g.quantile(0.95) - g.mean()],
                    fmt=mk + "-", color=c, capsize=3, label=lab)
    ax.axhline(t1["value"], color="#E69F00", ls="--", label=f"Real-data estimate (T1 = {t1['value']})")
    for a in (ax, bx):
        a.axvline(1.0, color="#999999", ls=":")
        a.set_xlabel("Spillover strength (x calibrated)")
    ax.text(1.04, ax.get_ylim()[1] - 0.01, "calibrated", color="#555555", fontsize=8, va="top")
    ax.set_ylabel("Phase 1 effect (log points)")
    ax.set_title("Effect: truth vs DiD (mean, 5-95% across runs)", fontsize=10)
    ax.legend(fontsize=8, loc="lower left")
    g = res.groupby("level")["bias"]
    bx.fill_between(summ["level"], g.quantile(0.05), g.quantile(0.95), color="#0072B2", alpha=0.18,
                    label="5-95% of runs")
    bx.fill_between(summ["level"], g.quantile(0.25), g.quantile(0.75), color="#0072B2", alpha=0.3,
                    label="25-75% of runs")
    bx.plot(summ["level"], g.mean(), "s-", color="#0072B2", label="Mean bias")
    bx.axhline(0, color="#000000", lw=0.8)
    bx.set_ylabel("Bias = DiD estimate - truth (log points)")
    bx.set_title("Bias (same run, same seed)", fontsize=10)
    bx.legend(fontsize=8, loc="lower left")
    fig.suptitle("Does the DiD recover the truth when hosts can move to exempt areas?")
    fig.tight_layout()
    fig.savefig(REPORTS / "did_recovery.png", dpi=130)
    plt.close(fig)

    L = ["# DiD-recovery experiment", "",
         f"_Generated by `calibration/did_recovery.py` from ensemble created {ens['meta']['created']} "
         f"(commit `{ens['meta']['gitCommit']}`); {len(idx)} ensemble members x {len(levels)} spillover levels, seed "
         f"{SEED}+member. Do not edit by hand._", "",
         "Truth = mean over Phase-1 snapshots (Jun 2024 - Mar 2025) of log covered listings under the policy minus under no "
         "policy, same seed. Estimate = the first project's covered-vs-exempt DiD (Phase-1 coefficient) on the noisy "
         "researcher-view panel. Bias = estimate - truth. Coverage = share of runs whose 95% CI (zone-clustered) contains "
         "the truth. RI p = placebo-in-space randomization inference over all 3-zone control groups (median over the "
         f"first {args.ri_members} members).", "",
         "| Spillover | True effect | DiD estimate | DiD, noise-free panel | Bias (mean) | Bias 5-95% | Control-group spillover (true) | 95% CI coverage | RI p (median) |",
         "|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for _, r in summ.iterrows():
        L.append(f"| {r['level']:.1f}x | {r['truth']:+.3f} | {r['estimate']:+.3f} | {r['noiseless']:+.3f} | {r['bias']:+.3f} | "
                 f"{r['bias_lo']:+.3f} to {r['bias_hi']:+.3f} | {r['control']:+.3f} | {r['coverage'] * 100:.0f}% | {r['ri_p']:.3f} |")
    L += ["", "Control-group spillover = the policy's effect on listings in the zones the regression uses as controls "
          "(the never-covered areas and Salt Spring before its opt-in), Phase 1 window, aggregate log points.", "",
          "## What the spillover levels mean", "",
          "Each level multiplies a member's `demandSpillover` (capped at 1, its upper bound) and `investorEntry`. Above 1x the "
          "cap binds for many members, so higher levels mostly scale investor entry, often beyond the calibration prior.", "",
          "| Spillover | Members with demandSpillover capped at 1 | Members with investorEntry above the prior maximum |",
          "|---:|---:|---:|"]
    for _, r in summ.iterrows():
        L.append(f"| {r['level']:.1f}x | {r['capped'] * 100:.0f}% | {r['beyond'] * 100:.0f}% |")
    L += ["", "## Data check: which spillover levels fit the observed control areas?", "",
          f"The control areas are untreated until Salt Spring's opt-in (tick 26), so their listing path before then is direct "
          f"evidence on spillover. Simulated path (policy run, noise-free) vs observed (targets T4 + H1, Juan de Fuca, "
          f"Southern Gulf Islands and Salt Spring) at snapshot ticks {obs_ticks}, log change from Aug 2023. The observed path "
          "also contains whatever common trend the model attributes to tourist demand growth.", "",
          "| Spillover | Mean gap, sim - data | RMSE |", "|---:|---:|---:|"]
    for _, r in summ.iterrows():
        L.append(f"| {r['level']:.1f}x | {r['ctrl_bias']:+.3f} | {r['ctrl_rmse']:.3f} |")
    L += ["", "## Measurement", "",
          "Per run, averaged by spillover level: snapshots the analyst's 75% rule drops although they were complete "
          "(false flags; a genuine policy-driven fall can trip the rule), truncated snapshots the rule misses, and the "
          f"share of RI-tested runs (first {args.ri_members} members) with RI p <= 0.05.", "",
          "| Spillover | False flags per run | Missed truncations per run | RI p <= 0.05 |", "|---:|---:|---:|---:|"]
    for _, r in summ.iterrows():
        L.append(f"| {r['level']:.1f}x | {r['false_flags']:.2f} | {r['missed']:.2f} | {r['ri_reject'] * 100:.0f}% |")
    cal = summ[summ["level"] == 1.0]
    if len(cal):
        c = cal.iloc[0]
        rel = (abs(c["estimate"]) / abs(c["truth"]) - 1) * 100 if c["truth"] else float("nan")
        L += ["", "## Numbers at the calibrated spillover (1x)", "",
              f"- DiD estimate {c['estimate']:+.3f} vs true effect {c['truth']:+.3f}: bias {c['bias']:+.3f} log points "
              f"(the DiD magnitude is {rel:+.0f}% relative to the true magnitude); the same DiD on the noise-free true panel gives {c['noiseless']:+.3f}.",
              f"- True effect on control-group listings: {c['control']:+.3f}.",
              "- Interpretation: docs/VALIDATION.md section 3 (written by hand from this report)."]
    L += ["", "![DiD recovery](did_recovery.png)", ""]
    (REPORTS / "did_recovery.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    (REPORTS / "did_recovery.json").write_text(json.dumps({"summary": summ.to_dict(orient="records"),
                                                            "runs": res.to_dict(orient="records")}, indent=1) + "\n",
                                               encoding="utf-8", newline="\n")
    print(summ.to_string())
    print(f"wrote {REPORTS / 'did_recovery.md'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
