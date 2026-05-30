"""V-sweep HDP backbone — Bayesian-nonparametric topic count inference.

Replaces LDA with gensim's Hierarchical Dirichlet Process (HDP), which
infers the topic count K from the data instead of fixing it. For each
(V, scene), we fit HDP on the same doc_term matrix that LDA used and
report:

- inferred_K: number of topics with non-trivial mass after truncation
- F-2-equivalent: c_v coherence on top-10 words per inferred topic
- F-14-equivalent: mean off-diagonal top-10 jaccard
- F-16 model-selection adequacy: |inferred_K − ground_truth_classes|

Output: data/derived/v_sweep/hdp_backbone/{scene}_{V}_uniform_Q8.json

This addresses issue #621 (HDP backend + F-16). Forms the first row of
the factorial sweep (#617).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
HDP_DERIVED = DERIVED_DIR / "v_sweep" / "hdp_backbone"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]
RANDOM_STATE = 42
TOP_N = 10
EPS = 1e-12

CLASS_COUNTS = {
    "indian-pines-corrected": 16, "salinas-corrected": 16,
    "salinas-a-corrected": 6, "pavia-university": 9,
    "kennedy-space-center": 13, "botswana": 14,
}


def load_doc_term(recipe: str, scene_id: str) -> sp.csr_matrix | None:
    p = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id / "doc_term.npz"
    if not p.exists():
        return None
    return sp.load_npz(p).tocsr()


def csr_to_gensim_corpus(mat: sp.csr_matrix) -> list[list[tuple[int, int]]]:
    """Convert scipy CSR to gensim's list-of-(token_id, count) per doc."""
    corpus = []
    for row_idx in range(mat.shape[0]):
        start = mat.indptr[row_idx]
        end = mat.indptr[row_idx + 1]
        cols = mat.indices[start:end].tolist()
        vals = mat.data[start:end].tolist()
        corpus.append([(int(c), int(v)) for c, v in zip(cols, vals) if v > 0])
    return corpus


def fit_hdp(doc_term: sp.csr_matrix, scene_id: str, recipe: str):
    from gensim.models import HdpModel
    from gensim.corpora import Dictionary

    D, V = doc_term.shape
    corpus = csr_to_gensim_corpus(doc_term)
    id2token = {i: f"w{i:05d}" for i in range(V)}
    # gensim HDP needs a Dictionary; build a synthetic one
    dictionary = Dictionary()
    dictionary.id2token = id2token
    dictionary.token2id = {v: k for k, v in id2token.items()}
    dictionary.cfs = {}
    dictionary.dfs = {}
    dictionary.num_docs = D

    t0 = time.perf_counter()
    hdp = HdpModel(
        corpus=corpus,
        id2word=dictionary,
        T=20,  # truncation level
        K=8,   # second-level truncation
        random_state=RANDOM_STATE,
    )
    fit_secs = time.perf_counter() - t0

    # Extract topic-word distributions
    phi = hdp.get_topics()  # (T_eff, V)
    if phi.shape[1] != V:
        # gensim may truncate vocab; pad with zeros
        pad = np.zeros((phi.shape[0], V - phi.shape[1]), dtype=phi.dtype)
        phi = np.concatenate([phi, pad], axis=1)
    K_inferred = phi.shape[0]

    # Topic prevalence via projecting the corpus through the inferred HDP
    # and counting topics that hold meaningful posterior mass. gensim's
    # HdpModel doesn't expose theta directly; we approximate prevalence
    # by the L1-norm of each topic's word distribution after subtracting
    # the uniform baseline, then count topics whose prevalence is at
    # least 5% of the maximum. This better tracks the 'effective' K than
    # truncation level alone.
    if phi.shape[1] > 0:
        uniform = 1.0 / phi.shape[1]
        deviation = np.abs(phi - uniform).sum(axis=1)  # L1 from uniform
        if deviation.max() > 0:
            normalised = deviation / deviation.max()
            K_effective = int((normalised > 0.05).sum())
        else:
            K_effective = 0
    else:
        K_effective = 0

    n_classes = CLASS_COUNTS.get(scene_id, 0)
    f16 = abs(K_effective - n_classes) if n_classes else None

    # F-14 jaccard repetitiveness
    n_words = min(TOP_N, V)
    top_sets = [set(np.argsort(phi[k])[::-1][:n_words].tolist()) for k in range(K_inferred)]
    pair_jaccard = []
    for i in range(K_inferred):
        for j in range(i + 1, K_inferred):
            inter = len(top_sets[i] & top_sets[j])
            union = len(top_sets[i] | top_sets[j])
            pair_jaccard.append(inter / max(union, 1))
    mean_jacc = float(np.mean(pair_jaccard)) if pair_jaccard else 0.0

    # F-2 c_v on inferred topics
    binary = (doc_term > 0).astype(np.float32).tocsr()
    doc_freq = np.asarray(binary.sum(axis=0)).reshape(-1)
    Dn = binary.shape[0]
    per_topic_cv = []
    for k in range(K_inferred):
        words = list(np.argsort(phi[k])[::-1][:n_words])
        nw = len(words)
        if nw < 2:
            per_topic_cv.append(0.0)
            continue
        sub = binary[:, words]
        co = (sub.T @ sub).toarray()
        npmi_mat = np.zeros((nw, nw), dtype=np.float64)
        for i in range(nw):
            pi = doc_freq[words[i]] / Dn if doc_freq[words[i]] > 0 else EPS
            for j in range(nw):
                if i == j:
                    npmi_mat[i, j] = 1.0
                    continue
                pj = doc_freq[words[j]] / Dn if doc_freq[words[j]] > 0 else EPS
                pij = co[i, j] / Dn if co[i, j] > 0 else EPS
                num = np.log(pij / max(pi * pj, EPS))
                den = -np.log(max(pij, EPS))
                npmi_mat[i, j] = float(num / den) if den > EPS else 0.0
        centroid = npmi_mat.mean(axis=0, keepdims=True)
        norms = np.linalg.norm(npmi_mat, axis=1)
        cn = float(np.linalg.norm(centroid))
        if cn < EPS:
            per_topic_cv.append(0.0)
            continue
        cv = float(((npmi_mat @ centroid.T).reshape(-1) / np.maximum(norms * cn, EPS)).mean())
        per_topic_cv.append(cv)
    c_v = float(np.mean(per_topic_cv)) if per_topic_cv else 0.0

    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "backbone": "HDP",
        "T_truncation": 20, "K_inferred_total": int(K_inferred),
        "K_effective": int(K_effective),
        "K_ground_truth_classes": n_classes,
        "f16_model_selection_adequacy": f16,
        "f2_c_v": round(c_v, 6),
        "f14_mean_pairwise_jaccard": round(mean_jacc, 6),
        "fit_seconds": round(fit_secs, 3),
        "D": int(D), "V": int(V),
        "topic_deviation_top5": [round(float(x), 6) for x in sorted(deviation)[::-1][:5]] if phi.shape[1] > 0 else [],
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_hdp v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep HDP backbone.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    HDP_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            dt = load_doc_term(recipe, scene)
            if dt is None:
                n_skip += 1
                continue
            try:
                res = fit_hdp(dt, scene, recipe)
            except Exception as exc:
                print(f"[hdp] {tag} FAILED: {exc}", flush=True)
                n_skip += 1
                continue
            out = HDP_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            n_ok += 1
            print(
                f"[hdp] {scene} {recipe} K_eff={res['K_effective']} "
                f"(GT={res['K_ground_truth_classes']}) "
                f"|delta|={res['f16_model_selection_adequacy']} "
                f"c_v={res['f2_c_v']:.3f} "
                f"jacc={res['f14_mean_pairwise_jaccard']:.3f}",
                flush=True,
            )
    print(f"[hdp] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
