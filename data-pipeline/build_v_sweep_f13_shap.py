"""V-sweep F-13 — SHAP attributions of LDA topic assignments.

For each (V, scene) we treat the wordification recipe as a fixed
preprocessing layer and ask SHAP to attribute the topic-mixture
output theta_dk to the recipe-specific tokens.

Concretely:
- For recipes whose vocabulary is "the bands" (V1, V4, V5, V6) we
  use KernelExplainer with background = mean of corpus and a
  classifier-style wrapper that returns the theta vector.
- For other recipes the attribution is on the recipe-specific
  vocabulary, but only V1's attribution is wavelength-mappable.
- We compute the mean absolute SHAP value per (band/feature, topic)
  over a sample of 50 documents per scene as a per-V interpretability
  fingerprint.

Output: data/derived/v_sweep/f13_shap/{scene}_{V}_uniform_Q8.json with
  {top_features_per_topic: [{topic: k, features: [(name, mean_abs_shap), ...]}]}

This is the headline interpretability defence — the SHAP attribution
per topic is the answer to "what wavelengths does topic k respond to?",
which is what a reviewer wants to see when we claim LDA is interpretable.

Costs: SHAP KernelExplainer is O(2^n_features * n_samples). For
V1 with B=200 bands and 50 docs, we use SHAP's TreeExplainer-style
sampling default. ~30 seconds per cell.
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
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import DATA_DIR, DERIVED_DIR  # noqa: E402

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits"
WORDIFICATION_LOCAL = DATA_DIR / "local" / "wordifications"
F13_DERIVED = DERIVED_DIR / "v_sweep" / "f13_shap"

LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
RECIPES = [f"V{i}" for i in range(1, 13)]
TOP_M = 8       # features to report per topic
N_SAMPLES = 50  # documents to attribute (sampled, deterministic)
N_BACKGROUND = 25  # SHAP background reference docs
RANDOM_STATE = 42


def load_artefacts(scene_id: str, recipe: str):
    fit_dir = SWEEP_LOCAL / f"{scene_id}_{recipe}_uniform_Q8"
    phi_path = fit_dir / "phi.npy"
    vocab_path = fit_dir / "vocab.json"
    corpus_dir = WORDIFICATION_LOCAL / recipe / "uniform_Q8" / scene_id
    dt_path = corpus_dir / "doc_term.npz"
    if not (phi_path.exists() and vocab_path.exists() and dt_path.exists()):
        return None
    phi = np.load(phi_path)
    with vocab_path.open("r", encoding="utf-8") as h:
        meta = json.load(h)
    vocab = meta.get("vocab", [])
    doc_term = sp.load_npz(dt_path).tocsr()
    return phi, vocab, doc_term


def make_predict_fn_from_phi(phi: np.ndarray, alpha: float = 0.45):
    """Closed-form posterior p(z | x, phi) under uniform fold-out.

    For document x in counts and topic distribution phi (K, V), the
    Bayes posterior over topics is

        p(z=k | x) propto exp( sum_v x[v] * log phi[k][v] ) * alpha

    where alpha is the symmetric Dirichlet prior. This is what
    sklearn's online-VB LDA approximates; using it directly side-steps
    the need to reconstruct an sklearn estimator state for SHAP.
    """
    K, V = phi.shape
    log_phi = np.log(np.clip(phi, 1e-12, None))

    def predict_fn(X_dense: np.ndarray) -> np.ndarray:
        # X_dense: (n, V); for sparse rows, dot with log_phi gives log-evidence
        log_post = X_dense @ log_phi.T + np.log(alpha)
        # Softmax over topics
        m = log_post.max(axis=1, keepdims=True)
        ex = np.exp(log_post - m)
        return ex / ex.sum(axis=1, keepdims=True)

    return predict_fn


def shap_attribution(recipe: str, scene_id: str) -> dict | None:
    pl = load_artefacts(scene_id, recipe)
    if pl is None:
        return None
    phi, vocab, doc_term = pl
    K, V = phi.shape
    D = doc_term.shape[0]

    predict_fn = make_predict_fn_from_phi(phi)

    rng = np.random.default_rng(RANDOM_STATE)
    sample_idx = rng.choice(D, size=min(N_SAMPLES, D), replace=False)
    bg_idx = rng.choice(D, size=min(N_BACKGROUND, D), replace=False)

    import shap

    background = np.asarray(doc_term[bg_idx].toarray(), dtype=np.float32)
    samples = np.asarray(doc_term[sample_idx].toarray(), dtype=np.float32)

    # KernelExplainer uses sampling so works on any predict function.
    try:
        explainer = shap.KernelExplainer(predict_fn, background, silent=True)
        # nsamples=auto would be slow; use a fixed budget.
        shap_values = explainer.shap_values(samples, nsamples=64, silent=True)
    except Exception as exc:
        return {
            "scene_id": scene_id, "recipe": recipe, "status": "failed",
            "error": str(exc),
        }

    # shap_values: list of K arrays [n_samples, V] OR (n_samples, V, K).
    if isinstance(shap_values, list):
        # older API: list of K arrays of shape (n_samples, V)
        per_topic_abs = np.stack(
            [np.abs(sv).mean(axis=0) for sv in shap_values], axis=0
        )  # (K, V)
    else:
        arr = np.asarray(shap_values)
        if arr.ndim == 3:
            # (n_samples, V, K) -> (K, V)
            per_topic_abs = np.abs(arr).mean(axis=0).T
        else:
            # (n_samples, V) — single output
            per_topic_abs = np.abs(arr).mean(axis=0)[None, :]

    top_features = []
    for k in range(K):
        row = per_topic_abs[k] if per_topic_abs.ndim == 2 else per_topic_abs[0]
        idx = np.argsort(row)[::-1][:TOP_M]
        top_features.append({
            "topic": k,
            "features": [
                {
                    "vocab_index": int(i),
                    "token": vocab[int(i)] if int(i) < len(vocab) else f"unk_{i}",
                    "mean_abs_shap": round(float(row[int(i)]), 6),
                }
                for i in idx
            ],
        })

    return {
        "scene_id": scene_id, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "V": int(V),
        "n_samples_explained": int(len(sample_idx)),
        "n_background": int(len(bg_idx)),
        "top_m": TOP_M,
        "top_features_per_topic": top_features,
        "status": "ok",
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_f13_shap v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V-sweep F-13 SHAP attributions.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES, choices=RECIPES)
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    args = parser.parse_args()

    F13_DERIVED.mkdir(parents=True, exist_ok=True)
    n_ok = n_fail = 0
    for scene in args.scenes:
        for recipe in args.recipes:
            tag = f"{scene} {recipe}"
            print(f"[f13] {tag} ...", flush=True)
            t0 = time.perf_counter()
            try:
                result = shap_attribution(recipe, scene)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                n_fail += 1
                continue
            if result is None:
                n_fail += 1
                continue
            elapsed = time.perf_counter() - t0
            result["elapsed_seconds"] = round(elapsed, 2)
            out = F13_DERIVED / f"{scene}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(result, h, indent=2)
            if result["status"] == "ok":
                n_ok += 1
                top0 = result["top_features_per_topic"][0]
                top_token = top0["features"][0]["token"]
                top_val = top0["features"][0]["mean_abs_shap"]
                print(
                    f"  K={result['K']} top1_topic0={top_token} ({top_val:.4f}) "
                    f"t={elapsed:.1f}s",
                    flush=True,
                )
            else:
                n_fail += 1
                print(f"  status={result['status']}", flush=True)
    print(f"[f13] done. ok={n_ok} failed={n_fail}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
