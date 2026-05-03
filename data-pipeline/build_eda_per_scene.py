"""EDA per labelled scene — class distributions, percentile envelopes,
band discriminative power, class-class spectral distances.

Output: data/derived/eda/per_scene/<scene>.json

Schema: master-plan.md §18.1.

These outputs are deliberately the EDA layer (no LDA, no topics). They
answer: *what does the data look like before any modelling decision?*
For each labelled scene the builder produces:

- class distribution (counts, relative frequencies, Gini imbalance)
- per-class mean ± std spectra plus percentiles 5/25/50/75/95 by band
- band discriminative power: Fisher ratio, ANOVA F-statistic with p-value,
  mutual information vs label
- class-class spectral distance matrices (cosine and spectral-angle)
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy import stats as scipy_stats
from sklearn.feature_selection import mutual_info_classif

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.class_catalog import CLASS_NAMES, class_color, has_labels
from research_core.paths import DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    valid_spectra_mask,
)


OUTPUT_DIR = DERIVED_DIR / "eda" / "per_scene"
SCENES_TO_BUILD = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]
PERCENTILES = [5, 25, 50, 75, 95]
MAX_PIXELS_FOR_MI = 6000  # subsample cap for mutual_info_classif speed


def gini_imbalance(counts: np.ndarray) -> float:
    """Gini coefficient of class counts. 0 = perfectly balanced, 1 = degenerate."""
    counts = np.asarray(counts, dtype=np.float64)
    counts = counts[counts > 0]
    if counts.size <= 1:
        return 0.0
    sorted_counts = np.sort(counts)
    n = sorted_counts.size
    cum = np.cumsum(sorted_counts)
    return float((n + 1 - 2 * np.sum(cum) / cum[-1]) / n)


def cosine_matrix(rows: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    norms = np.where(norms < 1e-12, 1.0, norms)
    normalized = rows / norms
    return normalized @ normalized.T


def spectral_angle_matrix(rows: np.ndarray) -> np.ndarray:
    cos = np.clip(cosine_matrix(rows), -1.0, 1.0)
    return np.arccos(cos)


def fisher_ratio_per_band(spectra: np.ndarray, labels: np.ndarray) -> np.ndarray:
    """Per-band Fisher ratio = between-class variance / within-class variance.

    spectra: [N, B], labels: [N] (positive integers).
    """
    classes = np.unique(labels)
    overall_mean = np.mean(spectra, axis=0)
    between = np.zeros(spectra.shape[1], dtype=np.float64)
    within = np.zeros(spectra.shape[1], dtype=np.float64)
    for cls in classes:
        mask = labels == cls
        if not np.any(mask):
            continue
        sub = spectra[mask]
        n = sub.shape[0]
        cls_mean = np.mean(sub, axis=0)
        between += n * (cls_mean - overall_mean) ** 2
        within += np.sum((sub - cls_mean) ** 2, axis=0)
    within = np.maximum(within, 1e-12)
    return between / within


def anova_f_per_band(spectra: np.ndarray, labels: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Per-band one-way ANOVA F-statistic with p-value."""
    classes = np.unique(labels)
    groups_by_band: list[list[np.ndarray]] = [[] for _ in range(spectra.shape[1])]
    for cls in classes:
        mask = labels == cls
        if not np.any(mask):
            continue
        sub = spectra[mask]
        for b in range(spectra.shape[1]):
            groups_by_band[b].append(sub[:, b])
    fstats = np.zeros(spectra.shape[1], dtype=np.float64)
    pvals = np.zeros(spectra.shape[1], dtype=np.float64)
    for b, groups in enumerate(groups_by_band):
        if len(groups) < 2:
            fstats[b] = 0.0
            pvals[b] = 1.0
            continue
        f, p = scipy_stats.f_oneway(*groups)
        fstats[b] = f if np.isfinite(f) else 0.0
        pvals[b] = p if np.isfinite(p) else 1.0
    return fstats, pvals


def mutual_information_per_band(
    spectra: np.ndarray, labels: np.ndarray, random_state: int = 42
) -> np.ndarray:
    """Per-band MI vs label. Subsamples to MAX_PIXELS_FOR_MI for speed."""
    n = spectra.shape[0]
    if n > MAX_PIXELS_FOR_MI:
        rng = np.random.default_rng(random_state)
        idx = rng.choice(n, size=MAX_PIXELS_FOR_MI, replace=False)
        spectra = spectra[idx]
        labels = labels[idx]
    return mutual_info_classif(
        spectra, labels, discrete_features=False, random_state=random_state
    )


def silhouette_using_label_as_cluster(
    spectra: np.ndarray, labels: np.ndarray, max_n: int = 4000, random_state: int = 42
) -> dict[str, float | None]:
    """Silhouette score (cosine) using the ground-truth labels as cluster ids."""
    from sklearn.metrics import silhouette_samples

    n = spectra.shape[0]
    if n > max_n:
        rng = np.random.default_rng(random_state)
        idx = rng.choice(n, size=max_n, replace=False)
        spectra = spectra[idx]
        labels = labels[idx]
    if len(np.unique(labels)) < 2:
        return {"overall": None, "per_class": {}}
    samples = silhouette_samples(spectra, labels, metric="cosine")
    overall = float(np.mean(samples))
    per_class = {
        str(int(cls)): float(np.mean(samples[labels == cls]))
        for cls in np.unique(labels)
    }
    return {"overall": overall, "per_class": per_class}


def build_scene_eda(scene_id: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    cube, gt, config = load_scene(scene_id)
    h, w, b = cube.shape
    flat = cube.reshape(-1, b).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1) if gt is not None else np.zeros(h * w, dtype=np.int32)

    # Use only labelled, valid pixels for class-related stats.
    labelled_mask = valid & (flat_labels > 0)
    spectra = flat[labelled_mask]
    labels = flat_labels[labelled_mask]
    n_labelled = int(labelled_mask.sum())
    n_pixels = h * w

    if n_labelled == 0:
        return None

    wavelengths = approximate_wavelengths(config, b)
    name_map = CLASS_NAMES.get(scene_id, {})

    # Class distribution
    unique, counts = np.unique(labels, return_counts=True)
    total = int(counts.sum())
    class_distribution = []
    for label_id, count in zip(unique.tolist(), counts.tolist()):
        class_distribution.append({
            "label_id": int(label_id),
            "name": name_map.get(int(label_id), f"class_{int(label_id)}"),
            "count": int(count),
            "rel_freq": round(count / total, 6),
            "color": class_color(int(label_id)),
        })
    class_distribution.sort(key=lambda x: x["count"], reverse=True)

    imb_gini = gini_imbalance(np.array(counts))

    # Per-class mean / std / percentiles
    class_mean_spectra: dict[str, dict[str, list[float]]] = {}
    class_means_matrix: list[np.ndarray] = []
    class_ids_in_matrix: list[int] = []
    for label_id in sorted(int(x) for x in unique):
        mask = labels == label_id
        sub = spectra[mask]
        if sub.size == 0:
            continue
        mean = np.mean(sub, axis=0)
        std = np.std(sub, axis=0)
        percentiles = np.percentile(sub, PERCENTILES, axis=0)
        class_mean_spectra[str(label_id)] = {
            "mean": [round(float(v), 6) for v in mean],
            "std": [round(float(v), 6) for v in std],
            "p5": [round(float(v), 6) for v in percentiles[0]],
            "p25": [round(float(v), 6) for v in percentiles[1]],
            "p50": [round(float(v), 6) for v in percentiles[2]],
            "p75": [round(float(v), 6) for v in percentiles[3]],
            "p95": [round(float(v), 6) for v in percentiles[4]],
        }
        class_means_matrix.append(mean)
        class_ids_in_matrix.append(label_id)

    means_array = np.stack(class_means_matrix, axis=0)
    cosine = cosine_matrix(means_array)
    sam = spectral_angle_matrix(means_array)

    # Band discriminative power
    fisher = fisher_ratio_per_band(spectra, labels)
    f_stat, p_value = anova_f_per_band(spectra, labels)
    mi = mutual_information_per_band(spectra, labels)

    band_discriminative = []
    for i in range(b):
        band_discriminative.append({
            "band_index": i,
            "wavelength_nm": round(float(wavelengths[i]), 2),
            "fisher_ratio": round(float(fisher[i]), 6),
            "f_stat": round(float(f_stat[i]), 6),
            "p_value": round(float(p_value[i]), 8),
            "mutual_info_vs_label": round(float(mi[i]), 6),
        })

    # Silhouette
    sil = silhouette_using_label_as_cluster(spectra, labels)

    return {
        "scene_id": scene_id,
        "scene_name": config.name,
        "sensor": config.sensor,
        "family_id": config.family_id,
        "spatial_shape": [int(h), int(w)],
        "n_pixels": int(n_pixels),
        "n_labelled_pixels": int(n_labelled),
        "n_classes": int(len(unique)),
        "imbalance_gini": round(imb_gini, 6),
        "wavelengths_nm": [round(float(x), 2) for x in wavelengths.tolist()],
        "class_distribution": class_distribution,
        "class_mean_spectra": class_mean_spectra,
        "class_distance_cosine": {
            "label_ids": class_ids_in_matrix,
            "matrix": [[round(float(v), 6) for v in row] for row in cosine.tolist()],
        },
        "class_distance_sam_radians": {
            "label_ids": class_ids_in_matrix,
            "matrix": [[round(float(v), 6) for v in row] for row in sam.tolist()],
        },
        "band_discriminative": band_discriminative,
        "silhouette_label_as_cluster_cosine": sil,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "builder_version": "build_eda_per_scene v0.1",
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for scene_id in SCENES_TO_BUILD:
        print(f"[eda_per_scene] {scene_id} ...", flush=True)
        try:
            payload = build_scene_eda(scene_id)
        except Exception as exc:
            print(f"  FAILED: {exc}", flush=True)
            continue
        if payload is None:
            print(f"  skipped (no labels)", flush=True)
            continue
        out_path = OUTPUT_DIR / f"{scene_id}.json"
        with out_path.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, separators=(",", ":"))
        size_kb = out_path.stat().st_size / 1024
        print(
            f"  wrote {out_path.relative_to(ROOT)} "
            f"(n_classes={payload['n_classes']}, n_labelled={payload['n_labelled_pixels']}, "
            f"size={size_kb:.1f} KB)",
            flush=True,
        )
        written += 1
    print(f"[eda_per_scene] done — {written} scenes written.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
