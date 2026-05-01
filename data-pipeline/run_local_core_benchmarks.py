"""Run local-core topic, clustering, stability, and unmixing benchmarks."""
from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import LatentDirichletAllocation, NMF, PCA
from sklearn.cross_decomposition import PLSRegression
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    adjusted_rand_score,
    balanced_accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    normalized_mutual_info_score,
    r2_score,
)
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import GroupKFold, KFold, LeaveOneOut, StratifiedKFold, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from research_core.paths import CORE_DERIVED_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    approximate_wavelengths as approximate_scene_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)
from research_core.spectral import best_alignment, cosine_similarity_matrix, spectral_angle_matrix
from research_core.unmixing import (
    approximate_wavelengths as approximate_unmixing_wavelengths,
    load_unmixing_cube_shape,
    load_unmixing_reference_groups,
    load_unmixing_scene,
)


OUTPUT_PATH = CORE_DERIVED_DIR / "local_core_benchmarks.json"
HIDSAG_CURATED_PATH = CORE_DERIVED_DIR / "hidsag_curated_subset.json"
HIDSAG_REGION_PATH = CORE_DERIVED_DIR / "hidsag_region_documents.json"
HIDSAG_REGION_ARRAYS_PATH = CORE_DERIVED_DIR / "hidsag_region_documents.npz"
LIBRARY_PATH = DERIVED_DIR / "spectral" / "library_samples.json"
RANDOM_STATE = 42
LABELED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "pavia-university",
    "botswana",
]
UNLABELED_SCENES = [
    "cuprite-upv-reflectance",
]
UNMIXING_SCENES = [
    "samson-unmixing-roi",
    "jasper-ridge-unmixing-roi",
    "urban-unmixing-roi",
]
TOPIC_STABILITY_SEEDS = [42, 7, 19, 99]
HIDSAG_MODALITY_ORDER = ["swir_low", "vnir_low", "vnir_high"]
HIDSAG_REGIME_FOCUS = {"Phengite", "Muscovite"}
HIDSAG_BINARY_THRESHOLD = 1.0
HIDSAG_REGRESSION_MIN_STD = 2.0
HIDSAG_REGRESSION_MIN_NONZERO = 8
HIDSAG_SUBSET_TOPIC_COUNTS = {
    "MINERAL1": 6,
    "MINERAL2": 4,
    "GEOMET": 6,
    "GEOCHEM": 5,
    "PORPHYRY": 6,
}
HIDSAG_SUBSET_DOC_TOPIC_COUNTS = {
    "MINERAL1": 6,
    "MINERAL2": 6,
    "GEOMET": 3,
    "GEOCHEM": 5,
    "PORPHYRY": 6,
}
HIDSAG_SUBSET_REGION_TOPIC_COUNTS = {
    "MINERAL1": 8,
    "MINERAL2": 6,
    "GEOMET": 6,
    "GEOCHEM": 6,
    "PORPHYRY": 6,
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_rows01(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    row_min = np.min(values, axis=1, keepdims=True)
    row_max = np.max(values, axis=1, keepdims=True)
    denom = np.maximum(row_max - row_min, 1e-6)
    return (values - row_min) / denom


def normalize_probability_rows(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=np.float32)
    totals = np.sum(values, axis=1, keepdims=True)
    return values / np.maximum(totals, 1e-8)


def band_frequency_counts(values: np.ndarray, scale: int = 12) -> np.ndarray:
    normalized = normalize_rows01(values)
    return np.rint(normalized * scale).astype(np.int32)


def top_band_tokens(weights: np.ndarray, wavelengths: np.ndarray, limit: int = 8) -> list[dict[str, float | str]]:
    indices = np.argsort(weights)[::-1][:limit]
    total = float(weights.sum()) if float(weights.sum()) > 0 else 1.0
    return [
        {
            "token": f"{int(round(float(wavelengths[index]))):04d}nm",
            "weight": round(float(weights[index] / total), 4),
        }
        for index in indices
    ]


def top_named_tokens(weights: np.ndarray, token_names: list[str], limit: int = 8) -> list[dict[str, float | str]]:
    indices = np.argsort(weights)[::-1][:limit]
    total = float(weights.sum()) if float(weights.sum()) > 0 else 1.0
    return [
        {
            "token": token_names[int(index)],
            "weight": round(float(weights[int(index)] / total), 4),
        }
        for index in indices
    ]


def slugify(value: str) -> str:
    return value.lower().replace(" ", "-").replace("/", "-")


def top_index_set(weights: np.ndarray, limit: int = 12) -> set[int]:
    indices = np.argsort(weights)[::-1][:limit]
    return {int(index) for index in indices}


def topic_count_for_labels(label_count: int) -> int:
    return max(4, min(12, label_count))


def safe_pca_components(sample_count: int, feature_count: int) -> int:
    return max(2, min(24, sample_count - 1, feature_count))


def safe_compact_pca_components(sample_count: int, feature_count: int) -> int:
    return max(2, min(8, sample_count - 1, feature_count))


def classification_metrics(model, x_train, x_test, y_train, y_test) -> dict[str, float]:
    model.fit(x_train, y_train)
    prediction = model.predict(x_test)
    return {
        "accuracy": round(float(accuracy_score(y_test, prediction)), 4),
        "macro_f1": round(float(f1_score(y_test, prediction, average="macro")), 4),
    }


def classification_metrics_from_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "balanced_accuracy": round(float(balanced_accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(f1_score(y_true, y_pred, average="macro")), 4),
    }


def regression_metrics_from_predictions(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    correlation = 0.0
    if float(np.std(y_true)) > 1e-8 and float(np.std(y_pred)) > 1e-8:
        correlation = float(np.corrcoef(y_true, y_pred)[0, 1])
    return {
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 4),
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
        "pearson_r": round(float(correlation), 4),
        "bias": round(float(np.mean(y_pred - y_true)), 4),
    }


def clustering_scores(labels: np.ndarray, prediction: np.ndarray) -> dict[str, float]:
    return {
        "ari": round(float(adjusted_rand_score(labels, prediction)), 4),
        "nmi": round(float(normalized_mutual_info_score(labels, prediction)), 4),
    }


def reduced_raw_feature_space(features: np.ndarray) -> np.ndarray:
    scaled = StandardScaler().fit_transform(features)
    reducer = PCA(
        n_components=safe_pca_components(scaled.shape[0], scaled.shape[1]),
        random_state=RANDOM_STATE,
    )
    return reducer.fit_transform(scaled)


def predict_kmeans(features: np.ndarray, cluster_count: int) -> np.ndarray:
    return KMeans(n_clusters=cluster_count, random_state=RANDOM_STATE, n_init="auto").fit_predict(features)


def predict_gmm(features: np.ndarray, cluster_count: int) -> np.ndarray:
    model = GaussianMixture(
        n_components=cluster_count,
        covariance_type="diag",
        random_state=RANDOM_STATE,
        reg_covar=1e-5,
    )
    return model.fit_predict(features)


def predict_hierarchical(features: np.ndarray, cluster_count: int) -> np.ndarray:
    return AgglomerativeClustering(n_clusters=cluster_count, linkage="ward").fit_predict(features)


def clustering_metrics(
    raw_features: np.ndarray,
    topic_features: np.ndarray,
    labels: np.ndarray,
    cluster_count: int,
) -> dict[str, dict[str, float | str]]:
    raw_reduced = reduced_raw_feature_space(raw_features)
    predictions = {
        "raw_kmeans": (predict_kmeans(raw_features, cluster_count), "normalized spectra"),
        "raw_gmm": (predict_gmm(raw_reduced, cluster_count), "pca-normalized spectra"),
        "raw_hierarchical": (predict_hierarchical(raw_reduced, cluster_count), "pca-normalized spectra"),
        "topic_kmeans": (predict_kmeans(topic_features, cluster_count), "topic mixture"),
        "topic_gmm": (predict_gmm(topic_features, cluster_count), "topic mixture"),
        "topic_hierarchical": (predict_hierarchical(topic_features, cluster_count), "topic mixture"),
    }
    return {
        method_id: {
            "feature_space": feature_space,
            **clustering_scores(labels, prediction),
        }
        for method_id, (prediction, feature_space) in predictions.items()
    }


def fit_lda(counts: np.ndarray, n_topics: int, seed: int, max_iter: int = 25) -> tuple[LatentDirichletAllocation, np.ndarray]:
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="batch",
        max_iter=max_iter,
        random_state=seed,
        doc_topic_prior=0.4,
        topic_word_prior=0.15,
    )
    mixtures = lda.fit_transform(counts)
    return lda, mixtures


def make_logreg() -> LogisticRegression:
    return LogisticRegression(
        max_iter=1200,
        solver="saga",
        tol=1e-3,
    )


def predict_constant_label(y_train: np.ndarray, size: int) -> np.ndarray:
    label = str(y_train[0]) if y_train.size else "unknown"
    return np.asarray([label] * size, dtype=object)


def safe_classifier_predict(model, x_train: np.ndarray, y_train: np.ndarray, x_test: np.ndarray) -> np.ndarray:
    if np.unique(y_train).size < 2:
        return predict_constant_label(y_train, int(x_test.shape[0]))
    return np.asarray(model.fit(x_train, y_train).predict(x_test), dtype=object)


def load_hidsag_subset(subset_code: str = "MINERAL2") -> dict[str, object]:
    payload = load_json(HIDSAG_CURATED_PATH)
    for subset in payload.get("subsets", []):
        if str(subset.get("subset_code")) == subset_code:
            return subset
    raise KeyError(f"HIDSAG subset {subset_code} not found in {HIDSAG_CURATED_PATH}")


def load_hidsag_region_documents(subset_code: str) -> tuple[dict[str, object], dict[str, np.ndarray]]:
    manifest = load_json(HIDSAG_REGION_PATH)
    subset_manifest = None
    for subset in manifest.get("subsets", []):
        if str(subset.get("subset_code")) == subset_code:
            subset_manifest = subset
            break
    if subset_manifest is None:
        raise KeyError(f"HIDSAG region-doc subset {subset_code} not found in {HIDSAG_REGION_PATH}")

    with np.load(HIDSAG_REGION_ARRAYS_PATH, allow_pickle=False) as payload:
        arrays = {
            "features": np.asarray(payload[f"{subset_code}__features"], dtype=np.float32),
            "sample_owner": np.asarray(payload[f"{subset_code}__sample_owner"], dtype=np.int32),
            "measurement_owner": np.asarray(payload[f"{subset_code}__measurement_owner"], dtype=np.int32),
            "patch_row_index": np.asarray(payload[f"{subset_code}__patch_row_index"], dtype=np.int8),
            "patch_col_index": np.asarray(payload[f"{subset_code}__patch_col_index"], dtype=np.int8),
        }
    return subset_manifest, arrays


def hidsag_measurements(sample: dict[str, object]) -> list[dict[str, object]]:
    measurements = sample.get("measurements")
    if isinstance(measurements, list) and measurements:
        return measurements

    cubes = sample.get("cubes", [])
    grouped: dict[str, dict[str, object]] = {}
    for cube in cubes:
        crop_id = str(cube["crop_id"])
        entry = grouped.setdefault(crop_id, {"crop_id": crop_id, "tags": [], "cubes": []})
        entry["cubes"].append(cube)
    return list(grouped.values())


def hidsag_sample_cubes(sample: dict[str, object]) -> list[dict[str, object]]:
    cubes: list[dict[str, object]] = []
    for measurement in hidsag_measurements(sample):
        cubes.extend(measurement.get("cubes", []))
    return cubes


def hidsag_numeric_target_names(subset: dict[str, object]) -> list[str]:
    names = subset.get("numeric_variable_names")
    if isinstance(names, list) and names:
        return [str(name) for name in names]
    return [str(name) for name in subset.get("variable_names", [])]


def hidsag_wavelength_token_names(subset: dict[str, object], modality: str, band_count: int) -> list[str]:
    modality_map = subset.get("modality_wavelengths_nm", {})
    wavelengths = modality_map.get(modality) if isinstance(modality_map, dict) else None
    if isinstance(wavelengths, list) and len(wavelengths) == band_count:
        return [f"{modality}_{float(wavelength):07.2f}nm" for wavelength in wavelengths]
    return [f"{modality}_b{band_index + 1:03d}" for band_index in range(band_count)]


def hidsag_primary_tag(sample: dict[str, object], prefix: str) -> str | None:
    summary = sample.get("measurement_tag_summary", {})
    if isinstance(summary, dict):
        matches = sorted(str(tag) for tag in summary.keys() if str(tag).startswith(prefix))
        if matches:
            return matches[0]
    return None


def hidsag_group_split_info(subset_code: str, subset: dict[str, object]) -> dict[str, object] | None:
    samples = subset.get("samples", [])
    if subset_code == "MINERAL1":
        groups = np.asarray([hidsag_primary_tag(sample, "P") or "unknown-process" for sample in samples], dtype=object)
        unique = sorted(set(groups.tolist()))
        if len(unique) >= 3:
            return {
                "group_name": "process_tag",
                "groups": groups,
                "unique_group_count": len(unique),
                "groups_preview": unique,
                "reason": "Process tags P1/P2/P3 define the first process-aware Family D split for MINERAL1.",
            }
    if subset_code == "PORPHYRY":
        groups = np.asarray(
            [str(sample.get("categorical_targets", {}).get("group", "unknown-group")) for sample in samples],
            dtype=object,
        )
        unique = sorted(set(groups.tolist()))
        if len(unique) >= 4:
            return {
                "group_name": "porphyry_group",
                "groups": groups,
                "unique_group_count": len(unique),
                "groups_preview": unique,
                "reason": "The PORPHYRY subset ships a categorical `group` label that supports group-aware measured-target validation.",
            }
    return None


def hidsag_feature_layout_and_tokens(subset: dict[str, object]) -> tuple[list[dict[str, object]], list[str]]:
    samples = subset.get("samples", [])
    if not samples:
        raise ValueError("HIDSAG curated subset has no samples.")

    first_measurement = hidsag_measurements(samples[0])[0]
    cubes_by_modality = {cube["modality"]: cube for cube in first_measurement["cubes"]}
    feature_layout = []
    token_names = []
    for modality in HIDSAG_MODALITY_ORDER:
        cube = cubes_by_modality[modality]
        band_count = int(cube["spectral_band_count"])
        feature_layout.append(
            {
                "modality": modality,
                "band_count": band_count,
                "source": "mean_spectrum",
                "wavelength_range_nm": cube.get("wavelength_range_nm"),
            }
        )
        token_names.extend(hidsag_wavelength_token_names(subset, modality, band_count))
    return feature_layout, token_names


def hidsag_feature_rows(subset: dict[str, object]) -> tuple[np.ndarray, list[str], list[dict[str, object]], list[str]]:
    samples = subset.get("samples", [])
    matrix = []
    sample_names = []
    feature_layout, token_names = hidsag_feature_layout_and_tokens(subset)

    for sample in samples:
        vectors = []
        for modality in HIDSAG_MODALITY_ORDER:
            modality_vectors = []
            for cube in hidsag_sample_cubes(sample):
                if str(cube["modality"]) != modality:
                    continue
                mean_spectrum = np.asarray(cube["mean_spectrum"], dtype=np.float32)
                modality_vectors.append(normalize_rows01(mean_spectrum[None, :])[0])
            if not modality_vectors:
                raise ValueError(f"Sample {sample['sample_name']} missing modality {modality}.")
            vectors.append(np.mean(np.vstack(modality_vectors), axis=0))
        matrix.append(np.concatenate(vectors))
        sample_names.append(str(sample["sample_name"]))

    return np.asarray(matrix, dtype=np.float32), sample_names, feature_layout, token_names


def hidsag_cube_document_rows(
    subset: dict[str, object],
    feature_layout: list[dict[str, object]],
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    samples = subset.get("samples", [])
    modality_offsets = {}
    offset = 0
    for row in feature_layout:
        modality_offsets[str(row["modality"])] = offset
        offset += int(row["band_count"])

    matrix = []
    owners = []
    doc_names = []
    for sample_index, sample in enumerate(samples):
        sample_name = str(sample["sample_name"])
        for measurement in hidsag_measurements(sample):
            crop_id = str(measurement["crop_id"])
            cubes = {cube["modality"]: cube for cube in measurement["cubes"]}
            for modality in HIDSAG_MODALITY_ORDER:
                cube = cubes[modality]
                spectrum = normalize_rows01(np.asarray(cube["mean_spectrum"], dtype=np.float32)[None, :])[0]
                row = np.zeros(offset, dtype=np.float32)
                start = modality_offsets[modality]
                row[start : start + spectrum.shape[0]] = spectrum
                matrix.append(row)
                owners.append(sample_index)
                doc_names.append(f"{sample_name}:{crop_id}:{modality}")

    return np.asarray(matrix, dtype=np.float32), np.asarray(owners, dtype=np.int32), doc_names


def hidsag_region_document_rows(subset_code: str) -> tuple[dict[str, object], np.ndarray, np.ndarray]:
    manifest, arrays = load_hidsag_region_documents(subset_code)
    return manifest, arrays["features"], arrays["sample_owner"]


def hidsag_target_summary(subset: dict[str, object]) -> list[dict[str, object]]:
    samples = subset.get("samples", [])
    summaries = []
    for target_name in hidsag_numeric_target_names(subset):
        values = np.asarray([sample["targets"][target_name] for sample in samples], dtype=np.float32)
        summaries.append(
            {
                "target": target_name,
                "mean": round(float(np.mean(values)), 4),
                "median": round(float(np.median(values)), 4),
                "std": round(float(np.std(values)), 4),
                "min": round(float(np.min(values)), 4),
                "max": round(float(np.max(values)), 4),
                "nonzero_samples": int(np.sum(values > 0)),
                "threshold_1pct_positive": int(np.sum(values >= HIDSAG_BINARY_THRESHOLD)),
            }
        )
    summaries.sort(key=lambda row: float(row["std"]), reverse=True)
    return summaries


def hidsag_secondary_regime_labels(subset: dict[str, object]) -> tuple[np.ndarray, list[dict[str, object]]]:
    labels = []
    top_secondary = []
    for sample in subset.get("samples", []):
        candidates = [(name, float(value)) for name, value in sample["targets"].items() if name != "Quartz"]
        best_name, best_value = max(candidates, key=lambda item: item[1])
        label = best_name if best_name in HIDSAG_REGIME_FOCUS else "other-secondary"
        labels.append(label)
        top_secondary.append(
            {
                "sample_name": sample["sample_name"],
                "secondary_mineral": best_name,
                "secondary_value": round(best_value, 4),
                "derived_regime_label": label,
            }
        )
    return np.asarray(labels), top_secondary


def hidsag_binary_tasks(target_summary: list[dict[str, object]], sample_count: int) -> list[dict[str, object]]:
    candidates = []
    for row in target_summary:
        positive = int(row["threshold_1pct_positive"])
        negative = sample_count - positive
        if min(positive, negative) < 5:
            continue
        candidates.append(
            {
                "task_id": f"{str(row['target']).lower().replace(' ', '-').replace('/', '-')}-present-1pct",
                "target": row["target"],
                "threshold": HIDSAG_BINARY_THRESHOLD,
                "positive_samples": positive,
                "negative_samples": negative,
                "std": row["std"],
            }
        )
    candidates.sort(key=lambda row: float(row["std"]), reverse=True)
    return candidates[:4]


def hidsag_regression_targets(target_summary: list[dict[str, object]]) -> list[str]:
    selected = [
        str(row["target"])
        for row in target_summary
        if float(row["std"]) >= HIDSAG_REGRESSION_MIN_STD and int(row["nonzero_samples"]) >= HIDSAG_REGRESSION_MIN_NONZERO
    ]
    return selected[:8]


def continuous_binary_tasks(
    subset: dict[str, object],
    target_summary: list[dict[str, object]],
    min_std: float,
    min_class_size: int,
) -> list[dict[str, object]]:
    samples = subset.get("samples", [])
    candidates = []
    for row in target_summary:
        if float(row["std"]) < min_std:
            continue
        target_name = str(row["target"])
        values = np.asarray([sample["targets"][target_name] for sample in samples], dtype=np.float32)
        threshold = float(np.median(values))
        positive = int(np.sum(values >= threshold))
        negative = int(values.shape[0] - positive)
        if min(positive, negative) < min_class_size:
            continue
        candidates.append(
            {
                "task_id": f"{slugify(target_name)}-high-median",
                "target": target_name,
                "threshold": round(threshold, 4),
                "positive_samples": positive,
                "negative_samples": negative,
                "std": round(float(np.std(values)), 4),
                "labels": np.where(values >= threshold, "high", "low"),
                "values": values,
                "label_definition": f"{target_name} >= median({round(threshold, 4)})",
            }
        )
    candidates.sort(key=lambda row: float(row["std"]), reverse=True)
    return candidates[:4]


def hidsag_regression_targets_for_subset(subset_code: str, target_summary: list[dict[str, object]]) -> list[str]:
    if subset_code == "GEOMET":
        return [str(row["target"]) for row in target_summary]
    if subset_code == "GEOCHEM":
        selected = [
            str(row["target"])
            for row in target_summary
            if float(row["std"]) >= 0.12 and int(row["nonzero_samples"]) >= 20
        ]
        return selected[:8]
    return hidsag_regression_targets(target_summary)


def hidsag_classification_task_defs(
    subset_code: str,
    subset: dict[str, object],
    target_summary: list[dict[str, object]],
) -> list[dict[str, object]]:
    tasks: list[dict[str, object]] = []
    sample_count = int(subset.get("sample_count", len(subset.get("samples", []))))
    if subset_code == "MINERAL2":
        secondary_labels, top_secondary = hidsag_secondary_regime_labels(subset)
        tasks.append(
            {
                "task_id": "secondary-regime-3class",
                "labels": secondary_labels,
                "label_definition": "Highest-abundance non-quartz mineral; labels outside {Phengite, Muscovite} collapse into other-secondary.",
                "label_distribution": dict(Counter(secondary_labels.tolist())),
                "top_secondary": top_secondary,
            }
        )
        for task in hidsag_binary_tasks(target_summary, sample_count):
            values = np.asarray(
                [sample["targets"][str(task["target"])] for sample in subset.get("samples", [])],
                dtype=np.float32,
            )
            labels = np.where(values >= float(task["threshold"]), "present", "absent")
            tasks.append(
                {
                    **task,
                    "labels": labels,
                    "values": values,
                    "label_definition": f"{task['target']} >= {task['threshold']} wt%",
                    "label_distribution": dict(Counter(labels.tolist())),
                }
            )
        return tasks

    if "Quartz" in {str(name) for name in subset.get("variable_names", [])}:
        for task in hidsag_binary_tasks(target_summary, sample_count):
            values = np.asarray(
                [sample["targets"][str(task["target"])] for sample in subset.get("samples", [])],
                dtype=np.float32,
            )
            labels = np.where(values >= float(task["threshold"]), "present", "absent")
            tasks.append(
                {
                    **task,
                    "labels": labels,
                    "values": values,
                    "label_definition": f"{task['target']} >= {task['threshold']} wt%",
                    "label_distribution": dict(Counter(labels.tolist())),
                }
            )
        return tasks

    binary_min_std = 0.15 if subset_code == "GEOCHEM" else 0.5
    if subset_code == "GEOCHEM":
        binary_min_class_size = 8
    elif subset_code == "PORPHYRY":
        binary_min_class_size = 6
    else:
        binary_min_class_size = 20
    for task in continuous_binary_tasks(subset, target_summary, binary_min_std, binary_min_class_size):
        tasks.append(
            {
                "task_id": task["task_id"],
                "labels": task["labels"],
                "values": task["values"],
                "target": task["target"],
                "threshold": task["threshold"],
                "label_definition": task["label_definition"],
                "label_distribution": dict(Counter(task["labels"].tolist())),
                "positive_samples": task["positive_samples"],
                "negative_samples": task["negative_samples"],
                "std": task["std"],
            }
        )
    return tasks


def hidsag_protocol_definition(
    subset_code: str,
    task_type: str,
    sample_count: int,
    split_info: dict[str, object] | None = None,
) -> dict[str, object]:
    if sample_count <= 20:
        return {
            "type": "leave-one-out",
            "fold_count": sample_count,
            "reason": "Subset is too small for a single stable holdout, so every sample is evaluated once as test.",
        }
    if split_info is not None:
        group_count = int(split_info["unique_group_count"])
        fold_count = min(5, group_count)
        return {
            "type": "group-k-fold",
            "fold_count": fold_count,
            "group_name": split_info["group_name"],
            "group_count": group_count,
            "groups_preview": split_info["groups_preview"],
            "reason": split_info["reason"],
            "task_type": task_type,
        }
    return {
        "type": "5-fold",
        "fold_count": 5,
        "reason": "Subset is large enough for shuffled five-fold cross-validation while keeping more training support per fold.",
        "task_type": task_type,
    }


def hidsag_classification_splits(
    subset_code: str,
    labels: np.ndarray,
    sample_count: int,
    split_info: dict[str, object] | None = None,
):
    if sample_count <= 20:
        return LeaveOneOut().split(np.arange(sample_count))
    if split_info is not None:
        groups = np.asarray(split_info["groups"], dtype=object)
        n_splits = min(5, int(split_info["unique_group_count"]))
        return GroupKFold(n_splits=n_splits).split(np.arange(sample_count), labels, groups)
    return StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE).split(np.arange(sample_count), labels)


def hidsag_regression_splits(
    subset_code: str,
    sample_count: int,
    split_info: dict[str, object] | None = None,
):
    if sample_count <= 20:
        return LeaveOneOut().split(np.arange(sample_count))
    if split_info is not None:
        groups = np.asarray(split_info["groups"], dtype=object)
        n_splits = min(5, int(split_info["unique_group_count"]))
        return GroupKFold(n_splits=n_splits).split(np.arange(sample_count), None, groups)
    return KFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE).split(np.arange(sample_count))


def aggregate_doc_mixtures(
    doc_mixtures: np.ndarray,
    doc_owners: np.ndarray,
    sample_indices: np.ndarray,
) -> np.ndarray:
    return np.vstack([np.mean(doc_mixtures[doc_owners == int(sample_index)], axis=0) for sample_index in sample_indices])


def crossval_hidsag_classification(
    subset_code: str,
    features: np.ndarray,
    cube_doc_features: np.ndarray,
    cube_doc_owners: np.ndarray,
    region_doc_features: np.ndarray,
    region_doc_owners: np.ndarray,
    labels: np.ndarray,
    n_topics: int,
    doc_topic_count: int,
    region_topic_count: int,
    split_info: dict[str, object] | None = None,
) -> tuple[dict[str, object], dict[str, np.ndarray], list[dict[str, object]]]:
    sample_count = int(features.shape[0])
    protocol = hidsag_protocol_definition(subset_code, "classification", sample_count, split_info)
    predictions = {
        "raw_logistic_regression": np.empty(sample_count, dtype=object),
        "pca_logistic_regression": np.empty(sample_count, dtype=object),
        "topic_logistic_regression": np.empty(sample_count, dtype=object),
        "cube_topic_logistic_regression": np.empty(sample_count, dtype=object),
        "region_topic_logistic_regression": np.empty(sample_count, dtype=object),
    }
    fold_rows = []

    for fold_index, (train_idx, test_idx) in enumerate(
        hidsag_classification_splits(subset_code, labels, sample_count, split_info),
        start=1,
    ):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = labels[train_idx]
        raw_model = Pipeline([("scale", StandardScaler()), ("clf", make_logreg())])
        pca_model = Pipeline(
            [
                ("scale", StandardScaler()),
                ("pca", PCA(n_components=safe_compact_pca_components(x_train.shape[0], x_train.shape[1]), random_state=RANDOM_STATE)),
                ("clf", make_logreg()),
            ]
        )

        counts_train = band_frequency_counts(x_train)
        counts_test = band_frequency_counts(x_test)
        lda, topic_train = fit_lda(counts_train, n_topics=n_topics, seed=RANDOM_STATE, max_iter=20)
        topic_test = lda.transform(counts_test)
        topic_model = make_logreg()

        train_doc_mask = np.isin(cube_doc_owners, train_idx)
        test_doc_mask = np.isin(cube_doc_owners, test_idx)
        doc_counts_train = band_frequency_counts(cube_doc_features[train_doc_mask])
        doc_counts_test = band_frequency_counts(cube_doc_features[test_doc_mask])
        lda_doc, doc_topic_train = fit_lda(doc_counts_train, n_topics=doc_topic_count, seed=RANDOM_STATE, max_iter=20)
        doc_topic_test = lda_doc.transform(doc_counts_test)
        cube_topic_train = aggregate_doc_mixtures(doc_topic_train, cube_doc_owners[train_doc_mask], train_idx)
        cube_topic_test = aggregate_doc_mixtures(doc_topic_test, cube_doc_owners[test_doc_mask], test_idx)
        cube_topic_model = make_logreg()

        train_region_mask = np.isin(region_doc_owners, train_idx)
        test_region_mask = np.isin(region_doc_owners, test_idx)
        region_counts_train = band_frequency_counts(region_doc_features[train_region_mask])
        region_counts_test = band_frequency_counts(region_doc_features[test_region_mask])
        lda_region, region_topic_train_docs = fit_lda(
            region_counts_train,
            n_topics=region_topic_count,
            seed=RANDOM_STATE,
            max_iter=20,
        )
        region_topic_test_docs = lda_region.transform(region_counts_test)
        region_topic_train = aggregate_doc_mixtures(region_topic_train_docs, region_doc_owners[train_region_mask], train_idx)
        region_topic_test = aggregate_doc_mixtures(region_topic_test_docs, region_doc_owners[test_region_mask], test_idx)
        region_topic_model = make_logreg()

        raw_pred = safe_classifier_predict(raw_model, x_train, y_train, x_test)
        pca_pred = safe_classifier_predict(pca_model, x_train, y_train, x_test)
        topic_pred = safe_classifier_predict(topic_model, topic_train, y_train, topic_test)
        cube_topic_pred = safe_classifier_predict(cube_topic_model, cube_topic_train, y_train, cube_topic_test)
        region_topic_pred = safe_classifier_predict(region_topic_model, region_topic_train, y_train, region_topic_test)

        predictions["raw_logistic_regression"][test_idx] = raw_pred
        predictions["pca_logistic_regression"][test_idx] = pca_pred
        predictions["topic_logistic_regression"][test_idx] = topic_pred
        predictions["cube_topic_logistic_regression"][test_idx] = cube_topic_pred
        predictions["region_topic_logistic_regression"][test_idx] = region_topic_pred

        for local_index, sample_index in enumerate(test_idx):
            fold_rows.append(
                {
                    "fold": fold_index,
                    "sample_index": int(sample_index),
                    "true_label": str(labels[int(sample_index)]),
                    "predictions": {
                        "raw_logistic_regression": str(raw_pred[local_index]),
                        "pca_logistic_regression": str(pca_pred[local_index]),
                        "topic_logistic_regression": str(topic_pred[local_index]),
                        "cube_topic_logistic_regression": str(cube_topic_pred[local_index]),
                        "region_topic_logistic_regression": str(region_topic_pred[local_index]),
                    },
                }
            )

    return protocol, {key: np.asarray(values) for key, values in predictions.items()}, fold_rows


def crossval_hidsag_regression(
    subset_code: str,
    features: np.ndarray,
    cube_doc_features: np.ndarray,
    cube_doc_owners: np.ndarray,
    region_doc_features: np.ndarray,
    region_doc_owners: np.ndarray,
    target: np.ndarray,
    n_topics: int,
    doc_topic_count: int,
    region_topic_count: int,
    split_info: dict[str, object] | None = None,
) -> tuple[dict[str, object], dict[str, np.ndarray], list[dict[str, object]]]:
    sample_count = int(features.shape[0])
    protocol = hidsag_protocol_definition(subset_code, "regression", sample_count, split_info)
    predictions = {
        "raw_ridge_regression": np.zeros(sample_count, dtype=np.float32),
        "pls_regression": np.zeros(sample_count, dtype=np.float32),
        "topic_mixture_linear_regression": np.zeros(sample_count, dtype=np.float32),
        "cube_topic_mixture_linear_regression": np.zeros(sample_count, dtype=np.float32),
        "region_topic_mixture_linear_regression": np.zeros(sample_count, dtype=np.float32),
        "topic_routed_linear_regression": np.zeros(sample_count, dtype=np.float32),
    }
    fold_rows = []

    for fold_index, (train_idx, test_idx) in enumerate(
        hidsag_regression_splits(subset_code, sample_count, split_info),
        start=1,
    ):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = target[train_idx]

        raw_model = Pipeline([("scale", StandardScaler()), ("reg", Ridge(alpha=1.0))])
        raw_pred = raw_model.fit(x_train, y_train).predict(x_test).astype(np.float32)

        pls_components = max(2, min(6, x_train.shape[0] - 1, x_train.shape[1]))
        pls_model = PLSRegression(n_components=pls_components, scale=True)
        pls_pred = pls_model.fit(x_train, y_train).predict(x_test).ravel().astype(np.float32)

        counts_train = band_frequency_counts(x_train)
        counts_test = band_frequency_counts(x_test)
        lda, topic_train = fit_lda(counts_train, n_topics=n_topics, seed=RANDOM_STATE, max_iter=20)
        topic_test = lda.transform(counts_test)
        topic_pred = LinearRegression().fit(topic_train, y_train).predict(topic_test).astype(np.float32)

        train_doc_mask = np.isin(cube_doc_owners, train_idx)
        test_doc_mask = np.isin(cube_doc_owners, test_idx)
        doc_counts_train = band_frequency_counts(cube_doc_features[train_doc_mask])
        doc_counts_test = band_frequency_counts(cube_doc_features[test_doc_mask])
        lda_doc, doc_topic_train = fit_lda(doc_counts_train, n_topics=doc_topic_count, seed=RANDOM_STATE, max_iter=20)
        doc_topic_test = lda_doc.transform(doc_counts_test)
        cube_topic_train = aggregate_doc_mixtures(doc_topic_train, cube_doc_owners[train_doc_mask], train_idx)
        cube_topic_test = aggregate_doc_mixtures(doc_topic_test, cube_doc_owners[test_doc_mask], test_idx)
        cube_topic_pred = LinearRegression().fit(cube_topic_train, y_train).predict(cube_topic_test).astype(np.float32)

        train_region_mask = np.isin(region_doc_owners, train_idx)
        test_region_mask = np.isin(region_doc_owners, test_idx)
        region_counts_train = band_frequency_counts(region_doc_features[train_region_mask])
        region_counts_test = band_frequency_counts(region_doc_features[test_region_mask])
        lda_region, region_topic_train_docs = fit_lda(
            region_counts_train,
            n_topics=region_topic_count,
            seed=RANDOM_STATE,
            max_iter=20,
        )
        region_topic_test_docs = lda_region.transform(region_counts_test)
        region_topic_train = aggregate_doc_mixtures(region_topic_train_docs, region_doc_owners[train_region_mask], train_idx)
        region_topic_test = aggregate_doc_mixtures(region_topic_test_docs, region_doc_owners[test_region_mask], test_idx)
        region_topic_pred = LinearRegression().fit(region_topic_train, y_train).predict(region_topic_test).astype(np.float32)

        train_dominant = np.argmax(topic_train, axis=1)
        test_dominant = np.argmax(topic_test, axis=1)
        routed_values = []
        local_counts = []
        routed_scopes = []
        for local_index, topic_id in enumerate(test_dominant):
            local_mask = train_dominant == int(topic_id)
            local_count = int(np.sum(local_mask))
            if local_count >= 4:
                routed_model = LinearRegression().fit(x_train[local_mask], y_train[local_mask])
                routed_scope = "topic-local"
            else:
                routed_model = LinearRegression().fit(x_train, y_train)
                routed_scope = "global-fallback"
            routed_values.append(float(routed_model.predict(x_test[local_index : local_index + 1])[0]))
            local_counts.append(local_count)
            routed_scopes.append(routed_scope)
        routed_pred = np.asarray(routed_values, dtype=np.float32)

        predictions["raw_ridge_regression"][test_idx] = raw_pred
        predictions["pls_regression"][test_idx] = pls_pred
        predictions["topic_mixture_linear_regression"][test_idx] = topic_pred
        predictions["cube_topic_mixture_linear_regression"][test_idx] = cube_topic_pred
        predictions["region_topic_mixture_linear_regression"][test_idx] = region_topic_pred
        predictions["topic_routed_linear_regression"][test_idx] = routed_pred

        for local_index, sample_index in enumerate(test_idx):
            fold_rows.append(
                {
                    "fold": fold_index,
                    "sample_index": int(sample_index),
                    "true_value": round(float(target[int(sample_index)]), 4),
                    "test_topic_id": int(test_dominant[local_index] + 1),
                    "local_training_samples": int(local_counts[local_index]),
                    "routed_scope": routed_scopes[local_index],
                    "predictions": {
                        "raw_ridge_regression": round(float(raw_pred[local_index]), 4),
                        "pls_regression": round(float(pls_pred[local_index]), 4),
                        "topic_mixture_linear_regression": round(float(topic_pred[local_index]), 4),
                        "cube_topic_mixture_linear_regression": round(float(cube_topic_pred[local_index]), 4),
                        "region_topic_mixture_linear_regression": round(float(region_topic_pred[local_index]), 4),
                        "topic_routed_linear_regression": round(float(routed_pred[local_index]), 4),
                    },
                }
            )

    return protocol, predictions, fold_rows


def loo_hidsag_classification(
    features: np.ndarray,
    labels: np.ndarray,
    n_topics: int,
) -> tuple[dict[str, np.ndarray], list[dict[str, object]]]:
    loo = LeaveOneOut()
    predictions = {
        "raw_logistic_regression": [],
        "pca_logistic_regression": [],
        "topic_logistic_regression": [],
    }
    fold_rows = []

    for fold_index, (train_idx, test_idx) in enumerate(loo.split(features), start=1):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = labels[train_idx]
        true_label = str(labels[test_idx[0]])
        sample_name = int(test_idx[0])

        raw_model = Pipeline(
            [
                ("scale", StandardScaler()),
                ("clf", make_logreg()),
            ]
        )
        pca_model = Pipeline(
            [
                ("scale", StandardScaler()),
                ("pca", PCA(n_components=safe_compact_pca_components(x_train.shape[0], x_train.shape[1]), random_state=RANDOM_STATE)),
                ("clf", make_logreg()),
            ]
        )
        counts_train = band_frequency_counts(x_train)
        counts_test = band_frequency_counts(x_test)
        lda, topic_train = fit_lda(counts_train, n_topics=n_topics, seed=RANDOM_STATE, max_iter=20)
        topic_test = lda.transform(counts_test)
        topic_model = make_logreg()

        raw_pred = str(raw_model.fit(x_train, y_train).predict(x_test)[0])
        pca_pred = str(pca_model.fit(x_train, y_train).predict(x_test)[0])
        topic_pred = str(topic_model.fit(topic_train, y_train).predict(topic_test)[0])

        predictions["raw_logistic_regression"].append(raw_pred)
        predictions["pca_logistic_regression"].append(pca_pred)
        predictions["topic_logistic_regression"].append(topic_pred)
        fold_rows.append(
            {
                "fold": fold_index,
                "sample_index": sample_name,
                "true_label": true_label,
                "predictions": {
                    "raw_logistic_regression": raw_pred,
                    "pca_logistic_regression": pca_pred,
                    "topic_logistic_regression": topic_pred,
                },
            }
        )

    return {key: np.asarray(values) for key, values in predictions.items()}, fold_rows


def loo_hidsag_regression(
    features: np.ndarray,
    target: np.ndarray,
    n_topics: int,
) -> tuple[dict[str, np.ndarray], list[dict[str, object]]]:
    loo = LeaveOneOut()
    predictions = {
        "raw_ridge_regression": [],
        "pls_regression": [],
        "topic_mixture_linear_regression": [],
        "topic_routed_linear_regression": [],
    }
    fold_rows = []

    for fold_index, (train_idx, test_idx) in enumerate(loo.split(features), start=1):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = target[train_idx]
        y_true = float(target[test_idx[0]])

        raw_model = Pipeline(
            [
                ("scale", StandardScaler()),
                ("reg", Ridge(alpha=1.0)),
            ]
        )
        raw_pred = float(raw_model.fit(x_train, y_train).predict(x_test)[0])

        pls_components = max(2, min(6, x_train.shape[0] - 1, x_train.shape[1]))
        pls_model = PLSRegression(n_components=pls_components, scale=True)
        pls_pred = float(pls_model.fit(x_train, y_train).predict(x_test).ravel()[0])

        counts_train = band_frequency_counts(x_train)
        counts_test = band_frequency_counts(x_test)
        lda, topic_train = fit_lda(counts_train, n_topics=n_topics, seed=RANDOM_STATE, max_iter=20)
        topic_test = lda.transform(counts_test)
        topic_linear = LinearRegression().fit(topic_train, y_train)
        topic_pred = float(topic_linear.predict(topic_test)[0])

        train_dominant = np.argmax(topic_train, axis=1)
        test_topic = int(np.argmax(topic_test[0]))
        local_mask = train_dominant == test_topic
        if int(np.sum(local_mask)) >= 4:
            routed_model = LinearRegression().fit(x_train[local_mask], y_train[local_mask])
            routed_scope = "topic-local"
        else:
            routed_model = LinearRegression().fit(x_train, y_train)
            routed_scope = "global-fallback"
        routed_pred = float(routed_model.predict(x_test)[0])

        predictions["raw_ridge_regression"].append(raw_pred)
        predictions["pls_regression"].append(pls_pred)
        predictions["topic_mixture_linear_regression"].append(topic_pred)
        predictions["topic_routed_linear_regression"].append(routed_pred)
        fold_rows.append(
            {
                "fold": fold_index,
                "true_value": round(y_true, 4),
                "test_topic_id": int(test_topic + 1),
                "local_training_samples": int(np.sum(local_mask)),
                "routed_scope": routed_scope,
                "predictions": {
                    "raw_ridge_regression": round(raw_pred, 4),
                    "pls_regression": round(pls_pred, 4),
                    "topic_mixture_linear_regression": round(topic_pred, 4),
                    "topic_routed_linear_regression": round(routed_pred, 4),
                },
            }
        )

    return {key: np.asarray(values, dtype=np.float32) for key, values in predictions.items()}, fold_rows


def cluster_size_summary(prediction: np.ndarray) -> list[dict[str, int]]:
    return [
        {"cluster_id": int(index + 1), "size": int(size)}
        for index, size in enumerate(np.bincount(prediction))
    ]


def matched_topic_similarity(reference_components: np.ndarray, candidate_components: np.ndarray) -> dict[str, object]:
    ref_probs = normalize_probability_rows(reference_components)
    cand_probs = normalize_probability_rows(candidate_components)
    similarity = cosine_similarity_matrix(ref_probs, cand_probs)
    row_ind, col_ind = best_alignment(similarity, maximize=True)
    matched = similarity[row_ind, col_ind]

    overlaps = []
    for ref_index, cand_index in zip(row_ind, col_ind, strict=False):
        ref_set = top_index_set(ref_probs[ref_index])
        cand_set = top_index_set(cand_probs[cand_index])
        union = max(1, len(ref_set | cand_set))
        overlaps.append(len(ref_set & cand_set) / union)

    return {
        "matched_topic_cosine_mean": round(float(np.mean(matched)), 4),
        "matched_topic_cosine_min": round(float(np.min(matched)), 4),
        "matched_topic_cosine_std": round(float(np.std(matched)), 4),
        "matched_top_token_jaccard_mean": round(float(np.mean(overlaps)), 4),
        "pairings": [
            {
                "reference_topic_id": int(ref_index + 1),
                "candidate_topic_id": int(cand_index + 1),
                "cosine_similarity": round(float(similarity[ref_index, cand_index]), 4),
                "top_token_jaccard": round(float(overlap), 4),
            }
            for ref_index, cand_index, overlap in zip(row_ind, col_ind, overlaps, strict=False)
        ],
    }


def topic_stability_benchmark(dataset_id: str) -> dict[str, object]:
    cube, gt, config = load_scene(dataset_id)
    assert gt is not None
    flat_cube = cube.reshape(-1, cube.shape[2])
    flat_gt = gt.reshape(-1)
    valid = valid_spectra_mask(flat_cube) & (flat_gt > 0)
    spectra = flat_cube[valid]
    labels = flat_gt[valid]
    sampled = stratified_sample_indices(labels, per_class=80, random_state=RANDOM_STATE)
    spectra = spectra[sampled]
    counts = band_frequency_counts(spectra)
    n_topics = topic_count_for_labels(np.unique(labels).size)

    fitted = []
    for seed in TOPIC_STABILITY_SEEDS:
        lda, _ = fit_lda(counts, n_topics=n_topics, seed=seed, max_iter=18)
        fitted.append(
            {
                "seed": seed,
                "model": lda,
                "perplexity": float(lda.perplexity(counts)),
            }
        )

    reference = fitted[0]
    comparisons = []
    for candidate in fitted[1:]:
        comparison = matched_topic_similarity(reference["model"].components_, candidate["model"].components_)
        comparison["reference_seed"] = int(reference["seed"])
        comparison["candidate_seed"] = int(candidate["seed"])
        comparison["reference_perplexity"] = round(float(reference["perplexity"]), 4)
        comparison["candidate_perplexity"] = round(float(candidate["perplexity"]), 4)
        comparisons.append(comparison)

    comparison_cosines = [row["matched_topic_cosine_mean"] for row in comparisons]
    comparison_jaccards = [row["matched_top_token_jaccard_mean"] for row in comparisons]
    perplexities = [row["perplexity"] for row in fitted]

    return {
        "dataset_id": dataset_id,
        "dataset_name": config.name,
        "topic_count": n_topics,
        "document_count": int(spectra.shape[0]),
        "seeds": TOPIC_STABILITY_SEEDS,
        "perplexity_mean": round(float(np.mean(perplexities)), 4),
        "perplexity_std": round(float(np.std(perplexities)), 4),
        "matched_topic_cosine_mean": round(float(np.mean(comparison_cosines)), 4),
        "matched_topic_cosine_min": round(float(np.min(comparison_cosines)), 4),
        "matched_top_token_jaccard_mean": round(float(np.mean(comparison_jaccards)), 4),
        "comparisons": comparisons,
        "caveat": "This first-pass stability view compares aligned topic components across seeds on a compact sample, not full-scene stability under all preprocessing choices.",
    }


def alignment_records(
    component_matrix: np.ndarray,
    reference_matrix: np.ndarray,
    reference_names: list[str],
    wavelengths: np.ndarray,
    top_k: int = 3,
) -> dict[str, object]:
    angles = spectral_angle_matrix(normalize_rows01(component_matrix), normalize_rows01(reference_matrix))
    row_ind, col_ind = best_alignment(angles, maximize=False)
    matched = angles[row_ind, col_ind]
    aligned = []
    for ref_component, ref_reference in zip(row_ind, col_ind, strict=False):
        row = angles[ref_component]
        nearest = np.argsort(row)[:top_k]
        aligned.append(
            {
                "component_id": int(ref_component + 1),
                "matched_reference": reference_names[ref_reference],
                "matched_angle_deg": round(float(angles[ref_component, ref_reference]), 4),
                "top_band_tokens": top_band_tokens(component_matrix[ref_component], wavelengths),
                "nearest_references": [
                    {
                        "name": reference_names[int(index)],
                        "angle_deg": round(float(row[int(index)]), 4),
                    }
                    for index in nearest
                ],
            }
        )
    return {
        "matched_angle_deg_mean": round(float(np.mean(matched)), 4),
        "matched_angle_deg_max": round(float(np.max(matched)), 4),
        "components": aligned,
    }


def fit_nmf(spectra: np.ndarray, n_components: int) -> tuple[NMF, np.ndarray]:
    nmf = NMF(
        n_components=n_components,
        init="nndsvda",
        random_state=RANDOM_STATE,
        max_iter=350,
        solver="cd",
    )
    abundances = nmf.fit_transform(np.maximum(spectra, 1e-6))
    return nmf, abundances


def benchmark_labeled_scene(dataset_id: str) -> dict:
    cube, gt, config = load_scene(dataset_id)
    assert gt is not None
    rows, cols, bands = cube.shape
    flat_cube = cube.reshape(-1, bands)
    flat_gt = gt.reshape(-1)
    valid = valid_spectra_mask(flat_cube) & (flat_gt > 0)
    spectra = flat_cube[valid]
    labels = flat_gt[valid]

    sampled = stratified_sample_indices(labels, per_class=160, random_state=RANDOM_STATE)
    spectra = spectra[sampled]
    labels = labels[sampled]

    x_train, x_test, y_train, y_test = train_test_split(
        spectra,
        labels,
        test_size=0.25,
        random_state=RANDOM_STATE,
        stratify=labels,
    )
    counts_train = band_frequency_counts(x_train)
    counts_test = band_frequency_counts(x_test)
    unique_labels = np.unique(labels)
    n_topics = topic_count_for_labels(unique_labels.size)

    lda, topic_train = fit_lda(counts_train, n_topics=n_topics, seed=RANDOM_STATE)
    topic_test = lda.transform(counts_test)

    raw_logreg = Pipeline(
        [
            ("scale", StandardScaler()),
            ("clf", make_logreg()),
        ]
    )
    pca_logreg = Pipeline(
        [
            ("scale", StandardScaler()),
            ("pca", PCA(n_components=safe_pca_components(x_train.shape[0], x_train.shape[1]), random_state=RANDOM_STATE)),
            ("clf", make_logreg()),
        ]
    )
    topic_logreg = make_logreg()

    topic_features_all = lda.transform(band_frequency_counts(spectra))
    wavelengths = approximate_scene_wavelengths(config, bands)

    return {
        "dataset_id": dataset_id,
        "dataset_name": config.name,
        "family_id": config.family_id,
        "sensor": config.sensor,
        "cube_shape": [int(rows), int(cols), int(bands)],
        "sampled_documents": int(spectra.shape[0]),
        "class_count": int(unique_labels.size),
        "train_size": int(x_train.shape[0]),
        "test_size": int(x_test.shape[0]),
        "representation": {
            "id": "band-frequency",
            "alphabet": "band-center tokens",
            "word": "band token repeated by normalized reflectance count",
            "document": "one labeled pixel spectrum",
        },
        "topic_model": {
            "method": "sklearn-lda",
            "topic_count": n_topics,
            "train_perplexity": round(float(lda.perplexity(counts_train)), 4),
            "test_perplexity": round(float(lda.perplexity(counts_test)), 4),
            "top_band_tokens": [
                {
                    "topic_id": topic_index + 1,
                    "tokens": top_band_tokens(component, wavelengths),
                }
                for topic_index, component in enumerate(lda.components_)
            ],
        },
        "classification": {
            "raw_logistic_regression": classification_metrics(raw_logreg, x_train, x_test, y_train, y_test),
            "pca_logistic_regression": classification_metrics(pca_logreg, x_train, x_test, y_train, y_test),
            "topic_logistic_regression": classification_metrics(topic_logreg, topic_train, topic_test, y_train, y_test),
        },
        "clustering": clustering_metrics(normalize_rows01(spectra), topic_features_all, labels, int(unique_labels.size)),
    }


def load_usgs_group_centroids(band_count: int) -> tuple[np.ndarray, list[str], np.ndarray]:
    payload = load_json(LIBRARY_PATH)
    samples = [sample for sample in payload.get("samples", []) if int(sample["band_count"]) == band_count]
    grouped: dict[str, list[np.ndarray]] = {}
    for sample in samples:
        grouped.setdefault(str(sample["group"]), []).append(np.asarray(sample["spectrum"], dtype=np.float32))
    group_names = sorted(grouped)
    centroids = np.array([np.mean(grouped[name], axis=0) for name in group_names], dtype=np.float32)
    wavelengths = np.asarray(samples[0]["wavelengths_nm"], dtype=np.float32)
    return centroids, group_names, wavelengths


def benchmark_unlabeled_scene(dataset_id: str) -> dict:
    cube, gt, config = load_scene(dataset_id)
    assert gt is None
    rows, cols, bands = cube.shape
    flat_cube = cube.reshape(-1, bands)
    valid = valid_spectra_mask(flat_cube)
    spectra = flat_cube[valid]
    rng = np.random.default_rng(RANDOM_STATE)
    sample_count = min(4200, int(spectra.shape[0]))
    chosen = rng.choice(np.arange(spectra.shape[0]), size=sample_count, replace=False)
    spectra = spectra[chosen]
    counts = band_frequency_counts(spectra)

    n_topics = 8
    lda, mixtures = fit_lda(counts, n_topics=n_topics, seed=RANDOM_STATE)
    raw_features = normalize_rows01(spectra)
    raw_reduced = reduced_raw_feature_space(raw_features)
    wavelengths = approximate_scene_wavelengths(config, bands)
    clustering_outputs = {
        "raw_kmeans": {
            "feature_space": "normalized spectra",
            "cluster_summary": cluster_size_summary(predict_kmeans(raw_features, n_topics)),
        },
        "raw_gmm": {
            "feature_space": "pca-normalized spectra",
            "cluster_summary": cluster_size_summary(predict_gmm(raw_reduced, n_topics)),
        },
        "raw_hierarchical": {
            "feature_space": "pca-normalized spectra",
            "cluster_summary": cluster_size_summary(predict_hierarchical(raw_reduced, n_topics)),
        },
        "topic_kmeans": {
            "feature_space": "topic mixture",
            "cluster_summary": cluster_size_summary(predict_kmeans(mixtures, n_topics)),
        },
        "topic_gmm": {
            "feature_space": "topic mixture",
            "cluster_summary": cluster_size_summary(predict_gmm(mixtures, n_topics)),
        },
        "topic_hierarchical": {
            "feature_space": "topic mixture",
            "cluster_summary": cluster_size_summary(predict_hierarchical(mixtures, n_topics)),
        },
    }

    reference_alignment = None
    if bands == 224:
        reference_centroids, reference_names, reference_wavelengths = load_usgs_group_centroids(224)
        nmf_model, nmf_abundances = fit_nmf(raw_features, min(n_topics, reference_centroids.shape[0]))
        topic_alignment = alignment_records(lda.components_, reference_centroids, reference_names, reference_wavelengths)
        nmf_alignment = alignment_records(nmf_model.components_, reference_centroids, reference_names, reference_wavelengths)
        abundance_entropy = -np.sum(
            normalize_probability_rows(nmf_abundances) * np.log(np.maximum(normalize_probability_rows(nmf_abundances), 1e-8)),
            axis=1,
        )
        reference_alignment = {
            "reference_source": "USGS Spectral Library Version 7 compact 224-band group centroids",
            "reference_group_count": int(reference_centroids.shape[0]),
            "topic_alignment": topic_alignment,
            "nmf_alignment": nmf_alignment,
            "nmf_reconstruction_error": round(float(nmf_model.reconstruction_err_ / np.linalg.norm(raw_features)), 4),
            "mean_abundance_entropy": round(float(np.mean(abundance_entropy)), 4),
        }

    return {
        "dataset_id": dataset_id,
        "dataset_name": config.name,
        "family_id": config.family_id,
        "sensor": config.sensor,
        "cube_shape": [int(rows), int(cols), int(bands)],
        "sampled_documents": int(spectra.shape[0]),
        "representation": {
            "id": "band-frequency",
            "alphabet": "band-center tokens",
            "word": "band token repeated by normalized reflectance count",
            "document": "one unlabeled pixel spectrum",
        },
        "topic_model": {
            "method": "sklearn-lda",
            "topic_count": n_topics,
            "perplexity": round(float(lda.perplexity(counts)), 4),
            "top_band_tokens": [
                {
                    "topic_id": topic_index + 1,
                    "tokens": top_band_tokens(component, wavelengths),
                }
                for topic_index, component in enumerate(lda.components_)
            ],
        },
        "clustering": clustering_outputs,
        "reference_alignment": reference_alignment,
        "caveat": "Unlabeled topic regimes are exploratory. They are not semantic or mineral labels by themselves.",
    }


def benchmark_spectral_library() -> dict:
    payload = load_json(LIBRARY_PATH)
    samples = payload.get("samples", [])
    groups = {}
    for sample in samples:
        groups.setdefault(int(sample["band_count"]), []).append(sample)

    band_groups = []
    for band_count, band_samples in sorted(groups.items()):
        if len(band_samples) < 4:
            continue
        spectra = np.array([sample["spectrum"] for sample in band_samples], dtype=np.float32)
        labels = np.array([sample["group"] for sample in band_samples])
        label_ids = {label: index for index, label in enumerate(sorted(set(labels)))}
        y = np.array([label_ids[label] for label in labels], dtype=np.int32)
        counts = band_frequency_counts(spectra)
        n_topics = max(4, min(6, len(band_samples) - 1))
        lda, mixtures = fit_lda(counts, n_topics=n_topics, seed=RANDOM_STATE)
        wavelengths = np.array(band_samples[0]["wavelengths_nm"], dtype=np.float32)
        raw_features = normalize_rows01(spectra)
        band_groups.append(
            {
                "band_count": band_count,
                "sample_count": len(band_samples),
                "group_count": len(label_ids),
                "topic_count": n_topics,
                "perplexity": round(float(lda.perplexity(counts)), 4),
                "clustering": clustering_metrics(raw_features, mixtures, y, len(label_ids)),
                "top_band_tokens": [
                    {
                        "topic_id": topic_index + 1,
                        "tokens": top_band_tokens(component, wavelengths),
                    }
                    for topic_index, component in enumerate(lda.components_)
                ],
            }
        )

    return {
        "dataset_id": "usgs-splib07",
        "dataset_name": "USGS Spectral Library Version 7 compact local slices",
        "family_id": "individual-spectra",
        "representation": {
            "id": "band-frequency",
            "alphabet": "sensor-convolved spectral band tokens",
            "word": "band token repeated by normalized reflectance count",
            "document": "one material reference spectrum",
        },
        "band_groups": band_groups,
    }


def benchmark_unmixing_scene(dataset_id: str) -> dict[str, object]:
    spectra, _, _, config = load_unmixing_scene(dataset_id)
    material_names, reference_groups, _ = load_unmixing_reference_groups(dataset_id)
    rows, cols, bands = load_unmixing_cube_shape(dataset_id)

    rng = np.random.default_rng(RANDOM_STATE)
    sample_count = min(4000, int(spectra.shape[0]))
    chosen = rng.choice(np.arange(spectra.shape[0]), size=sample_count, replace=False)
    spectra = spectra[chosen]
    spectra = normalize_rows01(spectra)
    counts = band_frequency_counts(spectra)
    reference_centroids = np.array([np.mean(group, axis=0) for group in reference_groups], dtype=np.float32)
    component_count = len(material_names)

    lda, topic_mixtures = fit_lda(counts, n_topics=component_count, seed=RANDOM_STATE, max_iter=20)
    nmf_model, abundances = fit_nmf(spectra, n_components=component_count)
    wavelengths = approximate_unmixing_wavelengths(config, bands)

    topic_alignment = alignment_records(lda.components_, reference_centroids, material_names, wavelengths)
    nmf_alignment = alignment_records(nmf_model.components_, reference_centroids, material_names, wavelengths)

    topic_entropy = -np.sum(
        normalize_probability_rows(topic_mixtures) * np.log(np.maximum(normalize_probability_rows(topic_mixtures), 1e-8)),
        axis=1,
    )
    abundance_entropy = -np.sum(
        normalize_probability_rows(abundances) * np.log(np.maximum(normalize_probability_rows(abundances), 1e-8)),
        axis=1,
    )

    return {
        "dataset_id": dataset_id,
        "dataset_name": config.name,
        "sensor": config.sensor,
        "cube_shape": [int(rows), int(cols), int(bands)],
        "sampled_documents": int(spectra.shape[0]),
        "reference_material_count": component_count,
        "reference_materials": material_names,
        "topic_model": {
            "method": "sklearn-lda",
            "topic_count": component_count,
            "perplexity": round(float(lda.perplexity(counts)), 4),
            "mean_topic_entropy": round(float(np.mean(topic_entropy)), 4),
            "alignment": topic_alignment,
        },
        "nmf_baseline": {
            "component_count": component_count,
            "normalized_reconstruction_error": round(float(nmf_model.reconstruction_err_ / np.linalg.norm(spectra)), 4),
            "mean_abundance_entropy": round(float(np.mean(abundance_entropy)), 4),
            "alignment": nmf_alignment,
        },
        "caveat": "Scene-specific spectral libraries support mixture-oriented reference checks, not semantic ground truth for every pixel.",
    }


def benchmark_hidsag_subset(subset_code: str = "MINERAL2") -> dict[str, object]:
    subset = load_hidsag_subset(subset_code)
    features, sample_names, feature_layout, token_names = hidsag_feature_rows(subset)
    cube_doc_features, cube_doc_owners, _ = hidsag_cube_document_rows(subset, feature_layout)
    region_manifest, region_doc_features, region_doc_owners = hidsag_region_document_rows(subset_code)
    counts = band_frequency_counts(features)
    cube_doc_counts = band_frequency_counts(cube_doc_features)
    region_doc_counts = band_frequency_counts(region_doc_features)
    topic_count = HIDSAG_SUBSET_TOPIC_COUNTS.get(subset_code, 4)
    doc_topic_count = HIDSAG_SUBSET_DOC_TOPIC_COUNTS.get(subset_code, min(topic_count, 3))
    region_topic_count = HIDSAG_SUBSET_REGION_TOPIC_COUNTS.get(subset_code, max(doc_topic_count, topic_count))
    lda, mixtures = fit_lda(counts, n_topics=topic_count, seed=RANDOM_STATE, max_iter=20)
    lda_doc, cube_doc_mixtures = fit_lda(cube_doc_counts, n_topics=doc_topic_count, seed=RANDOM_STATE, max_iter=20)
    lda_region, region_doc_mixtures = fit_lda(region_doc_counts, n_topics=region_topic_count, seed=RANDOM_STATE, max_iter=20)
    dominant_topic_counts = np.bincount(np.argmax(mixtures, axis=1), minlength=topic_count)
    hierarchical_topic_counts = np.bincount(
        np.argmax(aggregate_doc_mixtures(cube_doc_mixtures, cube_doc_owners, np.arange(features.shape[0])), axis=1),
        minlength=doc_topic_count,
    )
    region_topic_counts = np.bincount(
        np.argmax(aggregate_doc_mixtures(region_doc_mixtures, region_doc_owners, np.arange(features.shape[0])), axis=1),
        minlength=region_topic_count,
    )
    target_summary = hidsag_target_summary(subset)
    regression_targets = hidsag_regression_targets_for_subset(subset_code, target_summary)
    split_info = hidsag_group_split_info(subset_code, subset)

    classification_tasks = []
    for task in hidsag_classification_task_defs(subset_code, subset, target_summary):
        labels = np.asarray(task["labels"])
        protocol, predictions, fold_rows = crossval_hidsag_classification(
            subset_code,
            features,
            cube_doc_features,
            cube_doc_owners,
            region_doc_features,
            region_doc_owners,
            labels,
            n_topics=topic_count,
            doc_topic_count=doc_topic_count,
            region_topic_count=region_topic_count,
            split_info=split_info,
        )
        task_metrics = {
            model_id: classification_metrics_from_predictions(labels, prediction)
            for model_id, prediction in predictions.items()
        }
        task_payload = {
            "task_id": task["task_id"],
            "label_definition": task["label_definition"],
            "label_distribution": task["label_distribution"],
            "split_protocol": protocol,
            "metrics": task_metrics,
            "best_model": max(
                ({"model_id": model_id, **metrics} for model_id, metrics in task_metrics.items()),
                key=lambda row: (float(row["macro_f1"]), float(row["balanced_accuracy"])),
            ),
        }
        if "target" in task:
            task_payload["target"] = task["target"]
        if "threshold" in task:
            task_payload["threshold"] = task["threshold"]
        if "positive_samples" in task:
            task_payload["positive_samples"] = task["positive_samples"]
        if "negative_samples" in task:
            task_payload["negative_samples"] = task["negative_samples"]
        if "std" in task:
            task_payload["std"] = task["std"]
        if task["task_id"] == "secondary-regime-3class":
            top_secondary = task["top_secondary"]
            task_payload["sample_predictions"] = [
                {
                    "sample_name": sample_names[row["sample_index"]],
                    "true_label": row["true_label"],
                    "derived_secondary": top_secondary[row["sample_index"]]["secondary_mineral"],
                    "predictions": row["predictions"],
                }
                for row in fold_rows
            ]
        else:
            values = np.asarray(task["values"], dtype=np.float32)
            task_payload["sample_predictions"] = [
                {
                    "sample_name": sample_names[row["sample_index"]],
                    "true_label": row["true_label"],
                    "target_value": round(float(values[row["sample_index"]]), 4),
                    "predictions": row["predictions"],
                }
                for row in fold_rows
            ]
        classification_tasks.append(task_payload)

    regression_tasks = []
    for target_name in regression_targets:
        target = np.asarray([sample["targets"][target_name] for sample in subset.get("samples", [])], dtype=np.float32)
        protocol, predictions, fold_rows = crossval_hidsag_regression(
            subset_code,
            features,
            cube_doc_features,
            cube_doc_owners,
            region_doc_features,
            region_doc_owners,
            target,
            n_topics=topic_count,
            doc_topic_count=doc_topic_count,
            region_topic_count=region_topic_count,
            split_info=split_info,
        )
        task_metrics = {
            model_id: regression_metrics_from_predictions(target, prediction)
            for model_id, prediction in predictions.items()
        }
        regression_tasks.append(
            {
                "target": target_name,
                "summary": next(row for row in target_summary if str(row["target"]) == target_name),
                "split_protocol": protocol,
                "metrics": task_metrics,
                "best_model": min(
                    ({"model_id": model_id, **metrics} for model_id, metrics in task_metrics.items()),
                    key=lambda row: (float(row["rmse"]), float(row["mae"])),
                ),
                "sample_predictions": [
                    {
                        "sample_name": sample_names[index],
                        "true_value": round(float(target[index]), 4),
                        "predictions": row["predictions"],
                        "test_topic_id": row["test_topic_id"],
                        "local_training_samples": row["local_training_samples"],
                        "routed_scope": row["routed_scope"],
                    }
                    for index, row in enumerate(fold_rows)
                ],
            }
        )

    return {
        "dataset_id": "hidsag-geometallurgy",
        "dataset_name": "HIDSAG geometallurgy database",
        "subset_code": subset_code,
        "family_id": "regions-with-measurements",
        "sample_count": int(subset["sample_count"]),
        "measurement_count_total": int(subset.get("measurement_count_total", subset["sample_count"])),
        "cube_document_count": int(cube_doc_features.shape[0]),
        "region_document_count": int(region_doc_features.shape[0]),
        "numeric_variable_count": int(subset.get("numeric_variable_count", len(hidsag_numeric_target_names(subset)))),
        "categorical_variable_count": int(subset.get("categorical_variable_count", 0)),
        "feature_layout": feature_layout,
        "representation": {
            "id": "sample-mean-band-frequency",
            "alphabet": "modality-specific band-position tokens",
            "word": "wavelength-aware modality band token repeated by normalized sample-mean intensity count",
            "document": "one HIDSAG sample built from concatenated per-modality averages across all available measurement supports",
        },
        "hierarchical_representation": {
            "id": "cube-topic-aggregation",
            "alphabet": "modality-specific band-position tokens",
            "word": "wavelength-aware modality band token repeated by normalized cube-mean intensity count",
            "document": "one cube mean spectrum per crop and modality",
            "aggregation": "sample-level mean of cube topic mixtures",
        },
        "regional_representation": {
            "id": "patch-topic-aggregation",
            "alphabet": "modality-specific band-position tokens",
            "word": "wavelength-aware modality band token repeated by normalized fixed-grid patch intensity count",
            "document": "one fixed-grid patch mean per crop and modality cube",
            "aggregation": "sample-level mean of patch topic mixtures",
            "patch_grid": region_manifest["patch_grid"],
        },
        "topic_model": {
            "method": "sklearn-lda",
            "topic_count": topic_count,
            "perplexity": round(float(lda.perplexity(counts)), 4),
            "active_topic_count": int(np.sum(dominant_topic_counts > 0)),
            "topic_activity_warning": "topic-collapse-detected" if int(np.sum(dominant_topic_counts > 0)) < topic_count else "all-topics-active",
            "top_tokens": [
                {
                    "topic_id": topic_index + 1,
                    "tokens": top_named_tokens(component, token_names),
                }
                for topic_index, component in enumerate(lda.components_)
            ],
            "dominant_topic_counts": [
                {
                    "topic_id": int(topic_id + 1),
                    "sample_count": int(count),
                }
                for topic_id, count in enumerate(dominant_topic_counts)
            ],
        },
        "hierarchical_topic_model": {
            "method": "sklearn-lda",
            "topic_count": doc_topic_count,
            "perplexity": round(float(lda_doc.perplexity(cube_doc_counts)), 4),
            "active_topic_count": int(np.sum(hierarchical_topic_counts > 0)),
            "topic_activity_warning": "topic-collapse-detected" if int(np.sum(hierarchical_topic_counts > 0)) < doc_topic_count else "all-topics-active",
            "top_tokens": [
                {
                    "topic_id": topic_index + 1,
                    "tokens": top_named_tokens(component, token_names),
                }
                for topic_index, component in enumerate(lda_doc.components_)
            ],
            "dominant_topic_counts": [
                {
                    "topic_id": int(topic_id + 1),
                    "sample_count": int(count),
                }
                for topic_id, count in enumerate(hierarchical_topic_counts)
            ],
        },
        "regional_topic_model": {
            "method": "sklearn-lda",
            "topic_count": region_topic_count,
            "perplexity": round(float(lda_region.perplexity(region_doc_counts)), 4),
            "active_topic_count": int(np.sum(region_topic_counts > 0)),
            "topic_activity_warning": "topic-collapse-detected" if int(np.sum(region_topic_counts > 0)) < region_topic_count else "all-topics-active",
            "top_tokens": [
                {
                    "topic_id": topic_index + 1,
                    "tokens": top_named_tokens(component, token_names),
                }
                for topic_index, component in enumerate(lda_region.components_)
            ],
            "dominant_topic_counts": [
                {
                    "topic_id": int(topic_id + 1),
                    "sample_count": int(count),
                }
                for topic_id, count in enumerate(region_topic_counts)
            ],
        },
        "measurement_tags_top": subset.get("measurement_tags_top", []),
        "categorical_value_counts": subset.get("categorical_value_counts", {}),
        "group_split_definition": None
        if split_info is None
        else {
            "group_name": split_info["group_name"],
            "group_count": int(split_info["unique_group_count"]),
            "groups_preview": split_info["groups_preview"],
            "reason": split_info["reason"],
        },
        "measurement_count_stats": subset.get("measurement_count_stats", {}),
        "target_summary": target_summary,
        "classification_tasks": classification_tasks,
        "regression_tasks": regression_tasks,
        "region_document_summary": {
            "documents_per_measurement_stats": region_manifest.get("documents_per_measurement_stats", {}),
            "documents_per_sample_stats": region_manifest.get("documents_per_sample_stats", {}),
        },
        "caveat": "This is a local Family D benchmark over compact HIDSAG subsets with sample, cube, and fixed-grid region documents. It validates methodological options, not production-ready mineral or geochemical claims.",
    }


def main() -> None:
    payload = {
        "source": "Local-first PTM/LDA, clustering, stability, and unmixing benchmarks over real spectral datasets",
        "generated_at": str(date.today()),
        "methods": {
            "representation": "band-frequency count vectors from normalized spectra",
            "topic_model": "scikit-learn LatentDirichletAllocation",
            "classification_models": [
                "raw_logistic_regression",
                "pca_logistic_regression",
                "topic_logistic_regression",
            ],
            "clustering_baselines": [
                "raw_kmeans",
                "raw_gmm",
                "raw_hierarchical",
                "topic_kmeans",
                "topic_gmm",
                "topic_hierarchical",
            ],
            "reference_baselines": [
                "spectral_angle_mapper",
            ],
            "unmixing_baselines": [
                "nmf",
            ],
            "measured_target_models": {
                "classification": [
                    "raw_logistic_regression",
                    "pca_logistic_regression",
                    "topic_logistic_regression",
                    "cube_topic_logistic_regression",
                    "region_topic_logistic_regression",
                ],
                "regression": [
                    "raw_ridge_regression",
                    "pls_regression",
                    "topic_mixture_linear_regression",
                    "cube_topic_mixture_linear_regression",
                    "region_topic_mixture_linear_regression",
                    "topic_routed_linear_regression",
                ],
            },
            "stability_protocol": {
                "seeds": TOPIC_STABILITY_SEEDS,
                "comparison_metric": "aligned topic cosine similarity plus top-token jaccard",
            },
        },
        "labeled_scene_runs": [benchmark_labeled_scene(dataset_id) for dataset_id in LABELED_SCENES],
        "topic_stability_runs": [topic_stability_benchmark(dataset_id) for dataset_id in LABELED_SCENES],
        "unlabeled_scene_runs": [benchmark_unlabeled_scene(dataset_id) for dataset_id in UNLABELED_SCENES],
        "unmixing_runs": [benchmark_unmixing_scene(dataset_id) for dataset_id in UNMIXING_SCENES],
        "spectral_library_runs": [benchmark_spectral_library()],
        "measured_target_runs": [
            benchmark_hidsag_subset("MINERAL1"),
            benchmark_hidsag_subset("MINERAL2"),
            benchmark_hidsag_subset("GEOMET"),
            benchmark_hidsag_subset("GEOCHEM"),
            benchmark_hidsag_subset("PORPHYRY"),
        ],
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote local core benchmarks to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
