"""V19 — UMAP-coordinate tokens (#677).

Embed labelled pixels into 3D via UMAP (n_neighbors=15, min_dist=0.1,
random_state=42), bin each axis into Q levels, emit one (axis, bin)
token per axis per pixel = 3 tokens per doc, vocab = 3*Q = 24.

This is the cheap "coordinates-as-tokens" baseline. Topics should
recover UMAP-cluster boundaries when LDA fits. Note that UMAP is
*not* deterministic with the typical default (uses random init) but
is reproducible with random_state.

Tracks #677.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V19"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
N_DIMS = 3  # UMAP dimensionality


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    return (X - lo) / np.maximum(hi - lo, 1e-12)


def build_for_scene(scene_id: str, q: int = 8) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    try:
        import umap  # type: ignore
    except ImportError:
        print("  umap-learn not installed; skipping V19", flush=True)
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

    reducer = umap.UMAP(
        n_components=N_DIMS, n_neighbors=15, min_dist=0.1,
        random_state=RANDOM_STATE,
    )
    coords = reducer.fit_transform(X)  # [D, N_DIMS]

    # Per-axis percentile binning
    bins = np.zeros_like(coords, dtype=np.int32)
    for a in range(N_DIMS):
        col = coords[:, a]
        lo = float(np.percentile(col, 1))
        hi = float(np.percentile(col, 99))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"umap_d{a}_q{qq:02d}" for a in range(N_DIMS) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for a in range(N_DIMS):
            rows.append(d)
            cols.append(a * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, N_DIMS * q),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "n_dims": N_DIMS, "vocab_size": len(vocab),
        "doc_term": doc_term, "vocab": vocab,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V19 UMAP-coordinate wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()
    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V19] {scene} ...", flush=True)
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
                "vocab": res["vocab"], "recipe": "V19",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "n_dims": res["n_dims"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v19 v0.1",
            }, h)
        n_ok += 1
        print(f"  D={res['D']} B={res['B']} vocab={res['vocab_size']}", flush=True)
    print(f"[V19] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
