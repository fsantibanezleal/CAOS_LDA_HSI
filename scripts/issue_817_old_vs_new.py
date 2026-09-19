"""Old versus new values of every artefact changed by issue #817.

Reads the old artefacts from a git revision (default 6ae54de, develop before
the fixes) and the new ones from the working tree, and prints:

1. F-15 per recipe (six-scene mean) and per cell: archived, the archived argsort
   rule on the current corpus, and the tie-invariant rule; expected outcomes,
   tie-dependent and short documents, cells where the rule cannot say NO; and
   Spearman coefficients of F-15 against N_eff(phi) and |V| (P5 Fig. 1: with the
   figure script's argsort ranks and with average ranks for ties; N_eff needs
   data/local/v_sweep/lda_fits and is skipped without it).
2. HDP backbone V15 (F-2 c_v, F-14 Jaccard, K_eff, N_eff) and the HDP F-2 ranking.
3. F-7 across backbones: the 19 x 4 matrix of six-scene means, per-backbone
   winners, the top-12 by four-backbone mean, cross-backbone sd, HDP kept-topic
   counts and the ceiling min(1, log2 K / H(Y)).
4. The hierarchical Bayesian F-1 comparisons: locations, HDI94, R-hat, ESS, P(a > b).

Usage: python scripts/issue_817_old_vs_new.py [--base 6ae54de] [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
V_SWEEP = "data/derived/v_sweep"
SCENES = ["indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
          "pavia-university", "kennedy-space-center", "botswana"]
SHORT = {"indian-pines-corrected": "IP", "salinas-corrected": "Sal", "salinas-a-corrected": "SalA",
         "pavia-university": "PavU", "kennedy-space-center": "KSC", "botswana": "Bot"}
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
BACKBONES = ["LDA", "HDP", "ProdLDA", "ETM"]


def old_json(base: str, rel: str) -> dict | None:
    res = subprocess.run(["git", "-C", str(ROOT), "show", f"{base}:{rel}"],
                         capture_output=True, text=True, encoding="utf-8")
    return json.loads(res.stdout) if res.returncode == 0 else None


def new_json(rel: str) -> dict | None:
    p = ROOT / rel
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def spearman_argsort(a, b) -> float:
    """As figures/source/build_p5_dispersion_scatter.py: ranks by argsort (ties broken by order)."""
    ar, br = np.argsort(np.argsort(a)), np.argsort(np.argsort(b))
    return float(np.corrcoef(ar, br)[0, 1])


def spearman_avg(a, b) -> float:
    from scipy.stats import spearmanr
    return float(spearmanr(a, b).statistic)


def section_f15(base: str, out: dict) -> None:
    print("\n=== 1. F-15 (six-scene means) ===")
    print("recipe  archived  argsort-on-current-corpus  tie-invariant  E[aligned/misaligned/ambiguous] of 120  "
          "tie-dependent  <3-token docs  cells never-NO")
    rows = {}
    for r in RECIPES:
        o, n = [], []
        agg = {"eY": 0.0, "eN": 0.0, "eA": 0.0, "tied": 0, "short": 0, "forced": 0, "legacy": [], "V": None}
        for s in SCENES:
            rel = f"{V_SWEEP}/f15_llm_alignment/{s}_{r}_uniform_Q8.json"
            a, b = old_json(base, rel), new_json(rel)
            o.append(a["f15_alignment"])
            n.append(b["f15_alignment"])
            agg["legacy"].append(b.get("f15_alignment_legacy_argsort", float("nan")))
            agg["eY"] += b.get("expected_yes", 0.0)
            agg["eN"] += b.get("expected_no", 0.0)
            agg["eA"] += b.get("expected_ambiguous", 0.0)
            agg["tied"] += b.get("n_docs_tie_dependent", 0)
            agg["short"] += b.get("n_docs_fewer_than_3_tokens", 0)
            agg["forced"] += int(b.get("no_verdict_impossible_vocab", False)
                                 or b.get("n_docs_fewer_than_3_tokens", 0) == b.get("n_docs", -1))
            agg["V"] = agg["V"] or b.get("V")
        rows[r] = {"old": o, "new": n, **agg}
    for r in sorted(RECIPES, key=lambda x: -st.mean(rows[x]["new"])):
        x = rows[r]
        print(f"{r:5s}  {st.mean(x['old']):.3f}     {st.mean(x['legacy']):.3f}                      "
              f"{st.mean(x['new']):.3f}          {x['eY']:6.2f}/{x['eN']:6.2f}/{x['eA']:5.2f}"
              f"                  {x['tied']:3d}            {x['short']:3d}            {x['forced']}/6")
    print("\nper cell, new (archived):")
    for r in RECIPES:
        print(f"{r:5s} " + "  ".join(f"{SHORT[s]} {a:.3f} ({b:.3f})"
                                     for s, a, b in zip(SCENES, rows[r]["new"], rows[r]["old"])))
    out["f15"] = {r: {"old": rows[r]["old"], "new": rows[r]["new"], "legacy_on_current": rows[r]["legacy"]}
                  for r in RECIPES}
    fits = ROOT / "data" / "local" / "v_sweep" / "lda_fits"
    if not fits.is_dir():
        print("(data/local/v_sweep/lda_fits missing: Spearman against N_eff skipped)")
        return

    def neff(p):
        p = p[p > 0]
        p = p / p.sum()
        return float(np.exp(-(p * np.log(p)).sum()))

    n_eff = {r: float(np.mean([np.mean([neff(ph) for ph in np.load(fits / f"{s}_{r}_uniform_Q8" / "phi.npy")
                                        .astype(np.float64)]) for s in SCENES])) for r in RECIPES}
    v_nom = {r: rows[r]["V"] for r in RECIPES}
    print("\nSpearman (P5 Fig. 1), F-15 against N_eff(phi) and |V| (Indian Pines):")
    for label, key in (("archived", "old"), ("tie-invariant", "new")):
        for excluded in ({"V15"}, set()):
            rr = [r for r in RECIPES if r not in excluded]
            f = np.array([st.mean(rows[r][key]) for r in rr])
            ne = np.array([n_eff[r] for r in rr])
            vv = np.array([v_nom[r] for r in rr], dtype=float)
            print(f"  {label:14s} {len(rr)} recipes (V15 {'excluded' if excluded else 'included'}): "
                  f"argsort ranks rho(N_eff) {spearman_argsort(f, ne):+.2f}, rho(|V|) {spearman_argsort(f, vv):+.2f}; "
                  f"average ranks rho(N_eff) {spearman_avg(f, ne):+.2f}, rho(|V|) {spearman_avg(f, vv):+.2f}")


def section_hdp(base: str, out: dict) -> None:
    print("\n=== 2. HDP backbone, V15 at Q = 8 ===")
    keys = ["V", "f2_c_v", "f14_mean_pairwise_jaccard", "K_effective", "N_eff_topics",
            "f16_model_selection_adequacy"]
    for s in SCENES:
        rel = f"{V_SWEEP}/hdp_backbone/{s}_V15_uniform_Q8.json"
        a, b = old_json(base, rel), new_json(rel)
        print(f"  {SHORT[s]:5s} " + "  ".join(f"{k} old {a.get(k)} new {b.get(k)}" for k in keys))
    means = {}
    for label, getter in (("old", lambda rel: old_json(base, rel)), ("new", new_json)):
        means[label] = {r: st.mean(getter(f"{V_SWEEP}/hdp_backbone/{s}_{r}_uniform_Q8.json")["f2_c_v"]
                                   for s in SCENES) for r in RECIPES}
        rank = sorted(RECIPES, key=lambda r: -means[label][r])
        print(f"  HDP F-2 ranking ({label}): " + ", ".join(f"{r} {means[label][r]:.3f}" for r in rank))
    out["hdp_f2_means"] = means
    # P3 cross-axis correlation figure (figures/source/build_p3_axis_correlation.py): HDP row.
    cols = [("F-1", "f1_per_fold", "topic_routed_soft_mean"), ("F-2", "f2_coherence", "c_v"),
            ("F-7", "f7_topic_to_label", "normalised_mi"), ("F-14", "f14_repetitiveness", "mean_pairwise_jaccard"),
            ("F-18", "f18_reliability", "frac_above_0.7"), ("F-22", "f22_counterfactual", "counterfactual_l1_median"),
            ("ProdLDA", "prodlda_backbone", "f2_c_v"), ("ETM", "etm_backbone", "f2_c_v")]
    cells = [(s, r) for s in SCENES for r in RECIPES]
    other = {lab: np.array([new_json(f"{V_SWEEP}/{d}/{s}_{r}_uniform_Q8.json")[k] for s, r in cells], dtype=float)
             for lab, d, k in cols}
    other["F-14"] = -other["F-14"]
    # P4 cross-backbone affinity A(V) = mean over LDA / HDP / ProdLDA / ETM of the within-backbone
    # min-max normalised six-scene F-2 c_v.
    f2dirs = {"LDA": ("f2_coherence", "c_v"), "ProdLDA": ("prodlda_backbone", "f2_c_v"),
              "ETM": ("etm_backbone", "f2_c_v")}
    f2 = {b: {r: st.mean(new_json(f"{V_SWEEP}/{d}/{s}_{r}_uniform_Q8.json")[k] for s in SCENES) for r in RECIPES}
          for b, (d, k) in f2dirs.items()}
    for label in ("old", "new"):
        f2["HDP"] = means[label]
        aff = {}
        for r in RECIPES:
            parts = []
            for b in ("LDA", "HDP", "ProdLDA", "ETM"):
                lo, hi = min(f2[b].values()), max(f2[b].values())
                parts.append((f2[b][r] - lo) / (hi - lo))
            aff[r] = st.mean(parts)
        print(f"  P4 affinity ({label}): " + ", ".join(f"{r} {aff[r]:.2f}" for r in sorted(RECIPES, key=lambda x: -aff[x])))
    for label, getter in (("old", lambda rel: old_json(base, rel)), ("new", new_json)):
        hdp = np.array([getter(f"{V_SWEEP}/hdp_backbone/{s}_{r}_uniform_Q8.json")["f2_c_v"] for s, r in cells])
        print(f"  P3 axis-correlation HDP row ({label}, 114 cells): " + ", ".join(
            f"{lab} {spearman_argsort(hdp, v):+.2f} (avg-rank {spearman_avg(hdp, v):+.2f})" for lab, v in other.items()))


def f7_matrix(getter, backbone: str, recipe: str) -> tuple[list[float], list[dict]]:
    vals, recs = [], []
    for s in SCENES:
        if backbone == "LDA":
            rec = getter(f"{V_SWEEP}/f7_topic_to_label/{s}_{recipe}_uniform_Q8.json")
        else:
            rec = getter(f"{V_SWEEP}/backbones_f7/{backbone.lower()}_{s}_{recipe}_uniform_Q8.json")
        vals.append(rec["normalised_mi"])
        recs.append(rec)
    return vals, recs


def section_f7(base: str, out: dict) -> None:
    print("\n=== 3. F-7 across backbones (six-scene means, Q = 8) ===")
    res = {}
    for label, getter in (("old", lambda rel: old_json(base, rel)), ("new", new_json)):
        m = {}
        for b in BACKBONES:
            for r in RECIPES:
                vals, recs = f7_matrix(getter, b, r)
                m[(b, r)] = (st.mean(vals), vals, recs)
        res[label] = m
    print("recipe " + " ".join(f"{b:>15s}" for b in BACKBONES) + "   mean old/new   sd old/new   (cells: old/new)")
    for r in RECIPES:
        cells = []
        for b in BACKBONES:
            o, n = res["old"][(b, r)][0], res["new"][(b, r)][0]
            cells.append(f"{o:.3f}/{n:.3f}" if abs(o - n) > 5e-7 else f"{n:.3f}      ")
        mo = st.mean(res["old"][(b, r)][0] for b in BACKBONES)
        mn = st.mean(res["new"][(b, r)][0] for b in BACKBONES)
        so = st.pstdev([res["old"][(b, r)][0] for b in BACKBONES])
        sn = st.pstdev([res["new"][(b, r)][0] for b in BACKBONES])
        print(f"{r:5s}  " + " ".join(f"{c:>15s}" for c in cells) + f"   {mo:.3f}/{mn:.3f}    {so:.3f}/{sn:.3f}")
    for label in ("old", "new"):
        m = res[label]
        winners = {b: max(RECIPES, key=lambda r: m[(b, r)][0]) for b in BACKBONES}
        four = {r: st.mean(m[(b, r)][0] for b in BACKBONES) for r in RECIPES}
        top = sorted(RECIPES, key=lambda r: -four[r])[:12]
        print(f"\n[{label}] per-backbone winners: " + ", ".join(f"{b} {w} {m[(b, w)][0]:.3f}"
                                                            for b, w in winners.items()))
        print(f"[{label}] top-12 by four-backbone mean: " + ", ".join(f"{r} {four[r]:.3f}" for r in top))
    print("\nK per cell for ProdLDA / ETM (new) and HDP kept topics (distinct argmax topics / K_eff):")
    for r in RECIPES:
        k = [res["new"][("ProdLDA", r)][2][i].get("K") for i in range(6)]
        hdp = res["new"][("HDP", r)][2]
        ku = [h.get("K_used_argmax") for h in hdp]
        ke = [h.get("K_effective") for h in hdp]
        caps = [h.get("f7_upper_bound") for h in hdp]
        print(f"  {r:5s} ProdLDA/ETM K {k}  HDP K_used {ku} (mean {np.mean([x for x in ku if x is not None]) if any(ku) else float('nan'):.1f})"
              f"  K_eff {ke}  HDP ceiling {[round(c, 3) if c is not None else None for c in caps]}")
    hdp_f7 = [res["new"][("HDP", r)][0] for r in RECIPES]
    hdp_k = [np.mean([h.get("K_used_argmax") or np.nan for h in res["new"][("HDP", r)][2]]) for r in RECIPES]
    if not np.isnan(hdp_k).any():
        print(f"\nSpearman(HDP F-7, mean distinct argmax topics) over 19 recipes: "
              f"{spearman_avg(hdp_f7, hdp_k):+.2f}")
        near_zero = [(r, SHORT[s]) for r in RECIPES for s, v in zip(SCENES, res["new"][("HDP", r)][1]) if v < 0.01]
        print(f"HDP cells with F-7 < 0.01: {len(near_zero)}: {near_zero}")
    out["f7"] = {label: {f"{b}|{r}": res[label][(b, r)][1] for b in BACKBONES for r in RECIPES}
                 for label in ("old", "new")}


def section_bayes(base: str, out: dict) -> None:
    print("\n=== 4. Hierarchical Bayesian F-1 comparisons ===")
    arts = {
        "labelled": ("data/derived/method_statistics_labelled/cross_classification_bayesian.json", "raw_logistic"),
        "labelled_deep": ("data/derived/method_statistics_labelled/cross_classification_bayesian_deep.json",
                          "raw_logistic"),
        "hidsag_classification": ("data/derived/method_statistics_hidsag/cross_classification_bayesian.json",
                                  "raw_logistic_regression"),
        "hidsag_regression": ("data/derived/method_statistics_hidsag/cross_regression_bayesian.json",
                              "raw_ridge_regression"),
    }
    for name, (rel, ref) in arts.items():
        a, b = old_json(base, rel), new_json(rel)
        d = b.get("diagnostics", {})
        print(f"\n[{name}] {d.get('chains')} chains, divergences {d.get('divergences')}, max R-hat {d.get('max_r_hat')}, "
              f"min ESS bulk/tail {d.get('min_ess_bulk')}/{d.get('min_ess_tail')}")
        om = {m["method"]: m for m in a["method_posteriors"]}
        for m in sorted(b["method_posteriors"], key=lambda x: -x["posterior_mean"]):
            o = om[m["method"]]
            po = a["pairwise_p_a_gt_b"].get(m["method"], {}).get(ref)
            pn = b["pairwise_p_a_gt_b"].get(m["method"], {}).get(ref)
            print(f"  {m['method']:40s} old {o['posterior_mean']:.3f} [{o['hdi94_lo']:.3f}, {o['hdi94_hi']:.3f}]  "
                  f"new {m['posterior_mean']:.3f} [{m['hdi94_lo']:.3f}, {m['hdi94_hi']:.3f}] observed "
                  f"{m.get('observed_mean', float('nan')):.3f} R-hat {m.get('r_hat')} ESS "
                  f"{m.get('ess_bulk')}/{m.get('ess_tail')}  P(>{ref}) old {po} new {pn}")
        out[name] = {"old": a["method_posteriors"], "new": b["method_posteriors"]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", default="6ae54de")
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args()
    out: dict = {"base": args.base}
    section_f15(args.base, out)
    section_hdp(args.base, out)
    section_f7(args.base, out)
    section_bayes(args.base, out)
    if args.json:
        args.json.write_text(json.dumps(out, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
