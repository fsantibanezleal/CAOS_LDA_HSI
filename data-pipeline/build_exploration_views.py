"""Precompute interactive exploration views for the Workspace.

For every public scene that ships compact `topics[]`, `class_summaries[]`,
and `mean_spectrum` arrays, this script computes everything the
interactive Topics / Data / Comparison steps need to brush-and-link
instantly without the frontend having to compute on the fly:

- Topic-topic cosine similarity matrix on band_profiles
- Topic-topic Hellinger distance over top_words distributions
- Topic intertopic 2D coordinates (classical PCA on band_profiles)
- Topic peak wavelength + concentration (top-N weight share)
- Class-topic loading matrix + class dominant topic
- Class-class spectral cosine similarity
- Per-topic class-loading rank + per-class topic-loading rank
- Per-topic document examples (existing example_documents joined)
- Spectral library: per-sample 2D coords (PCA on spectra) + nearest neighbours
- Output: data/derived/core/exploration_views.json

The frontend reads this once per session and wires brushing across
panels: select a topic chip -> matrix highlights -> scatter highlights
-> band-profile line plot fades others -> class-loading bars sort.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DERIVED = ROOT / "data" / "derived"
OUT_PATH = DERIVED / "core" / "exploration_views.json"

REAL_PATH = DERIVED / "real" / "real_samples.json"
LIBRARY_PATH = DERIVED / "spectral" / "library_samples.json"
HIDSAG_CURATED_PATH = DERIVED / "core" / "hidsag_curated_subset.json"


# ---------------------------------------------------------------------------
# Numeric helpers
# ---------------------------------------------------------------------------


def _safe_array(values: Any) -> np.ndarray | None:
    if values is None:
        return None
    arr = np.asarray(values, dtype=float)
    if arr.size == 0:
        return None
    return arr


def cosine_matrix(rows: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(rows, axis=1, keepdims=True)
    norms = np.where(norms < 1e-12, 1.0, norms)
    normed = rows / norms
    return normed @ normed.T


def hellinger_matrix(distributions: np.ndarray) -> np.ndarray:
    # Distributions assumed non-negative; renormalise rows.
    safe = np.clip(distributions, 0.0, None)
    sums = safe.sum(axis=1, keepdims=True)
    sums = np.where(sums < 1e-12, 1.0, sums)
    p = safe / sums
    sqrt_p = np.sqrt(p)
    diff = sqrt_p[:, None, :] - sqrt_p[None, :, :]
    return np.linalg.norm(diff, axis=-1) / math.sqrt(2.0)


def pca_2d(rows: np.ndarray) -> np.ndarray:
    if rows.shape[0] < 2:
        return np.zeros((rows.shape[0], 2))
    centered = rows - rows.mean(axis=0, keepdims=True)
    # SVD-based PCA, robust for short matrices.
    u, s, _ = np.linalg.svd(centered, full_matrices=False)
    coords = u[:, :2] * s[:2]
    return coords


def shannon_entropy(values: np.ndarray) -> float:
    safe = np.clip(values, 1e-12, None)
    p = safe / safe.sum()
    return float(-(p * np.log(p)).sum())


def top_n_concentration(values: np.ndarray, n: int) -> float:
    if values.size == 0:
        return 0.0
    sorted_desc = np.sort(values)[::-1]
    return float(sorted_desc[:n].sum())


def round_array(values: np.ndarray, digits: int = 4) -> list[float]:
    if values.size == 0:
        return []
    return [round(float(v), digits) for v in values]


def round_matrix(matrix: np.ndarray, digits: int = 4) -> list[list[float]]:
    return [round_array(row, digits) for row in matrix]


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------


def _load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


# ---------------------------------------------------------------------------
# Real-scene exploration view
# ---------------------------------------------------------------------------


def build_scene_view(scene: dict[str, Any]) -> dict[str, Any] | None:
    topics_raw = scene.get("topics") or []
    class_summaries = scene.get("class_summaries") or []
    wavelengths = scene.get("approximate_wavelengths_nm") or []

    if not topics_raw:
        return None

    band_profiles: list[np.ndarray] = []
    top_words_lists: list[list[dict[str, Any]]] = []
    topic_meta: list[dict[str, Any]] = []
    for topic in topics_raw:
        bp = _safe_array(topic.get("band_profile"))
        if bp is None:
            continue
        band_profiles.append(bp)
        top_words = topic.get("top_words") or []
        top_words_lists.append(top_words)
        topic_meta.append(
            {
                "id": topic.get("id"),
                "name": topic.get("name"),
                "topic_index": len(topic_meta),
                "top_words": top_words[:8]
            }
        )
    if not band_profiles:
        return None

    profiles_matrix = np.vstack(band_profiles)
    K = profiles_matrix.shape[0]

    # Cosine on band profiles
    cos_sim = cosine_matrix(profiles_matrix)

    # Hellinger on normalised band profiles (treat as distributions)
    hellinger = hellinger_matrix(profiles_matrix)

    # 2D embedding via PCA on profiles
    intertopic_xy = pca_2d(profiles_matrix)

    # Peak wavelength + concentration per topic
    peak_indices = profiles_matrix.argmax(axis=1)
    peak_wls = [
        float(wavelengths[int(idx)]) if 0 <= int(idx) < len(wavelengths) else float(int(idx))
        for idx in peak_indices
    ]
    concentrations = np.array(
        [top_n_concentration(profiles_matrix[i], min(10, profiles_matrix.shape[1])) for i in range(K)]
    )
    entropies = np.array([shannon_entropy(profiles_matrix[i]) for i in range(K)])

    # Class-topic loadings (rows = classes, cols = topics)
    class_topic = []
    class_meta = []
    class_spectra: list[np.ndarray] = []
    for cs in class_summaries:
        mixture = _safe_array(cs.get("mean_topic_mixture"))
        spectrum = _safe_array(cs.get("mean_spectrum"))
        if mixture is None:
            continue
        if mixture.shape[0] != K:
            # pad / truncate to K
            padded = np.zeros(K)
            length = min(K, mixture.shape[0])
            padded[:length] = mixture[:length]
            mixture = padded
        class_topic.append(mixture)
        class_meta.append(
            {
                "label_id": cs.get("label_id"),
                "name": cs.get("name"),
                "count": cs.get("count"),
                "dominant_topic": int(np.argmax(mixture)) if mixture.size else None,
                "topic_entropy": shannon_entropy(mixture)
            }
        )
        if spectrum is not None:
            class_spectra.append(spectrum)
        else:
            class_spectra.append(np.zeros_like(profiles_matrix[0]))

    class_topic_matrix = (
        np.vstack(class_topic) if class_topic else np.zeros((0, K))
    )
    # Class-class spectral similarity
    class_spectral_cos: np.ndarray | None
    if class_spectra:
        spectra_mat = np.vstack(class_spectra)
        class_spectral_cos = cosine_matrix(spectra_mat)
    else:
        class_spectral_cos = None

    # Per-topic class loadings ranked
    topic_class_loadings = []
    for k in range(K):
        rows = []
        for ci, cm in enumerate(class_meta):
            rows.append(
                {
                    "label_id": cm["label_id"],
                    "name": cm["name"],
                    "count": cm["count"],
                    "weight": float(class_topic_matrix[ci, k])
                    if class_topic_matrix.size
                    else 0.0
                }
            )
        rows.sort(key=lambda r: r["weight"], reverse=True)
        topic_class_loadings.append(rows)

    # Topic top-words token cloud weight totals
    word_weight_totals: dict[str, float] = {}
    for words in top_words_lists:
        for entry in words:
            tok = str(entry.get("token", ""))
            w = float(entry.get("weight", 0.0))
            word_weight_totals[tok] = word_weight_totals.get(tok, 0.0) + w
    word_weight_sorted = sorted(
        word_weight_totals.items(), key=lambda kv: kv[1], reverse=True
    )[:50]

    # Pair-wise top-word overlap (Jaccard) on top-N=8 tokens
    word_jaccard = np.zeros((K, K))
    word_sets = [
        {str(w.get("token")) for w in words[:8]} for words in top_words_lists
    ]
    for i in range(K):
        for j in range(K):
            if i == j:
                word_jaccard[i, j] = 1.0
                continue
            a = word_sets[i]
            b = word_sets[j]
            if not a and not b:
                word_jaccard[i, j] = 0.0
                continue
            word_jaccard[i, j] = len(a & b) / max(len(a | b), 1)

    return {
        "scene_id": scene.get("id"),
        "scene_name": scene.get("name"),
        "modality": scene.get("modality"),
        "sensor": scene.get("sensor"),
        "rgb_preview_path": scene.get("rgb_preview_path"),
        "label_preview_path": scene.get("label_preview_path"),
        "wavelengths_nm": [round(float(v), 2) for v in wavelengths],
        "topic_count": K,
        "topics": topic_meta,
        "topic_band_profiles": round_matrix(profiles_matrix),
        "topic_cosine_sim": round_matrix(cos_sim),
        "topic_hellinger_dist": round_matrix(hellinger),
        "topic_word_jaccard": round_matrix(word_jaccard, digits=3),
        "topic_intertopic_xy": round_matrix(intertopic_xy),
        "topic_peak_wavelength_nm": [round(v, 2) for v in peak_wls],
        "topic_top10_concentration": round_array(concentrations),
        "topic_band_entropy": round_array(entropies),
        "topic_word_cloud": [
            {"token": t, "weight": round(w, 4)} for t, w in word_weight_sorted
        ],
        "class_summaries": class_meta,
        "class_topic_loadings": round_matrix(class_topic_matrix),
        "topic_class_loadings_ranked": topic_class_loadings,
        "class_spectral_cosine": (
            round_matrix(class_spectral_cos)
            if class_spectral_cos is not None
            else None
        ),
        "class_mean_spectra": (
            round_matrix(np.vstack(class_spectra)) if class_spectra else []
        )
    }


# ---------------------------------------------------------------------------
# Spectral library exploration view
# ---------------------------------------------------------------------------


def build_library_view(library: dict[str, Any]) -> dict[str, Any] | None:
    samples = library.get("samples") or []
    if not samples:
        return None

    # Group samples by band_count so we can do per-sensor projections
    grouped: dict[int, list[dict[str, Any]]] = {}
    for sample in samples:
        bc = int(sample.get("band_count", 0))
        if bc <= 0:
            continue
        grouped.setdefault(bc, []).append(sample)

    groups_view = []
    for band_count, group in grouped.items():
        spectra = []
        meta = []
        for sample in group:
            spectrum = _safe_array(sample.get("spectrum"))
            if spectrum is None:
                continue
            spectra.append(spectrum)
            meta.append(
                {
                    "id": sample.get("id"),
                    "name": sample.get("name"),
                    "group": sample.get("group"),
                    "sensor": sample.get("sensor"),
                    "absorption_tokens": sample.get("absorption_tokens", [])[:6]
                }
            )
        if not spectra:
            continue
        mat = np.vstack(spectra)
        wavelengths = group[0].get("wavelengths_nm") or []
        cos_sim = cosine_matrix(mat)
        coords = pca_2d(mat)
        # Nearest neighbours per sample (top-3 excluding self)
        nearest = []
        for i in range(mat.shape[0]):
            sims = cos_sim[i].copy()
            sims[i] = -np.inf
            order = np.argsort(sims)[::-1][:3]
            nearest.append(
                [
                    {"id": meta[int(j)]["id"], "name": meta[int(j)]["name"], "similarity": round(float(sims[int(j)]), 4)}
                    for j in order
                ]
            )
        groups_view.append(
            {
                "band_count": band_count,
                "wavelengths_nm": [round(float(v), 2) for v in wavelengths],
                "samples": meta,
                "sample_spectra": round_matrix(mat),
                "sample_cosine_sim": round_matrix(cos_sim),
                "sample_pca_xy": round_matrix(coords),
                "nearest_neighbours_top3": nearest
            }
        )

    if not groups_view:
        return None
    return {
        "library_id": "usgs-splib07",
        "groups": groups_view
    }


# ---------------------------------------------------------------------------
# HIDSAG exploration view (sample-level)
# ---------------------------------------------------------------------------


def build_hidsag_view(curated: dict[str, Any]) -> dict[str, Any] | None:
    subsets = curated.get("subsets") or []
    if not subsets:
        return None
    out = []
    for sub in subsets:
        samples = sub.get("samples") or []
        if not samples:
            continue
        spectra = []
        meta = []
        wavelengths = sub.get("wavelengths_nm") or []
        for sample in samples:
            mean = _safe_array(sample.get("mean_spectrum"))
            if mean is None:
                continue
            spectra.append(mean)
            meta.append(
                {
                    "sample_id": sample.get("sample_id"),
                    "process_tag": sample.get("process_tag"),
                    "geomet_summary": sample.get("geomet_summary", {}),
                    "modality_count": sample.get("modality_count")
                }
            )
        if not spectra:
            continue
        mat = np.vstack(spectra)
        cos_sim = cosine_matrix(mat)
        coords = pca_2d(mat)
        out.append(
            {
                "subset_id": sub.get("id"),
                "modality": sub.get("modality"),
                "wavelengths_nm": [round(float(v), 2) for v in wavelengths],
                "samples": meta,
                "sample_spectra": round_matrix(mat),
                "sample_cosine_sim": round_matrix(cos_sim),
                "sample_pca_xy": round_matrix(coords)
            }
        )
    if not out:
        return None
    return {"subsets": out}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    real = _load_json(REAL_PATH) or {}
    library = _load_json(LIBRARY_PATH) or {}
    hidsag = _load_json(HIDSAG_CURATED_PATH) or {}

    scene_views: list[dict[str, Any]] = []
    for scene in real.get("scenes", []):
        view = build_scene_view(scene)
        if view is not None:
            scene_views.append(view)

    library_view = build_library_view(library)
    hidsag_view = build_hidsag_view(hidsag)

    payload = {
        "source": "Precomputed exploration views for the interactive Workspace",
        "generated_at": date.today().isoformat(),
        "scenes": scene_views,
        "spectral_library": library_view,
        "hidsag": hidsag_view
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(f"Wrote exploration views: {OUT_PATH}")
    print(f"  scenes:   {len(scene_views)}")
    print(f"  library:  {'yes' if library_view else 'no'}")
    print(f"  hidsag:   {'yes' if hidsag_view else 'no'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
