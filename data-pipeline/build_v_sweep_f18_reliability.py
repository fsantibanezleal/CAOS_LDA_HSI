"""V-sweep F-18 — Maier 2024 reliability beyond seed stability.

From arxiv:2410.23186: the "reliability" of a topic model is the
proportion of topic pairs (over reseed runs) whose top-N word lists
share enough overlap to be considered the same topic. Maier uses
cosine similarity > 0.7 on the *top-N word indicator vectors* as the
threshold; we expose both 0.5 and 0.7 thresholds.

For each (V, scene) we:
- refit LDA with N_SEEDS = 5 distinct random_states (42, 43, 44, 45, 46)
- for every pair of seeds, Hungarian-align topics by top-10 word
  cosine similarity over the indicator vector
- count what fraction of matched pairs cross the threshold
- average across pairs

Output: data/derived/v_sweep/f18_reliability/{scene}_{V}_uniform_Q8.json

Costs ~ N_SEEDS / 1 LDA refits per (V, scene), i.e. 5x compute over
the canonical fit. With 6 scenes * 12 V = 72 cells * 5 seeds = 360
LDA fits. Per-V K-policy carried from canonical_fit.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.optimize import linear_sum_assignment
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F18_DERIVED = DERIVED_DIR / "v_sweep" / "f18_reliability"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
N_SEEDS = 5
SEEDS = [42, 43, 44, 45, 46]
TOP_N = 10
THRESHOLDS = [0.5, 0.7]

LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20


def class_count_for(scene_id: str) -> int:
    return {
        "indian-pines-corrected": 16,
        "salinas-corrected": 16,
        "salinas-a-corrected": 6,
        "pavia-university": 9,
        "kennedy-space-center": 13,
        "botswana": 14,
    }.get(scene_id, 0)


def k_for(scene_id: str, mean_doc: float) -> int:
    cls = class_count_for(scene_id)
    upper = max(4, min(12, cls)) if cls > 0 else 12
    if mean_doc < 2.5:
        return max(3, min(upper, 4))
    if mean_doc < 8:
        return max(3, min(upper, int(round(mean_doc / 2))))
    return upper


def load_doc_term(recipe: str, scene_id: str) -> sp.csr_matrix | None:
    p = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id / "doc_term.npz"
    if not p.exists():
        return None
    return sp.load_npz(p).tocsr()


def fit_one(doc_term: sp.csr_matrix, K: int, seed: int) -> np.ndarray:
    lda = LatentDirichletAllocation(
        n_components=K, learning_method="online", max_iter=LDA_MAX_ITER,
        batch_size=512, evaluate_every=-1, random_state=seed,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    lda.fit(doc_term)
    phi = lda.components_
    return phi / phi.sum(axis=1, keepdims=True)


def top_n_indicator(phi: np.ndarray, n: int) -> np.ndarray:
    K, V = phi.shape
    out = np.zeros((K, V), dtype=np.float32)
    for k in range(K):
        top = np.argsort(phi[k])[::-1][:n]
        out[k, top] = 1.0
    return out


def matched_cosines(ind_a: np.ndarray, ind_b: np.ndarray) -> np.ndarray:
    """Hungarian-align topics in B to topics in A by cosine. Return the
    matched cosine values (length K)."""
    na = np.linalg.norm(ind_a, axis=1, keepdims=True)
    nb = np.linalg.norm(ind_b, axis=1, keepdims=True)
    cos = (ind_a @ ind_b.T) / np.maximum(na * nb.T, 1e-12)
    cost = -cos
    row_idx, col_idx = linear_sum_assignment(cost)
    return cos[row_idx, col_idx]


def for_cell(recipe: str, scene_id: str) -> dict | None:
    doc_term = load_doc_term(recipe, scene_id)
    if doc_term is None:
        return None
    mean_doc = float(np.asarray(doc_term.sum(axis=1)).reshape(-1).mean())
    K = k_for(scene_id, mean_doc)
    phis = []
    for seed in SEEDS:
        try:
            phis.append(fit_one(doc_term, K, seed))
        except Exception as exc:
            print(f"  fit failed at seed {seed}: {exc}", flush=True)
            continue
    if len(phis) < 2:
        return None
    indicators = [top_n_indicator(p, TOP_N) for p in phis]
    pair_cosines = []
    for i in range(len(indicators)):
        for j in range(i + 1, len(indicators)):
            pair_cosines.append(matched_cosines(indicators[i], indicators[j]))
    pair_cosines = np.array(pair_cosines)  # (n_pairs, K)
    mean_cos = float(pair_cosines.mean())
    per_threshold = {
        f"frac_above_{t}": float((pair_cosines > t).mean())
        for t in THRESHOLDS
    }
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "n_seeds": int(len(phis)), "top_n": TOP_N,
        "seeds_used": SEEDS[: len(phis)],
        "mean_matched_cosine": round(mean_cos, 6),
        **{k: round(v, 6) for k, v in per_threshold.items()},
        "per_pair_cosine_mean_per_topic": [
            round(float(x), 6) for x in pair_cosines.mean(axis=0).tolist()
        ],
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f18_reliability v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-18 reliability.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    F18_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            print(f"[f18] {tag} ...", flush=True)
            try:
                res = for_cell(recipe, scene)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                n_skip += 1
                continue
            if res is None:
                n_skip += 1
                continue
            out_path = F18_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out_path.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            n_ok += 1
            print(
                f"  K={res['K']} cos_mean={res['mean_matched_cosine']:.3f}  "
                f">0.5: {res['frac_above_0.5']:.3f}  "
                f">0.7: {res['frac_above_0.7']:.3f}",
                flush=True,
            )
    print(f"[f18] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
