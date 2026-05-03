"""B-2 Rate-distortion curve: LDA vs NMF vs PCA across K.

Master plan Addendum B Axis G (reconstruction quality vs other K-dim
methods).

For each labelled scene, build the canonical band-frequency document-
term matrix used by the LDA pipeline, then for K in {4, 6, 8, 10, 12, 16}
fit each method on a train split and report reconstruction RMSE on a
held-out test split. The curve K -> RMSE answers "how much spectral
information is preserved at K dimensions for each compressor", and is
a fair-baseline reading on the same axis the linear probe touches from
the supervised side.

Methods:
  - LDA (sklearn) — reconstruction = theta @ phi * doc_length
  - NMF (sklearn) — reconstruction = W @ H
  - PCA (sklearn) — reconstruction = X_centered_K @ V.T + mean

Output: data/derived/rate_distortion_curve/<scene>.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import (
    NMF,
    PCA,
    LatentDirichletAllocation,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import has_labels
from research_core.paths import DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

warnings.filterwarnings("ignore")


DERIVED_OUT_DIR = DERIVED_DIR / "rate_distortion_curve"

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
K_GRID = [4, 6, 8, 10, 12, 16]
SAMPLES_PER_CLASS = 220
SCALE = 12
TRAIN_FRAC = 0.8
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def rmse(a: np.ndarray, b: np.ndarray) -> float:
    diff = a.astype(np.float64) - b.astype(np.float64)
    return float(np.sqrt(np.mean(diff * diff)))


def normalised_rmse(a: np.ndarray, b: np.ndarray) -> float:
    """RMSE divided by the std of the target."""
    s = float(np.std(a))
    return rmse(a, b) / s if s > 1e-12 else float("nan")


def fit_lda_reconstruction(doc_train: np.ndarray, doc_test: np.ndarray, K: int) -> dict:
    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=60,
        batch_size=512,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    lda.fit(doc_train)
    phi = lda.components_ / lda.components_.sum(axis=1, keepdims=True)

    theta_test = lda.transform(doc_test)
    theta_test = theta_test / np.clip(theta_test.sum(axis=1, keepdims=True), 1e-12, None)
    doc_lengths = doc_test.sum(axis=1, keepdims=True)
    recon_test = (theta_test @ phi) * doc_lengths

    theta_train = lda.transform(doc_train)
    theta_train = theta_train / np.clip(theta_train.sum(axis=1, keepdims=True), 1e-12, None)
    train_lengths = doc_train.sum(axis=1, keepdims=True)
    recon_train = (theta_train @ phi) * train_lengths

    try:
        perp_test = float(lda.perplexity(doc_test))
    except Exception:
        perp_test = float("nan")

    return {
        "K": int(K),
        "rmse_train": round(rmse(doc_train, recon_train), 6),
        "rmse_test": round(rmse(doc_test, recon_test), 6),
        "rmse_test_normalised": round(normalised_rmse(doc_test, recon_test), 6),
        "perplexity_test": round(perp_test, 4) if np.isfinite(perp_test) else None,
    }


def fit_nmf_reconstruction(doc_train: np.ndarray, doc_test: np.ndarray, K: int) -> dict:
    nmf = NMF(
        n_components=K,
        init="nndsvd",
        max_iter=400,
        tol=1e-4,
        random_state=RANDOM_STATE,
    )
    W_train = nmf.fit_transform(doc_train.astype(np.float64))
    H = nmf.components_
    W_test = nmf.transform(doc_test.astype(np.float64))
    return {
        "K": int(K),
        "rmse_train": round(rmse(doc_train, W_train @ H), 6),
        "rmse_test": round(rmse(doc_test, W_test @ H), 6),
        "rmse_test_normalised": round(normalised_rmse(doc_test, W_test @ H), 6),
        "reconstruction_error_attr": round(float(nmf.reconstruction_err_), 6),
    }


def fit_pca_reconstruction(doc_train: np.ndarray, doc_test: np.ndarray, K: int) -> dict:
    Kc = int(min(K, min(doc_train.shape) - 1))
    pca = PCA(n_components=Kc, random_state=RANDOM_STATE)
    Z_train = pca.fit_transform(doc_train.astype(np.float64))
    Z_test = pca.transform(doc_test.astype(np.float64))
    recon_train = pca.inverse_transform(Z_train)
    recon_test = pca.inverse_transform(Z_test)
    return {
        "K": int(K),
        "K_effective": Kc,
        "rmse_train": round(rmse(doc_train, recon_train), 6),
        "rmse_test": round(rmse(doc_test, recon_test), 6),
        "rmse_test_normalised": round(normalised_rmse(doc_test, recon_test), 6),
        "explained_variance_ratio_sum": round(
            float(np.sum(pca.explained_variance_ratio_)), 6
        ),
    }


def build_for_scene(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None

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
    sample_spectra = spectra[sample_idx_local]
    doc_term = band_frequency_counts(sample_spectra, scale=SCALE).astype(np.float32)
    D, V = doc_term.shape

    rng = np.random.default_rng(RANDOM_STATE)
    perm = rng.permutation(D)
    n_train = int(D * TRAIN_FRAC)
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]
    doc_train = doc_term[train_idx]
    doc_test = doc_term[test_idx]

    method_curves: dict[str, list[dict]] = {"lda": [], "nmf": [], "pca": []}
    for K in K_GRID:
        try:
            method_curves["lda"].append(fit_lda_reconstruction(doc_train, doc_test, K))
        except Exception as exc:
            method_curves["lda"].append({"K": K, "error": str(exc)})
        try:
            method_curves["nmf"].append(fit_nmf_reconstruction(doc_train, doc_test, K))
        except Exception as exc:
            method_curves["nmf"].append({"K": K, "error": str(exc)})
        try:
            method_curves["pca"].append(fit_pca_reconstruction(doc_train, doc_test, K))
        except Exception as exc:
            method_curves["pca"].append({"K": K, "error": str(exc)})

    # Per-K ranking by rmse_test
    by_K = []
    for i, K in enumerate(K_GRID):
        row: dict = {"K": K}
        for method, curve in method_curves.items():
            r = curve[i].get("rmse_test")
            if r is not None and not (isinstance(r, float) and np.isnan(r)):
                row[f"rmse_test_{method}"] = r
        # Pick winner at this K
        candidates = [(m, row.get(f"rmse_test_{m}")) for m in ("lda", "nmf", "pca")]
        candidates = [c for c in candidates if c[1] is not None]
        if candidates:
            best = min(candidates, key=lambda kv: kv[1])
            row["winner"] = best[0]
        by_K.append(row)

    return {
        "scene_id": scene_id,
        "K_grid": K_GRID,
        "doc_term_shape": [int(D), int(V)],
        "train_fraction": TRAIN_FRAC,
        "wordification": "band-frequency",
        "quantization_scale": SCALE,
        "samples_per_class": SAMPLES_PER_CLASS,
        "method_curves": method_curves,
        "rmse_test_table_by_K": by_K,
        "framework_axis": "B-2 (master plan Addendum B Axis G): rate-distortion — RMSE(K) curves for LDA / NMF / PCA on the canonical band-frequency document-term matrix",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_rate_distortion_curve v0.1",
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in LABELLED_SCENES:
        print(f"[rate_distortion] {scene_id} ...", flush=True)
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
        for row in payload["rmse_test_table_by_K"]:
            parts = [f"K={row['K']:2d}"]
            for m in ("lda", "nmf", "pca"):
                v = row.get(f"rmse_test_{m}")
                parts.append(f"{m}={v:.3f}" if v is not None else f"{m}=NA")
            parts.append(f"win={row.get('winner', '-'):3s}")
            print("  " + "  ".join(parts), flush=True)
        written += 1
    print(f"[rate_distortion] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
