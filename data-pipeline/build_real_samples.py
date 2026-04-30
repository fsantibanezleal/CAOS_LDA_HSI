"""Create compact derived assets from downloaded public HSI scenes."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.io import loadmat
from sklearn.decomposition import LatentDirichletAllocation


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "upv_ehu"
OUTPUT_DIR = ROOT / "data" / "derived" / "real"
PREVIEW_DIR = OUTPUT_DIR / "previews"
OUTPUT_PATH = OUTPUT_DIR / "real_samples.json"

LABEL_COLORS = [
    (0, 0, 0),
    (38, 70, 83),
    (42, 157, 143),
    (76, 201, 240),
    (79, 193, 90),
    (123, 201, 111),
    (241, 196, 15),
    (244, 162, 97),
    (231, 111, 81),
    (168, 87, 160),
    (99, 102, 241),
    (45, 118, 232),
    (21, 128, 61),
    (132, 204, 22),
    (217, 119, 6),
    (220, 38, 38),
    (155, 28, 28),
]


@dataclass(frozen=True)
class SceneConfig:
    id: str
    name: str
    source_url: str
    sensor: str
    modality: str
    cube_file: str
    cube_key: str
    gt_file: str
    gt_key: str
    band_min_nm: float
    band_max_nm: float
    classes: dict[int, str]


SCENES = [
    SceneConfig(
        id="indian-pines-corrected",
        name="Indian Pines corrected",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        cube_file="Indian_pines_corrected.mat",
        cube_key="indian_pines_corrected",
        gt_file="Indian_pines_gt.mat",
        gt_key="indian_pines_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        classes={
            1: "Alfalfa",
            2: "Corn-notill",
            3: "Corn-mintill",
            4: "Corn",
            5: "Grass-pasture",
            6: "Grass-trees",
            7: "Grass-pasture-mowed",
            8: "Hay-windrowed",
            9: "Oats",
            10: "Soybean-notill",
            11: "Soybean-mintill",
            12: "Soybean-clean",
            13: "Wheat",
            14: "Woods",
            15: "Buildings-Grass-Trees-Drives",
            16: "Stone-Steel-Towers",
        },
    ),
    SceneConfig(
        id="salinas-a-corrected",
        name="Salinas-A corrected",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        cube_file="SalinasA_corrected.mat",
        cube_key="salinasA_corrected",
        gt_file="SalinasA_gt.mat",
        gt_key="salinasA_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        classes={
            1: "Brocoli_green_weeds_1",
            2: "Corn_senesced_green_weeds",
            3: "Lettuce_romaine_4wk",
            4: "Lettuce_romaine_5wk",
            5: "Lettuce_romaine_6wk",
            6: "Lettuce_romaine_7wk",
        },
    ),
    SceneConfig(
        id="pavia-university",
        name="Pavia University",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="ROSIS",
        modality="HSI scene",
        cube_file="PaviaU.mat",
        cube_key="paviaU",
        gt_file="PaviaU_gt.mat",
        gt_key="paviaU_gt",
        band_min_nm=430.0,
        band_max_nm=860.0,
        classes={
            1: "Asphalt",
            2: "Meadows",
            3: "Gravel",
            4: "Trees",
            5: "Painted metal sheets",
            6: "Bare Soil",
            7: "Bitumen",
            8: "Self-Blocking Bricks",
            9: "Shadows",
        },
    ),
    SceneConfig(
        id="kennedy-space-center",
        name="Kennedy Space Center",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        cube_file="KSC.mat",
        cube_key="KSC",
        gt_file="KSC_gt.mat",
        gt_key="KSC_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        classes={
            1: "Scrub",
            2: "Willow swamp",
            3: "CP hammock",
            4: "Slash pine",
            5: "Oak/Broadleaf",
            6: "Hardwood",
            7: "Swamp",
            8: "Graminoid marsh",
            9: "Spartina marsh",
            10: "Cattail marsh",
            11: "Salt marsh",
            12: "Mud flats",
            13: "Water",
        },
    ),
    SceneConfig(
        id="botswana",
        name="Botswana",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="Hyperion",
        modality="HSI scene",
        cube_file="Botswana.mat",
        cube_key="Botswana",
        gt_file="Botswana_gt.mat",
        gt_key="Botswana_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        classes={
            1: "Water",
            2: "Hippo grass",
            3: "Floodplain grasses 1",
            4: "Floodplain grasses 2",
            5: "Reeds",
            6: "Riparian",
            7: "Firescar",
            8: "Island interior",
            9: "Acacia woodlands",
            10: "Acacia shrublands",
            11: "Acacia grasslands",
            12: "Short mopane",
            13: "Mixed mopane",
            14: "Exposed soils",
        },
    ),
]


def normalize01(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = float(values.min())
    high = float(values.max())
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def quantize_spectra(spectra: np.ndarray, levels: int = 16) -> np.ndarray:
    scaled = normalize01(spectra)
    return np.clip(np.rint(scaled * (levels - 1)), 0, levels - 1).astype(np.int32)


def fit_scene_topics(doc_term: np.ndarray, n_topics: int = 4) -> tuple[np.ndarray, np.ndarray]:
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="batch",
        max_iter=120,
        random_state=42,
        doc_topic_prior=0.4,
        topic_word_prior=0.25,
    )
    doc_topic = lda.fit_transform(doc_term)
    return doc_topic, lda.components_


def load_scene(config: SceneConfig) -> tuple[np.ndarray, np.ndarray]:
    cube = loadmat(RAW_DIR / config.cube_file)[config.cube_key]
    gt = loadmat(RAW_DIR / config.gt_file)[config.gt_key]
    return cube.astype(np.float32), gt.astype(np.int32)


def top_band_tokens(weights: np.ndarray, wavelengths: np.ndarray, top_n: int = 6) -> list[dict[str, float | str]]:
    indices = np.argsort(weights)[::-1][:top_n]
    total = float(weights.sum()) if float(weights.sum()) > 0 else 1.0
    return [
        {
            "token": f"{int(round(float(wavelengths[index]))):04d}nm",
            "weight": round(float(weights[index] / total), 4),
        }
        for index in indices
    ]


def select_rgb_indices(wavelengths: np.ndarray) -> list[int]:
    targets = np.array([650.0, 550.0, 450.0], dtype=np.float32)
    return [int(np.abs(wavelengths - target).argmin()) for target in targets]


def save_preview(image: np.ndarray, destination: Path, nearest: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    pil_image = Image.fromarray(image)
    if pil_image.width > 960:
        height = int(round((960 / pil_image.width) * pil_image.height))
        resample = Image.Resampling.NEAREST if nearest else Image.Resampling.BILINEAR
        pil_image = pil_image.resize((960, height), resample=resample)
    pil_image.save(destination)


def build_rgb_preview(scene_id: str, cube: np.ndarray, wavelengths: np.ndarray) -> str:
    rgb_indices = select_rgb_indices(wavelengths)
    rgb = cube[..., rgb_indices]
    low = np.percentile(rgb, 2, axis=(0, 1))
    high = np.percentile(rgb, 98, axis=(0, 1))
    scaled = np.clip((rgb - low) / np.maximum(high - low, 1e-6), 0, 1)
    image = (scaled * 255).astype(np.uint8)
    path = PREVIEW_DIR / f"{scene_id}-rgb.png"
    save_preview(image, path, nearest=False)
    return f"/generated/real/previews/{path.name}"


def build_label_preview(scene_id: str, gt: np.ndarray) -> str:
    image = np.zeros((gt.shape[0], gt.shape[1], 3), dtype=np.uint8)
    for label_id in np.unique(gt):
        color = LABEL_COLORS[int(label_id) % len(LABEL_COLORS)]
        image[gt == label_id] = color
    path = PREVIEW_DIR / f"{scene_id}-labels.png"
    save_preview(image, path, nearest=True)
    return f"/generated/real/previews/{path.name}"


def build_scene_payload(config: SceneConfig) -> dict:
    cube, gt = load_scene(config)
    rows, cols, bands = cube.shape
    wavelengths = np.linspace(config.band_min_nm, config.band_max_nm, bands, dtype=np.float32)

    flat_cube = cube.reshape(-1, bands)
    flat_gt = gt.reshape(-1)
    valid_mask = flat_gt > 0
    spectra = flat_cube[valid_mask]
    labels = flat_gt[valid_mask]
    quantized = quantize_spectra(spectra, levels=16)

    rng = np.random.default_rng(42)
    sample_indices = []
    for label_value in sorted(config.classes):
        label_positions = np.flatnonzero(labels == label_value)
        if label_positions.size == 0:
            continue
        take = min(120, int(label_positions.size))
        chosen = rng.choice(label_positions, size=take, replace=False)
        sample_indices.append(chosen)
    stacked_indices = np.concatenate(sample_indices) if sample_indices else np.arange(min(500, spectra.shape[0]))
    sampled_spectra = spectra[stacked_indices]
    sampled_labels = labels[stacked_indices]
    sampled_quantized = quantized[stacked_indices]

    doc_topic, topic_components = fit_scene_topics(sampled_quantized, n_topics=4)

    classes_payload = []
    example_documents = []
    for label_value, class_name in config.classes.items():
        class_mask = labels == label_value
        if not np.any(class_mask):
            continue
        class_spectra = spectra[class_mask]
        mean_spectrum = class_spectra.mean(axis=0)

        sampled_class_mask = sampled_labels == label_value
        mean_topic = (
            doc_topic[sampled_class_mask].mean(axis=0)
            if np.any(sampled_class_mask)
            else np.zeros(topic_components.shape[0], dtype=np.float32)
        )

        classes_payload.append(
            {
                "label_id": int(label_value),
                "name": class_name,
                "count": int(class_mask.sum()),
                "mean_spectrum": [round(float(value), 4) for value in normalize01(mean_spectrum)],
                "mean_topic_mixture": [round(float(value), 4) for value in mean_topic],
            }
        )

        if np.any(sampled_class_mask):
            example_index = int(np.flatnonzero(sampled_class_mask)[0])
            example_documents.append(
                {
                    "label_id": int(label_value),
                    "class_name": class_name,
                    "spectrum": [round(float(value), 4) for value in normalize01(sampled_spectra[example_index])],
                    "quantized_levels": [int(value) for value in sampled_quantized[example_index]],
                    "topic_mixture": [round(float(value), 4) for value in doc_topic[example_index]],
                }
            )

    topics_payload = []
    for topic_index in range(topic_components.shape[0]):
        topics_payload.append(
            {
                "id": f"{config.id}-topic-{topic_index + 1}",
                "name": f"Scene topic {topic_index + 1}",
                "top_words": top_band_tokens(topic_components[topic_index], wavelengths),
                "band_profile": [round(float(value), 4) for value in normalize01(topic_components[topic_index])],
            }
        )

    rgb_preview_path = build_rgb_preview(config.id, cube, wavelengths)
    label_preview_path = build_label_preview(config.id, gt)

    return {
        "id": config.id,
        "name": config.name,
        "modality": config.modality,
        "sensor": config.sensor,
        "source_url": config.source_url,
        "cube_shape": [int(rows), int(cols), int(bands)],
        "labeled_pixels": int(valid_mask.sum()),
        "approximate_wavelengths_nm": [round(float(value), 2) for value in wavelengths],
        "class_summaries": classes_payload,
        "topics": topics_payload,
        "example_documents": example_documents[:8],
        "local_raw_files": [
            {
                "name": config.cube_file,
                "size_bytes": (RAW_DIR / config.cube_file).stat().st_size,
            },
            {
                "name": config.gt_file,
                "size_bytes": (RAW_DIR / config.gt_file).stat().st_size,
            },
        ],
        "rgb_preview_path": rgb_preview_path,
        "label_preview_path": label_preview_path,
        "label_coverage_ratio": round(float(valid_mask.mean()), 4),
        "notes": (
            "Band centers are approximated from the nominal sensor range for visualization. "
            "RGB previews are built from the nearest approximate visible bands, and label previews "
            "come from the official ground-truth maps bundled with each scene."
        ),
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scenes = []
    for config in SCENES:
        cube_path = RAW_DIR / config.cube_file
        gt_path = RAW_DIR / config.gt_file
        if not cube_path.exists() or not gt_path.exists():
            print(f"Skipping {config.id}: raw files not found.")
            continue
        print(f"Building compact asset for {config.name} ...")
        scenes.append(build_scene_payload(config))

    payload = {
        "source": "Official scenes from the UPV/EHU benchmark page",
        "scenes": scenes,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote derived real-scene payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
