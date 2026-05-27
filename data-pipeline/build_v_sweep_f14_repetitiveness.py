"""V-sweep F-14 — topic repetitiveness (top-N word overlap between topics).

Per arxiv:2502.07352 (Yang et al., LLM-judge framework for topic eval).
F-14 = within-model overlap of top-N words across topics. Low overlap
means topics are diverse; high overlap means topics are repetitive
(common failure mode of LDA at fixed K).

For each phi matrix saved by build_v_sweep_canonical_fit, compute:
- topic_word_jaccard_top10: K x K matrix of jaccard(top10(k), top10(j))
- mean_pairwise_jaccard: average off-diagonal — the headline F-14 number.
  Lower is better; 0 = completely diverse topics.
- max_pairwise_jaccard: worst case.

Output: data/derived/v_sweep/f14_repetitiveness/{scene}_{V}_uniform_Q8.json
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

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
F14_DERIVED = DERIVED_DIR / "v_sweep" / "f14_repetitiveness"

TOP_N = 10


def jaccard_matrix(phi: np.ndarray, top_n: int) -> np.ndarray:
    K = phi.shape[0]
    top_sets = [set(np.argsort(phi[k])[::-1][:top_n].tolist()) for k in range(K)]
    out = np.zeros((K, K), dtype=np.float64)
    for i in range(K):
        for j in range(K):
            if i == j:
                out[i, j] = 1.0
                continue
            inter = len(top_sets[i] & top_sets[j])
            union = len(top_sets[i] | top_sets[j])
            out[i, j] = inter / max(union, 1)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-14 repetitiveness.")
    parser.add_argument("--top-n", type=int, default=TOP_N)
    args = parser.parse_args()

    F14_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = 0
    summary = []
    for fit_dir in sorted(SWEEP_LOCAL.glob("*")):
        phi_path = fit_dir / "phi.npy"
        if not phi_path.exists():
            continue
        stem = fit_dir.name
        parts = stem.rsplit("_", 2)
        if len(parts) != 3 or not parts[2].startswith("Q"):
            continue
        try:
            q = int(parts[2][1:])
        except ValueError:
            continue
        scheme = parts[1]
        sr = parts[0].rsplit("_", 1)
        if len(sr) != 2:
            continue
        scene_id, recipe = sr
        phi = np.load(phi_path)
        K = phi.shape[0]
        if K < 2:
            continue
        J = jaccard_matrix(phi, args.top_n)
        mask = ~np.eye(K, dtype=bool)
        off_diag = J[mask]
        rec = {
            "scene_id": scene_id, "recipe": recipe, "scheme": scheme, "Q": q,
            "K": int(K), "top_n": int(args.top_n),
            "mean_pairwise_jaccard": round(float(off_diag.mean()), 6),
            "max_pairwise_jaccard": round(float(off_diag.max()), 6),
            "n_redundant_pairs_above_0.5": int((off_diag > 0.5).sum() // 2),
            "generated_at": datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z"),
            "builder": "build_v_sweep_f14_repetitiveness v0.1",
        }
        out = F14_DERIVED / f"{scene_id}_{recipe}_{scheme}_Q{q}.json"
        with out.open("w", encoding="utf-8") as h:
            json.dump(rec, h, indent=2)
        n_ok += 1
        summary.append(rec)
        print(
            f"[f14] {scene_id} {recipe} K={K} "
            f"mean={rec['mean_pairwise_jaccard']:.3f} "
            f"max={rec['max_pairwise_jaccard']:.3f} "
            f"redundant={rec['n_redundant_pairs_above_0.5']}",
            flush=True,
        )

    if summary:
        from collections import defaultdict
        by_recipe = defaultdict(list)
        for r in summary:
            by_recipe[r["recipe"]].append(r["mean_pairwise_jaccard"])
        print("\n[f14] Per-recipe mean pairwise jaccard (lower = more diverse):",
              flush=True)
        for r in sorted(by_recipe, key=lambda x: int(x[1:])):
            v = by_recipe[r]
            print(f"    {r:5s} mean={np.mean(v):.4f} (n={len(v)})", flush=True)

    print(f"[f14] done. ok={n_ok}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
