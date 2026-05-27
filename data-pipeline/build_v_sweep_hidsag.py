"""HIDSAG V-sweep — V1..V12 wordification + F-2 coherence on 5 mineral subsets.

HIDSAG documents are region-aggregated reflectance spectra
(hidsag_region_documents.npz). Each row is one document. There is no
per-document class label, so F-1 / F-7 do not directly apply. We compute
F-2 coherence (c_v, c_npmi, u_mass on top-10 words per topic) plus
F-14 repetitiveness.

The hypothesis (P4 conditional): V7 (absorption-feature triplet) should
outperform V1 on F-2 coherence on the mineralogical subsets because
USGS library matching aligns with absorption peaks.

Output:
  data/local/v_sweep/lda_fits_hidsag/{subset}_{V}_uniform_Q8/...
  data/derived/v_sweep/hidsag/topic_views/{subset}_{V}_uniform_Q8.json
  data/derived/v_sweep/hidsag/f2_coherence/{subset}_{V}_uniform_Q8.json
  data/derived/v_sweep/hidsag/f14_repetitiveness/{subset}_{V}_uniform_Q8.json
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

# Reuse the wordify_* functions from the existing builders by importing
# the modules dynamically (their module names have dashes).
import importlib
import importlib.util


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_PIPE = ROOT / "data-pipeline"
W123 = _load("w123", _PIPE / "build_wordifications.py")
W45 = _load("w45", _PIPE / "build_wordifications_v4plus.py")
W6789 = _load("w6789", _PIPE / "build_wordifications_v6plus.py")
W711 = _load("w711", _PIPE / "build_wordifications_v7v11.py")

HIDSAG_NPZ = DATA_DIR / "derived" / "core" / "hidsag_region_documents.npz"
SUBSETS = ["GEOCHEM", "GEOMET", "MINERAL1", "MINERAL2", "PORPHYRY"]
RECIPES = [f"V{i}" for i in range(1, 13)]

SWEEP_LOCAL = DATA_DIR / "local" / "v_sweep" / "lda_fits_hidsag"
SWEEP_DERIVED = DERIVED_DIR / "v_sweep" / "hidsag"

LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.20
RANDOM_STATE = 42
TOP_N = 10
EPS = 1e-12


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    rng = np.maximum(hi - lo, 1e-12)
    return (X - lo) / rng


def k_for(mean_doc: float) -> int:
    """Slightly looser HIDSAG K-policy since we lack class labels."""
    if mean_doc < 2.5:
        return 4
    if mean_doc < 8:
        return max(3, min(8, int(round(mean_doc / 2))))
    return 8


def wordify(recipe: str, X: np.ndarray, scheme: str, Q: int):
    """Dispatch to the right wordify_v* on a [D, B] spectra matrix.

    V8 (endmember NFINDR) and V9 (region-SAM Felzenszwalb) require
    precomputes that don't exist for HIDSAG; we skip them.
    """
    if recipe in {"V8", "V9"}:
        return None, None, "skipped: precompute not available for HIDSAG"
    Xn = normalise_per_row(X.astype(np.float32))
    B = Xn.shape[1]
    try:
        if recipe in {"V1", "V2", "V3"}:
            bins = W123.quantize(Xn, scheme, Q)
            if recipe == "V1":
                dt, vocab = W123.wordify_v1_band_frequency(bins, B, Q)
            elif recipe == "V2":
                dt, vocab = W123.wordify_v2_magnitude_phrase(bins, B, Q)
            else:
                dt, vocab = W123.wordify_v3_band_bin(bins, B, Q)
        elif recipe in {"V4", "V5"}:
            wl = np.linspace(400, 2500, B).astype(np.float32)
            if recipe == "V4":
                dt, vocab = W45.wordify_v4_first_derivative(Xn, wl, scheme, Q)
            else:
                dt, vocab = W45.wordify_v5_second_derivative(Xn, wl, scheme, Q)
        elif recipe == "V6":
            dt, vocab = W6789.wordify_v6_wavelet(Xn, scheme, Q)
        elif recipe == "V7":
            wl = np.linspace(400, 2500, B).astype(np.float32)
            dt, vocab = W711.wordify_v7(Xn, wl, scheme, Q)
        elif recipe == "V10":
            wl = np.linspace(400, 2500, B).astype(np.float32)
            dt, vocab = W45.wordify_v10_band_group(Xn, wl, scheme, Q)
        elif recipe == "V11":
            dt, vocab = W711.wordify_v11(Xn, scheme, Q)
        elif recipe == "V12":
            dt, vocab = W6789.wordify_v12_gmm(Xn, scheme, Q)
        else:
            return None, None, f"unknown recipe {recipe}"
    except Exception as exc:
        return None, None, f"wordify failed: {exc}"
    return dt, vocab, "ok"


def fit_lda_and_compute(recipe: str, subset: str, doc_term: sp.csr_matrix):
    D, V = doc_term.shape
    doc_lengths = np.asarray(doc_term.sum(axis=1)).reshape(-1)
    mean_doc = float(doc_lengths.mean()) if D > 0 else 0.0
    if mean_doc < 1e-6 or V == 0:
        return None
    K = k_for(mean_doc)

    t0 = time.perf_counter()
    lda = LatentDirichletAllocation(
        n_components=K, learning_method="online", max_iter=LDA_MAX_ITER,
        batch_size=512, evaluate_every=-1, random_state=RANDOM_STATE,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    doc_topic = lda.fit_transform(doc_term)
    phi_un = lda.components_
    phi = phi_un / phi_un.sum(axis=1, keepdims=True)
    fit_secs = time.perf_counter() - t0
    try:
        perplexity = float(lda.perplexity(doc_term))
    except Exception:
        perplexity = float("nan")

    # F-14 jaccard repetitiveness — clip top-N to vocab size
    effective_n = min(TOP_N, V)
    top_sets = [set(np.argsort(phi[k])[::-1][:effective_n].tolist()) for k in range(K)]
    pair_jaccard = []
    for i in range(K):
        for j in range(i + 1, K):
            inter = len(top_sets[i] & top_sets[j])
            union = len(top_sets[i] | top_sets[j])
            pair_jaccard.append(inter / max(union, 1))
    mean_jacc = float(np.mean(pair_jaccard)) if pair_jaccard else 0.0
    max_jacc = float(np.max(pair_jaccard)) if pair_jaccard else 0.0

    # F-2 c_v approximation (doc-level binary co-occurrence)
    binary = (doc_term > 0).astype(np.float32).tocsr()
    doc_freq = np.asarray(binary.sum(axis=0)).reshape(-1)
    Dn = binary.shape[0]
    per_topic_cv = []
    per_topic_npmi = []
    per_topic_umass = []
    for k in range(K):
        words = list(np.argsort(phi[k])[::-1][:effective_n])
        n_words = len(words)
        sub = binary[:, words]
        co = (sub.T @ sub).toarray()
        # NPMI matrix
        npmi_mat = np.zeros((n_words, n_words), dtype=np.float64)
        umass_terms = []
        for i in range(n_words):
            pi = doc_freq[words[i]] / Dn if doc_freq[words[i]] > 0 else EPS
            for j in range(n_words):
                if i == j:
                    npmi_mat[i, j] = 1.0
                    continue
                pj = doc_freq[words[j]] / Dn if doc_freq[words[j]] > 0 else EPS
                pij = co[i, j] / Dn if co[i, j] > 0 else EPS
                num = np.log(pij / max(pi * pj, EPS))
                den = -np.log(max(pij, EPS))
                npmi_mat[i, j] = float(num / den) if den > EPS else 0.0
                if i > j:
                    umass_terms.append(np.log((co[i, j] + 1.0) / max(doc_freq[words[j]], 1.0)))
        # c_v = mean cosine of each row vs centroid
        centroid = npmi_mat.mean(axis=0, keepdims=True)
        norms = np.linalg.norm(npmi_mat, axis=1)
        cn = float(np.linalg.norm(centroid))
        cv = float(((npmi_mat @ centroid.T).reshape(-1) / np.maximum(norms * cn, EPS)).mean()) if cn > EPS else 0.0
        # NPMI mean (off-diagonal)
        if n_words >= 2:
            off = npmi_mat[~np.eye(n_words, dtype=bool)]
        else:
            off = np.array([0.0])
        per_topic_npmi.append(float(off.mean()))
        per_topic_cv.append(cv)
        per_topic_umass.append(float(np.mean(umass_terms)) if umass_terms else 0.0)
    c_v = float(np.mean(per_topic_cv))
    c_npmi = float(np.mean(per_topic_npmi))
    u_mass = float(np.mean(per_topic_umass))

    SWEEP_LOCAL.mkdir(parents=True, exist_ok=True)
    local_dir = SWEEP_LOCAL / f"{subset}_{recipe}_uniform_Q8"
    local_dir.mkdir(parents=True, exist_ok=True)
    np.save(local_dir / "phi.npy", phi.astype(np.float32))
    np.save(local_dir / "theta.npy", doc_topic.astype(np.float32))

    return {
        "subset": subset, "recipe": recipe, "scheme": "uniform", "Q": 8,
        "K": int(K), "D": int(D), "V": int(V),
        "mean_doc_length": round(mean_doc, 4),
        "perplexity": round(perplexity, 4) if perplexity == perplexity else None,
        "fit_seconds": round(fit_secs, 3),
        "f2_c_v": round(c_v, 6),
        "f2_c_npmi": round(c_npmi, 6),
        "f2_u_mass": round(u_mass, 6),
        "f14_mean_pairwise_jaccard": round(mean_jacc, 6),
        "f14_max_pairwise_jaccard": round(max_jacc, 6),
        "lda_config": {
            "max_iter": LDA_MAX_ITER, "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
        },
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder": "build_v_sweep_hidsag v0.1",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="HIDSAG V-sweep.")
    parser.add_argument("--recipes", nargs="+", default=RECIPES,
                        choices=RECIPES)
    parser.add_argument("--subsets", nargs="+", default=SUBSETS, choices=SUBSETS)
    args = parser.parse_args()

    if not HIDSAG_NPZ.exists():
        print(f"HIDSAG npz not found: {HIDSAG_NPZ}", flush=True)
        return 1
    npz = np.load(HIDSAG_NPZ, allow_pickle=True)

    SWEEP_DERIVED.mkdir(parents=True, exist_ok=True)
    out_dir = SWEEP_DERIVED / "topic_views"
    out_dir.mkdir(parents=True, exist_ok=True)
    n_ok = n_skip = 0
    for subset in args.subsets:
        key = f"{subset}__features"
        if key not in npz:
            print(f"  no {subset}, skipping", flush=True)
            continue
        X = npz[key]
        print(f"\n[hidsag] {subset}: D={X.shape[0]} B={X.shape[1]}", flush=True)
        for recipe in args.recipes:
            tag = f"{subset} {recipe}"
            dt, vocab, status = wordify(recipe, X, "uniform", 8)
            if status != "ok" or dt is None:
                print(f"  {tag} SKIP: {status}", flush=True)
                n_skip += 1
                continue
            result = fit_lda_and_compute(recipe, subset, dt)
            if result is None:
                n_skip += 1
                continue
            result["vocab_size"] = len(vocab) if vocab is not None else None
            out = out_dir / f"{subset}_{recipe}_uniform_Q8.json"
            with out.open("w", encoding="utf-8") as h:
                json.dump(result, h, indent=2)
            n_ok += 1
            print(
                f"  {tag} K={result['K']} V={result['V']} "
                f"c_v={result['f2_c_v']:.3f} "
                f"npmi={result['f2_c_npmi']:.3f} "
                f"jacc_mean={result['f14_mean_pairwise_jaccard']:.3f}",
                flush=True,
            )
    print(f"\n[hidsag] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
