"""Wordification recipes V4 / V5 / V10 — extending Procemin V1/V2/V3.

The master plan §7 lists nine recipes beyond the canonical Procemin
V1/V2/V3 (already in `build_wordifications.py`):

  V4  derivative-bin           — band → bin id of d/dλ(spectrum)
  V5  second-derivative-bin    — band → bin id of d²/dλ²(spectrum)
  V6  wavelet-coefficient-bin  — uses pywavelets (deferred)
  V7  absorption-feature triplet — uses pysptools.spectro (deferred)
  V8  endmember-fraction-bin   — uses NFINDR + NNLS (deferred)
  V9  region-token             — per-Felzenszwalb region SAM (deferred)
  V10 band-group               — VNIR / SWIR-1 / SWIR-2 + bin
  V11 codebook-vq              — uses nanopq (deferred)
  V12 GMM token                — uses sklearn.mixture (deferred)

This builder lands the three pure-numpy ones — V4, V5, V10 — for now.
The other six need extra libraries or substantial scaffolding and are
left as follow-ups in pending §6.

Each recipe is sampled across the same scheme × Q grid as V1/V2/V3
(uniform / quantile / lloyd_max × Q in {8, 16, 32}) so the artifacts
slot directly into the existing API plumbing
(`/api/wordifications/{scene}/{recipe}/{scheme}/{q}`).

Output:
  data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/{doc_term.npz, vocab.json}
  data/derived/wordifications/<scene>_<recipe>_<scheme>_Q<q>.json
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
RECIPES = ["V4", "V5", "V10"]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

# V10 spectral regions (AVIRIS / Hyperion conventions)
BAND_GROUPS_NM = [
    ("VNIR", 400.0, 1000.0),
    ("SWIR1", 1000.0, 1800.0),
    ("SWIR2", 1800.0, 2500.0),
]


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def quantize_uniform(values01: np.ndarray, Q: int) -> np.ndarray:
    return np.clip(np.floor(values01 * Q).astype(np.int32), 0, Q - 1)


def quantize_quantile(values01: np.ndarray, Q: int) -> np.ndarray:
    out = np.zeros_like(values01, dtype=np.int32)
    edges = np.percentile(values01, np.linspace(0, 100, Q + 1, endpoint=True), axis=1).T
    for i in range(values01.shape[0]):
        e = edges[i]
        e = np.maximum.accumulate(e + 1e-12 * np.arange(e.size))
        out[i] = np.clip(np.searchsorted(e[1:-1], values01[i]), 0, Q - 1)
    return out


def quantize_lloyd_max(values01: np.ndarray, Q: int, random_state: int = RANDOM_STATE) -> np.ndarray:
    flat = values01.reshape(-1, 1)
    rng = np.random.default_rng(random_state)
    if flat.shape[0] > 50000:
        sub = flat[rng.choice(flat.shape[0], 50000, replace=False)]
    else:
        sub = flat
    km = KMeans(n_clusters=Q, n_init=4, random_state=random_state)
    km.fit(sub)
    sorted_centers = np.sort(km.cluster_centers_.ravel())
    diffs = np.abs(values01[:, :, None] - sorted_centers[None, None, :])
    return np.argmin(diffs, axis=2).astype(np.int32)


def quantize(values01: np.ndarray, scheme: str, Q: int) -> np.ndarray:
    if scheme == "uniform":
        return quantize_uniform(values01, Q)
    if scheme == "quantile":
        return quantize_quantile(values01, Q)
    if scheme == "lloyd_max":
        return quantize_lloyd_max(values01, Q)
    raise ValueError(f"unknown scheme {scheme}")


def shannon_entropy_bits(probs: np.ndarray) -> float:
    p = probs[probs > 0]
    return float(-(p * np.log2(p)).sum())


def first_derivative(spectra: np.ndarray, wavelengths: np.ndarray) -> np.ndarray:
    """Central-difference d/dlambda. Returns same shape as input."""
    return np.gradient(spectra, wavelengths, axis=1)


def second_derivative(spectra: np.ndarray, wavelengths: np.ndarray) -> np.ndarray:
    """Central-difference d^2/dlambda^2. Returns same shape as input."""
    g = np.gradient(spectra, wavelengths, axis=1)
    return np.gradient(g, wavelengths, axis=1)


def wordify_v4_first_derivative(
    spectra: np.ndarray, wavelengths: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V4: vocab = bands; doc_term[d, b] = bin id of d/dlambda at that band.
    The derivative is signed; we normalise per-row to [0, 1] before
    quantising so bin 0 = most negative slope, bin Q-1 = most positive.
    """
    deriv = first_derivative(spectra, wavelengths)
    deriv01 = normalize01_per_row(deriv)
    bins = quantize(deriv01, scheme, Q)
    D, B = bins.shape
    return sparse.csr_matrix(bins.astype(np.int32)), [
        f"d1_b{b:03d}" for b in range(B)
    ]


def wordify_v5_second_derivative(
    spectra: np.ndarray, wavelengths: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    deriv2 = second_derivative(spectra, wavelengths)
    deriv01 = normalize01_per_row(deriv2)
    bins = quantize(deriv01, scheme, Q)
    D, B = bins.shape
    return sparse.csr_matrix(bins.astype(np.int32)), [
        f"d2_b{b:03d}" for b in range(B)
    ]


def wordify_v10_band_group(
    spectra: np.ndarray, wavelengths: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V10: vocab = (region, bin) joint tokens. For each spectrum and
    each of three regions (VNIR / SWIR-1 / SWIR-2) compute the mean
    intensity over that region, normalise per-row across the three
    regions to [0, 1], quantise with Q levels, then doc_term[d, r*Q + q]
    = 1 if region r of spectrum d landed in bin q. Each document has
    exactly len(regions) non-zero entries (one bin per region)."""
    D, B = spectra.shape
    region_means = np.zeros((D, len(BAND_GROUPS_NM)), dtype=np.float32)
    region_present = np.zeros(len(BAND_GROUPS_NM), dtype=bool)
    region_band_counts = np.zeros(len(BAND_GROUPS_NM), dtype=np.int64)
    for r, (_, lo, hi) in enumerate(BAND_GROUPS_NM):
        idx = np.flatnonzero((wavelengths >= lo) & (wavelengths <= hi))
        region_band_counts[r] = idx.size
        if idx.size == 0:
            continue
        region_present[r] = True
        region_means[:, r] = spectra[:, idx].mean(axis=1)

    # Normalise the (D, n_regions) matrix per-row so each spectrum's
    # region-mean profile is on [0, 1]. Spectra outside any region
    # (e.g. Pavia U has no SWIR coverage) get zero contribution there.
    region01 = normalize01_per_row(region_means)
    bins = quantize(region01, scheme, Q)

    R = len(BAND_GROUPS_NM)
    rows = np.repeat(np.arange(D), R)
    region_idx = np.tile(np.arange(R), D)
    cols = region_idx * Q + bins.ravel()
    # Mask out absent regions for that scene
    keep = np.tile(region_present.astype(bool), D)
    rows = rows[keep]
    cols = cols[keep]
    data = np.ones(rows.size, dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data, (rows, cols)), shape=(D, R * Q), dtype=np.int32
    )
    vocab = [f"{name}_q{q:02d}" for (name, _, _) in BAND_GROUPS_NM for q in range(Q)]
    return doc_term, vocab


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
    sample_spectra = spectra[sample_idx_local].astype(np.float32)
    D = sample_spectra.shape[0]
    wavelengths = approximate_wavelengths(config, B).astype(np.float64)

    summaries: list[dict] = []
    for scheme in SCHEMES:
        for Q in Q_VALUES:
            for recipe in RECIPES:
                if recipe == "V4":
                    doc_term, vocab = wordify_v4_first_derivative(
                        sample_spectra, wavelengths, scheme, Q
                    )
                elif recipe == "V5":
                    doc_term, vocab = wordify_v5_second_derivative(
                        sample_spectra, wavelengths, scheme, Q
                    )
                elif recipe == "V10":
                    doc_term, vocab = wordify_v10_band_group(
                        sample_spectra, wavelengths, scheme, Q
                    )
                else:
                    continue

                dense = doc_term.toarray()
                doc_lengths = dense.sum(axis=1)
                token_totals = dense.sum(axis=0)
                v_actual = int((token_totals > 0).sum())
                zero_doc_rate = float((doc_lengths == 0).mean())
                p_w = token_totals.astype(np.float64)
                p_w = p_w / max(p_w.sum(), 1)

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
                    "builder_version": "build_wordifications_v4plus v0.1",
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
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[wordifications_v4plus] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if not summaries:
            print("  skipped", flush=True)
            continue
        # Print the headline 3 (one per recipe at the canonical scheme/Q)
        for s in summaries[:9]:  # 3 recipes × 3 schemes per scene printed at Q=8
            if s["config"].endswith("_Q8"):
                print(
                    f"  {s['config']:25s} V_actual={s['V_actual']:5d} "
                    f"doc_len_mean={s['doc_len_mean']:.1f} "
                    f"entropy_bits={s['entropy_bits']:.3f}",
                    flush=True,
                )
        written += 1
    print(f"[wordifications_v4plus] done — {written} scenes processed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
