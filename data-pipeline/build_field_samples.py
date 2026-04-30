"""Create compact MSI field-scene assets from downloaded MicaSense samples."""
from __future__ import annotations

import json
import warnings
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.decomposition import LatentDirichletAllocation
from tifffile import imread


warnings.filterwarnings("ignore", message=".*GDAL_NODATA.*")

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "micasense"
OUTPUT_DIR = ROOT / "data" / "derived" / "field"
PREVIEW_DIR = OUTPUT_DIR / "previews"
OUTPUT_PATH = OUTPUT_DIR / "field_samples.json"

BAND_NAMES = ["Blue", "Green", "Red", "NIR"]
BAND_SHORT_NAMES = ["B", "G", "R", "NIR"]
BAND_CENTERS_NM = [480.0, 550.0, 670.0, 850.0]
PATCH_SIZE = 32
QUANTIZATION_LEVELS = 16


@dataclass(frozen=True)
class FieldSceneConfig:
    id: str
    name: str
    source_url: str
    sensor: str
    modality: str
    orthomosaic_file: str
    raw_capture_file: str
    altitude_m: int


SCENES = [
    FieldSceneConfig(
        id="micasense-example-1",
        name="MicaSense Example 1",
        source_url="https://sample.micasense.com/",
        sensor="MicaSense RedEdge",
        modality="MSI field orthomosaic",
        orthomosaic_file="rededge_geotiff_example1.tif",
        raw_capture_file="rededge_raw_example1.zip",
        altitude_m=70,
    ),
    FieldSceneConfig(
        id="micasense-example-2",
        name="MicaSense Example 2",
        source_url="https://sample.micasense.com/",
        sensor="MicaSense RedEdge",
        modality="MSI field orthomosaic",
        orthomosaic_file="rededge_geotiff_example2.tif",
        raw_capture_file="rededge_raw_example2.zip",
        altitude_m=120,
    ),
]


def normalize01(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = float(values.min())
    high = float(values.max())
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def save_preview(image: np.ndarray, destination: Path, nearest: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    pil_image = Image.fromarray(image)
    if pil_image.width > 960:
        height = int(round((960 / pil_image.width) * pil_image.height))
        resample = Image.Resampling.NEAREST if nearest else Image.Resampling.BILINEAR
        pil_image = pil_image.resize((960, height), resample=resample)
    pil_image.save(destination)


def load_raster(path: Path) -> np.ndarray:
    raster = imread(path).astype(np.float32)
    raster[raster > 60000] = np.nan
    for band_index in range(raster.shape[-1]):
        band = raster[..., band_index]
        if np.isnan(band).any():
            fill_value = float(np.nanmedian(band))
            band[np.isnan(band)] = fill_value
            raster[..., band_index] = band
    return raster


def robust_scale(raster: np.ndarray) -> np.ndarray:
    flat = raster.reshape(-1, raster.shape[-1])
    low = np.percentile(flat, 1, axis=0)
    high = np.percentile(flat, 99, axis=0)
    return np.clip((raster - low) / np.maximum(high - low, 1e-6), 0, 1)


def quantize_scaled_raster(scaled: np.ndarray) -> np.ndarray:
    return np.clip(np.rint(scaled * (QUANTIZATION_LEVELS - 1)), 0, QUANTIZATION_LEVELS - 1).astype(np.int32)


def build_rgb_preview(scene_id: str, scaled: np.ndarray) -> str:
    rgb = scaled[..., [2, 1, 0]]
    image = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    path = PREVIEW_DIR / f"{scene_id}-rgb.png"
    save_preview(image, path, nearest=False)
    return f"/generated/field/previews/{path.name}"


def build_ndvi_preview(scene_id: str, scaled: np.ndarray) -> tuple[str, np.ndarray]:
    ndvi = (scaled[..., 3] - scaled[..., 2]) / np.maximum(scaled[..., 3] + scaled[..., 2], 1e-6)
    ndvi_norm = np.clip((ndvi + 1.0) / 2.0, 0, 1)
    image = np.stack([1.0 - ndvi_norm, ndvi_norm, np.zeros_like(ndvi_norm)], axis=-1)
    path = PREVIEW_DIR / f"{scene_id}-ndvi.png"
    save_preview((image * 255).astype(np.uint8), path, nearest=False)
    return f"/generated/field/previews/{path.name}", ndvi


def build_patch_documents(scaled: np.ndarray, quantized: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    docs: list[np.ndarray] = []
    mean_spectra: list[np.ndarray] = []
    mean_quantized: list[np.ndarray] = []
    mean_ndvi: list[float] = []

    rows, cols, _ = scaled.shape
    for row in range(0, rows - PATCH_SIZE + 1, PATCH_SIZE):
        for col in range(0, cols - PATCH_SIZE + 1, PATCH_SIZE):
            scaled_block = scaled[row : row + PATCH_SIZE, col : col + PATCH_SIZE, :]
            quantized_block = quantized[row : row + PATCH_SIZE, col : col + PATCH_SIZE, :]

            vector = np.zeros(len(BAND_NAMES) * QUANTIZATION_LEVELS, dtype=np.float32)
            for band_index in range(len(BAND_NAMES)):
                values = quantized_block[..., band_index].ravel()
                counts = np.bincount(values, minlength=QUANTIZATION_LEVELS)
                start = band_index * QUANTIZATION_LEVELS
                vector[start : start + QUANTIZATION_LEVELS] = counts

            docs.append(vector)
            mean_spectra.append(scaled_block.mean(axis=(0, 1)))
            mean_quantized.append(np.rint(quantized_block.mean(axis=(0, 1))).astype(np.int32))
            ndvi_block = (scaled_block[..., 3] - scaled_block[..., 2]) / np.maximum(
                scaled_block[..., 3] + scaled_block[..., 2],
                1e-6,
            )
            mean_ndvi.append(float(ndvi_block.mean()))

    return (
        np.vstack(docs),
        np.vstack(mean_spectra),
        np.vstack(mean_quantized),
        np.asarray(mean_ndvi, dtype=np.float32),
    )


def fit_topics(doc_term: np.ndarray, n_topics: int = 4) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(42)
    if doc_term.shape[0] > 1500:
        fit_indices = rng.choice(doc_term.shape[0], size=1500, replace=False)
        fit_docs = doc_term[fit_indices]
    else:
        fit_docs = doc_term

    lda = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="batch",
        max_iter=60,
        random_state=42,
        doc_topic_prior=0.5,
        topic_word_prior=0.15,
    )
    lda.fit(fit_docs)
    return lda.transform(doc_term), lda.components_


def top_band_intensity_tokens(weights: np.ndarray, top_n: int = 8) -> list[dict[str, float | str]]:
    indices = np.argsort(weights)[::-1][:top_n]
    total = float(weights.sum()) if float(weights.sum()) > 0 else 1.0
    tokens = []
    for index in indices:
        band_index = int(index // QUANTIZATION_LEVELS)
        quantized_level = int(index % QUANTIZATION_LEVELS)
        tokens.append(
            {
                "token": f"{BAND_SHORT_NAMES[band_index]}_q{quantized_level:02d}",
                "weight": round(float(weights[index] / total), 4),
            }
        )
    return tokens


def topic_band_profile(weights: np.ndarray) -> list[float]:
    profile = weights.reshape(len(BAND_NAMES), QUANTIZATION_LEVELS).sum(axis=1)
    return [round(float(value), 4) for value in normalize01(profile)]


def assign_strata(mean_ndvi: np.ndarray, mean_spectra: np.ndarray) -> tuple[np.ndarray, dict[int, str]]:
    q50 = float(np.quantile(mean_ndvi, 0.5))
    q75 = float(np.quantile(mean_ndvi, 0.75))
    brightness = mean_spectra.mean(axis=1)
    brightness_median = float(np.median(brightness))

    labels = np.zeros(mean_ndvi.shape[0], dtype=np.int32)
    for index, ndvi_value in enumerate(mean_ndvi):
        if ndvi_value >= q75:
            labels[index] = 1
        elif ndvi_value >= q50:
            labels[index] = 2
        elif brightness[index] >= brightness_median:
            labels[index] = 3
        else:
            labels[index] = 4

    names = {
        1: "High NDVI patches",
        2: "Mid NDVI patches",
        3: "Low NDVI bright patches",
        4: "Low NDVI dark patches",
    }
    return labels, names


def build_scene_payload(config: FieldSceneConfig) -> dict:
    raster = load_raster(RAW_DIR / config.orthomosaic_file)
    scaled = robust_scale(raster)
    quantized = quantize_scaled_raster(scaled)
    rgb_preview_path = build_rgb_preview(config.id, scaled)
    ndvi_preview_path, _ = build_ndvi_preview(config.id, scaled)

    docs, mean_spectra, mean_quantized, mean_ndvi = build_patch_documents(scaled, quantized)
    doc_topic, topic_components = fit_topics(docs, n_topics=4)
    stratum_labels, stratum_names = assign_strata(mean_ndvi, mean_spectra)

    topics_payload = []
    for topic_index in range(topic_components.shape[0]):
        topics_payload.append(
            {
                "id": f"{config.id}-topic-{topic_index + 1}",
                "name": f"Field topic {topic_index + 1}",
                "top_words": top_band_intensity_tokens(topic_components[topic_index]),
                "band_profile": topic_band_profile(topic_components[topic_index]),
            }
        )

    strata_payload = []
    example_documents = []
    for label_id in sorted(stratum_names):
        mask = stratum_labels == label_id
        if not np.any(mask):
            continue
        strata_payload.append(
            {
                "label_id": int(label_id),
                "name": stratum_names[label_id],
                "count": int(mask.sum()),
                "mean_spectrum": [round(float(value), 4) for value in mean_spectra[mask].mean(axis=0)],
                "mean_topic_mixture": [round(float(value), 4) for value in doc_topic[mask].mean(axis=0)],
                "mean_ndvi": round(float(mean_ndvi[mask].mean()), 4),
            }
        )

        example_index = int(np.flatnonzero(mask)[0])
        example_documents.append(
            {
                "label_id": int(label_id),
                "class_name": stratum_names[label_id],
                "spectrum": [round(float(value), 4) for value in mean_spectra[example_index]],
                "quantized_levels": [int(value) for value in mean_quantized[example_index]],
                "topic_mixture": [round(float(value), 4) for value in doc_topic[example_index]],
                "mean_ndvi": round(float(mean_ndvi[example_index]), 4),
            }
        )

    local_raw_files = [
        {
            "name": config.orthomosaic_file,
            "size_bytes": (RAW_DIR / config.orthomosaic_file).stat().st_size,
        }
    ]
    raw_capture_path = RAW_DIR / config.raw_capture_file
    if raw_capture_path.exists():
        local_raw_files.append(
            {
                "name": config.raw_capture_file,
                "size_bytes": raw_capture_path.stat().st_size,
            }
        )

    return {
        "id": config.id,
        "name": config.name,
        "modality": config.modality,
        "sensor": config.sensor,
        "source_url": config.source_url,
        "raster_shape": [int(value) for value in raster.shape],
        "patch_size": PATCH_SIZE,
        "patch_count": int(docs.shape[0]),
        "band_names": BAND_NAMES,
        "band_centers_nm": BAND_CENTERS_NM,
        "rgb_preview_path": rgb_preview_path,
        "ndvi_preview_path": ndvi_preview_path,
        "strata_summaries": strata_payload,
        "topics": topics_payload,
        "example_documents": example_documents,
        "local_raw_files": local_raw_files,
        "notes": (
            f"Official reflectance-calibrated orthomosaic captured from {config.altitude_m} m above ground level. "
            "Patch documents are unlabeled. The strata shown here are heuristic bins driven by mean patch NDVI "
            "and brightness, used only to anchor interpretation."
        ),
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scenes = []
    for config in SCENES:
        orthomosaic_path = RAW_DIR / config.orthomosaic_file
        if not orthomosaic_path.exists():
            print(f"Skipping {config.id}: orthomosaic not found.")
            continue
        print(f"Building compact asset for {config.name} ...")
        scenes.append(build_scene_payload(config))

    payload = {
        "source": "Official orthomosaics from the MicaSense RedEdge sample page",
        "scenes": scenes,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote derived field-scene payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
