"""V17 — sparse-coding dictionary atom tokens (#675).

Train a per-scene over-complete dictionary via scikit-learn's
MiniBatchDictionaryLearning, encode each pixel as a sparse combination
of atoms (transform_algorithm='lasso_lars' with n_nonzero_coefs=8),
emit one (atom_id, abundance_bin) token per non-zero coefficient.

Dictionary size: K_atoms = 64 (over-complete relative to B).
Vocab: K_atoms * Q = 512 entries.

Tracks #675.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.decomposition import MiniBatchDictionaryLearning

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V17"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
K_ATOMS = 64
N_NONZERO = 8


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    return (X - lo) / np.maximum(hi - lo, 1e-12)


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

    dl = MiniBatchDictionaryLearning(
        n_components=K_ATOMS,
        alpha=1.0,
        max_iter=100,  # renamed from n_iter in sklearn 1.x
        transform_algorithm="lasso_lars",
        transform_n_nonzero_coefs=N_NONZERO,
        random_state=RANDOM_STATE,
    )
    coeffs = dl.fit_transform(X)  # [D, K_atoms], sparse-by-LASSO

    # Quantise absolute coefficient magnitudes per-atom (per-column
    # percentile) so each atom-bin emits a distinct token.
    abs_coeffs = np.abs(coeffs)
    # Per-column percentile binning
    bins = np.zeros_like(abs_coeffs, dtype=np.int32)
    for a in range(K_ATOMS):
        col = abs_coeffs[:, a]
        nz = col[col > 0]
        if nz.size < 2:
            continue
        lo = float(np.percentile(nz, 5))
        hi = float(np.percentile(nz, 95))
        rng = max(hi - lo, 1e-6)
        bins[:, a] = np.clip(np.floor((col - lo) / rng * q), 0, q - 1)

    vocab = [f"atom_a{a:03d}_q{qq:02d}" for a in range(K_ATOMS) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        nz_atoms = np.flatnonzero(abs_coeffs[d] > 0)
        for a in nz_atoms:
            rows.append(d)
            cols.append(int(a) * q + int(bins[d, a]))
            data.append(1)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, K_ATOMS * q),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "K_atoms": K_ATOMS, "n_nonzero": N_NONZERO,
        "vocab_size": len(vocab),
        "doc_term": doc_term, "vocab": vocab,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V17 sparse-coding wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()
    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V17] {scene} ...", flush=True)
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
                "vocab": res["vocab"], "recipe": "V17",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "K_atoms": res["K_atoms"], "n_nonzero": res["n_nonzero"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v17 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} K_atoms={res['K_atoms']} "
            f"vocab={res['vocab_size']}",
            flush=True,
        )
    print(f"[V17] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
