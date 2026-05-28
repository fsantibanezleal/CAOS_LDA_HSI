"""V18 — graph-Laplacian eigenvector tokens (#676).

Build a k-NN affinity graph over the sampled pixels using spectral-
angle distance (SAM), compute the first K normalised Laplacian
eigenvectors (spectral-clustering style), project each pixel onto
each eigenvector, bin the projections per axis. Emit (eigenvector_id,
bin) tokens.

Vocab = K_eigen * Q. With K_eigen = 16, Q = 8: vocab = 128.

Tracks #676.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.sparse.linalg import eigsh
from sklearn.neighbors import kneighbors_graph

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V18"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
K_EIGEN = 16
K_NN = 10


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    return (X - lo) / np.maximum(hi - lo, 1e-12)


def sam_metric(u: np.ndarray, v: np.ndarray) -> float:
    n_u = np.linalg.norm(u)
    n_v = np.linalg.norm(v)
    if n_u < 1e-12 or n_v < 1e-12:
        return np.pi / 2
    cos_a = np.clip(float(np.dot(u, v) / (n_u * n_v)), -1.0, 1.0)
    return float(np.arccos(cos_a))


def build_for_scene(scene_id: str, q: int = 8) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, _ = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    mask = valid & (flat_labels > 0)
    pixel_idx = np.flatnonzero(mask)
    labels = flat_labels[pixel_idx]
    sample_local = stratified_sample_indices(labels, SAMPLES_PER_CLASS,
                                              random_state=RANDOM_STATE)
    spectra = flat[pixel_idx[sample_local]]
    D = spectra.shape[0]
    X = normalise_per_row(spectra)

    # k-NN affinity graph using SAM distance via custom metric
    # (scikit-learn's kneighbors_graph supports a callable; SAM ≈ cosine
    # for unit vectors, so we use cosine distance which is fast).
    knn_adj = kneighbors_graph(
        X, n_neighbors=K_NN, mode="distance", metric="cosine"
    )
    # Symmetrise + convert distance to similarity via exp(-d^2 / sigma)
    knn_adj = (knn_adj + knn_adj.T) / 2.0
    sigma = float(np.median(knn_adj.data)) if knn_adj.nnz > 0 else 1.0
    affinity = sp.csr_matrix(knn_adj.copy())
    affinity.data = np.exp(-(affinity.data ** 2) / (sigma ** 2 + 1e-12))

    # Normalised Laplacian L_sym = I - D^{-1/2} A D^{-1/2}
    deg = np.asarray(affinity.sum(axis=1)).reshape(-1)
    deg_inv_sqrt = 1.0 / np.sqrt(np.maximum(deg, 1e-12))
    D_inv_sqrt = sp.diags(deg_inv_sqrt)
    norm_aff = D_inv_sqrt @ affinity @ D_inv_sqrt
    laplacian = sp.eye(D, format="csr") - norm_aff

    # First K_eigen eigenvectors (smallest eigenvalues = informative)
    try:
        eigvals, eigvecs = eigsh(
            laplacian, k=min(K_EIGEN, D - 2), which="SM",
        )
    except Exception as exc:
        print(f"  eigsh failed: {exc}", flush=True)
        return None
    # Sort by ascending eigenvalue
    order = np.argsort(eigvals)
    eigvecs = eigvecs[:, order]  # [D, K]
    K_actual = eigvecs.shape[1]

    # Per-axis percentile binning
    bins = np.zeros_like(eigvecs, dtype=np.int32)
    for a in range(K_actual):
        col = eigvecs[:, a]
        lo = float(np.percentile(col, 1))
        hi = float(np.percentile(col, 99))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"lap_e{a:02d}_q{qq:02d}" for a in range(K_actual) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for a in range(K_actual):
            rows.append(d)
            cols.append(a * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, K_actual * q),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "K_eigen": int(K_actual), "k_nn": K_NN,
        "vocab_size": len(vocab),
        "doc_term": doc_term, "vocab": vocab,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V18 graph-Laplacian eigenvector wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()
    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V18] {scene} ...", flush=True)
        try:
            res = build_for_scene(scene, args.q)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            n_skip += 1
            continue
        if res is None:
            n_skip += 1
            continue
        out_dir = out_root / scene
        out_dir.mkdir(parents=True, exist_ok=True)
        sp.save_npz(out_dir / "doc_term.npz", res["doc_term"])
        with (out_dir / "vocab.json").open("w", encoding="utf-8") as h:
            json.dump({
                "vocab": res["vocab"], "recipe": "V18",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "K_eigen": res["K_eigen"], "k_nn": res["k_nn"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v18 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} K_eigen={res['K_eigen']} "
            f"vocab={res['vocab_size']}",
            flush=True,
        )
    print(f"[V18] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
