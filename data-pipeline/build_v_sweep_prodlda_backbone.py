"""V-sweep ProdLDA backbone — factorial backbone row (#617 second row).

Reuses the ProdLDA implementation from build_neural_topic_models.py
and runs it on each (V, scene) doc_term matrix instead of just V1.

This is the second backbone in the factorial study (LDA was the
first; HDP was the third). Together with LDA + HDP we have three
backbones × 13 recipes = 39 cells covering 3 of the 5 backbones
proposed in #617.

For each cell we compute:
- F-2 c_v on the inferred topics
- F-14 jaccard repetitiveness
- ProdLDA-specific: ELBO at convergence

Output: data/derived/v_sweep/prodlda_backbone/{scene}_{V}_uniform_Q8.json
"""
from __future__ import annotations

import argparse
import importlib.util
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

_PIPE = ROOT / "data-pipeline"
_spec = importlib.util.spec_from_file_location("neural_models", _PIPE / "build_neural_topic_models.py")
_neural = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_neural)

WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
PROD_DERIVED = DERIVED_DIR / "v_sweep" / "prodlda_backbone"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 14)]
TOP_N = 10
EPS = 1e-12

CLASS_COUNTS = {
    "indian-pines-corrected": 16, "salinas-corrected": 16,
    "salinas-a-corrected": 6, "pavia-university": 9,
    "kennedy-space-center": 13, "botswana": 14,
}


def load_doc_term(recipe: str, scene_id: str):
    p = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id / "doc_term.npz"
    if not p.exists():
        return None
    return sp.load_npz(p).tocsr()


def k_for(scene_id: str, mean_doc: float) -> int:
    cls = CLASS_COUNTS.get(scene_id, 0)
    upper = max(4, min(12, cls)) if cls > 0 else 12
    if mean_doc < 2.5:
        return max(3, min(upper, 4))
    if mean_doc < 8:
        return max(3, min(upper, int(round(mean_doc / 2))))
    return upper


def compute_f2_f14(phi: np.ndarray, doc_term: sp.csr_matrix) -> dict:
    K, V = phi.shape
    n_words = min(TOP_N, V)
    # F-14 jaccard
    top_sets = [set(np.argsort(phi[k])[::-1][:n_words].tolist()) for k in range(K)]
    pair_jacc = []
    for i in range(K):
        for j in range(i + 1, K):
            inter = len(top_sets[i] & top_sets[j])
            union = len(top_sets[i] | top_sets[j])
            pair_jacc.append(inter / max(union, 1))
    mean_jacc = float(np.mean(pair_jacc)) if pair_jacc else 0.0

    # F-2 c_v
    binary = (doc_term > 0).astype(np.float32).tocsr()
    doc_freq = np.asarray(binary.sum(axis=0)).reshape(-1)
    Dn = binary.shape[0]
    per_topic_cv = []
    for k in range(K):
        words = list(np.argsort(phi[k])[::-1][:n_words])
        nw = len(words)
        if nw < 2:
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
        if cn > EPS:
            per_topic_cv.append(
                float(((npmi_mat @ centroid.T).reshape(-1) / np.maximum(norms * cn, EPS)).mean())
            )
    c_v = float(np.mean(per_topic_cv)) if per_topic_cv else 0.0
    return {"f2_c_v": round(c_v, 6), "f14_mean_pairwise_jaccard": round(mean_jacc, 6)}


def for_cell(recipe: str, scene_id: str) -> dict | None:
    doc_term = load_doc_term(recipe, scene_id)
    if doc_term is None:
        return None
    D, V = doc_term.shape
    mean_doc = float(np.asarray(doc_term.sum(axis=1)).reshape(-1).mean())
    K = k_for(scene_id, mean_doc)
    dense = doc_term.toarray().astype(np.float32)
    t0 = time.perf_counter()
    try:
        fit = _neural.fit_prodlda(dense, K, seed=42)
    except Exception as exc:
        return {
            "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
            "status": "failed", "error": str(exc),
        }
    fit_secs = time.perf_counter() - t0
    phi = fit["phi"]
    metrics = compute_f2_f14(phi, doc_term)
    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "backbone": "ProdLDA",
        "K": int(K), "D": int(D), "V": int(V),
        "mean_doc_length": round(mean_doc, 4),
        **metrics,
        "fit_seconds": round(fit_secs, 3),
        "status": "ok",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_prodlda_backbone v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep ProdLDA backbone.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    PROD_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_fail = 0
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            print(f"[prodlda] {tag} ...", flush=True)
            res = for_cell(recipe, scene)
            if res is None:
                n_fail += 1
                print("  SKIP: no doc_term", flush=True)
                continue
            out = PROD_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(res, h, indent=2)
            if res.get("status") == "ok":
                n_ok += 1
                print(
                    f"  K={res['K']} c_v={res['f2_c_v']:.3f} "
                    f"jacc={res['f14_mean_pairwise_jaccard']:.3f} "
                    f"t={res['fit_seconds']}s",
                    flush=True,
                )
            else:
                n_fail += 1
                print(f"  FAILED: {res.get('error', 'unknown')}", flush=True)
    print(f"[prodlda] done. ok={n_ok} failed={n_fail}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
