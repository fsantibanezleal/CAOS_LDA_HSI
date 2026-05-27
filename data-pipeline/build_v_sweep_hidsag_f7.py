"""HIDSAG F-7 — NMI of topic-argmax against sample-owner ID.

The HIDSAG region documents come from physical mineral samples; each
document carries a `sample_owner` integer that identifies which sample
it came from (e.g. MINERAL1 has 99 owners × 9 docs = 891 documents).
Using sample_owner as the "label" we can compute F-7-style NMI: how
much do the topics carry sample-membership information?

This is a more interesting question for mineralogy than the labelled-
scene F-7 because each sample is a unique mineralogical entity; topics
that capture per-sample chemistry will score high here, while topics
that capture generic spectral patterns will score low.

Output: data/derived/v_sweep/hidsag/f7_topic_to_owner/{subset}_{V}_uniform_Q8.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

HIDSAG_NPZ = DATA_DIR / "derived" / "core" / "hidsag_region_documents.npz"
SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits_hidsag"
F7_DERIVED = DERIVED_DIR / "v_sweep" / "hidsag" / "f7_topic_to_owner"

SUBSETS = ["GEOCHEM", "GEOMET", "MINERAL1", "MINERAL2", "PORPHYRY"]
RECIPES = [f"V{i}" for i in range(1, 13)]
EPS = 1e-12


def entropy(p):
    p = np.clip(p, EPS, None)
    p = p / p.sum()
    return float(-np.sum(p * np.log2(p)))


def compute_f7(theta: np.ndarray, owners: np.ndarray) -> dict:
    z = np.argmax(theta, axis=1)
    K = theta.shape[1]
    classes = np.array(sorted(int(c) for c in np.unique(owners)))
    C = classes.size
    cls_idx = {c: i for i, c in enumerate(classes.tolist())}
    owner_idx = np.array([cls_idx[int(c)] for c in owners])

    p_owner = np.bincount(owner_idx, minlength=C).astype(np.float64)
    p_owner /= max(p_owner.sum(), EPS)
    H_owner = entropy(p_owner)

    p_topic = np.bincount(z, minlength=K).astype(np.float64)
    p_topic /= max(p_topic.sum(), EPS)

    H_cond_terms = []
    for k in range(K):
        mask = z == k
        if mask.sum() == 0:
            continue
        p_lk = np.bincount(owner_idx[mask], minlength=C).astype(np.float64)
        p_lk /= p_lk.sum()
        H_cond_terms.append(p_topic[k] * entropy(p_lk))
    H_cond = float(np.sum(H_cond_terms))
    mi = H_owner - H_cond
    return {
        "n_owners": int(C),
        "K": int(K),
        "H_owner_bits": round(H_owner, 6),
        "H_owner_given_topic_bits": round(H_cond, 6),
        "mutual_information_bits": round(mi, 6),
        "normalised_mi": round(mi / max(H_owner, EPS), 6),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="HIDSAG F-7 by sample-owner.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--subsets", nargs="+", default=SUBSETS, choices=SUBSETS)
    args = parser.parse_args()

    if not HIDSAG_NPZ.exists():
        print(f"HIDSAG npz not found: {HIDSAG_NPZ}", flush=True)
        return 1
    npz = np.load(HIDSAG_NPZ, allow_pickle=True)

    F7_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    summary = []
    for subset in args.subsets:
        owners_key = f"{subset}__sample_owner"
        if owners_key not in npz:
            continue
        owners = npz[owners_key]
        for recipe in args.recipes:
            fit_dir = SWEEP_LOCAL / f"{subset}_{recipe}_uniform_Q8"
            theta_path = fit_dir / "theta.npy"
            if not theta_path.exists():
                n_skip += 1
                continue
            theta = np.load(theta_path)
            if theta.shape[0] != len(owners):
                n_skip += 1
                continue
            try:
                res = compute_f7(theta, owners)
            except Exception as exc:
                n_skip += 1
                print(f"[hidsag_f7] {subset} {recipe} FAILED: {exc}", flush=True)
                continue
            res.update({
                "subset": subset, "recipe": recipe, "scheme": "uniform", "Q": 8,
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_v_sweep_hidsag_f7 v0.1",
            })
            out = F7_DERIVED / f"{subset}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            n_ok += 1
            summary.append(res)
            print(
                f"[hidsag_f7] {subset:10s} {recipe:5s} K={res['K']:2d} "
                f"n_owners={res['n_owners']:3d} NMI={res['normalised_mi']:.3f}",
                flush=True,
            )

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["normalised_mi"])
        print("\n[hidsag_f7] Per-recipe mean NMI (vs sample_owner):", flush=True)
        for r in sorted(by_recipe, key=lambda x: int(x[1:])):
            v = by_recipe[r]
            print(f"    {r:5s} mean={np.mean(v):.4f} (n={len(v)})", flush=True)

    print(f"\n[hidsag_f7] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
