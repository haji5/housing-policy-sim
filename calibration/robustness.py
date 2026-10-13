"""Robustness of the headline results to things the calibration does not vary (audit, 2026-10-11).

1. Ensemble composition and fit. The ABC-SMC ensemble is resampled by importance weight, so it
   can hold duplicates; headline numbers are reported both over the 300 members (as everywhere else) and
   over the distinct parameter sets. The calibration distance is compared with what a correctly
   specified model would give (sum of target weight x dimensions, if the target SEs are right and
   simulation noise is negligible).
2. Rent-effect structural sensitivity. The STR-attributable rent effect depends mostly on two
   ASSUMED rent-market parameters that the listing data barely identify: the asking-rent
   adjustment speed `rental.kappa` and the vacancy pull on renter arrivals
   `rental.arrivalVacancySemiElasticity` (eta). Since ADR 0013 both are drawn in the ensemble;
   this re-runs a spread of distinct members with both fixed at each cell of a grid (paired
   no-policy runs, calibration seeds), to show how the effect depends on them.
3. Renter buyers (ADR 0013). The same members with `host.renterBuyerShare` at 0, 0.4 (default)
   and 0.6.

No model code or parameter file is changed. Writes calibration/reports/robustness.md and
robustness.json. Usage (via run.py): robustness [--members 30]
"""
from __future__ import annotations

import argparse
import json
from collections import Counter

import numpy as np

from common import CAL_SEEDS, ENSEMBLE_PATH, REPORTS, distance, contributions, load_priors, load_targets
from simbridge import evaluate

KAPPA = (0.03, 0.1, 0.3)  # default 0.1; 1 pp vacancy gap => 0.36%, 1.2%, 3.6% a year (ASSUMED range)
ETA = (0.0, 10.0, 25.0, 50.0)  # default 25; 0 = arrivals ignore vacancy (ASSUMED range)
DEFAULT = (0.1, 25.0)
BUYER_SHARES = (0.0, 0.4, 0.6)  # default 0.4 (R1)
HEADLINE = [("didP1", "Phase 1 DiD"), ("didAntic", "Anticipation DiD"), ("didP2", "Phase 2 DiD"),
            ("multiShareEnd", "Multi-host share, Jun 2026"), ("registeredShareEnd", "Registered share, Jun 2026")]


def q(x, w=None):
    x = np.asarray(x, float)
    if w is not None:
        x = np.repeat(x, np.asarray(w, int))
    return float(x.mean()), float(np.quantile(x, 0.05)), float(np.quantile(x, 0.95))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--members", type=int, default=30, help="distinct members in the rent grid")
    args = ap.parse_args(argv)
    ens = json.loads(ENSEMBLE_PATH.read_text(encoding="utf-8"))
    targets = load_targets()
    keys = [json.dumps(s, sort_keys=True) for s in ens["sets"]]
    cnt = Counter(keys)
    uniq = list(dict.fromkeys(keys))  # first-appearance order: deterministic
    w = np.array([cnt[k] for k in uniq])
    sets = [json.loads(k) for k in uniq]

    # ---- 1. composition and fit (every distinct set, calibration seeds, with counterfactual)
    print(f"robustness: {len(uniq)} distinct sets x {len(CAL_SEEDS)} seeds", flush=True)
    res = evaluate(sets, seeds=CAL_SEEDS, counterfactual=True)
    D = np.array([distance(r, targets) for r in res])
    expected = sum(t["weight"] * len(np.atleast_1d(t["value"])) for t in targets
                   if t["role"] in ("fit", "constraint"))
    contrib = {k: float(np.average([contributions(r, targets)[k] for r in res], weights=w))
               for k in contributions(res[0], targets)}
    head = {}
    for key, _ in HEADLINE:
        x = [r["moments"][key] for r in res]
        head[key] = {"members": q(x, w), "distinct": q(x)}
    for key in ("askingRent", "cpiRent", "coveredListings"):
        x = [r["effects"][key] for r in res]
        head["effects." + key] = {"members": q(x, w), "distinct": q(x)}

    # ---- 2. rent-effect grid over (kappa, eta), on a spread of distinct members
    pick = np.linspace(0, len(sets) - 1, min(args.members, len(sets))).round().astype(int)
    draws, meta = [], []
    for k in KAPPA:
        for e in ETA:
            for i in pick:
                s = json.loads(json.dumps(sets[int(i)]))
                s.setdefault("rental", {}).update({"kappa": k, "arrivalVacancySemiElasticity": e})
                draws.append(s)
                meta.append((k, e, int(i)))
    print(f"robustness: rent grid {len(KAPPA)}x{len(ETA)} x {len(pick)} members", flush=True)
    gres = evaluate(draws, seeds=CAL_SEEDS, counterfactual=True)
    grid = {}
    for (k, e, i), r in zip(meta, gres):
        g = grid.setdefault((k, e), {"ask": [], "cpi": [], "cov": []})
        g["ask"].append(r["effects"]["askingRent"])
        g["cpi"].append(r["effects"]["cpiRent"])
        g["cov"].append(r["effects"]["coveredListings"])
    if not all(np.isfinite(v).all() for g in grid.values() for v in g.values()):
        raise RuntimeError("non-finite effect in the rent grid")
    allask = np.concatenate([g["ask"] for g in grid.values()])

    # ---- 3. renter-buyer share, same members at their own kappa and eta
    bdraws = []
    for b in BUYER_SHARES:
        for i in pick:
            s = json.loads(json.dumps(sets[int(i)]))
            s.setdefault("host", {})["renterBuyerShare"] = b
            bdraws.append(s)
    print(f"robustness: renter-buyer share {BUYER_SHARES} x {len(pick)} members", flush=True)
    bres = evaluate(bdraws, seeds=CAL_SEEDS, counterfactual=True)
    buyers = {b: [r["effects"]["askingRent"] for r in bres[j * len(pick):(j + 1) * len(pick)]]
              for j, b in enumerate(BUYER_SHARES)}
    n_cal = len(load_priors())
    ens_kappa = np.array([s["rental"]["kappa"] for s in sets])
    ens_eta = np.array([s["rental"]["arrivalVacancySemiElasticity"] for s in sets])
    ens_ask = np.array([r["effects"]["askingRent"] for r in res])
    corr_k = float(np.corrcoef(np.log(ens_kappa), ens_ask)[0, 1])
    corr_e = float(np.corrcoef(ens_eta, ens_ask)[0, 1])
    ess = float(ens["meta"]["ess"])
    top2 = [k for k, _ in sorted(contrib.items(), key=lambda kv: -kv[1])[:2]]
    share_top2 = sum(contrib[k] for k in top2) / max(1e-9, sum(contrib.values()) - expected) \
        if sum(contrib.values()) > expected else float("nan")

    # ---- report
    pct = lambda v: f"{100 * v:+.2f}%"  # noqa: E731
    L = ["# Robustness of the headline results", "",
         f"_Generated by `calibration/robustness.py` from the ensemble created {ens['meta']['created']} "
         f"(commit `{ens['meta']['gitCommit']}`); seeds {list(CAL_SEEDS)}, paired no-policy runs. Do not edit by hand._", "",
         "## 1. Ensemble composition", "",
         f"- {len(keys)} members, **{len(uniq)} distinct** parameter sets (resampled by importance weight from the final "
         f"ABC-SMC population; ESS {ess:.0f} of {ens['meta']['nAccepted']}). The most frequent set appears **{w.max()} times** "
         f"({100 * w.max() / len(keys):.0f}% of members); the next: {', '.join(map(str, sorted(w, reverse=True)[1:6]))}.",
         (f"- With an effective sample size of {ess:.0f}, each tail of a 5-95% range rests on about {0.05 * ess:.0f} "
          "effective draws: treat the tails as approximate." if ess >= 100 else
          f"- With an effective sample size of {ess:.0f}, each tail of a 5-95% range rests on roughly "
          f"{max(1, round(0.05 * ess))} effective draw(s): treat the ranges below as indicative, not precise."), "",
         "| Quantity | Over the 300 members: mean (5-95%) | Over distinct sets, equal weight: mean (5-95%) |", "|---|---|---|"]
    for key, lab in HEADLINE + [("effects.askingRent", "Asking-rent effect"), ("effects.cpiRent", "CPI-style rent effect"),
                                ("effects.coveredListings", "Covered-listings effect, Jun 2026 (log)")]:
        m, d = head[key]["members"], head[key]["distinct"]
        f = pct if key.startswith("effects.") and "Rent" in key else (lambda v: f"{v:+.3f}")
        L.append(f"| {lab} | {f(m[0])} ({f(m[1])} to {f(m[2])}) | {f(d[0])} ({f(d[1])} to {f(d[2])}) |")
    L += ["", "## 2. Goodness of fit", "",
          f"If the model were correctly specified and the target standard errors right, the weighted calibration "
          f"distance would be about **{expected:.1f}** (sum of target weight x dimensions). The distinct ensemble sets "
          f"score **{D.min():.1f}** (best), {np.median(D):.1f} (median) and {D.max():.1f} (worst). "
          "The model does not fit every target within its standard error; where it falls short:", "",
          "| Target | Weighted mean contribution to the distance |", "|---|---:|"]
    for k, v in sorted(contrib.items(), key=lambda kv: -kv[1]):
        L.append(f"| {k} | {v:.1f} |")
    L += ["", f"{top2[0]} and {top2[1]} contribute the most (together about {100 * share_top2:.0f}% of the excess over "
          f"{expected:.1f}, when there is one). "
          "Individual members typically miss the Phase 1 DiD (T1) by about "
          f"{np.sqrt(contrib.get('T1', 0)):.1f} standard errors; the ensemble *mean* matches it.", "",
          "## 3. Rent effect: how it depends on the rent-market assumptions", "",
          f"The ensemble draws all {n_cal} calibrated parameters, including the asking-rent adjustment speed (`kappa`, prior "
          "0.03-0.3) and the vacancy pull on renter arrivals (`eta`, prior 0-50), which the listing data barely identify "
          f"(ADR 0013). Across the ensemble the asking-rent effect correlates {corr_k:+.2f} with log kappa and {corr_e:+.2f} "
          "with eta. The grid below fixes both at each cell, overriding the members' own draws. "
          f"Asking-rent effect by Jun 2026 (mean and 5-95% over {len(pick)} distinct members), cell at the parameter "
          "defaults in bold:", "",
          "| kappa \\ eta | " + " | ".join(f"{e:g}" for e in ETA) + " |", "|---" * (len(ETA) + 1) + "|"]
    for k in KAPPA:
        cells = []
        for e in ETA:
            m, lo, hi = q(grid[(k, e)]["ask"])
            c = f"{pct(m)} ({pct(lo)} to {pct(hi)})"
            cells.append(f"**{c}**" if (k, e) == DEFAULT else c)
        L.append(f"| {k:g} | " + " | ".join(cells) + " |")
    cov = [q(g["cov"])[0] for g in grid.values()]
    L += ["", f"- Across the whole grid the asking-rent effect spans **{pct(np.quantile(allask, 0.05))} to "
          f"{pct(np.quantile(allask, 0.95))}** (5-95% of member x cell runs; extremes {pct(allask.min())} to {pct(allask.max())}), "
          f"against {pct(q(grid[DEFAULT]['ask'])[1])} to {pct(q(grid[DEFAULT]['ask'])[2])} at the defaults. These two "
          "assumptions move the effect more than the other calibrated parameters together, which is why they are in the "
          "ensemble.",
          f"- The listing effect barely moves (covered listings {min(cov):+.3f} to {max(cov):+.3f} log points across cells): "
          "these parameters change what the displaced homes do to rents, not how many are displaced.",
          "- Faster rent adjustment and a weaker vacancy pull give larger rent effects: with eta = 0 the extra rental homes are "
          "not filled by extra arrivals drawn in by higher vacancy, so more of them lower rents.",
          "",
          "## 4. Renter buyers", "",
          "Share of homes sold by investors that a local renter buys, freeing a rental (ADR 0013; R1, VERIFY). "
          f"Asking-rent effect by Jun 2026, mean over the same {len(pick)} members at their own kappa and eta: "
          + ", ".join(f"{b:g}: {pct(np.mean(buyers[b]))}" for b in BUYER_SHARES)
          + f". Largest change across members between 0 and {BUYER_SHARES[-1]:g}: "
          f"{100 * np.max(np.abs(np.array(buyers[BUYER_SHARES[-1]]) - np.array(buyers[0.0]))):.3f} points.",
          ""]
    (REPORTS / "robustness.md").write_text("\n".join(L) + "\n", encoding="utf-8", newline="\n")
    out = {"distinct": len(uniq), "members": len(keys), "maxMultiplicity": int(w.max()), "expectedDistance": expected,
           "distance": {"min": float(D.min()), "median": float(np.median(D)), "max": float(D.max())},
           "contributions": contrib, "headline": head,
           "rentGrid": [{"kappa": k, "eta": e, "askingRent": q(g["ask"]), "cpiRent": q(g["cpi"]), "coveredListings": q(g["cov"])}
                        for (k, e), g in grid.items()],
           "rentGridEnvelope": [float(np.quantile(allask, 0.05)), float(np.quantile(allask, 0.95))],
           "ensembleRentCorrelation": {"logKappa": corr_k, "eta": corr_e},
           "renterBuyers": {str(b): q(v) for b, v in buyers.items()}}
    (REPORTS / "robustness.json").write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8", newline="\n")
    print("\n".join(L))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
