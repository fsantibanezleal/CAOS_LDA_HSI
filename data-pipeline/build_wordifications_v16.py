"""V16 — Foundation-model spectral embedding tokens (#674).

Embed each labelled pixel into a frozen HyperSIGMA latent space, then
quantise the embedding into LDA-compatible tokens.

Three codebook options (selected via ``--codebook``):

* ``pq`` — product quantisation, M=4 sub-vectors, K=64 codewords each.
  Vocab = M * K = 256. Cheapest; closest analogue to V11.
* ``vqvae`` — vector-quantised VAE fit on the 6-scene embedding pool;
  K=128 codewords. Vocab = 128. Closest analogue to V13.
* ``kmeans`` — k-means clusters on the 6-scene pool; k=200.
  Vocab = 200. Cheapest learnt option.

V16 is GPU-only in practice (HyperSIGMA forward pass on ~30K pixels per
scene). On a CPU-only host this script will work but will be slow;
plan to embed on a workstation/Colab and ship the derived JSON to the
production VPS.

See ``wip/v16-scoping/2026-05-28-v16-foundation-embedding-tokens.md``
for the full design doc.

Tracks #674. Status as of 2026-05-28: scaffolded; weights not yet
vendored. Run ``--smoke`` to verify the embedding API end-to-end on a
small batch.
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

WORDIFICATION_LOCAL_ROOT = DATA_DIR / "local" / "wordifications" / "V16"
LABELLED_SCENES = [
    "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
    "pavia-university", "kennedy-space-center", "botswana",
]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

# Codebook hyperparameters
PQ_M = 4
PQ_K = 64
VQVAE_K = 128
KMEANS_K = 200


def normalise_per_row(X: np.ndarray) -> np.ndarray:
    lo = X.min(axis=1, keepdims=True)
    hi = X.max(axis=1, keepdims=True)
    return (X - lo) / np.maximum(hi - lo, 1e-12)


def hypersigma_embed(spectra: np.ndarray) -> np.ndarray:
    """Embed [D, B] spectra into HyperSIGMA latent space.

    NOTE: implementation deferred — needs HyperSIGMA weights vendored
    under ``third_party/HyperSIGMA/``. Until then this raises so V16
    can't be built accidentally without the weights.
    """
    raise NotImplementedError(
        "V16 requires HyperSIGMA weights vendored under "
        "third_party/HyperSIGMA/. See "
        "wip/v16-scoping/2026-05-28-v16-foundation-embedding-tokens.md"
    )


def quantise_pq(embeddings: np.ndarray, M: int = PQ_M, K: int = PQ_K) -> tuple[np.ndarray, list[str]]:
    """Product quantisation. embeddings: [D, D_emb]. Returns codes [D, M] in [0, K)."""
    from sklearn.cluster import KMeans

    D, D_emb = embeddings.shape
    if D_emb % M != 0:
        raise ValueError(f"D_emb={D_emb} must be divisible by M={M}")
    sub_dim = D_emb // M
    codes = np.zeros((D, M), dtype=np.int32)
    for m in range(M):
        km = KMeans(n_clusters=K, random_state=RANDOM_STATE, n_init=10)
        km.fit(embeddings[:, m * sub_dim:(m + 1) * sub_dim])
        codes[:, m] = km.predict(embeddings[:, m * sub_dim:(m + 1) * sub_dim])
    vocab = [f"pq_m{m}_c{c:03d}" for m in range(M) for c in range(K)]
    return codes, vocab


def quantise_kmeans(embeddings: np.ndarray, k: int = KMEANS_K) -> tuple[np.ndarray, list[str]]:
    """Single-codebook k-means. Returns [D, 1]."""
    from sklearn.cluster import KMeans

    km = KMeans(n_clusters=k, random_state=RANDOM_STATE, n_init=10)
    codes = km.fit_predict(embeddings).reshape(-1, 1).astype(np.int32)
    vocab = [f"km_c{c:03d}" for c in range(k)]
    return codes, vocab


def build_for_scene(scene_id: str, codebook: str, smoke: bool = False) -> dict | None:
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
    n_per_class = 10 if smoke else SAMPLES_PER_CLASS
    sample_local = stratified_sample_indices(
        labels, n_per_class, random_state=RANDOM_STATE,
    )
    spectra = flat[pixel_idx[sample_local]]
    D = spectra.shape[0]
    X = normalise_per_row(spectra)

    # Foundation embedding (currently raises NotImplementedError)
    embeddings = hypersigma_embed(X)

    # Quantise
    if codebook == "pq":
        codes, vocab = quantise_pq(embeddings)
    elif codebook == "kmeans":
        codes, vocab = quantise_kmeans(embeddings)
    elif codebook == "vqvae":
        raise NotImplementedError("V16 vqvae codebook deferred; use --codebook pq")
    else:
        raise ValueError(f"unknown codebook: {codebook}")

    # Build doc-term: each pixel contributes its M tokens (PQ) or 1 token (kmeans)
    rows, cols, data = [], [], []
    M = codes.shape[1]
    for d in range(D):
        for m in range(M):
            rows.append(d)
            cols.append(m * (PQ_K if codebook == "pq" else 1) + int(codes[d, m]))
            data.append(1)
    vocab_size = M * PQ_K if codebook == "pq" else KMEANS_K
    doc_term = sp.csr_matrix(
        (data, (rows, cols)),
        shape=(D, vocab_size),
        dtype=np.int32,
    )

    return {
        "scene_id": scene_id, "D": int(D), "B": int(B),
        "vocab_size": vocab_size, "codebook": codebook,
        "doc_term": doc_term, "vocab": vocab,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="V16 foundation-model embedding wordification.")
    parser.add_argument("--scenes", nargs="+", default=LABELLED_SCENES, choices=LABELLED_SCENES)
    parser.add_argument("--codebook", default="pq", choices=("pq", "vqvae", "kmeans"))
    parser.add_argument("--smoke", action="store_true",
                        help="Build with 10 pixels/class to verify pipeline end-to-end.")
    parser.add_argument("--q", type=int, default=8,
                        help="kept for output-path compatibility with V1-V15")
    args = parser.parse_args()

    out_root = WORDIFICATION_LOCAL_ROOT / f"uniform_Q{args.q}"
    n_ok = n_skip = 0
    for scene in args.scenes:
        print(f"[V16:{args.codebook}] {scene} ...", flush=True)
        try:
            res = build_for_scene(scene, args.codebook, smoke=args.smoke)
        except NotImplementedError as exc:
            print(f"  {exc}", flush=True)
            return 2
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
                "vocab": res["vocab"], "recipe": "V16",
                "scheme": "uniform", "Q": args.q, "B": res["B"],
                "codebook": res["codebook"],
                "generated_at": datetime.now(timezone.utc)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "builder": "build_wordifications_v16 v0.1-scaffold",
            }, h)
        n_ok += 1
        print(
            f"  D={res['D']} B={res['B']} vocab={res['vocab_size']}",
            flush=True,
        )
    print(f"[V16:{args.codebook}] done. ok={n_ok} skipped={n_skip}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
