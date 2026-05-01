"""Run local-core topic, clustering, stability, and unmixing benchmarks."""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import numpy as np
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.decomposition import LatentDirichletAllocation, NMF, PCA
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, adjusted_rand_score, f1_score, normalized_mutual_info_score
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import train_test_split
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


def top_index_set(weights: np.ndarray, limit: int = 12) -> set[int]:
    indices = np.argsort(weights)[::-1][:limit]
    return {int(index) for index in indices}


def topic_count_for_labels(label_count: int) -> int:
    return max(4, min(12, label_count))


def safe_pca_components(sample_count: int, feature_count: int) -> int:
    return max(2, min(24, sample_count - 1, feature_count))


def classification_metrics(model, x_train, x_test, y_train, y_test) -> dict[str, float]:
    model.fit(x_train, y_train)
    prediction = model.predict(x_test)
    return {
        "accuracy": round(float(accuracy_score(y_test, prediction)), 4),
        "macro_f1": round(float(f1_score(y_test, prediction, average="macro")), 4),
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
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote local core benchmarks to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
