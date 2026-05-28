"""V20 — mutual-info-weighted band tokens (#678).

V20 is V1 (band-frequency) with bands re-weighted by their per-band
mutual information with the label vector. Bands with higher MI emit
more copies of their (band, bin) tokens; bands with near-zero MI
emit ~zero. Vocab size = B * Q matching V3's joint design.

Concretely: for each (band b, sampled pixel d),
- compute the intensity bin q (same as V1)
- compute the band's MI weight w_b = MI(intensity_b across docs, labels)
  / max(MI) (normalised to [0, 1])
- emit floor(w_b * MAX_COPIES) copies of token (b, q)

Effectively a discriminative-weighted V1. Cheap retort to "why all
bands equal?".

Tracks #678.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from sklearn.feature_selection import mutual_info_classif

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES, load_scene, stratified_sample_indices, valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V20"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
MAX_COPIES = 8  # max copies per band per pixel


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
    sample_labels = labels[sample_local]
    D = spectra.shape[0]
    X = normalise_per_row(spectra)

    # Per-band MI with labels (scikit-learn returns array of shape [B])
    mi = mutual_info_classif(X, sample_labels, random_state=RANDOM_STATE)
    mi_norm = mi / max(mi.max(), 1e-12)  # in [0, 1]
    # Weight each band's copies: w_b = round(mi_norm * MAX_COPIES)
    copies_per_band = np.round(mi_norm * MAX_COPIES).astype(np.int32)

    # Quantise intensities
    q_int = np.clip(np.floor(X * q), 0, q - 1).astype(np.int32)  # [D, B]

    vocab = [f"miw_b{b:03d}_q{qq:02d}" for b in range(B) for qq in range(q)]
    rows, cols, data = [], [], []
    for d in range(D):
        for b in range(B):
            cps = int(copies_per_band[b])
            if cps == 0:
                continue
            rows.append(d)
            cols.append(b * q + int(q_int[d, b]))
            data.append(cps)
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, B * q),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "vocab_size": len(vocab), "max_copies": MAX_COPIES,
        "doc_term": doc_term, "vocab": vocab,
        "mi_norm_top5": [float(x) for x in sorted(mi_norm, reverse=True)[:5]],
        "n_bands_with_zero_weight": int((copies_per_band == 0).sum()),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V20 MI-weighted band wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()
    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V20] {scene} ...", flush=True)
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
                "vocab": res["vocab"], "recipe": "V20",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "max_copies": res["max_copies"],
                "n_bands_with_zero_weight": res["n_bands_with_zero_weight"],
                "mi_norm_top5": res["mi_norm_top5"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v20 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} vocab={res['vocab_size']} "
            f"zero_bands={res['n_bands_with_zero_weight']}",
            flush=True,
        )
    print(f"[V20] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
