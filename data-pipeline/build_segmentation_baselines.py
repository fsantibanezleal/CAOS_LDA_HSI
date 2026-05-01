"""Build compact SLIC segmentation baseline payloads.

SLIC is used here as a spatial document-boundary experiment and baseline. The
output is static JSON plus small preview images; the web app should consume
these artifacts rather than running segmentation at request time.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean, median

import numpy as np
from PIL import Image
from scipy.io import loadmat
from skimage.segmentation import slic


ROOT = Path(__file__).resolve().parents[1]
UPV_RAW_DIR = ROOT / "data" / "raw" / "upv_ehu"
OUTPUT_DIR = ROOT / "data" / "derived" / "baselines"
PREVIEW_DIR = OUTPUT_DIR / "previews"
OUTPUT_PATH = OUTPUT_DIR / "segmentation_baselines.json"


@dataclass(frozen=True)
class SegmentationConfig:
    dataset_id: str
    scene_id: str
    name: str
    family_id: str
    cube_file: str
    cube_key: str
    band_min_nm: float
    band_max_nm: float
    n_segments: int
    compactness: float
    gt_file: str | None = None
    gt_key: str | None = None
    classes: dict[int, str] = field(default_factory=dict)
    caveat: str = ""


SCENES = [
    SegmentationConfig(
        dataset_id="salinas-a-corrected",
        scene_id="salinas-a-corrected",
        name="Salinas-A corrected",
        family_id="labeled-spectral-image",
        cube_file="SalinasA_corrected.mat",
        cube_key="salinasA_corrected",
        gt_file="SalinasA_gt.mat",
        gt_key="salinasA_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        n_segments=90,
        compactness=12.0,
        classes={
            1: "Brocoli_green_weeds_1",
            2: "Corn_senesced_green_weeds",
            3: "Lettuce_romaine_4wk",
            4: "Lettuce_romaine_5wk",
            5: "Lettuce_romaine_6wk",
            6: "Lettuce_romaine_7wk",
        },
    ),
    SegmentationConfig(
        dataset_id="indian-pines-corrected",
        scene_id="indian-pines-corrected",
        name="Indian Pines corrected",
        family_id="labeled-spectral-image",
        cube_file="Indian_pines_corrected.mat",
        cube_key="indian_pines_corrected",
        gt_file="Indian_pines_gt.mat",
        gt_key="indian_pines_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        n_segments=160,
        compactness=10.0,
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
    SegmentationConfig(
        dataset_id="cuprite-upv-reflectance",
        scene_id="cuprite-aviris-reflectance",
        name="Cuprite reflectance",
        family_id="unlabeled-spectral-image",
        cube_file="Cuprite_f970619t01p02_r02_sc03.a.rfl.mat",
        cube_key="X",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        n_segments=420,
        compactness=16.0,
        caveat="No ground-truth labels are available in the app; SLIC regions are spatial documents, not material labels.",
    ),
]


def wavelengths_for_cube(config: SegmentationConfig, band_count: int) -> np.ndarray:
    return np.linspace(config.band_min_nm, config.band_max_nm, band_count, dtype=np.float32)


def normalize01(values: np.ndarray) -> np.ndarray:
    low = np.nanpercentile(values, 2, axis=(0, 1))
    high = np.nanpercentile(values, 98, axis=(0, 1))
    return np.clip((values - low) / np.maximum(high - low, 1e-6), 0.0, 1.0)


def rgb_features(cube: np.ndarray, wavelengths: np.ndarray) -> np.ndarray:
    targets = np.array([650.0, 550.0, 450.0], dtype=np.float32)
    indices = [int(np.abs(wavelengths - target).argmin()) for target in targets]
    return normalize01(cube[..., indices]).astype(np.float32)


def colorize_segments(segments: np.ndarray) -> np.ndarray:
    image = np.zeros((*segments.shape, 3), dtype=np.uint8)
    for segment_id in np.unique(segments):
        value = int(segment_id)
        color = (
            (37 * value + 41) % 255,
            (67 * value + 97) % 255,
            (109 * value + 17) % 255,
        )
        image[segments == segment_id] = color
    return image


def save_preview(config: SegmentationConfig, segments: np.ndarray) -> str:
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(colorize_segments(segments))
    if image.width > 960:
        height = int(round((960 / image.width) * image.height))
        image = image.resize((960, height), Image.Resampling.NEAREST)
    path = PREVIEW_DIR / f"{config.scene_id}-slic.png"
    image.save(path)
    return f"/generated/baselines/previews/{path.name}"


def load_scene(config: SegmentationConfig) -> tuple[np.ndarray, np.ndarray | None]:
    cube_mat = loadmat(UPV_RAW_DIR / config.cube_file)
    cube = cube_mat[config.cube_key].astype(np.float32)
    gt = None
    if config.gt_file and config.gt_key:
        gt = loadmat(UPV_RAW_DIR / config.gt_file)[config.gt_key].astype(np.int32)
    return cube, gt


def size_stats(sizes: np.ndarray) -> dict[str, float | int]:
    return {
        "min": int(np.min(sizes)),
        "median": round(float(median(int(value) for value in sizes)), 2),
        "max": int(np.max(sizes)),
        "mean": round(float(mean(int(value) for value in sizes)), 2),
    }


def label_metrics(
    config: SegmentationConfig,
    segments: np.ndarray,
    gt: np.ndarray | None,
) -> tuple[dict[str, float | int | None], list[dict[str, float | int | str | None]]]:
    examples: list[dict[str, float | int | str | None]] = []
    if gt is None:
        return (
            {
                "label_available": False,
                "label_coverage_ratio": None,
                "weighted_label_purity": None,
                "segments_with_labels": 0,
            },
            examples,
        )

    labelled_total = int(np.sum(gt > 0))
    majority_total = 0
    segments_with_labels = 0
    for segment_id in np.unique(segments):
        mask = segments == segment_id
        labels = gt[mask]
        labels = labels[labels > 0]
        if labels.size == 0:
            continue
        ids, counts = np.unique(labels, return_counts=True)
        best_index = int(np.argmax(counts))
        majority_id = int(ids[best_index])
        majority_count = int(counts[best_index])
        majority_total += majority_count
        segments_with_labels += 1
        if len(examples) < 12:
            examples.append(
                {
                    "segment_id": int(segment_id),
                    "pixel_count": int(np.sum(mask)),
                    "labeled_pixel_count": int(labels.size),
                    "majority_label_id": majority_id,
                    "majority_label": config.classes.get(majority_id, f"label {majority_id}"),
                    "purity": round(float(majority_count / labels.size), 4),
                }
            )

    return (
        {
            "label_available": True,
            "label_coverage_ratio": round(float(labelled_total / gt.size), 4) if gt.size else 0.0,
            "weighted_label_purity": round(float(majority_total / labelled_total), 4) if labelled_total else None,
            "segments_with_labels": segments_with_labels,
        },
        examples,
    )


def build_scene(config: SegmentationConfig) -> dict:
    cube, gt = load_scene(config)
    rows, cols, bands = cube.shape
    wavelengths = wavelengths_for_cube(config, bands)
    features = rgb_features(cube, wavelengths)
    segments = slic(
        features,
        n_segments=config.n_segments,
        compactness=config.compactness,
        start_label=1,
        channel_axis=-1,
        convert2lab=False,
        enforce_connectivity=True,
    ).astype(np.int32)
    segment_ids, segment_sizes = np.unique(segments, return_counts=True)
    metrics, examples = label_metrics(config, segments, gt)
    caveats = [
        "SLIC is used as a spatial grouping baseline and possible document generator, not as a class or material detector.",
        "This first pass uses approximate RGB bands for compactness; full hyperspectral SLIC/PCA features should be compared later.",
    ]
    if config.caveat:
        caveats.append(config.caveat)

    return {
        "scene_id": config.scene_id,
        "dataset_id": config.dataset_id,
        "scene_name": config.name,
        "family_id": config.family_id,
        "method_id": "slic-rgb-spatial-baseline",
        "feature_space": "false-color RGB feature cube from approximate 650/550/450 nm bands",
        "spatial_information_used": True,
        "supervision_used": False,
        "slic_parameters": {
            "n_segments_requested": config.n_segments,
            "compactness": config.compactness,
            "convert2lab": False,
            "enforce_connectivity": True,
        },
        "segment_count": int(segment_ids.size),
        "segment_size_pixels": size_stats(segment_sizes),
        "label_metrics": metrics,
        "segment_examples": examples,
        "preview_path": save_preview(config, segments),
        "caveats": caveats,
    }


def main() -> None:
    scenes = []
    for config in SCENES:
        cube_path = UPV_RAW_DIR / config.cube_file
        gt_path = UPV_RAW_DIR / config.gt_file if config.gt_file else None
        if not cube_path.exists() or (gt_path is not None and not gt_path.exists()):
            print(f"Skipping {config.scene_id}: raw files not found.")
            continue
        print(f"Building SLIC baseline for {config.name} ...")
        scenes.append(build_scene(config))

    payload = {
        "source": "SLIC segmentation baselines generated from local raw public HSI scenes",
        "generated_at": "2026-04-30",
        "methods": [
            {
                "id": "slic-rgb-spatial-baseline",
                "name": "SLIC false-color spatial baseline",
                "purpose": "Test whether spatially coherent superpixels are useful document boundaries before comparing topic maps or class labels.",
                "uses_spatial_information": True,
                "uses_supervision": False,
                "caveat": "The current first pass uses approximate RGB bands; it must not be interpreted as a hyperspectral material segmentation.",
            }
        ],
        "scenes": scenes,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote segmentation baseline payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
