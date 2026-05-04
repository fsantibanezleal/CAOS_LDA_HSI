"""Wordification recipes V7 (absorption-feature triplet) + V11 (codebook-VQ).

V7 absorption-feature triplet
-----------------------------
For each spectrum we compute the **upper convex hull** of (wavelength,
reflectance) and the continuum-removed spectrum =
spectrum / hull_envelope. Local minima of the continuum-removed
spectrum where (1 - cont_removed) >= ABSORPTION_THRESHOLD are kept as
absorption features. For each feature we record three quantities:

  - centroid wavelength (band-bucket id)
  - depth = max(1 - cont_removed) within the feature window
  - area = integrated (1 - cont_removed) over the feature window

Tokens combine (centroid_bucket, depth_bin, area_bin) — the "triplet"
in the master plan name. We use a small fixed number of wavelength
buckets (CENTROID_BUCKETS = 8) so the vocabulary stays compact.

pysptools.spectro.FeaturesConvexHullQuotient is the canonical
implementation but is fragile on band-frequency-style noisy spectra,
so we ship a self-contained convex-hull extractor (Clark-Roush 1984
hull-quotient with monotone-stack convex hull).

V11 codebook-VQ
---------------
Product Quantisation (Jegou-Douze-Schmid 2011) via `nanopq.PQ`. The
B-band spectrum is partitioned into M = NUM_SUBVECTORS sub-vectors,
each of length B/M, and a Ks=Q codebook is learned per sub-vector via
k-means. Each spectrum becomes M codes; vocab = M × Q tokens.

Each recipe samples the same scheme × Q grid as V1/V2/V3
(uniform / quantile / lloyd_max × Q in {8, 16, 32}); the schemes are
ignored by V7 (its own per-feature quantisation) and by V11 (PQ owns
the quantisation). They are still iterated so the artifacts slot
into the existing API plumbing.

Output:
  data/local/wordifications/<recipe>/<scheme>_Q<q>/<scene>/{doc_term.npz, vocab.json}
  data/derived/wordifications/<scene>_<recipe>_<scheme>_Q<q>.json
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import nanopq
import numpy as np
from scipy import sparse

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
RECIPES = ["V7", "V11"]
SCHEMES = ["uniform", "quantile", "lloyd_max"]
Q_VALUES = [8, 16, 32]
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42

# V7 settings
ABSORPTION_THRESHOLD = 0.02   # min depth (1 - cont_removed) to keep
MAX_FEATURES_PER_DOC = 6
CENTROID_BUCKETS = 8

# V11 settings
NUM_SUBVECTORS = 4


def shannon_entropy_bits(probs: np.ndarray) -> float:
    p = probs[probs > 0]
    return float(-(p * np.log2(p)).sum())


def upper_convex_hull(wvl: np.ndarray, spec: np.ndarray) -> np.ndarray:
    """Return the linearly-interpolated upper convex hull envelope of
    (wvl, spec). Andrew's monotone chain on (wvl, spec) keeping the
    upper edge."""
    n = wvl.size
    if n < 3:
        return spec.copy()
    pts = np.column_stack([wvl, spec])
    # Upper hull via monotone chain
    upper: list[int] = []
    for i in range(n):
        while len(upper) >= 2:
            o, a = upper[-2], upper[-1]
            cross = (
                (pts[a, 0] - pts[o, 0]) * (pts[i, 1] - pts[o, 1])
                - (pts[a, 1] - pts[o, 1]) * (pts[i, 0] - pts[o, 0])
            )
            if cross >= 0:  # right turn (or collinear) → pop
                upper.pop()
            else:
                break
        upper.append(i)
    hx = pts[upper, 0]
    hy = pts[upper, 1]
    # Linear interpolation back to the full wavelength grid
    return np.interp(wvl, hx, hy).astype(np.float64)


def continuum_removed(wvl: np.ndarray, spec: np.ndarray) -> np.ndarray:
    hull = upper_convex_hull(wvl, spec)
    safe = np.where(hull > 1e-12, hull, 1.0)
    return spec / safe


def extract_absorption_features(
    wvl: np.ndarray, spec: np.ndarray, threshold: float = ABSORPTION_THRESHOLD
) -> list[dict]:
    """Returns a list of feature dicts: {centroid_nm, depth, area}."""
    cr = continuum_removed(wvl, spec)
    abs_signal = 1.0 - cr  # peaks where the absorption is deep
    # Find local maxima of abs_signal above threshold
    if abs_signal.size < 3:
        return []
    peaks = []
    for i in range(1, abs_signal.size - 1):
        if abs_signal[i] >= threshold and abs_signal[i] >= abs_signal[i - 1] and abs_signal[i] >= abs_signal[i + 1]:
            peaks.append(i)
    if not peaks:
        return []

    features: list[dict] = []
    for p in peaks:
        # Walk left/right to find the feature window where abs_signal
        # crosses below threshold/4 (a soft shoulder).
        lo = p
        while lo > 0 and abs_signal[lo - 1] > threshold / 4:
            lo -= 1
        hi = p
        while hi < abs_signal.size - 1 and abs_signal[hi + 1] > threshold / 4:
            hi += 1
        if hi - lo < 1:
            continue
        depth = float(abs_signal[p])
        area = float(np.trapezoid(abs_signal[lo:hi + 1], wvl[lo:hi + 1]))
        features.append({
            "centroid_nm": float(wvl[p]),
            "depth": depth,
            "area": area,
        })
    # Sort by depth descending and keep top N
    features.sort(key=lambda f: -f["depth"])
    return features[:MAX_FEATURES_PER_DOC]


def wordify_v7(
    spectra: np.ndarray, wavelengths: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V7 absorption-feature triplet. Vocab = (centroid_bucket, depth_bin,
    area_bin) joints. Each doc emits 0..MAX_FEATURES_PER_DOC tokens."""
    del scheme
    D, B = spectra.shape
    # Gather all features, then collect global depth / area distributions
    # so we can quantise them with a shared Q-bin scheme.
    docs_features: list[list[dict]] = [
        extract_absorption_features(wavelengths, spectra[d]) for d in range(D)
    ]
    all_depths = np.array([f["depth"] for fs in docs_features for f in fs], dtype=np.float64)
    all_areas = np.array([f["area"] for fs in docs_features for f in fs], dtype=np.float64)

    if all_depths.size == 0:
        # No features anywhere; return a single-token document for each.
        rows = np.arange(D)
        cols = np.zeros(D, dtype=np.int64)
        data = np.ones(D, dtype=np.int32)
        doc_term = sparse.csr_matrix(
            (data, (rows, cols)), shape=(D, 1), dtype=np.int32
        )
        return doc_term, ["abs_none"]

    depth_edges = np.quantile(all_depths, np.linspace(0, 1, Q + 1))
    area_edges = np.quantile(all_areas, np.linspace(0, 1, Q + 1))
    # Make edges strictly monotonic to keep digitize sane
    depth_edges = np.maximum.accumulate(depth_edges + 1e-12 * np.arange(depth_edges.size))
    area_edges = np.maximum.accumulate(area_edges + 1e-12 * np.arange(area_edges.size))

    wvl_min, wvl_max = float(wavelengths.min()), float(wavelengths.max())
    wvl_step = (wvl_max - wvl_min) / max(1, CENTROID_BUCKETS)

    rows: list[int] = []
    cols: list[int] = []
    vocab_seen: dict[tuple[int, int, int], int] = {}
    vocab: list[str] = []
    for d in range(D):
        for f in docs_features[d]:
            cb = int(min(CENTROID_BUCKETS - 1, max(0, (f["centroid_nm"] - wvl_min) / max(wvl_step, 1e-9))))
            db = int(np.clip(np.searchsorted(depth_edges[1:-1], f["depth"]), 0, Q - 1))
            ab = int(np.clip(np.searchsorted(area_edges[1:-1], f["area"]), 0, Q - 1))
            key = (cb, db, ab)
            if key not in vocab_seen:
                vocab_seen[key] = len(vocab)
                vocab.append(f"abs_c{cb}_d{db}_a{ab}")
            rows.append(d)
            cols.append(vocab_seen[key])
    if not vocab:
        vocab = ["abs_none"]
    rows_arr = np.asarray(rows, dtype=np.int64)
    cols_arr = np.asarray(cols, dtype=np.int64)
    data_arr = np.ones(rows_arr.size, dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data_arr, (rows_arr, cols_arr)), shape=(D, len(vocab)), dtype=np.int32
    )
    return doc_term, vocab


def wordify_v11(
    spectra: np.ndarray, scheme: str, Q: int
) -> tuple[sparse.csr_matrix, list[str]]:
    """V11 codebook-VQ via nanopq.PQ(M=NUM_SUBVECTORS, Ks=Q). Each
    spectrum becomes M codes; vocab = (m, code) joints, total size M*Q."""
    del scheme
    D, B = spectra.shape
    M = NUM_SUBVECTORS
    # nanopq requires B divisible by M; truncate to nearest multiple
    B_use = (B // M) * M
    if B_use == 0:
        # Degenerate fallback
        return sparse.csr_matrix(np.zeros((D, 1), dtype=np.int32)), ["pq_none"]
    X = spectra[:, :B_use].astype(np.float32)
    pq = nanopq.PQ(M=M, Ks=Q, verbose=False)
    pq.fit(X)
    codes = pq.encode(X)  # (D, M)
    rows = np.repeat(np.arange(D), M)
    sub_idx = np.tile(np.arange(M), D)
    cols = sub_idx * Q + codes.ravel().astype(np.int64)
    data = np.ones(D * M, dtype=np.int32)
    doc_term = sparse.csr_matrix(
        (data, (rows, cols)), shape=(D, M * Q), dtype=np.int32
    )
    vocab = [f"pq_m{m}_c{c:02d}" for m in range(M) for c in range(Q)]
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
                if recipe == "V7":
                    doc_term, vocab = wordify_v7(sample_spectra, wavelengths, scheme, Q)
                elif recipe == "V11":
                    doc_term, vocab = wordify_v11(sample_spectra, scheme, Q)
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
                    "builder_version": "build_wordifications_v7v11 v0.1",
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
        print(f"[wordifications_v7v11] {scene_id} ...", flush=True)
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
        for s in summaries:
            if s["config"].endswith("_Q8"):
                print(
                    f"  {s['config']:25s} V_actual={s['V_actual']:5d} "
                    f"doc_len_mean={s['doc_len_mean']:.1f} "
                    f"entropy_bits={s['entropy_bits']:.3f}",
                    flush=True,
                )
        written += 1
    print(f"[wordifications_v7v11] done — {written} scenes processed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
