"""Wordification recipes V6 / V8 / V9 / V12 — completing the §7 set
(except V7 absorption triplet and V11 codebook-VQ which still pend).

  V6  wavelet-coefficient-bin    — pywavelets db4 multi-resolution
                                  decomposition, coefficients quantised
  V8  endmember-fraction-bin     — NFINDR + NNLS abundances per
                                  endmember, quantised
  V9  region-token (per-region SAM) — Felzenszwalb regions of the
                                  scene; per-spectrum token = (region,
                                  SAM bin to that region's mean)
  V12 GMM-token                   — sklearn.mixture.GaussianMixture(Q)
                                  on per-band intensities; tokens =
                                  (band, GMM component) joints

Each recipe samples the same scheme × Q grid as V1/V2/V3
(uniform / quantile / lloyd_max × Q in {8, 16, 32}). Outputs slot
into the existing `/api/wordifications/{scene}/{recipe}/{scheme}/{q}`
endpoint.

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
import pywt
from scipy import sparse
from scipy.optimize import nnls
from sklearn.cluster import KMeans
from sklearn.mixture import GaussianMixture

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
LOCAL_GROUPINGS_DIR = DATA_DIR / "local" / "groupings"
DERIVED_ENDMEMBER_DIR = DERIVED_DIR / "endmember_baseline"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
RECIPES = ["V6", "V8", "V9", "V12"]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

# V6 wavelet config
WAVELET_FAMILY = "db4"
WAVELET_LEVEL = 4

# V8 NNLS sum-to-one penalty
SUM_TO_ONE_DELTA = 100.0


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
    km = KMeans(n_clusters=min(Q, max(2, len(np.unique(sub)))), n_init=4, random_state=random_state)
    km.fit(sub)
    sorted_centers = np.sort(km.cluster_centers_.ravel())
    diffs = np.abs(values01[:, :, None] - sorted_centers[None, None, :])
    bins = np.argmin(diffs, axis=2).astype(np.int32)
    # Pad bin range to Q if KMeans collapsed to fewer clusters
    if sorted_centers.size < Q:
        bins = np.clip(bins, 0, sorted_centers.size - 1)
    return bins


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


def safe_sam(a: np.ndarray, b: np.ndarray) -> float:
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    cos = float(np.dot(a, b) / (na * nb))
    return float(np.arccos(np.clip(cos, -1.0, 1.0)))


# ----- V6 wavelet ---------------------------------------------------------

def wordify_v6_wavelet(
    spectra: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """Discrete wavelet decomposition (db4, level=WAVELET_LEVEL).
    Each spectrum's coefficient vector is concatenated cA_n, cD_n, ...,
    cD_1; we treat coefficient absolute values as the per-position
    intensity, normalise per-row, and quantise. Vocab tokens are
    (level, position_within_level)."""
    coeff_lists = [pywt.wavedec(spectra[d], WAVELET_FAMILY, level=WAVELET_LEVEL) for d in range(spectra.shape[0])]
    # All spectra share band count B → shapes are identical
    sizes = [c.size for c in coeff_lists[0]]
    n_bands_total = int(sum(sizes))
    coef_matrix = np.zeros((spectra.shape[0], n_bands_total), dtype=np.float64)
    for d, coeffs in enumerate(coeff_lists):
        coef_matrix[d] = np.concatenate(coeffs)
    abs_coef = np.abs(coef_matrix)
    abs_coef01 = normalize01_per_row(abs_coef)
    bins = quantize(abs_coef01, scheme, Q)
    # Token names: w<level>_<idx> with cA = level 0 (approximation)
    vocab = []
    pos = 0
    for level_idx, size in enumerate(sizes):
        kind = "cA" if level_idx == 0 else "cD"
        level_name = WAVELET_LEVEL - max(0, level_idx - 1)
        for i in range(size):
            vocab.append(f"w_{kind}{level_name}_{i:03d}")
            pos += 1
    return sparse.csr_matrix(bins.astype(np.int32)), vocab


# ----- V8 endmember-fraction ----------------------------------------------

def nnls_unmix(X: np.ndarray, endmembers: np.ndarray, delta: float = SUM_TO_ONE_DELTA) -> np.ndarray:
    """Per-pixel NNLS unmixing with sum-to-one penalty; returns
    abundance matrix (D, K). Falls back to clipped UCLS for any pixel
    where NNLS exceeds its iteration budget (matches build_endmember_baseline)."""
    D, B = X.shape
    K = endmembers.shape[0]
    A = np.vstack([endmembers.T, delta * np.ones((1, K))])
    A_pinv = np.linalg.pinv(endmembers.T)
    abund = np.zeros((D, K), dtype=np.float64)
    for j in range(D):
        b = np.append(X[j], delta)
        try:
            a, _ = nnls(A, b, maxiter=10 * (B + K + 1))
        except RuntimeError:
            a = np.clip(A_pinv @ X[j], 0.0, None)
        s = a.sum()
        if s > 1e-12:
            a = a / s
        abund[j] = a
    return abund


def wordify_v8_endmember_fraction(
    spectra: np.ndarray, endmembers: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V8: vocab = endmembers; doc_term[d, e] = bin id of abundance
    of endmember e in spectrum d. K endmembers come from the
    pre-computed NFINDR fit (build_endmember_baseline); abundances
    via NNLS-with-sum-to-one. Resulting matrix is dense (every
    spectrum has K non-zero entries one per endmember)."""
    K = endmembers.shape[0]
    abund = nnls_unmix(spectra, endmembers)
    # Per-row normalise abundances to [0, 1] (already sum to 1 → just rescale)
    abund_max = abund.max(axis=1, keepdims=True)
    abund01 = abund / np.maximum(abund_max, 1e-12)
    bins = quantize(abund01.astype(np.float32), scheme, Q)
    return sparse.csr_matrix(bins.astype(np.int32)), [f"em{k:02d}" for k in range(K)]


# ----- V9 region SAM ------------------------------------------------------

def wordify_v9_region_sam(
    spectra: np.ndarray,
    pixel_indices: np.ndarray,
    spatial_shape: tuple[int, int],
    region_assignment_flat: np.ndarray | None,
    scheme: str,
    Q: int,
) -> tuple[sparse.csr_matrix, list[str]]:
    """V9: region-token using Felzenszwalb partitions of the cube.
    For each spectrum d in the sampled set:
      - find its region r via the per-pixel Felzenszwalb assignment
      - compute SAM(spectrum, region_mean_spectrum)
    Then for each region we collect the SAM distribution across all
    its sampled members and quantise. Token is (region_id, SAM_bin).
    Each document has exactly 1 token (its own region + SAM bin).
    Vocab is therefore R × Q where R is the number of *occupied*
    regions in the sample.
    """
    if region_assignment_flat is None:
        # No groupings available — fall back to a trivial single-region case.
        return sparse.csr_matrix(np.ones((spectra.shape[0], 1), dtype=np.int32)), ["region00_q00"]
    H, W = spatial_shape
    region_per_doc = region_assignment_flat[pixel_indices]
    unique_regions = np.unique(region_per_doc)
    region_to_local = {int(r): i for i, r in enumerate(unique_regions)}
    R = len(unique_regions)

    # Region mean spectrum from the sampled docs
    region_means = np.zeros((R, spectra.shape[1]), dtype=np.float64)
    for r in unique_regions:
        members = spectra[region_per_doc == r]
        region_means[region_to_local[int(r)]] = members.mean(axis=0)

    # SAM per doc to its own region's mean
    sam_per_doc = np.zeros(spectra.shape[0], dtype=np.float64)
    for d in range(spectra.shape[0]):
        r_local = region_to_local[int(region_per_doc[d])]
        sam_per_doc[d] = safe_sam(spectra[d], region_means[r_local])

    # Per-region quantise the SAM distribution to Q bins. If a region
    # has fewer than Q sampled members we cannot fit a Q-cluster Lloyd-
    # Max quantizer, and quantile / uniform are still safe but
    # uninformative; in that small-region case we fall back to a
    # simple linear bucketing.
    bins_per_doc = np.zeros(spectra.shape[0], dtype=np.int32)
    for r in unique_regions:
        mask = region_per_doc == r
        sam_r = sam_per_doc[mask]
        if sam_r.size == 0:
            continue
        rng_span = sam_r.max() - sam_r.min()
        if rng_span < 1e-12:
            local01 = np.zeros_like(sam_r)
        else:
            local01 = (sam_r - sam_r.min()) / rng_span
        if sam_r.size < Q or scheme == "lloyd_max" and sam_r.size < max(Q, 4):
            # Fallback: uniform binning in [0, Q-1]
            bins_per_doc[mask] = np.clip(
                np.floor(local01 * Q).astype(np.int32), 0, Q - 1
            )
        else:
            bins_per_doc[mask] = quantize(local01.reshape(1, -1), scheme, Q).ravel()

    # Build sparse doc-term: each doc has one (region_id, bin) token
    cols = np.array([
        region_to_local[int(region_per_doc[d])] * Q + bins_per_doc[d]
        for d in range(spectra.shape[0])
    ])
    rows = np.arange(spectra.shape[0])
    data = np.ones(spectra.shape[0], dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data, (rows, cols)), shape=(spectra.shape[0], R * Q), dtype=np.int32
    )
    vocab = [f"region{int(r):03d}_q{q:02d}" for r in unique_regions for q in range(Q)]
    return doc_term, vocab


# ----- V12 GMM ------------------------------------------------------------

def wordify_v12_gmm(
    spectra: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V12: vocab = (band, gmm_component); doc_term[d, b*Q + g] = 1 if
    intensity at band b of spectrum d is assigned to GMM component g.
    GMM is fit globally on the per-band-per-spectrum intensity values
    (1D, Q components). The "scheme" argument is ignored — GMM
    replaces the quantizer; we use it for parameter consistency."""
    del scheme
    flat = spectra.reshape(-1, 1).astype(np.float64)
    rng = np.random.default_rng(RANDOM_STATE)
    if flat.shape[0] > 50000:
        sub = flat[rng.choice(flat.shape[0], 50000, replace=False)]
    else:
        sub = flat
    gmm = GaussianMixture(
        n_components=Q,
        covariance_type="diag",
        random_state=RANDOM_STATE,
        max_iter=80,
    )
    gmm.fit(sub)
    # Sort components by mean so component 0 = lowest intensity
    order = np.argsort(gmm.means_.ravel())
    inverse_order = np.empty_like(order)
    inverse_order[order] = np.arange(Q)
    flat_assignments = gmm.predict(flat)
    sorted_assignments = inverse_order[flat_assignments]
    bins = sorted_assignments.reshape(spectra.shape).astype(np.int32)

    D, B = bins.shape
    rows = np.repeat(np.arange(D), B)
    band_idx = np.tile(np.arange(B), D)
    cols = band_idx * Q + bins.ravel()
    data = np.ones(D * B, dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data, (rows, cols)), shape=(D, B * Q), dtype=np.int32
    )
    vocab = [f"b{b:03d}_g{g:02d}" for b in range(B) for g in range(Q)]
    return doc_term, vocab


# ----- driver -------------------------------------------------------------

def load_felzenszwalb_assignment(scene_id: str, H: int, W: int) -> np.ndarray | None:
    """Returns flat (H*W,) int32 region ids if available."""
    path = LOCAL_GROUPINGS_DIR / "felzenszwalb" / scene_id / "assignment.bin"
    if not path.exists():
        return None
    raw = np.frombuffer(path.read_bytes(), dtype=np.uint16)
    if raw.size != H * W:
        return None
    return raw.astype(np.int32)


def load_endmembers(scene_id: str) -> np.ndarray | None:
    """Returns NFINDR endmembers (K, B) from build_endmember_baseline."""
    path = DERIVED_ENDMEMBER_DIR / f"{scene_id}.json"
    if not path.exists():
        return None
    payload = json.load(path.open("r", encoding="utf-8"))
    em = np.asarray(payload.get("nfindr_endmembers"), dtype=np.float64)
    if em.ndim != 2:
        return None
    return em


def build_for_scene(scene_id: str) -> list[dict]:
    if scene_id not in SCENES or not has_labels(scene_id):
        return []

    cube, gt, config = load_scene(scene_id)
    H, W, B = cube.shape
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
    sample_pixel_indices = pixel_indices[sample_idx_local]
    sample_spectra = spectra[sample_idx_local].astype(np.float32)
    D = sample_spectra.shape[0]
    wavelengths = approximate_wavelengths(config, B).astype(np.float64)

    region_flat = load_felzenszwalb_assignment(scene_id, H, W)
    endmembers = load_endmembers(scene_id)

    summaries: list[dict] = []
    for scheme in SCHEMES:
        for Q in Q_VALUES:
            for recipe in RECIPES:
                if recipe == "V6":
                    doc_term, vocab = wordify_v6_wavelet(sample_spectra, scheme, Q)
                elif recipe == "V8":
                    if endmembers is None:
                        continue
                    doc_term, vocab = wordify_v8_endmember_fraction(
                        sample_spectra.astype(np.float64), endmembers, scheme, Q
                    )
                elif recipe == "V9":
                    doc_term, vocab = wordify_v9_region_sam(
                        sample_spectra, sample_pixel_indices, (H, W), region_flat, scheme, Q
                    )
                elif recipe == "V12":
                    doc_term, vocab = wordify_v12_gmm(sample_spectra, scheme, Q)
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
                    "builder_version": "build_wordifications_v6plus v0.1",
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
        print(f"[wordifications_v6plus] {scene_id} ...", flush=True)
        try:
            summaries = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if not summaries:
            print("  skipped (missing endmembers / felzenszwalb / labels)", flush=True)
            continue
        for s in summaries:
            if s["config"].endswith("_Q8"):
                print(
                    f"  {s['config']:25s} V_actual={s['V_actual']:5d} "
                    f"doc_len_mean={s['doc_len_mean']:.1f} "
                    f"entropy_bits={s['entropy_bits']:.3f}",
                    flush=True,
                )
        written += 1
    print(f"[wordifications_v6plus] done — {written} scenes processed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
