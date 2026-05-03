"""B-8 Cross-scene topic transfer (LDA fit on A, theta inferred on B).

Master plan Addendum B Axis E (transfer).

For each source scene fit LDA on its documents on a **common** AVIRIS-
1997 wavelength grid (400-2500 nm, 224 bands, scale=12 band-frequency
quantisation → V = 2688 shared tokens). Then transform every other
target scene's documents through the source LDA and evaluate
downstream macro F1 via theta-logistic on the target's labels.

The diagonal (source == target) is the within-scene baseline; the
off-diagonal cells are the cross-scene transfer scores. A method that
truly captures *transferable* spectral structure should produce
off-diagonals close to the diagonal; a method that overfits to
scene-specific quirks should drop sharply.

Pavia U (ROSIS, 430-860 nm) is excluded — its narrower range cannot
host the AVIRIS-1997 token vocabulary without massive NaN padding.

Output: data/derived/cross_scene_transfer.json
"""
from __future__ import annotations

import json
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import StratifiedKFold

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

warnings.filterwarnings("ignore")


LOCAL_FIT_DIR = DATA_DIR / "local" / "lda_fits"
DERIVED_OUT_DIR = DERIVED_DIR / "cross_scene_transfer"
DERIVED_OUT_PATH = DERIVED_OUT_DIR / "transfer_matrix.json"

# AVIRIS-class labelled scenes that share a 400-2500 nm SWIR-VNIR span.
AVIRIS_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "kennedy-space-center",
    "botswana",
]
COMMON_WL = np.linspace(400.0, 2500.0, 224)
SCALE = 12
SAMPLES_PER_CLASS = 220
N_FOLDS = 5
RANDOM_STATE = 42


def normalize01_per_row(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = np.nanmin(values, axis=1, keepdims=True)
    high = np.nanmax(values, axis=1, keepdims=True)
    denom = np.where(high - low > 1e-6, high - low, 1.0)
    return (values - low) / denom


def band_frequency_counts(values: np.ndarray, scale: int = SCALE) -> np.ndarray:
    return np.rint(normalize01_per_row(values) * scale).astype(np.int32)


def resample_to_common(spectra: np.ndarray, source_wl: np.ndarray, target_wl: np.ndarray) -> np.ndarray:
    """Linear interpolation per spectrum to `target_wl`. Source coverage
    that does not span target_wl is filled with edge values (clip)."""
    D, B = spectra.shape
    out = np.empty((D, target_wl.size), dtype=np.float32)
    for d in range(D):
        out[d] = np.interp(
            target_wl,
            source_wl,
            spectra[d],
            left=spectra[d, 0],
            right=spectra[d, -1],
        ).astype(np.float32)
    return out


def fit_lda(doc_term: np.ndarray, K: int):
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
    return lda.fit(doc_term)


def macro_f1_5fold(theta: np.ndarray, y: np.ndarray) -> dict:
    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=RANDOM_STATE)
    f1s = []
    accs = []
    baccs = []
    for tr, te in skf.split(theta, y):
        clf = LogisticRegression(max_iter=2000, C=1.0)
        clf.fit(theta[tr], y[tr])
        pred = clf.predict(theta[te])
        f1s.append(float(f1_score(y[te], pred, average="macro")))
        accs.append(float(accuracy_score(y[te], pred)))
        baccs.append(float(balanced_accuracy_score(y[te], pred)))
    return {
        "macro_f1_mean": round(float(np.mean(f1s)), 6),
        "macro_f1_std": round(float(np.std(f1s)), 6),
        "accuracy_mean": round(float(np.mean(accs)), 6),
        "balanced_accuracy_mean": round(float(np.mean(baccs)), 6),
        "per_fold": [round(float(v), 6) for v in f1s],
    }


def prepare_scene(scene_id: str) -> dict | None:
    """Build the (D, V) doc-term matrix on the common AVIRIS-1997 grid
    plus labels and the canonical K from the existing fit."""
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, config = load_scene(scene_id)
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
    y = labels[sample_idx_local]

    wl = approximate_wavelengths(config, b).astype(np.float64)
    X_resampled = resample_to_common(X, wl, COMMON_WL)
    doc_term = band_frequency_counts(X_resampled, scale=SCALE).astype(np.float32)

    fit_dir = LOCAL_FIT_DIR / scene_id
    K = 8
    if (fit_dir / "phi.npy").exists():
        try:
            phi = np.load(fit_dir / "phi.npy")
            K = int(phi.shape[0])
        except Exception:
            K = 8

    return {
        "scene_id": scene_id,
        "doc_term": doc_term,
        "labels": y,
        "K": int(K),
        "n_documents": int(doc_term.shape[0]),
        "n_classes": int(np.unique(y).size),
        "n_bands_native": int(b),
        "wavelength_range_native": [float(wl.min()), float(wl.max())],
    }


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("[transfer] preparing scenes (resampling to common AVIRIS-1997 grid) ...", flush=True)
    prepared: dict[str, dict] = {}
    for scene_id in AVIRIS_SCENES:
        info = prepare_scene(scene_id)
        if info is None:
            print(f"  {scene_id}: skipped", flush=True)
            continue
        prepared[scene_id] = info
        print(
            f"  {scene_id}: D={info['n_documents']:4d}  K={info['K']:2d}  "
            f"native_bands={info['n_bands_native']}  range={info['wavelength_range_native']}",
            flush=True,
        )

    # Fit LDA on each source scene
    print("[transfer] fitting source LDAs on common-grid doc-term matrices ...", flush=True)
    source_models: dict[str, LatentDirichletAllocation] = {}
    for source_id, info in prepared.items():
        lda = fit_lda(info["doc_term"], info["K"])
        source_models[source_id] = lda
        print(f"  {source_id}: source K={info['K']} fitted", flush=True)

    # Build the transfer matrix (source x target) of macro F1
    print("[transfer] computing source x target downstream macro F1 ...", flush=True)
    rows: list[dict] = []
    matrix_macro_f1 = []
    scene_order = list(prepared.keys())
    for source_id in scene_order:
        row_scores = []
        for target_id in scene_order:
            target_info = prepared[target_id]
            theta = source_models[source_id].transform(target_info["doc_term"])
            theta = theta / np.clip(theta.sum(axis=1, keepdims=True), 1e-12, None)
            metrics = macro_f1_5fold(theta, target_info["labels"])
            rows.append({
                "source_scene": source_id,
                "target_scene": target_id,
                "K_source": int(prepared[source_id]["K"]),
                **metrics,
            })
            row_scores.append(metrics["macro_f1_mean"])
            print(
                f"  {source_id:25s} -> {target_id:25s}  "
                f"K_source={prepared[source_id]['K']:2d}  F1={metrics['macro_f1_mean']:.3f}",
                flush=True,
            )
        matrix_macro_f1.append(row_scores)

    payload = {
        "scene_order": scene_order,
        "common_wavelength_grid": {
            "min_nm": float(COMMON_WL.min()),
            "max_nm": float(COMMON_WL.max()),
            "n_bands": int(COMMON_WL.size),
            "spacing_nm": float(np.mean(np.diff(COMMON_WL))),
        },
        "wordification": "band-frequency",
        "quantization_scale": SCALE,
        "samples_per_class": SAMPLES_PER_CLASS,
        "split": f"StratifiedKFold(n_splits={N_FOLDS}, shuffle=True, random_state={RANDOM_STATE})",
        "head": "LogisticRegression(max_iter=2000, C=1.0, l2)",
        "transfer_matrix_macro_f1": [
            [round(v, 6) for v in row] for row in matrix_macro_f1
        ],
        "transfer_pairs": rows,
        "scene_meta": [
            {
                "scene_id": s,
                "K": prepared[s]["K"],
                "n_documents": prepared[s]["n_documents"],
                "n_classes": prepared[s]["n_classes"],
                "native_bands": prepared[s]["n_bands_native"],
                "native_range_nm": prepared[s]["wavelength_range_native"],
            }
            for s in scene_order
        ],
        "framework_axis": "B-8 (master plan Addendum B Axis E): cross-scene topic transfer on a common AVIRIS-1997 grid — fit LDA on A, infer theta on B, evaluate downstream macro F1 on B via theta-logistic",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_cross_scene_transfer v0.1",
    }
    with DERIVED_OUT_PATH.open("w", encoding="utf-8") as h:
        json.dump(payload, h, separators=(",", ":"))
    print(f"[transfer] done — wrote {DERIVED_OUT_PATH.name}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
