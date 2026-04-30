"""Build compact clustering diagnostics from derived spectral assets.

This script does not read raw cubes. It consumes the already compact scene
summaries and spectral-library samples, then creates a lightweight analytical
payload for the web app. The goal is to expose topic-mixture geometry and
spectral-library structure without turning the deployed app into a runtime
modelling service.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score


ROOT = Path(__file__).resolve().parents[1]
REAL_PATH = ROOT / "data" / "derived" / "real" / "real_samples.json"
SPECTRAL_PATH = ROOT / "data" / "derived" / "spectral" / "library_samples.json"
OUTPUT_DIR = ROOT / "data" / "derived" / "analysis"
OUTPUT_PATH = OUTPUT_DIR / "analysis.json"
RANDOM_STATE = 42


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def rounded(values: np.ndarray, digits: int = 4) -> list[float]:
    return [round(float(value), digits) for value in values]


def safe_pca(features: np.ndarray) -> tuple[np.ndarray, list[float]]:
    if features.shape[0] < 2 or features.shape[1] < 1:
        return np.zeros((features.shape[0], 2), dtype=np.float32), [0.0, 0.0]

    components = min(2, features.shape[0], features.shape[1])
    pca = PCA(n_components=components, random_state=RANDOM_STATE)
    coords = pca.fit_transform(features)
    if components == 1:
        coords = np.column_stack([coords[:, 0], np.zeros(features.shape[0], dtype=np.float32)])

    variance = list(pca.explained_variance_ratio_)
    while len(variance) < 2:
        variance.append(0.0)
    return coords.astype(np.float32), [round(float(value), 4) for value in variance[:2]]


def choose_cluster_count(features: np.ndarray, max_clusters: int = 4) -> int:
    unique_count = np.unique(np.round(features, 6), axis=0).shape[0]
    if features.shape[0] < 3 or unique_count < 2:
        return 1
    desired = int(np.ceil(np.sqrt(features.shape[0])))
    return max(2, min(max_clusters, desired, unique_count, features.shape[0] - 1))


def cluster_features(features: np.ndarray, max_clusters: int = 4) -> tuple[np.ndarray, int, float | None]:
    cluster_count = choose_cluster_count(features, max_clusters=max_clusters)
    if cluster_count < 2:
        return np.zeros(features.shape[0], dtype=np.int32), 1, None

    labels = KMeans(n_clusters=cluster_count, n_init="auto", random_state=RANDOM_STATE).fit_predict(features)
    unique_labels = np.unique(labels)
    score = None
    if 2 <= unique_labels.shape[0] <= features.shape[0] - 1:
        score = round(float(silhouette_score(features, labels)), 4)
    return labels.astype(np.int32), int(unique_labels.shape[0]), score


def pairwise_nearest(
    labels: list[str],
    feature_vectors: np.ndarray,
    spectral_vectors: np.ndarray | None = None,
    limit: int = 5,
) -> list[dict[str, Any]]:
    pairs: list[dict[str, Any]] = []
    for left in range(len(labels)):
        for right in range(left + 1, len(labels)):
            feature_distance = float(np.linalg.norm(feature_vectors[left] - feature_vectors[right]))
            pair: dict[str, Any] = {
                "a_label": labels[left],
                "b_label": labels[right],
                "feature_distance": round(feature_distance, 4),
            }
            if spectral_vectors is not None:
                spectral_distance = float(np.sqrt(np.mean((spectral_vectors[left] - spectral_vectors[right]) ** 2)))
                pair["spectral_distance"] = round(spectral_distance, 4)
            pairs.append(pair)
    return sorted(pairs, key=lambda item: item["feature_distance"])[:limit]


def build_profiles(
    labels: np.ndarray,
    coords: np.ndarray,
    vectors: np.ndarray,
    names: list[str],
    counts: np.ndarray,
) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    for cluster_id in sorted(int(value) for value in np.unique(labels)):
        mask = labels == cluster_id
        weights = counts[mask].astype(np.float64)
        weights = weights / max(float(weights.sum()), 1.0)
        mean_vector = np.average(vectors[mask], axis=0, weights=weights)
        centroid = coords[mask].mean(axis=0)
        dominant_index = int(np.argmax(mean_vector))
        top_indices = np.argsort(counts[mask])[::-1][:4]
        cluster_names = [names[index] for index in np.flatnonzero(mask)[top_indices]]
        profiles.append(
            {
                "cluster_id": cluster_id,
                "item_count": int(mask.sum()),
                "support_count": int(counts[mask].sum()),
                "centroid": rounded(centroid),
                "mean_vector": rounded(mean_vector),
                "dominant_feature_index": dominant_index,
                "top_labels": cluster_names,
            }
        )
    return profiles


def build_scene_diagnostic(scene: dict[str, Any]) -> dict[str, Any] | None:
    rows = scene.get("class_summaries", [])
    if len(rows) < 2:
        return None

    names = [str(row["name"]) for row in rows]
    counts = np.array([int(row["count"]) for row in rows], dtype=np.int64)
    topic_features = np.array([row["mean_topic_mixture"] for row in rows], dtype=np.float32)
    spectral_features = np.array([row["mean_spectrum"] for row in rows], dtype=np.float32)
    coords, variance = safe_pca(topic_features)
    cluster_labels, cluster_count, score = cluster_features(topic_features)
    max_count = max(int(counts.max()), 1)

    points = []
    for index, row in enumerate(rows):
        points.append(
            {
                "id": f"{scene['id']}::{row['label_id']}",
                "label": names[index],
                "group": scene["name"],
                "item_count": int(counts[index]),
                "cluster": int(cluster_labels[index]),
                "x": round(float(coords[index, 0]), 4),
                "y": round(float(coords[index, 1]), 4),
                "size": round(0.35 + 0.65 * (int(counts[index]) / max_count), 4),
                "dominant_feature_index": int(np.argmax(topic_features[index])),
                "vector": rounded(topic_features[index]),
            }
        )

    return {
        "scene_id": scene["id"],
        "scene_name": scene["name"],
        "feature_space": "class/regime mean topic-mixture vectors",
        "method_id": "topic-pca-kmeans",
        "item_count": len(rows),
        "cluster_count": cluster_count,
        "silhouette_score": score,
        "explained_variance_ratio": variance,
        "points": points,
        "cluster_profiles": build_profiles(cluster_labels, coords, topic_features, names, counts),
        "nearest_pairs": pairwise_nearest(names, topic_features, spectral_features),
    }


def build_library_diagnostic(samples: list[dict[str, Any]], band_count: int) -> dict[str, Any] | None:
    selected = [sample for sample in samples if int(sample["band_count"]) == band_count]
    if len(selected) < 3:
        return None

    names = [str(sample["name"]) for sample in selected]
    counts = np.ones(len(selected), dtype=np.int64)
    spectra = np.array([sample["spectrum"] for sample in selected], dtype=np.float32)
    coords, variance = safe_pca(spectra)
    cluster_labels, cluster_count, score = cluster_features(spectra)

    points = []
    for index, sample in enumerate(selected):
        points.append(
            {
                "id": sample["id"],
                "label": sample["name"],
                "group": sample["group"],
                "item_count": 1,
                "cluster": int(cluster_labels[index]),
                "x": round(float(coords[index, 0]), 4),
                "y": round(float(coords[index, 1]), 4),
                "size": 0.7,
                "dominant_feature_index": int(np.argmax(spectra[index])),
                "vector": rounded(spectra[index]),
            }
        )

    sensor_name = selected[0]["sensor"]
    return {
        "library_id": f"spectral-library-{band_count}",
        "library_name": f"{sensor_name} references",
        "band_count": band_count,
        "feature_space": "normalized material reference spectra",
        "method_id": "spectrum-pca-kmeans",
        "item_count": len(selected),
        "cluster_count": cluster_count,
        "silhouette_score": score,
        "explained_variance_ratio": variance,
        "points": points,
        "cluster_profiles": build_profiles(cluster_labels, coords, spectra, names, counts),
        "nearest_pairs": pairwise_nearest(names, spectra, None),
    }


def main() -> None:
    real_payload = load_json(REAL_PATH)
    spectral_payload = load_json(SPECTRAL_PATH)

    scene_diagnostics = [
        diagnostic
        for scene in real_payload.get("scenes", [])
        if (diagnostic := build_scene_diagnostic(scene)) is not None
    ]
    band_counts = sorted({int(sample["band_count"]) for sample in spectral_payload.get("samples", [])})
    library_diagnostics = [
        diagnostic
        for band_count in band_counts
        if (diagnostic := build_library_diagnostic(spectral_payload.get("samples", []), band_count)) is not None
    ]

    payload = {
        "source": "Derived diagnostics from compact real-scene and spectral-library payloads",
        "methods": [
            {
                "id": "topic-pca-kmeans",
                "name": "Topic-space PCA + KMeans",
                "description": (
                    "Class or inferred-regime mean topic mixtures are projected to two principal components and "
                    "clustered to expose the geometry of spectral documents after LDA-style representation."
                ),
            },
            {
                "id": "spectrum-pca-kmeans",
                "name": "Spectral-library PCA + KMeans",
                "description": (
                    "Curated material spectra with matching band counts are projected and clustered so the app can "
                    "compare reference-material neighborhoods without loading the full library."
                ),
            },
        ],
        "scene_diagnostics": scene_diagnostics,
        "library_diagnostics": library_diagnostics,
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote analysis payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
