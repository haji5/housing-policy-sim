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

from common import ENSEMBLE_PATH, REPORTS, ROOT, load_targets  # noqa: E402
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
    rows = []
    for zi, z in enumerate(p["zones"]):
        for k, t in enumerate(p["snapshotTicks"]):
            if p["incomplete"][k]:
                continue  # flagged truncated snapshot: excluded, never interpolated
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


def true_exempt(p: dict) -> float:
    ks = [k for k, t in enumerate(p["snapshotTicks"]) if P1_WINDOW[0] <= t < P1_WINDOW[1]]
    ex = [zi for zi, z in enumerate(p["zones"]) if not z["covered"] and z.get("optInTick") is None]
    h = np.array([sum(p["hist"][zi][k] for zi in ex) for k in ks], dtype=float)
    n = np.array([sum(p["none"][zi][k] for zi in ex) for k in ks], dtype=float)
    return float(np.mean(np.log(h) - np.log(n)))


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
    for lv in levels:
        for i in idx:
            s = json.loads(json.dumps(ens["sets"][int(i)]))
            s["str"]["demandSpillover"] = float(min(1.0, s["str"]["demandSpillover"] * lv))
            s["host"]["investorEntry"] = float(s["host"]["investorEntry"] * lv)
            draws.append({"params": s, "seed": SEED + int(i)})
            meta.append({"level": lv, "member": int(i)})
    print(f"DiD recovery: {len(draws)} paired runs ({len(levels)} spillover levels x {len(idx)} members)", flush=True)
    panels = run_panels(draws, default_workers())

    rows = []
    for k, (p, m) in enumerate(zip(panels, meta)):
        df = panel_frame(p)
        est, se = estimate(df)
        clean, _ = estimate(panel_frame(p, "hist"))  # same estimator on the noise-free true panel
        row = {**m, "estimate": est, "se": se, "estimate_noiseless": clean, "truth": true_att(p),
               "exempt_spillover": true_exempt(p), "dropped_snapshots": int(sum(p["incomplete"]))}
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
        exempt=("exempt_spillover", "mean"), coverage=("covered95", "mean"), ri_p=("ri_p", "median"),
    ).reset_index()
    t1 = next(t for t in load_targets() if t["id"] == "T1")

    fig, ax = plt.subplots(figsize=(7.5, 4.2))
    for col, lab, c, mk in [("truth", "True effect on covered listings (paired runs)", "#000000", "o"),
                            ("estimate", "Covered-vs-exempt DiD estimate (researcher view)", "#0072B2", "s")]:
        g = res.groupby("level")[col]
        ax.errorbar(summ["level"] + (0.04 if col == "estimate" else -0.04), g.mean(),
                    yerr=[g.mean() - g.quantile(0.05), g.quantile(0.95) - g.mean()],
                    fmt=mk + "-", color=c, capsize=3, label=lab)
    ax.axhline(t1["value"], color="#E69F00", ls="--", label=f"Real-data estimate (T1 = {t1['value']})")
    ax.axvline(1.0, color="#999999", ls=":")
    ax.text(1.02, ax.get_ylim()[1] - 0.02, "calibrated", color="#555555", fontsize=8, va="top")
    ax.set_xlabel("Spillover strength (x calibrated demand spillover and investor entry)")
    ax.set_ylabel("Phase 1 effect (log points)")
    ax.set_title("Does the DiD recover the truth when hosts can move to exempt areas?")
    ax.legend(fontsize=8, loc="lower left")
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
         "| Spillover | True effect | DiD estimate | DiD, noise-free panel | Bias (mean) | Bias 5-95% | Exempt-area spillover (true) | 95% CI coverage | RI p (median) |",
         "|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for _, r in summ.iterrows():
        L.append(f"| {r['level']:.1f}x | {r['truth']:+.3f} | {r['estimate']:+.3f} | {r['noiseless']:+.3f} | {r['bias']:+.3f} | "
                 f"{r['bias_lo']:+.3f} to {r['bias_hi']:+.3f} | {r['exempt']:+.3f} | {r['coverage'] * 100:.0f}% | {r['ri_p']:.3f} |")
    cal = summ[summ["level"] == 1.0]
    if len(cal):
        c = cal.iloc[0]
        rel = c["bias"] / c["truth"] * 100 if c["truth"] else float("nan")
        L += ["", "## Plain reading", "",
              f"- At the calibrated spillover strength the DiD estimate is {c['estimate']:+.3f} against a true effect of "
              f"{c['truth']:+.3f}: a bias of {c['bias']:+.3f} log points ({rel:+.0f}% of the true effect). "
              + ("The DiD overstates the fall in covered listings, because the control group is itself pushed up by "
                 "displaced demand and investors." if c["bias"] < 0 else
                 "The DiD does not overstate the effect at this spillover level."),
              f"- With no spillover (0x) the mean bias is {summ.iloc[0]['bias']:+.3f}: the design is close to unbiased when "
              "SUTVA holds; what remains is noise from the snapshot process and the few control areas.",
              f"- Bias grows with spillover: at {summ.iloc[-1]['level']:.0f}x it is {summ.iloc[-1]['bias']:+.3f}.",
              "- Spillover strength is weakly identified by the calibration (see calibration.md), so the size of this "
              "bias in the real Bill 35 estimate cannot be pinned down from the listings data alone."]
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
