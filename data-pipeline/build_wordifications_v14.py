"""V14 — continuous wavelet transform tokens (Morlet + Mexican-hat) (#672).

Discrete-time approximation of the continuous wavelet transform on
each pixel spectrum. Unlike V6 (Db4 level-4 discrete wavelet packet)
this uses *continuous* scales with a Morlet mother wavelet, which
gives joint frequency-space localisation that V6's dyadic DWT cannot.

Tokenisation:
- compute the CWT magnitude at S = 16 logarithmically-spaced scales
- collapse to a per-(scale, normalised-position) magnitude grid
- per-pixel, bin each (scale, position) magnitude into Q bins
- emit tokens at the top-k (scale, position) cells with largest
  magnitude (k = MAX_TOKENS = 16 per document)

Vocab = (scale_id, position_bucket, magnitude_bin). With S=16,
P=8 position buckets, Q=8 magnitude bins: vocab = 1024 nominal,
but only realised cells are kept (sparse).

Mother wavelet: pywt.ContinuousWavelet("morl") by default; user
can switch to "mexh" (Mexican-hat) via --wavelet.

Tracks #672.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pywt
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels  # noqa: E402
from research_core.paths import DATA_DIR  # noqa: E402
from research_core.raw_scenes import (  # noqa: E402
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V14"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

N_SCALES = 16
P_BUCKETS = 8
MAX_TOKENS_PER_DOC = 16


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    return (X - lo) / np.maximum(hi - lo, 1e-12)


def cwt_magnitudes(spectra: np.ndarray, wavelet: str) -> np.ndarray:
    """For each pixel, compute CWT magnitudes at S logarithmically
    spaced scales. Returns [D, S, B] absolute magnitudes."""
    D, B = spectra.shape
    scales = np.logspace(0, np.log10(B / 2), N_SCALES)
    out = np.zeros((D, N_SCALES, B), dtype=np.float32)
    for d in range(D):
        # pywt.cwt accepts shape (N,) only; iterate (vectorised pywt
        # would need shape (1, N)).
        coeffs, _ = pywt.cwt(spectra[d], scales, wavelet)
        out[d] = np.abs(coeffs).astype(np.float32)
    return out


def wordify_v14(spectra: np.ndarray, wavelet: str, q: int) -> tuple[sp.csr_matrix, list[str]]:
    """Compute CWT, collapse to (S, P) grid, emit top-k tokens per pixel."""
    D, B = spectra.shape
    spectra01 = normalise_per_row(spectra.astype(np.float32))
    mag = cwt_magnitudes(spectra01, wavelet)  # [D, S, B]

    # Collapse B positions into P_BUCKETS by mean within bucket
    bucket_bounds = np.linspace(0, B, P_BUCKETS + 1, dtype=int)
    bucketed = np.zeros((D, N_SCALES, P_BUCKETS), dtype=np.float32)
    for b in range(P_BUCKETS):
        lo, hi = bucket_bounds[b], bucket_bounds[b + 1]
        if hi > lo:
            bucketed[:, :, b] = mag[:, :, lo:hi].mean(axis=2)

    # Global per-cell magnitude quantisation (uniform percentile on
    # flattened distribution)
    flat = bucketed.reshape(-1)
    lo = float(np.percentile(flat, 1))
    hi = float(np.percentile(flat, 99))
    rng = max(hi - lo, 1e-6)
    bins = np.clip(np.floor((bucketed - lo) / rng * q), 0, q - 1).astype(np.int32)

    # Build vocab
    vocab = [
        f"cwt_s{s:02d}_p{p}_q{qq:02d}"
        for s in range(N_SCALES) for p in range(P_BUCKETS) for qq in range(q)
    ]
    vocab_idx = lambda s, p, qq: (s * P_BUCKETS + p) * q + qq

    rows, cols, data = [], [], []
    for d in range(D):
        # top-k by magnitude
        flat_mag = bucketed[d].reshape(-1)
        if MAX_TOKENS_PER_DOC < flat_mag.size:
            top_idx = np.argpartition(flat_mag, -MAX_TOKENS_PER_DOC)[-MAX_TOKENS_PER_DOC:]
        else:
            top_idx = np.arange(flat_mag.size)
        for i in top_idx:
            s = int(i // P_BUCKETS)
            p = int(i % P_BUCKETS)
            qq = int(bins[d, s, p])
            rows.append(d)
            cols.append(vocab_idx(s, p, qq))
            data.append(1)

    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, len(vocab)),
        dtype=np.int32,
    )
    return doc_term, vocab


def build_for_scene(scene_id: str, wavelet: str, q: int) -> dict | None:
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

    doc_term, vocab = wordify_v14(spectra, wavelet, q)
    return {
        "scene_id": scene_id, "D": int(spectra.shape[0]), "B": int(B),
        "vocab_size": len(vocab),
        "doc_term": doc_term, "vocab": vocab,
        "wavelet": wavelet, "n_scales": N_SCALES, "n_position_buckets": P_BUCKETS,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V14 continuous-wavelet wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES,
                        choices=LABELLED_SCENES)
    parser.add_argument("--wavelet", default="morl", choices=["morl", "mexh"])
    parser.add_argument("--q", type=int, default=8)
    args = parser.parse_args()
    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V14:{args.wavelet}] {scene} ...", flush=True)
        try:
            res = build_for_scene(scene, args.wavelet, args.q)
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
                "vocab": res["vocab"], "recipe": "V14",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "wavelet": res["wavelet"], "n_scales": res["n_scales"],
                "n_position_buckets": res["n_position_buckets"],
                "max_tokens_per_doc": MAX_TOKENS_PER_DOC,
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v14 v0.1",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} S={res['n_scales']} "
            f"P={res['n_position_buckets']} vocab={res['vocab_size']}",
            flush=True,
        )
    print(f"[V14] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
