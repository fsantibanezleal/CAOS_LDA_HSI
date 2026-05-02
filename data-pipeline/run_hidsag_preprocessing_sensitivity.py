"""Evaluate HIDSAG preprocessing sensitivity under heuristic bad-band policies."""
from __future__ import annotations

import importlib.util
import json
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
from scipy.signal import savgol_filter


ROOT = Path(__file__).resolve().parents[1]
CURATED_PATH = ROOT / "data" / "derived" / "core" / "hidsag_curated_subset.json"
BAND_QUALITY_PATH = ROOT / "data" / "derived" / "core" / "hidsag_band_quality.json"
BENCHMARK_PATH = ROOT / "data" / "derived" / "core" / "local_core_benchmarks.json"
OUTPUT_PATH = ROOT / "data" / "derived" / "core" / "hidsag_preprocessing_sensitivity.json"
BENCHMARK_MODULE_PATH = ROOT / "data-pipeline" / "run_local_core_benchmarks.py"
TOP_TOKEN_LIMIT = 6
SENSITIVITY_TOPIC_MAX_ITER = 12

POLICIES = [
    {
        "policy_id": "baseline_raw",
        "name": "Raw baseline",
        "description": "No heuristic bad-band removal or spectral preprocessing before downstream normalization and quantization.",
        "mask_bad_bands": False,
        "apply_savgol": False,
        "apply_snv": False,
    },
    {
        "policy_id": "heuristic_bad_band_mask",
        "name": "Heuristic bad-band mask",
        "description": "Drop wavelength positions flagged by the local edge-plus-roughness heuristic.",
        "mask_bad_bands": True,
        "apply_savgol": False,
        "apply_snv": False,
    },
    {
        "policy_id": "heuristic_bad_band_mask_snv",
        "name": "Mask plus SNV",
        "description": "Apply the heuristic bad-band mask and then standard normal variate per modality.",
        "mask_bad_bands": True,
        "apply_savgol": False,
        "apply_snv": True,
    },
    {
        "policy_id": "heuristic_bad_band_mask_savgol_snv",
        "name": "Mask plus Savitzky-Golay plus SNV",
        "description": "Apply the heuristic bad-band mask, smooth with Savitzky-Golay, then standard normal variate per modality.",
        "mask_bad_bands": True,
        "apply_savgol": True,
        "apply_snv": True,
    },
]


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def load_benchmark_module():
    spec = importlib.util.spec_from_file_location("local_core_benchmarks_module", BENCHMARK_MODULE_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load benchmark module from {BENCHMARK_MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def subset_by_code(payload: dict[str, Any], subset_code: str) -> dict[str, Any]:
    for subset in payload.get("subsets", []):
        if str(subset.get("subset_code")) == subset_code:
            return subset
    raise KeyError(f"Subset {subset_code} not found.")


def measured_run_by_code(payload: dict[str, Any], subset_code: str) -> dict[str, Any]:
    for run in payload.get("measured_target_runs", []):
        if str(run.get("subset_code")) == subset_code:
            return run
    raise KeyError(f"Measured target run {subset_code} not found.")


def best_model_payload(task: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    best_model = task.get("best_model")
    if isinstance(best_model, dict):
        model_id = best_model.get("model_id")
        return (None if model_id is None else str(model_id), best_model)
    if best_model is None:
        return None, {}
    model_id = str(best_model)
    metrics = task.get("metrics", {}).get(model_id, {})
    return model_id, metrics if isinstance(metrics, dict) else {}


def modality_lengths(subset: dict[str, Any], benchmark_module) -> dict[str, int]:
    return {
        modality: len(subset["modality_wavelengths_nm"][modality])
        for modality in benchmark_module.HIDSAG_MODALITY_ORDER
    }


def modality_slices(subset: dict[str, Any], benchmark_module) -> tuple[dict[str, slice], int]:
    lengths = modality_lengths(subset, benchmark_module)
    mapping: dict[str, slice] = {}
    offset = 0
    for modality in benchmark_module.HIDSAG_MODALITY_ORDER:
        mapping[modality] = slice(offset, offset + lengths[modality])
        offset += lengths[modality]
    return mapping, offset


def mask_lookup(band_quality_payload: dict[str, Any]) -> dict[str, dict[str, np.ndarray]]:
    lookup: dict[str, dict[str, np.ndarray]] = {}
    for subset in band_quality_payload.get("subsets", []):
        subset_code = str(subset["subset_code"])
        modality_lookup: dict[str, np.ndarray] = {}
        for row in subset.get("modalities", []):
            modality = str(row["modality"])
            band_count = int(row["band_count"])
            mask = np.zeros(band_count, dtype=bool)
            indices = row.get("heuristic_policy", {}).get("masked_indices", [])
            for index in indices:
                mask[int(index)] = True
            modality_lookup[modality] = mask
        lookup[subset_code] = modality_lookup
    return lookup


def raw_sample_feature_matrix(subset: dict[str, Any], benchmark_module) -> tuple[np.ndarray, list[str]]:
    rows = []
    sample_names = []
    for sample in subset.get("samples", []):
        parts = []
        for modality in benchmark_module.HIDSAG_MODALITY_ORDER:
            spectra = []
            for cube in benchmark_module.hidsag_sample_cubes(sample):
                if str(cube["modality"]) != modality:
                    continue
                spectra.append(np.asarray(cube["mean_spectrum"], dtype=np.float32))
            if not spectra:
                raise ValueError(f"Sample {sample['sample_name']} missing modality {modality}.")
            parts.append(np.mean(np.vstack(spectra), axis=0).astype(np.float32))
        rows.append(np.concatenate(parts))
        sample_names.append(str(sample["sample_name"]))
    return np.asarray(rows, dtype=np.float32), sample_names


def raw_cube_document_matrix(subset: dict[str, Any], benchmark_module) -> tuple[np.ndarray, np.ndarray]:
    slices, total_bands = modality_slices(subset, benchmark_module)
    rows = []
    owners = []
    for sample_index, sample in enumerate(subset.get("samples", [])):
        for measurement in benchmark_module.hidsag_measurements(sample):
            cubes_by_modality = {str(cube["modality"]): cube for cube in measurement["cubes"]}
            for modality in benchmark_module.HIDSAG_MODALITY_ORDER:
                spectrum = np.asarray(cubes_by_modality[modality]["mean_spectrum"], dtype=np.float32)
                row = np.zeros(total_bands, dtype=np.float32)
                row[slices[modality]] = spectrum
                rows.append(row)
                owners.append(sample_index)
    return np.asarray(rows, dtype=np.float32), np.asarray(owners, dtype=np.int32)


def snv_rows(values: np.ndarray) -> np.ndarray:
    mean = np.mean(values, axis=1, keepdims=True)
    std = np.std(values, axis=1, keepdims=True)
    return ((values - mean) / np.maximum(std, 1e-6)).astype(np.float32)


def savgol_window(band_count: int) -> int | None:
    if band_count < 5:
        return None
    window = min(11, band_count if band_count % 2 == 1 else band_count - 1)
    return window if window >= 5 else None


def apply_policy_block(values: np.ndarray, policy: dict[str, Any]) -> np.ndarray:
    block = np.asarray(values, dtype=np.float32)
    if bool(policy["apply_savgol"]):
        window = savgol_window(int(block.shape[1]))
        if window is not None:
            block = savgol_filter(block, window_length=window, polyorder=2, axis=1, mode="interp").astype(np.float32)
    if bool(policy["apply_snv"]):
        block = snv_rows(block)
    return block.astype(np.float32)


def transform_matrix_for_policy(
    matrix: np.ndarray,
    subset: dict[str, Any],
    subset_masks: dict[str, np.ndarray],
    policy: dict[str, Any],
    benchmark_module,
) -> tuple[np.ndarray, list[dict[str, Any]], list[str]]:
    slices, _ = modality_slices(subset, benchmark_module)
    feature_layout: list[dict[str, Any]] = []
    token_names: list[str] = []
    transformed_parts: list[np.ndarray] = []

    for modality in benchmark_module.HIDSAG_MODALITY_ORDER:
        modality_slice = slices[modality]
        block = np.asarray(matrix[:, modality_slice], dtype=np.float32)
        mask = np.asarray(subset_masks[modality], dtype=bool)
        wavelengths = np.asarray(subset["modality_wavelengths_nm"][modality], dtype=np.float32)
        keep_mask = ~mask if bool(policy["mask_bad_bands"]) else np.ones(mask.shape[0], dtype=bool)
        retained_block = block[:, keep_mask]
        retained_wavelengths = wavelengths[keep_mask]
        transformed_block = apply_policy_block(retained_block, policy)
        transformed_parts.append(transformed_block)
        wavelength_range = None
        if retained_wavelengths.size:
            wavelength_range = {
                "start": round(float(retained_wavelengths[0]), 4),
                "stop": round(float(retained_wavelengths[-1]), 4),
            }
        feature_layout.append(
            {
                "modality": modality,
                "original_band_count": int(mask.shape[0]),
                "masked_band_count": int(np.sum(mask)) if bool(policy["mask_bad_bands"]) else 0,
                "retained_band_count": int(retained_block.shape[1]),
                "retained_fraction": round(float(retained_block.shape[1] / max(1, mask.shape[0])), 4),
                "wavelength_range_nm": wavelength_range,
            }
        )
        token_names.extend([f"{modality}_{float(value):07.2f}nm" for value in retained_wavelengths.tolist()])

    return np.concatenate(transformed_parts, axis=1).astype(np.float32), feature_layout, token_names


def topic_summary(
    features: np.ndarray,
    owners: np.ndarray | None,
    token_names: list[str],
    topic_count: int,
    benchmark_module,
) -> tuple[dict[str, Any], np.ndarray]:
    counts = benchmark_module.band_frequency_counts(features)
    lda, mixtures = benchmark_module.fit_lda(
        counts,
        n_topics=topic_count,
        seed=benchmark_module.RANDOM_STATE,
        max_iter=SENSITIVITY_TOPIC_MAX_ITER,
    )
    sample_level_mixtures = mixtures
    if owners is not None:
        sample_indices = np.arange(int(np.max(owners)) + 1, dtype=np.int32)
        sample_level_mixtures = benchmark_module.aggregate_doc_mixtures(mixtures, owners, sample_indices)
    dominant = np.argmax(sample_level_mixtures, axis=1)
    dominant_counts = np.bincount(dominant, minlength=topic_count)
    return (
        {
            "topic_count": int(topic_count),
            "perplexity": round(float(lda.perplexity(counts)), 4),
            "active_topic_count": int(np.sum(dominant_counts > 0)),
            "topic_activity_warning": "topic-collapse-detected"
            if int(np.sum(dominant_counts > 0)) < topic_count
            else "all-topics-active",
            "dominant_topic_counts": [
                {"topic_id": int(topic_id + 1), "sample_count": int(count)}
                for topic_id, count in enumerate(dominant_counts)
            ],
            "top_tokens": [
                {
                    "topic_id": int(topic_index + 1),
                    "tokens": benchmark_module.top_named_tokens(component, token_names, limit=TOP_TOKEN_LIMIT),
                }
                for topic_index, component in enumerate(lda.components_)
            ],
        },
        sample_level_mixtures,
    )


def best_classification_task(run: dict[str, Any]) -> dict[str, Any] | None:
    tasks = run.get("classification_tasks", [])
    if not tasks:
        return None

    def score(task: dict[str, Any]) -> tuple[float, float, float]:
        _, metrics = best_model_payload(task)
        return (
            float(metrics.get("balanced_accuracy", metrics.get("accuracy", 0.0))),
            float(metrics.get("accuracy", 0.0)),
            float(metrics.get("macro_f1", 0.0)),
        )

    return max(tasks, key=score)


def best_regression_task(run: dict[str, Any]) -> dict[str, Any] | None:
    tasks = run.get("regression_tasks", [])
    if not tasks:
        return None

    def score(task: dict[str, Any]) -> tuple[float, float]:
        _, metrics = best_model_payload(task)
        return (
            float(metrics.get("r2", -999.0)),
            -float(metrics.get("rmse", 999999.0)),
        )

    return max(tasks, key=score)


def task_definitions_for_subset(subset_code: str, subset: dict[str, Any], benchmark_module) -> list[dict[str, Any]]:
    target_summary = benchmark_module.hidsag_target_summary(subset)
    return benchmark_module.hidsag_classification_task_defs(subset_code, subset, target_summary)


def classification_model_metrics(predictions: dict[str, np.ndarray], labels: np.ndarray, benchmark_module) -> dict[str, Any]:
    metrics = {
        model_id: benchmark_module.classification_metrics_from_predictions(labels, values)
        for model_id, values in predictions.items()
    }
    best_model = max(
        metrics,
        key=lambda model_id: (
            float(metrics[model_id].get("balanced_accuracy", metrics[model_id].get("accuracy", 0.0))),
            float(metrics[model_id].get("accuracy", 0.0)),
            float(metrics[model_id].get("macro_f1", 0.0)),
        ),
    )
    return {
        "metrics": metrics,
        "best_model": best_model,
        "best_balanced_accuracy": metrics[best_model].get("balanced_accuracy", metrics[best_model].get("accuracy", 0.0)),
    }


def regression_model_metrics(predictions: dict[str, np.ndarray], target: np.ndarray, benchmark_module) -> dict[str, Any]:
    metrics = {
        model_id: benchmark_module.regression_metrics_from_predictions(target, values)
        for model_id, values in predictions.items()
    }
    best_model = max(
        metrics,
        key=lambda model_id: (
            float(metrics[model_id].get("r2", -999.0)),
            -float(metrics[model_id].get("rmse", 999999.0)),
        ),
    )
    return {
        "metrics": metrics,
        "best_model": best_model,
        "best_r2": metrics[best_model]["r2"],
    }


def evaluate_classification_task(
    subset_code: str,
    features: np.ndarray,
    region_features: np.ndarray,
    region_owners: np.ndarray,
    labels: np.ndarray,
    region_topic_count: int,
    split_info: dict[str, Any] | None,
    benchmark_module,
) -> dict[str, Any]:
    sample_count = int(features.shape[0])
    protocol = benchmark_module.hidsag_protocol_definition(subset_code, "classification", sample_count, split_info)
    predictions = {
        "raw_logistic_regression": np.empty(sample_count, dtype=object),
        "pca_logistic_regression": np.empty(sample_count, dtype=object),
        "region_topic_logistic_regression": np.empty(sample_count, dtype=object),
    }

    for train_idx, test_idx in benchmark_module.hidsag_classification_splits(
        subset_code,
        labels,
        sample_count,
        split_info,
    ):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = labels[train_idx]
        raw_model = benchmark_module.Pipeline(
            [("scale", benchmark_module.StandardScaler()), ("clf", benchmark_module.make_logreg())]
        )
        pca_model = benchmark_module.Pipeline(
            [
                ("scale", benchmark_module.StandardScaler()),
                (
                    "pca",
                    benchmark_module.PCA(
                        n_components=benchmark_module.safe_compact_pca_components(x_train.shape[0], x_train.shape[1]),
                        random_state=benchmark_module.RANDOM_STATE,
                    ),
                ),
                ("clf", benchmark_module.make_logreg()),
            ]
        )

        train_region_mask = np.isin(region_owners, train_idx)
        test_region_mask = np.isin(region_owners, test_idx)
        region_counts_train = benchmark_module.band_frequency_counts(region_features[train_region_mask])
        region_counts_test = benchmark_module.band_frequency_counts(region_features[test_region_mask])
        lda_region, region_topic_train_docs = benchmark_module.fit_lda(
            region_counts_train,
            n_topics=region_topic_count,
            seed=benchmark_module.RANDOM_STATE,
            max_iter=SENSITIVITY_TOPIC_MAX_ITER,
        )
        region_topic_test_docs = lda_region.transform(region_counts_test)
        region_topic_train = benchmark_module.aggregate_doc_mixtures(region_topic_train_docs, region_owners[train_region_mask], train_idx)
        region_topic_test = benchmark_module.aggregate_doc_mixtures(region_topic_test_docs, region_owners[test_region_mask], test_idx)
        region_topic_model = benchmark_module.make_logreg()

        predictions["raw_logistic_regression"][test_idx] = benchmark_module.safe_classifier_predict(raw_model, x_train, y_train, x_test)
        predictions["pca_logistic_regression"][test_idx] = benchmark_module.safe_classifier_predict(pca_model, x_train, y_train, x_test)
        predictions["region_topic_logistic_regression"][test_idx] = benchmark_module.safe_classifier_predict(
            region_topic_model,
            region_topic_train,
            y_train,
            region_topic_test,
        )

    return {
        "split_protocol": protocol,
        **classification_model_metrics(predictions, labels, benchmark_module),
    }


def evaluate_regression_task(
    subset_code: str,
    features: np.ndarray,
    region_features: np.ndarray,
    region_owners: np.ndarray,
    target: np.ndarray,
    region_topic_count: int,
    split_info: dict[str, Any] | None,
    benchmark_module,
) -> dict[str, Any]:
    sample_count = int(features.shape[0])
    protocol = benchmark_module.hidsag_protocol_definition(subset_code, "regression", sample_count, split_info)
    predictions = {
        "raw_ridge_regression": np.zeros(sample_count, dtype=np.float32),
        "pls_regression": np.zeros(sample_count, dtype=np.float32),
        "region_topic_mixture_linear_regression": np.zeros(sample_count, dtype=np.float32),
    }

    for train_idx, test_idx in benchmark_module.hidsag_regression_splits(
        subset_code,
        sample_count,
        split_info,
    ):
        x_train, x_test = features[train_idx], features[test_idx]
        y_train = target[train_idx]

        raw_model = benchmark_module.Pipeline([("scale", benchmark_module.StandardScaler()), ("reg", benchmark_module.Ridge(alpha=1.0))])
        raw_pred = raw_model.fit(x_train, y_train).predict(x_test).astype(np.float32)

        pls_components = max(2, min(6, x_train.shape[0] - 1, x_train.shape[1]))
        pls_model = benchmark_module.PLSRegression(n_components=pls_components, scale=True)
        pls_pred = pls_model.fit(x_train, y_train).predict(x_test).ravel().astype(np.float32)

        train_region_mask = np.isin(region_owners, train_idx)
        test_region_mask = np.isin(region_owners, test_idx)
        region_counts_train = benchmark_module.band_frequency_counts(region_features[train_region_mask])
        region_counts_test = benchmark_module.band_frequency_counts(region_features[test_region_mask])
        lda_region, region_topic_train_docs = benchmark_module.fit_lda(
            region_counts_train,
            n_topics=region_topic_count,
            seed=benchmark_module.RANDOM_STATE,
            max_iter=SENSITIVITY_TOPIC_MAX_ITER,
        )
        region_topic_test_docs = lda_region.transform(region_counts_test)
        region_topic_train = benchmark_module.aggregate_doc_mixtures(region_topic_train_docs, region_owners[train_region_mask], train_idx)
        region_topic_test = benchmark_module.aggregate_doc_mixtures(region_topic_test_docs, region_owners[test_region_mask], test_idx)
        region_topic_pred = benchmark_module.LinearRegression().fit(region_topic_train, y_train).predict(region_topic_test).astype(np.float32)

        predictions["raw_ridge_regression"][test_idx] = raw_pred
        predictions["pls_regression"][test_idx] = pls_pred
        predictions["region_topic_mixture_linear_regression"][test_idx] = region_topic_pred

    return {
        "split_protocol": protocol,
        **regression_model_metrics(predictions, target, benchmark_module),
    }


def evaluate_subset_policy(
    subset_code: str,
    subset: dict[str, Any],
    subset_run: dict[str, Any],
    subset_masks: dict[str, np.ndarray],
    sample_matrix_raw: np.ndarray,
    cube_matrix_raw: np.ndarray,
    cube_owners: np.ndarray,
    region_matrix_raw: np.ndarray,
    region_owners: np.ndarray,
    policy: dict[str, Any],
    benchmark_module,
) -> dict[str, Any]:
    topic_count = int(benchmark_module.HIDSAG_SUBSET_TOPIC_COUNTS.get(subset_code, 6))
    doc_topic_count = int(benchmark_module.HIDSAG_SUBSET_DOC_TOPIC_COUNTS.get(subset_code, topic_count))
    region_topic_count = int(benchmark_module.HIDSAG_SUBSET_REGION_TOPIC_COUNTS.get(subset_code, doc_topic_count))
    split_info = benchmark_module.hidsag_group_split_info(subset_code, subset)

    sample_features, sample_layout, token_names = transform_matrix_for_policy(
        sample_matrix_raw,
        subset,
        subset_masks,
        policy,
        benchmark_module,
    )
    cube_features, _, _ = transform_matrix_for_policy(cube_matrix_raw, subset, subset_masks, policy, benchmark_module)
    region_features, _, _ = transform_matrix_for_policy(region_matrix_raw, subset, subset_masks, policy, benchmark_module)

    sample_topic, _ = topic_summary(sample_features, None, token_names, topic_count, benchmark_module)
    cube_topic, _ = topic_summary(cube_features, cube_owners, token_names, doc_topic_count, benchmark_module)
    region_topic, _ = topic_summary(region_features, region_owners, token_names, region_topic_count, benchmark_module)

    selected_class_task = best_classification_task(subset_run)
    classification_result = None
    if selected_class_task is not None:
        task_defs = task_definitions_for_subset(subset_code, subset, benchmark_module)
        class_task = next(
            task for task in task_defs if str(task.get("task_id")) == str(selected_class_task["task_id"])
        )
        labels = np.asarray(class_task["labels"], dtype=object)
        classification_result = {
            "task_id": str(class_task["task_id"]),
            "target": class_task.get("target"),
            "label_definition": class_task["label_definition"],
            "label_distribution": dict(class_task["label_distribution"]),
            **evaluate_classification_task(
                subset_code=subset_code,
                features=sample_features,
                region_features=region_features,
                region_owners=region_owners,
                labels=labels,
                region_topic_count=region_topic_count,
                split_info=split_info,
                benchmark_module=benchmark_module,
            ),
        }

    selected_reg_task = best_regression_task(subset_run)
    regression_result = None
    if selected_reg_task is not None:
        target_name = str(selected_reg_task["target"])
        target = np.asarray([sample["targets"][target_name] for sample in subset.get("samples", [])], dtype=np.float32)
        regression_result = {
            "target": target_name,
            "summary": selected_reg_task.get("summary", {}),
            **evaluate_regression_task(
                subset_code=subset_code,
                features=sample_features,
                region_features=region_features,
                region_owners=region_owners,
                target=target,
                region_topic_count=region_topic_count,
                split_info=split_info,
                benchmark_module=benchmark_module,
            ),
        }

    return {
        "policy_id": str(policy["policy_id"]),
        "policy_name": str(policy["name"]),
        "description": str(policy["description"]),
        "band_policy": sample_layout,
        "sample_topic_model": sample_topic,
        "cube_topic_model": cube_topic,
        "regional_topic_model": region_topic,
        "classification_task": classification_result,
        "regression_task": regression_result,
    }


def subset_ranking(policy_runs: list[dict[str, Any]], field_name: str, score_field: str) -> list[dict[str, Any]]:
    rows = []
    for row in policy_runs:
        result = row.get(field_name)
        if result is None:
            continue
        rows.append(
            {
                "policy_id": row["policy_id"],
                "best_model": result["best_model"],
                score_field: result[score_field],
            }
        )
    rows.sort(key=lambda item: float(item[score_field]), reverse=True)
    return rows


def main() -> None:
    benchmark_module = load_benchmark_module()
    curated = load_json(CURATED_PATH)
    band_quality = load_json(BAND_QUALITY_PATH)
    benchmark_payload = load_json(BENCHMARK_PATH)
    masks = mask_lookup(band_quality)

    subset_rows = []
    for subset_run in benchmark_payload.get("measured_target_runs", []):
        subset_code = str(subset_run["subset_code"])
        subset = subset_by_code(curated, subset_code)
        sample_matrix_raw, sample_names = raw_sample_feature_matrix(subset, benchmark_module)
        cube_matrix_raw, cube_owners = raw_cube_document_matrix(subset, benchmark_module)
        _, region_arrays = benchmark_module.load_hidsag_region_documents(subset_code)
        region_matrix_raw = np.asarray(region_arrays["features"], dtype=np.float32)
        region_owners = np.asarray(region_arrays["sample_owner"], dtype=np.int32)

        policy_runs = [
            evaluate_subset_policy(
                subset_code=subset_code,
                subset=subset,
                subset_run=subset_run,
                subset_masks=masks[subset_code],
                sample_matrix_raw=sample_matrix_raw,
                cube_matrix_raw=cube_matrix_raw,
                cube_owners=cube_owners,
                region_matrix_raw=region_matrix_raw,
                region_owners=region_owners,
                policy=policy,
                benchmark_module=benchmark_module,
            )
            for policy in POLICIES
        ]

        classification_reference = best_classification_task(subset_run)
        regression_reference = best_regression_task(subset_run)
        subset_rows.append(
            {
                "subset_code": subset_code,
                "sample_count": int(subset["sample_count"]),
                "measurement_count_total": int(subset.get("measurement_count_total", subset["sample_count"])),
                "selected_reference_tasks": {
                    "classification": None
                    if classification_reference is None
                    else {
                        "task_id": classification_reference["task_id"],
                        "best_model": best_model_payload(classification_reference)[0],
                        "reference_metric": best_model_payload(classification_reference)[1],
                    },
                    "regression": None
                    if regression_reference is None
                    else {
                        "target": regression_reference["target"],
                        "best_model": best_model_payload(regression_reference)[0],
                        "reference_metric": best_model_payload(regression_reference)[1],
                    },
                },
                "group_split_definition": subset_run.get("group_split_definition"),
                "policy_runs": policy_runs,
                "classification_policy_ranking": subset_ranking(
                    policy_runs,
                    "classification_task",
                    "best_balanced_accuracy",
                ),
                "regression_policy_ranking": subset_ranking(
                    policy_runs,
                    "regression_task",
                    "best_r2",
                ),
                "sample_names_preview": sample_names[:8],
            }
        )

    payload = {
        "source": "HIDSAG preprocessing sensitivity benchmark driven by local heuristic bad-band policies",
        "generated_at": str(date.today()),
        "methods": {
            "task_selection": "Per subset, reuse one representative classification task and one representative regression target selected from the current local_core_benchmarks.json results.",
            "policy_count": len(POLICIES),
            "policies": POLICIES,
            "topic_summary": "Sample, cube-document, and region-document topic models are re-fitted for every policy using the same Family D topic counts as the main benchmark.",
            "downstream_models": {
                "classification": [
                    "raw_logistic_regression",
                    "pca_logistic_regression",
                    "region_topic_logistic_regression",
                ],
                "regression": [
                    "raw_ridge_regression",
                    "pls_regression",
                    "region_topic_mixture_linear_regression",
                ],
            },
            "caveat": "This benchmark is local and comparative. It measures sensitivity of downstream behavior, not an official sensor preprocessing recommendation.",
        },
        "subsets": subset_rows,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote HIDSAG preprocessing sensitivity benchmark to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
