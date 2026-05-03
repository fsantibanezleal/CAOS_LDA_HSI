"""Wordification recipes V1, V2, V3 across multiple quantization schemes
and Q values. Implements the missing V3 from Procemin 2022.

The three Procemin recipes are:

  V1 — band-frequency
       word = wavelength band, count = quantised intensity at that band
       vocab size = B
       token example: "0653nm"

  V2 — magnitude-phrase (bin tokens)
       word = quantised intensity bin id, count = number of bands at that bin
       vocab size = Q
       token example: "q07"

  V3 — band-bin ordered (audit gap #1 — never implemented before)
       word = (band, bin) joint token; the ordering is preserved by the
       band index baked into the token. Used as a bag for LDA.
       vocab size <= B * Q
       token example: "0653nm_q07"

For each (recipe, quant_scheme, Q, scene) the builder writes:

  data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/
    doc_term.npz      sparse CSR int32 [D, V_actual]
    vocab.json        token list, recipe metadata, sampling info

  data/derived/wordifications/<scene>_<recipe>_<scheme>_Q<q>.json
    small summary: D, V_actual, doc-length quartiles, zero-token-doc rate,
    top-N tokens by global frequency, corpus_marginal entropy bits

Quantization schemes (per_spectrum domain — each spectrum is normalised
into [0, 1] then binned with Q breakpoints):

  uniform   equi-spaced bin edges
  quantile  equi-frequency bin edges from the per-spectrum empirical CDF
  lloyd_max Lloyd-Max optimal scalar quantizer (k-means in 1D)

Focused grid (3 x 3 x 3 = 27 configs per scene; 6 scenes = 162 total).
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)


LOCAL_OUT_ROOT = DATA_DIR / "local" / "wordifications"
DERIVED_OUT_DIR = DERIVED_DIR / "wordifications"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = ["V1", "V2", "V3"]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def quantize_uniform(spectra01: np.ndarray, Q: int) -> np.ndarray:
    """Equi-spaced over [0, 1] -> bin id in {0, ..., Q-1}."""
    bins = np.clip(np.floor(spectra01 * Q).astype(np.int32), 0, Q - 1)
    return bins


def quantize_quantile(spectra01: np.ndarray, Q: int) -> np.ndarray:
    """Equi-frequency: per-spectrum empirical quantiles. Returns bin ids."""
    out = np.zeros_like(spectra01, dtype=np.int32)
    edges = np.percentile(spectra01, np.linspace(0, 100, Q + 1, endpoint=True), axis=1).T
    for i in range(spectra01.shape[0]):
        e = edges[i]
        # Ensure monotonic edges (degenerate spectra can produce duplicates)
        e = np.maximum.accumulate(e + 1e-12 * np.arange(e.size))
        out[i] = np.clip(np.searchsorted(e[1:-1], spectra01[i]), 0, Q - 1)
    return out


def quantize_lloyd_max(spectra01: np.ndarray, Q: int, random_state: int = 42) -> np.ndarray:
    """Lloyd-Max optimal: 1D k-means over all observations; uses centroids
    as bin reference and assigns each value to its nearest centroid."""
    flat = spectra01.reshape(-1, 1)
    # Subsample for speed
    rng = np.random.default_rng(random_state)
    if flat.shape[0] > 50000:
        sub = flat[rng.choice(flat.shape[0], 50000, replace=False)]
    else:
        sub = flat
    km = KMeans(n_clusters=Q, n_init=4, random_state=random_state)
    km.fit(sub)
    # Sort centroids so that bin 0 = lowest reflectance
    order = np.argsort(km.cluster_centers_.ravel())
    sorted_centers = km.cluster_centers_.ravel()[order]
    # Assign each value to nearest sorted centroid
    diffs = np.abs(spectra01[:, :, None] - sorted_centers[None, None, :])
    return np.argmin(diffs, axis=2).astype(np.int32)


def quantize(spectra01: np.ndarray, scheme: str, Q: int) -> np.ndarray:
    if scheme == "uniform":
        return quantize_uniform(spectra01, Q)
    if scheme == "quantile":
        return quantize_quantile(spectra01, Q)
    if scheme == "lloyd_max":
        return quantize_lloyd_max(spectra01, Q)
    raise ValueError(f"unknown scheme {scheme}")


def wordify_v1_band_frequency(bins: np.ndarray, B: int, Q: int) -> tuple[sparse.csr_matrix, list[str]]:
    """V1: vocab = bands; doc_term[d, b] = bin value (integer in [0, Q-1])."""
    # bins shape [D, B]; treat as count matrix directly (counts in [0, Q-1])
    doc_term = sparse.csr_matrix(bins.astype(np.int32))
    return doc_term, [f"b{b:03d}" for b in range(B)]


def wordify_v2_magnitude_phrase(bins: np.ndarray, B: int, Q: int) -> tuple[sparse.csr_matrix, list[str]]:
    """V2: vocab = bin ids; doc_term[d, q] = #bands of doc d at bin q."""
    D = bins.shape[0]
    doc_term = np.zeros((D, Q), dtype=np.int32)
    for d in range(D):
        counts = np.bincount(bins[d], minlength=Q)[:Q]
        doc_term[d] = counts
    return sparse.csr_matrix(doc_term), [f"q{q:02d}" for q in range(Q)]


def wordify_v3_band_bin(bins: np.ndarray, B: int, Q: int) -> tuple[sparse.csr_matrix, list[str]]:
    """V3: vocab = (band, bin) joint tokens. doc_term[d, b*Q + q] = 1 if
    document d has band b at bin q (which is always exactly 1 per band per
    document). Most rows therefore have exactly B non-zero entries."""
    D = bins.shape[0]
    rows = np.repeat(np.arange(D), B)
    band_idx = np.tile(np.arange(B), D)
    cols = band_idx * Q + bins.ravel()
    data = np.ones(D * B, dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data, (rows, cols)), shape=(D, B * Q), dtype=np.int32
    )
    vocab = [f"b{b:03d}_q{q:02d}" for b in range(B) for q in range(Q)]
    return doc_term, vocab


def shannon_entropy_bits(probs: np.ndarray) -> float:
    p = probs[probs > 0]
    return float(-(p * np.log2(p)).sum())


def build_for_scene(scene_id: str) -> list[dict]:
    if scene_id not in SCENES or not has_labels(scene_id):
        return []

    cube, gt, config = load_scene(scene_id)
    h, w, B = cube.shape
    flat = cube.reshape(-1, B).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    sample_spectra = spectra[sample_idx_local]
    spectra01 = normalize01_per_row(sample_spectra)
    D = spectra01.shape[0]
    wavelengths = approximate_wavelengths(config, B)

    summaries: list[dict] = []
    for scheme in SCHEMES:
        for Q in Q_VALUES:
            bins = quantize(spectra01, scheme, Q)
            for recipe in RECIPES:
                if recipe == "V1":
                    doc_term, vocab = wordify_v1_band_frequency(bins, B, Q)
                elif recipe == "V2":
                    doc_term, vocab = wordify_v2_magnitude_phrase(bins, B, Q)
                elif recipe == "V3":
                    doc_term, vocab = wordify_v3_band_bin(bins, B, Q)
                else:
                    continue

                dense = doc_term.toarray()
                doc_lengths = dense.sum(axis=1)
                token_totals = dense.sum(axis=0)
                v_actual = int((token_totals > 0).sum())
                zero_doc_rate = float((doc_lengths == 0).mean())
                p_w = token_totals.astype(np.float64)
                p_w = p_w / max(p_w.sum(), 1)

                # Top-N tokens by global count
                top_n = 20
                order = np.argsort(token_totals)[::-1][:top_n]
                top_tokens = [
                    {
                        "token": vocab[int(i)],
                        "count": int(token_totals[int(i)]),
                        "p_global": round(float(p_w[int(i)]), 6),
                    }
                    for i in order if token_totals[int(i)] > 0
                ]

                # Save local artifacts
                local_dir = LOCAL_OUT_ROOT / recipe / f"{scheme}_Q{Q}" / scene_id
                local_dir.mkdir(parents=True, exist_ok=True)
                sparse.save_npz(local_dir / "doc_term.npz", doc_term)
                with (local_dir / "vocab.json").open("w", encoding="utf-8") as h_handle:
                    json.dump({
                        "vocab": vocab,
                        "recipe": recipe,
                        "scheme": scheme,
                        "Q": int(Q),
                        "B": int(B),
                        "D": int(D),
                        "V_full": int(len(vocab)),
                        "V_actual": int(v_actual),
                    }, h_handle)

                # Derived summary
                summary = {
                    "scene_id": scene_id,
                    "recipe": recipe,
                    "scheme": scheme,
                    "Q": int(Q),
                    "B": int(B),
                    "D": int(D),
                    "V_full": int(len(vocab)),
                    "V_actual": int(v_actual),
                    "doc_length_distribution": {
                        "mean": round(float(doc_lengths.mean()), 4),
                        "std": round(float(doc_lengths.std()), 4),
                        "min": int(doc_lengths.min()),
                        "p25": float(np.percentile(doc_lengths, 25)),
                        "p50": float(np.percentile(doc_lengths, 50)),
                        "p75": float(np.percentile(doc_lengths, 75)),
                        "max": int(doc_lengths.max()),
                    },
                    "zero_token_doc_rate": round(zero_doc_rate, 6),
                    "corpus_marginal_entropy_bits": round(
                        shannon_entropy_bits(p_w), 4
                    ),
                    "top_tokens_by_count": top_tokens,
                    "wavelengths_nm_first_last": [
                        round(float(wavelengths[0]), 2),
                        round(float(wavelengths[-1]), 2),
                    ],
                    "local_doc_term_path": str(
                        (local_dir / "doc_term.npz").relative_to(ROOT)
                    ).replace("\\", "/"),
                    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
                    "builder_version": "build_wordifications v0.1",
                }
                out_path = DERIVED_OUT_DIR / f"{scene_id}_{recipe}_{scheme}_Q{Q}.json"
                out_path.parent.mkdir(parents=True, exist_ok=True)
                with out_path.open("w", encoding="utf-8") as o_handle:
                    json.dump(summary, o_handle, separators=(",", ":"))
                summaries.append({
                    "config": f"{recipe}/{scheme}_Q{Q}",
                    "V_actual": v_actual,
                    "doc_len_mean": float(doc_lengths.mean()),
                    "entropy_bits": round(shannon_entropy_bits(p_w), 4),
                })
    return summaries


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_OUT_ROOT.mkdir(parents=True, exist_ok=True)
    written_total = 0
    for scene_id in LABELLED_SCENES:
        print(f"[wordifications] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        # Print a compact summary line per recipe family
        for recipe in RECIPES:
            recipe_rows = [s for s in summaries if s["config"].startswith(recipe + "/")]
            if not recipe_rows:
                continue
            v_min = min(s["V_actual"] for s in recipe_rows)
            v_max = max(s["V_actual"] for s in recipe_rows)
            ent_min = min(s["entropy_bits"] for s in recipe_rows)
            ent_max = max(s["entropy_bits"] for s in recipe_rows)
            print(
                f"  {recipe}: V_actual {v_min}-{v_max}, "
                f"corpus entropy {ent_min:.2f}-{ent_max:.2f} bits "
                f"({len(recipe_rows)} configs)",
                flush=True,
            )
        written_total += len(summaries)
    print(f"[wordifications] done — {written_total} (recipe x quant x scene) configs.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
