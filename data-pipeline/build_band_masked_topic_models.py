"""Step 8 band-mask sweep: refit canonical LDA on band-restricted corpora.

For every labelled scene this builder evaluates four band masks and
emits the canonical-K (K = max(4, min(12, n_classes))) LDA fit per
(scene, mask):

  - vnir          400-1100 nm only
  - swir          1100-2500 nm only
  - no_water      drop 1350-1430 + 1800-1950 + 2480-2500 nm
  - top_50_fisher top-50 bands by Fisher ratio (from interpretability/band_cards)

Outputs per (scene, mask):

  data/derived/band_masks/<scene>/<mask>/
    summary.json                       # phi top-words + distances + p(L|t) + diagnostics
    dominant_topic_map.bin             # uint8 (H * W) with sentinel 255
    theta_grid.bin                     # float32 (H * W * K) sentinel all-zero

  data/derived/band_masks/index.json   # master index of (scene, mask) tuples

The canonical (no-mask) fit lives in build_topic_views.py / build_topic_to_data.py
and is referenced for side-by-side comparison in the frontend. This
builder lets the user answer "what would the topics look like if we
only saw the VNIR / SWIR / non-water-corrupted / top-50-discriminative
bands?" — i.e. it instantiates the Step 8 band-mask manipulation that
web-app-spec.md requested.

Hyperparameters mirror build_topic_views.py:
  SAMPLES_PER_CLASS=220, K from topic_count_for, LDA online VB
  doc_topic_prior=0.45, topic_word_prior=0.2, max_iter=60, seed=42.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sklearn.decomposition import LatentDirichletAllocation
from sklearn.metrics import adjusted_rand_score

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_HERE = Path(__file__).resolve().parent
if str(_HERE) not in sys.path:
    sys.path.insert(0, str(_HERE))

from research_core.class_catalog import CLASS_NAMES, has_labels
from research_core.paths import DATA_DIR, DERIVED_DIR
from research_core.raw_scenes import (
    SCENES,
    approximate_wavelengths,
    load_scene,
    stratified_sample_indices,
    valid_spectra_mask,
)

DERIVED_OUT_DIR = DERIVED_DIR / "band_masks"
LABEL_PALETTE = {
    # 12-colour Tableau-ish palette; LabelCell carries its own colour but the
    # band-mask payload doesn't ship LabelCell rows, only label_id + name. The
    # frontend re-uses whatever palette it already has.
}

# Hyperparameters mirror build_topic_views.py
SAMPLES_PER_CLASS = 220
RANDOM_STATE = 42
SCALE = 12
LDA_MAX_ITER = 60
LDA_DOC_TOPIC_PRIOR = 0.45
LDA_TOPIC_WORD_PRIOR = 0.2

LABELLED_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]

# ---- mask definitions ------------------------------------------------------

WATER_BANDS_NM = [
    (1350.0, 1430.0),
    (1800.0, 1950.0),
    (2480.0, 2500.0),
]


def mask_vnir(wavelengths: np.ndarray, _scene_id: str) -> np.ndarray:
    return (wavelengths >= 400.0) & (wavelengths <= 1100.0)


def mask_swir(wavelengths: np.ndarray, _scene_id: str) -> np.ndarray:
    return (wavelengths >= 1100.0) & (wavelengths <= 2500.0)


def mask_no_water(wavelengths: np.ndarray, _scene_id: str) -> np.ndarray:
    keep = np.ones_like(wavelengths, dtype=bool)
    for lo, hi in WATER_BANDS_NM:
        keep &= ~((wavelengths >= lo) & (wavelengths <= hi))
    return keep


def mask_top_fisher(
    wavelengths: np.ndarray, scene_id: str, top_n: int = 50
) -> np.ndarray:
    band_cards_path = (
        DERIVED_DIR
        / "interpretability"
        / scene_id
        / "band_cards.json"
    )
    if not band_cards_path.exists():
        # Fallback: keep all bands
        return np.ones_like(wavelengths, dtype=bool)
    payload = json.loads(band_cards_path.read_text(encoding="utf-8"))
    cards = payload.get("band_cards", [])
    if not cards:
        return np.ones_like(wavelengths, dtype=bool)
    # Sort by fisher_ratio descending; pick top N
    cards_sorted = sorted(cards, key=lambda c: -c.get("fisher_ratio", 0.0))
    n_keep = min(top_n, len(cards_sorted))
    top_band_indices = sorted(int(c["band_index"]) for c in cards_sorted[:n_keep])
    keep = np.zeros_like(wavelengths, dtype=bool)
    for idx in top_band_indices:
        if 0 <= idx < len(wavelengths):
            keep[idx] = True
    return keep


MASK_DEFINITIONS = {
    "vnir": {
        "label": "VNIR-only (400-1100 nm)",
        "description": "Visible + near-infrared bands only. Removes SWIR signal so topics can only express visible-light + chlorophyll-region absorption.",
        "fn": mask_vnir,
    },
    "swir": {
        "label": "SWIR-only (1100-2500 nm)",
        "description": "Shortwave-infrared bands only. Removes VNIR signal so topics can only express mineral / moisture absorption regions.",
        "fn": mask_swir,
    },
    "no_water": {
        "label": "Water-bands removed (1350-1430 + 1800-1950 + 2480-2500 nm)",
        "description": "Drops atmospheric water-vapour absorption bands. Topics still see VNIR + SWIR but without the noisiest portions.",
        "fn": mask_no_water,
    },
    "top_50_fisher": {
        "label": "Top-50 Fisher-ratio bands",
        "description": "Keep only the 50 bands with the largest per-band Fisher discriminant ratio (from interpretability/band_cards). Topics built on the most label-discriminative subset.",
        "fn": mask_top_fisher,
    },
}


# ---- helpers ---------------------------------------------------------------


def topic_count_for(_scene_id: str, n_classes: int) -> int:
    return max(4, min(12, n_classes))


def band_frequency_counts(spectra: np.ndarray, scale: int = SCALE) -> np.ndarray:
    """Quantise each pixel into [0..scale] per band then return as int counts."""
    lo = np.nanmin(spectra, axis=0, keepdims=True)
    hi = np.nanmax(spectra, axis=0, keepdims=True)
    denom = np.where(hi > lo, hi - lo, 1.0)
    norm = np.clip((spectra - lo) / denom, 0.0, 1.0)
    return np.round(norm * scale).astype(np.int32)


def cosine_matrix(phi: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(phi, axis=1, keepdims=True)
    safe = np.where(norms > 0, norms, 1.0)
    normed = phi / safe
    cos = normed @ normed.T
    return np.clip(1.0 - cos, 0.0, 2.0)


def top_words(phi: np.ndarray, vocab: list[str], n: int = 15) -> list[list[str]]:
    out = []
    for k in range(phi.shape[0]):
        order = np.argsort(phi[k])[::-1][:n]
        out.append([vocab[int(i)] for i in order])
    return out


def label_distribution(
    labels: np.ndarray, all_labels: list[int], scene_id: str
) -> list[dict]:
    name_map = CLASS_NAMES.get(scene_id, {})
    counts = np.zeros(len(all_labels), dtype=np.int64)
    for lbl in labels:
        try:
            idx = all_labels.index(int(lbl))
            counts[idx] += 1
        except ValueError:
            continue
    total = max(int(counts.sum()), 1)
    return [
        {
            "label_id": all_labels[i],
            "name": name_map.get(all_labels[i], f"class_{all_labels[i]}"),
            "count": int(counts[i]),
            "p": float(counts[i] / total),
        }
        for i in range(len(all_labels))
    ]


# ---- per (scene, mask) build ----------------------------------------------


def build_for(scene_id: str, mask_name: str) -> dict | None:
    if scene_id not in SCENES or not has_labels(scene_id):
        return None
    mask_def = MASK_DEFINITIONS[mask_name]
    cube, gt, config = load_scene(scene_id)
    h, w, b_full = cube.shape
    flat = cube.reshape(-1, b_full).astype(np.float32)
    valid = valid_spectra_mask(flat)
    flat_labels = gt.reshape(-1)
    labelled_mask = valid & (flat_labels > 0)
    if not labelled_mask.any():
        return None

    pixel_indices = np.flatnonzero(labelled_mask)
    spectra_all_bands = flat[pixel_indices]
    labels = flat_labels[pixel_indices]
    classes = sorted(int(c) for c in np.unique(labels))
    K = topic_count_for(scene_id, len(classes))

    wavelengths_full = approximate_wavelengths(config, b_full)
    band_keep = mask_def["fn"](wavelengths_full, scene_id)
    n_bands_kept = int(band_keep.sum())
    if n_bands_kept < 8:
        return {
            "skipped": True,
            "reason": f"only {n_bands_kept} bands kept after mask; need >= 8",
            "n_bands_full": int(b_full),
            "n_bands_kept": n_bands_kept,
        }
    band_keep_idx = np.flatnonzero(band_keep)
    wavelengths_kept = wavelengths_full[band_keep]
    spectra = spectra_all_bands[:, band_keep]

    sample_idx_local = stratified_sample_indices(
        labels, SAMPLES_PER_CLASS, random_state=RANDOM_STATE
    )
    sample_spectra = spectra[sample_idx_local]
    sample_labels = labels[sample_idx_local]
    sample_pixel_indices = pixel_indices[sample_idx_local]

    counts = band_frequency_counts(sample_spectra, scale=SCALE)
    doc_term = counts.astype(np.float32)
    D, V = doc_term.shape

    vocab = [
        f"{int(round(float(wavelengths_kept[i]))):04d}nm" for i in range(V)
    ]

    lda = LatentDirichletAllocation(
        n_components=K,
        learning_method="online",
        max_iter=LDA_MAX_ITER,
        batch_size=512,
        evaluate_every=-1,
        random_state=RANDOM_STATE,
        doc_topic_prior=LDA_DOC_TOPIC_PRIOR,
        topic_word_prior=LDA_TOPIC_WORD_PRIOR,
    )
    theta = lda.fit_transform(doc_term)
    phi_unn = lda.components_
    phi = phi_unn / phi_unn.sum(axis=1, keepdims=True)
    perplexity = float(lda.perplexity(doc_term))

    dominant = np.argmax(theta, axis=1)
    confidence = np.max(theta, axis=1)
    topic_prevalence = theta.mean(axis=0)
    topic_distance_cosine = cosine_matrix(phi)
    top_words_lambda_05 = top_words(phi, vocab, n=15)

    # ARI of dominant_topic vs sample_labels (multi-class agreement)
    ari = float(adjusted_rand_score(sample_labels, dominant))

    # Per-topic label posterior
    all_labels = sorted(
        {int(c) for c in CLASS_NAMES[scene_id].keys()}
        | {int(c) for c in np.unique(sample_labels)}
    )
    p_label_given_topic_dominant: list[list[dict]] = []
    docs_per_topic_dominant: list[int] = []
    for k in range(K):
        mask_k = dominant == k
        labels_k = sample_labels[mask_k]
        dist = label_distribution(labels_k, all_labels, scene_id)
        p_label_given_topic_dominant.append(dist)
        docs_per_topic_dominant.append(int(mask_k.sum()))

    # Sidecars: dominant_topic_map + theta_grid
    out_dir = DERIVED_OUT_DIR / scene_id / mask_name
    out_dir.mkdir(parents=True, exist_ok=True)

    dom_map = np.full(h * w, fill_value=255, dtype=np.uint8)
    for d_idx, pixel_idx in enumerate(sample_pixel_indices):
        dom_map[int(pixel_idx)] = int(dominant[d_idx])
    (out_dir / "dominant_topic_map.bin").write_bytes(dom_map.tobytes())

    theta_grid = np.zeros((h * w, K), dtype=np.float32)
    for d_idx, pixel_idx in enumerate(sample_pixel_indices):
        theta_grid[int(pixel_idx)] = theta[d_idx].astype(np.float32)
    (out_dir / "theta_grid.bin").write_bytes(theta_grid.tobytes())

    summary = {
        "scene_id": scene_id,
        "mask_id": mask_name,
        "mask_label": mask_def["label"],
        "mask_description": mask_def["description"],
        "spatial_shape": [int(h), int(w)],
        "topic_count": int(K),
        "document_count": int(D),
        "vocabulary_size": int(V),
        "n_bands_full": int(b_full),
        "n_bands_kept": n_bands_kept,
        "kept_band_indices": [int(i) for i in band_keep_idx.tolist()],
        "wavelengths_nm_kept_first_last": [
            float(wavelengths_kept[0]),
            float(wavelengths_kept[-1]),
        ],
        "wavelengths_nm_kept": [round(float(x), 2) for x in wavelengths_kept.tolist()],
        "topic_prevalence": [round(float(v), 6) for v in topic_prevalence.tolist()],
        "topic_distance_cosine": [
            [round(float(v), 6) for v in row.tolist()] for row in topic_distance_cosine
        ],
        "top_words_per_topic_lambda_05": top_words_lambda_05,
        "p_label_given_topic_dominant": p_label_given_topic_dominant,
        "docs_per_topic_dominant": docs_per_topic_dominant,
        "perplexity_train": perplexity,
        "ari_dominant_vs_label": ari,
        "mean_confidence": float(np.mean(confidence)),
        "lda_config": {
            "method": "sklearn.LatentDirichletAllocation online",
            "max_iter": LDA_MAX_ITER,
            "doc_topic_prior": LDA_DOC_TOPIC_PRIOR,
            "topic_word_prior": LDA_TOPIC_WORD_PRIOR,
            "random_state": RANDOM_STATE,
            "wordification": "band-frequency",
            "quantization_scale": SCALE,
            "samples_per_class": SAMPLES_PER_CLASS,
        },
        "dominant_topic_map": {
            "format": "binary_uint8",
            "shape": [int(h), int(w)],
            "sentinel_unlabelled": 255,
            "served_path": str(
                (out_dir / "dominant_topic_map.bin").relative_to(ROOT)
            ).replace("\\", "/"),
        },
        "theta_grid": {
            "format": "binary_float32",
            "shape": [int(h), int(w), int(K)],
            "dtype": "float32",
            "sentinel": "all_zero_vector",
            "byte_order": "little_endian",
            "served_path": str(
                (out_dir / "theta_grid.bin").relative_to(ROOT)
            ).replace("\\", "/"),
        },
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_band_masked_topic_models v0.1",
    }

    summary_path = out_dir / "summary.json"
    summary_path.write_text(
        json.dumps(summary, separators=(",", ":")), encoding="utf-8"
    )
    return summary


def main() -> int:
    DERIVED_OUT_DIR.mkdir(parents=True, exist_ok=True)
    index_entries: list[dict] = []
    for scene_id in LABELLED_SCENES:
        for mask_name in MASK_DEFINITIONS.keys():
            print(f"[band_masks] {scene_id} / {mask_name} ...", flush=True)
            try:
                result = build_for(scene_id, mask_name)
            except Exception as exc:
                print(f"  FAILED: {exc}", flush=True)
                import traceback
                traceback.print_exc()
                continue
            if result is None:
                print(f"  skipped (no labels)", flush=True)
                continue
            if result.get("skipped"):
                print(
                    f"  skipped: {result.get('reason')}", flush=True,
                )
                index_entries.append(
                    {
                        "scene_id": scene_id,
                        "mask_id": mask_name,
                        "skipped": True,
                        "reason": result.get("reason"),
                        "n_bands_full": result.get("n_bands_full"),
                        "n_bands_kept": result.get("n_bands_kept"),
                    }
                )
                continue
            print(
                f"  K={result['topic_count']} D={result['document_count']} "
                f"V={result['vocabulary_size']} ppl={result['perplexity_train']:.3f} "
                f"ARI={result['ari_dominant_vs_label']:.4f}",
                flush=True,
            )
            index_entries.append(
                {
                    "scene_id": scene_id,
                    "mask_id": mask_name,
                    "mask_label": result["mask_label"],
                    "topic_count": result["topic_count"],
                    "n_bands_full": result["n_bands_full"],
                    "n_bands_kept": result["n_bands_kept"],
                    "perplexity_train": result["perplexity_train"],
                    "ari_dominant_vs_label": result["ari_dominant_vs_label"],
                    "mean_confidence": result["mean_confidence"],
                    "summary_path": f"data/derived/band_masks/{scene_id}/{mask_name}/summary.json",
                }
            )

    index_path = DERIVED_OUT_DIR / "index.json"
    index_payload = {
        "generated_at": datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z"),
        "builder_version": "build_band_masked_topic_models v0.1",
        "mask_definitions": {
            k: {
                "label": v["label"],
                "description": v["description"],
            }
            for k, v in MASK_DEFINITIONS.items()
        },
        "entries": index_entries,
    }
    index_path.write_text(
        json.dumps(index_payload, separators=(",", ":")), encoding="utf-8"
    )
    print(
        f"[band_masks] wrote {len(index_entries)} entries -> {index_path}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
