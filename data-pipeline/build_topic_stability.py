"""B-6 Topic stability: Hungarian-matched cosine across seeds.

Master plan Addendum B Axis A (internal stability — Greene-O'Callaghan-
Cunningham 2014, ACM CSUR 2024).

For each labelled scene at the canonical K:

  - Refit LDA at K with N_SEEDS seeds on the canonical band-frequency
    document-term matrix
  - For every seed pair, Hungarian-match topics by cosine and report
    the per-topic matched cosine
  - Aggregate to per-topic stability vector (median cosine across all
    seed pairs after matching to seed 0) and to scene-level
    matched_cosine_mean / min / std

The existing `build_lda_sweep` already reports `matched_cosine_mean`
per K across seeds, but does not produce the per-topic vector or the
agreement matrix that the Procemin / Greene-style stability tests
expect. This builder closes that gap at the canonical K.

Output: data/derived/topic_stability/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import linear_sum_assignment
from sklearn.decomposition import LatentDirichletAllocation

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "topic_stability"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
import os as _os
N_SEEDS = int(_os.environ.get("CAOS_TOPIC_STABILITY_N_SEEDS", "7"))
SAMPLES_PER_CLASS = 220
SCALE = 12
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def fit_lda(doc_term: np.ndarray, K: int, seed: int):
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=seed,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    lda.fit(doc_term)
    return lda.components_ / lda.components_.sum(axis=1, keepdims=True)


def matched_cosine_per_topic(phi_a: np.ndarray, phi_b: np.ndarray) -> np.ndarray:
    """Returns the matched-cosine vector aligning phi_b to phi_a."""
    K = min(phi_a.shape[0], phi_b.shape[0])
    a = phi_a[:K]
    b = phi_b[:K]
    norms_a = np.linalg.norm(a, axis=1, keepdims=True)
    norms_b = np.linalg.norm(b, axis=1, keepdims=True)
    a_n = a / np.where(norms_a < 1e-12, 1.0, norms_a)
    b_n = b / np.where(norms_b < 1e-12, 1.0, norms_b)
    cos = a_n @ b_n.T
    row_ind, col_ind = linear_sum_assignment(-cos)
    matched = cos[row_ind, col_ind]
    # Reorder so output index = topic id in seed_a (row order)
    out = np.empty(K, dtype=np.float64)
    out[row_ind] = matched
    return out


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

    fit_dir = LOCAL_FIT_DIR / scene_id
    K_default = 8
    K = K_default
    if (fit_dir / "phi.npy").exists():
        try:
            phi = np.load(fit_dir / "phi.npy")
            K = int(phi.shape[0])
        except Exception:
            K = K_default

    cube, gt, _ = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    pixel_indices = np.flatnonzero(labelled_mask)
    spectra = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    X = spectra[sample_idx_local]
    doc_term = band_frequency_counts(X, scale=SCALE).astype(np.float32)

    seeds = list(range(N_SEEDS))
    phi_per_seed: list[np.ndarray] = []
    for seed in seeds:
        phi_per_seed.append(fit_lda(doc_term, K, seed))

    # Pairwise matched-cosine matrix (N_SEEDS x N_SEEDS)
    pair_matrix = np.full((len(seeds), len(seeds)), fill_value=np.nan, dtype=np.float64)
    pair_min = np.full((len(seeds), len(seeds)), fill_value=np.nan, dtype=np.float64)
    pair_std = np.full((len(seeds), len(seeds)), fill_value=np.nan, dtype=np.float64)
    per_topic_cos: list[list[float]] = []
    # Each seed[i] vs seed[0] gives a per-topic cosine vector aligned to seed[0]'s topic ids
    for j in range(len(seeds)):
        cos_vec = matched_cosine_per_topic(phi_per_seed[0], phi_per_seed[j])
        per_topic_cos.append([round(float(v), 6) for v in cos_vec])

    for i in range(len(seeds)):
        for j in range(len(seeds)):
            cos_vec = matched_cosine_per_topic(phi_per_seed[i], phi_per_seed[j])
            pair_matrix[i, j] = float(cos_vec.mean())
            pair_min[i, j] = float(cos_vec.min())
            pair_std[i, j] = float(cos_vec.std())

    # Aggregate to per-topic stability (median cosine across all pairs against seed 0)
    arr = np.array(per_topic_cos, dtype=np.float64)  # (N_SEEDS, K) — row 0 is self (1.0)
    per_topic_median_vs_seed0 = np.median(arr[1:], axis=0)
    per_topic_min_vs_seed0 = np.min(arr[1:], axis=0)
    per_topic_std_vs_seed0 = np.std(arr[1:], axis=0)

    # Scene-level summary off-diagonal
    off = pair_matrix[~np.eye(len(seeds), dtype=bool)]
    return {
        "scene_id": scene_id,
        "K": int(K),
        "seeds": seeds,
        "wordification": "band-frequency",
        "quantization_scale": SCALE,
        "samples_per_class": SAMPLES_PER_CLASS,
        "seed_pair_matched_cosine_mean": [
            [round(float(v), 6) for v in row] for row in pair_matrix
        ],
        "seed_pair_matched_cosine_min": [
            [round(float(v), 6) for v in row] for row in pair_min
        ],
        "seed_pair_matched_cosine_std": [
            [round(float(v), 6) for v in row] for row in pair_std
        ],
        "per_topic_matched_cosine_vs_seed0": [
            row for row in per_topic_cos
        ],
        "per_topic_stability_summary": [
            {
                "topic_id": int(i + 1),
                "median_matched_cosine_vs_seed0": round(float(per_topic_median_vs_seed0[i]), 6),
                "min_matched_cosine_vs_seed0": round(float(per_topic_min_vs_seed0[i]), 6),
                "std_matched_cosine_vs_seed0": round(float(per_topic_std_vs_seed0[i]), 6),
            }
            for i in range(int(K))
        ],
        "scene_stability_summary": {
            "off_diagonal_mean": round(float(off.mean()), 6),
            "off_diagonal_min": round(float(off.min()), 6),
            "off_diagonal_std": round(float(off.std()), 6),
        },
        "framework_axis": "B-6 (master plan Addendum B Axis A): topic stability via Hungarian-matched cosine across seeds — per-topic vector + agreement matrix",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_topic_stability v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[stability] {scene_id} ...", flush=True)
        try:
            payload = build_for_scene(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            import traceback
            traceback.print_exc()
            continue
        if payload is None:
            print("  skipped", flush=True)
            continue
        out_path = DERIVED_OUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as h:
            json.dump(payload, h, separators=(",", ":"))
        s = payload["scene_stability_summary"]
        print(
            f"  K={payload['K']:2d}  off-diag mean={s['off_diagonal_mean']:.3f}  "
            f"min={s['off_diagonal_min']:.3f}  std={s['off_diagonal_std']:.3f}",
            flush=True,
        )
        for entry in payload["per_topic_stability_summary"][:6]:
            print(
                f"    topic {entry['topic_id']:2d}: median={entry['median_matched_cosine_vs_seed0']:.3f}  "
                f"min={entry['min_matched_cosine_vs_seed0']:.3f}",
                flush=True,
            )
        written += 1
    print(f"[stability] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
