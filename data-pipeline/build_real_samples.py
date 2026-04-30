"""Create compact derived assets from downloaded public HSI scenes.

The web app should not load raw cubes directly. This pipeline converts public
raw scenes into small JSON summaries and preview images that preserve the
methodological point: spectra are treated as documents, and recurring spectral
regimes are treated as topics or topic-like strata.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image
from scipy.io import loadmat
from sklearn.decomposition import LatentDirichletAllocation


ROOT = Path(__file__).resolve().parents[1]
UPV_RAW_DIR = ROOT / "data" / "raw" / "upv_ehu"
UNMIXING_RAW_DIR = ROOT / "data" / "raw" / "borsoi_mua"
OUTPUT_DIR = ROOT / "data" / "derived" / "real"
PREVIEW_DIR = OUTPUT_DIR / "previews"
OUTPUT_PATH = OUTPUT_DIR / "real_samples.json"

LABEL_COLORS = [
    (0, 0, 0),
    (56, 118, 196),
    (6, 182, 212),
    (132, 204, 22),
    (245, 158, 11),
    (239, 68, 68),
    (168, 85, 247),
    (20, 184, 166),
    (99, 102, 241),
    (217, 119, 6),
    (14, 165, 233),
    (34, 197, 94),
    (236, 72, 153),
    (100, 116, 139),
    (234, 179, 8),
    (248, 113, 113),
    (45, 212, 191),
]


@dataclass(frozen=True)
class SceneConfig:
    id: str
    name: str
    source_url: str
    sensor: str
    modality: str
    raw_dir: Path
    cube_file: str
    cube_key: str
    band_min_nm: float
    band_max_nm: float
    gt_file: str | None = None
    gt_key: str | None = None
    classes: dict[int, str] = field(default_factory=dict)
    cube_layout: Literal["rows_cols_bands", "bands_pixels"] = "rows_cols_bands"
    rows_key: str | None = None
    cols_key: str | None = None
    max_value_key: str | None = None
    support_files: tuple[str, ...] = ()
    n_topics: int = 4
    sample_per_class: int = 120
    unlabeled_sample_limit: int = 3500
    notes: str = ""


SCENES = [
    SceneConfig(
        id="indian-pines-corrected",
        name="Indian Pines corrected",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        raw_dir=UPV_RAW_DIR,
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
        id="salinas-corrected",
        name="Salinas corrected",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        raw_dir=UPV_RAW_DIR,
        cube_file="Salinas_corrected.mat",
        cube_key="salinas_corrected",
        gt_file="Salinas_gt.mat",
        gt_key="salinas_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        classes={
            1: "Brocoli_green_weeds_1",
            2: "Brocoli_green_weeds_2",
            3: "Fallow",
            4: "Fallow_rough_plow",
            5: "Fallow_smooth",
            6: "Stubble",
            7: "Celery",
            8: "Grapes_untrained",
            9: "Soil_vinyard_develop",
            10: "Corn_senesced_green_weeds",
            11: "Lettuce_romaine_4wk",
            12: "Lettuce_romaine_5wk",
            13: "Lettuce_romaine_6wk",
            14: "Lettuce_romaine_7wk",
            15: "Vinyard_untrained",
            16: "Vinyard_vertical_trellis",
        },
        sample_per_class=90,
    ),
    SceneConfig(
        id="salinas-a-corrected",
        name="Salinas-A corrected",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI scene",
        raw_dir=UPV_RAW_DIR,
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
        id="cuprite-aviris-reflectance",
        name="Cuprite AVIRIS reflectance",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="AVIRIS",
        modality="HSI mineral scene",
        raw_dir=UPV_RAW_DIR,
        cube_file="Cuprite_f970619t01p02_r02_sc03.a.rfl.mat",
        cube_key="X",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        n_topics=6,
        unlabeled_sample_limit=4500,
        notes="No ground-truth map is bundled with the public EHU MATLAB file; the label preview is an inferred topic-stratum map.",
    ),
    SceneConfig(
        id="pavia-university",
        name="Pavia University",
        source_url="https://www.ehu.eus/ccwintco/index.php/Hyperspectral_Remote_Sensing_Scenes",
        sensor="ROSIS",
        modality="HSI urban scene",
        raw_dir=UPV_RAW_DIR,
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
        modality="HSI wetland scene",
        raw_dir=UPV_RAW_DIR,
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
        modality="HSI wetland scene",
        raw_dir=UPV_RAW_DIR,
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
    SceneConfig(
        id="samson-unmixing-roi",
        name="Samson unmixing ROI",
        source_url="https://github.com/ricardoborsoi/MUA_SparseUnmixing/tree/master/real_data",
        sensor="Samson HSI",
        modality="HSI unmixing ROI",
        raw_dir=UNMIXING_RAW_DIR,
        cube_file="samson_1.mat",
        cube_key="V",
        cube_layout="bands_pixels",
        rows_key="nRow",
        cols_key="nCol",
        band_min_nm=401.0,
        band_max_nm=889.0,
        support_files=("spectral_library_samson.mat",),
        notes="The public ROI is treated as unlabeled; spectral-library files are retained for later material-reference workflows.",
    ),
    SceneConfig(
        id="jasper-ridge-unmixing-roi",
        name="Jasper Ridge unmixing ROI",
        source_url="https://github.com/ricardoborsoi/MUA_SparseUnmixing/tree/master/real_data",
        sensor="AVIRIS subset",
        modality="HSI unmixing ROI",
        raw_dir=UNMIXING_RAW_DIR,
        cube_file="jasperRidge2_R198.mat",
        cube_key="Y",
        cube_layout="bands_pixels",
        rows_key="nRow",
        cols_key="nCol",
        max_value_key="maxValue",
        band_min_nm=380.0,
        band_max_nm=2500.0,
        support_files=("spectral_library_jasperRidge.mat",),
        notes="The public ROI is treated as unlabeled; the label preview is an inferred topic-stratum map.",
    ),
    SceneConfig(
        id="urban-unmixing-roi",
        name="Urban HYDICE unmixing ROI",
        source_url="https://github.com/ricardoborsoi/MUA_SparseUnmixing/tree/master/real_data",
        sensor="HYDICE",
        modality="HSI unmixing ROI",
        raw_dir=UNMIXING_RAW_DIR,
        cube_file="Urban_R162.mat",
        cube_key="Y",
        cube_layout="bands_pixels",
        rows_key="nRow",
        cols_key="nCol",
        max_value_key="maxValue",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        support_files=("spectral_library_urban.mat",),
        n_topics=6,
        notes="The public ROI is treated as unlabeled; the label preview is an inferred topic-stratum map.",
    ),
]


def normalize01(values: np.ndarray) -> np.ndarray:
    values = values.astype(np.float32)
    low = float(np.nanmin(values))
    high = float(np.nanmax(values))
    denom = high - low if high > low else 1.0
    return (values - low) / denom


def quantize_spectra(spectra: np.ndarray, levels: int = 16) -> np.ndarray:
    scaled = normalize01(spectra)
    return np.clip(np.rint(scaled * (levels - 1)), 0, levels - 1).astype(np.int32)


def fit_scene_topics(doc_term: np.ndarray, n_topics: int) -> tuple[np.ndarray, LatentDirichletAllocation]:
    lda = LatentDirichletAllocation(
        n_components=n_topics,
        learning_method="online",
        max_iter=45,
        batch_size=512,
        evaluate_every=-1,
        random_state=42,
        doc_topic_prior=0.45,
        topic_word_prior=0.2,
    )
    doc_topic = lda.fit_transform(doc_term)
    return doc_topic, lda


def _scalar(mat: dict, key: str | None) -> int:
    if not key:
        raise ValueError("Missing MATLAB scalar key.")
    value = mat[key]
    return int(np.asarray(value).squeeze())


def load_scene(config: SceneConfig) -> tuple[np.ndarray, np.ndarray | None]:
    cube_mat = loadmat(config.raw_dir / config.cube_file)
    raw_cube = cube_mat[config.cube_key].astype(np.float32)

    if config.cube_layout == "bands_pixels":
        rows = _scalar(cube_mat, config.rows_key)
        cols = _scalar(cube_mat, config.cols_key)
        bands = raw_cube.shape[0]
        cube = raw_cube.T.reshape(rows, cols, bands)
        if config.max_value_key and config.max_value_key in cube_mat:
            max_value = float(np.asarray(cube_mat[config.max_value_key]).squeeze())
            if max_value > 0:
                cube = cube / max_value
    else:
        cube = raw_cube

    gt = None
    if config.gt_file and config.gt_key:
        gt = loadmat(config.raw_dir / config.gt_file)[config.gt_key].astype(np.int32)
    return cube.astype(np.float32), gt


def top_band_tokens(weights: np.ndarray, wavelengths: np.ndarray, top_n: int = 8) -> list[dict[str, float | str]]:
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
    low = np.nanpercentile(rgb, 2, axis=(0, 1))
    high = np.nanpercentile(rgb, 98, axis=(0, 1))
    scaled = np.clip((rgb - low) / np.maximum(high - low, 1e-6), 0, 1)
    image = (scaled * 255).astype(np.uint8)
    path = PREVIEW_DIR / f"{scene_id}-rgb.png"
    save_preview(image, path, nearest=False)
    return f"/generated/real/previews/{path.name}"


def colorize_label_map(label_map: np.ndarray) -> np.ndarray:
    image = np.zeros((label_map.shape[0], label_map.shape[1], 3), dtype=np.uint8)
    for label_id in np.unique(label_map):
        color = LABEL_COLORS[int(label_id) % len(LABEL_COLORS)]
        image[label_map == label_id] = color
    return image


def build_label_preview(scene_id: str, label_map: np.ndarray) -> str:
    path = PREVIEW_DIR / f"{scene_id}-labels.png"
    save_preview(colorize_label_map(label_map), path, nearest=True)
    return f"/generated/real/previews/{path.name}"


def valid_spectra_mask(flat_cube: np.ndarray) -> np.ndarray:
    finite = np.isfinite(flat_cube).all(axis=1)
    dynamic = np.nanmax(flat_cube, axis=1) > np.nanmin(flat_cube, axis=1)
    return finite & dynamic


def sampled_indices_for_labeled(labels: np.ndarray, classes: dict[int, str], sample_per_class: int) -> np.ndarray:
    rng = np.random.default_rng(42)
    sample_indices = []
    for label_value in sorted(classes):
        label_positions = np.flatnonzero(labels == label_value)
        if label_positions.size == 0:
            continue
        take = min(sample_per_class, int(label_positions.size))
        sample_indices.append(rng.choice(label_positions, size=take, replace=False))
    return np.concatenate(sample_indices) if sample_indices else np.arange(min(500, labels.shape[0]))


def sampled_indices_for_unlabeled(count: int, sample_limit: int) -> np.ndarray:
    rng = np.random.default_rng(42)
    take = min(sample_limit, count)
    return rng.choice(np.arange(count), size=take, replace=False)


def infer_topic_map(
    topic_components: np.ndarray,
    quantized: np.ndarray,
    valid_flat_indices: np.ndarray,
    rows: int,
    cols: int,
    chunk_size: int = 25000,
) -> tuple[np.ndarray, np.ndarray]:
    component_norms = np.linalg.norm(topic_components, axis=1, keepdims=True)
    normalized_components = topic_components / np.maximum(component_norms, 1e-6)
    topic_labels = np.zeros(valid_flat_indices.shape[0], dtype=np.int32)
    for start in range(0, quantized.shape[0], chunk_size):
        end = min(start + chunk_size, quantized.shape[0])
        chunk = quantized[start:end].astype(np.float32)
        chunk_norms = np.linalg.norm(chunk, axis=1, keepdims=True)
        normalized_chunk = chunk / np.maximum(chunk_norms, 1e-6)
        topic_labels[start:end] = (normalized_chunk @ normalized_components.T).argmax(axis=1) + 1

    label_map = np.zeros(rows * cols, dtype=np.int32)
    label_map[valid_flat_indices] = topic_labels
    return label_map.reshape(rows, cols), topic_labels


def local_raw_files(config: SceneConfig) -> list[dict[str, int | str]]:
    names = [config.cube_file, *config.support_files]
    if config.gt_file:
        names.append(config.gt_file)
    files = []
    for name in names:
        path = config.raw_dir / name
        if path.exists():
            files.append({"name": name, "size_bytes": path.stat().st_size})
    return files


def build_scene_payload(config: SceneConfig) -> dict:
    cube, gt = load_scene(config)
    rows, cols, bands = cube.shape
    wavelengths = np.linspace(config.band_min_nm, config.band_max_nm, bands, dtype=np.float32)
    flat_cube = cube.reshape(-1, bands)

    finite_mask = valid_spectra_mask(flat_cube)
    if gt is not None:
        flat_gt = gt.reshape(-1)
        valid_mask = finite_mask & (flat_gt > 0)
        spectra = flat_cube[valid_mask]
        labels = flat_gt[valid_mask]
        valid_flat_indices = np.flatnonzero(valid_mask)
        sampled_positions = sampled_indices_for_labeled(labels, config.classes, config.sample_per_class)
        label_preview_path = build_label_preview(config.id, gt)
        label_coverage_ratio = round(float(valid_mask.mean()), 4)
    else:
        valid_mask = finite_mask
        spectra = flat_cube[valid_mask]
        labels = np.zeros(spectra.shape[0], dtype=np.int32)
        valid_flat_indices = np.flatnonzero(valid_mask)
        sampled_positions = sampled_indices_for_unlabeled(spectra.shape[0], config.unlabeled_sample_limit)
        label_preview_path = None
        label_coverage_ratio = None

    if spectra.shape[0] == 0:
        raise RuntimeError(f"{config.id} has no valid spectra after masking.")

    quantized = quantize_spectra(spectra, levels=16)
    sampled_spectra = spectra[sampled_positions]
    sampled_quantized = quantized[sampled_positions]
    sampled_labels = labels[sampled_positions]

    doc_topic, lda = fit_scene_topics(sampled_quantized, n_topics=config.n_topics)
    topic_components = lda.components_

    if gt is None:
        inferred_label_map, inferred_topic_labels = infer_topic_map(topic_components, quantized, valid_flat_indices, rows, cols)
        label_preview_path = build_label_preview(config.id, inferred_label_map)
        sampled_labels = doc_topic.argmax(axis=1) + 1
        topic_counts = np.bincount(inferred_topic_labels, minlength=config.n_topics + 1)[1:]
    else:
        topic_counts = np.zeros(config.n_topics, dtype=np.int32)

    classes_payload = []
    example_documents = []
    if gt is not None:
        for label_value, class_name in config.classes.items():
            class_mask = labels == label_value
            if not np.any(class_mask):
                continue
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
                    "mean_spectrum": [round(float(value), 4) for value in normalize01(spectra[class_mask].mean(axis=0))],
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
    else:
        for topic_index in range(config.n_topics):
            label_value = topic_index + 1
            sampled_topic_mask = sampled_labels == label_value
            if not np.any(sampled_topic_mask):
                continue
            class_name = f"Inferred spectral stratum {label_value}"
            classes_payload.append(
                {
                    "label_id": int(label_value),
                    "name": class_name,
                    "count": int(topic_counts[topic_index]),
                    "mean_spectrum": [round(float(value), 4) for value in normalize01(sampled_spectra[sampled_topic_mask].mean(axis=0))],
                    "mean_topic_mixture": [round(float(value), 4) for value in doc_topic[sampled_topic_mask].mean(axis=0)],
                }
            )
            example_index = int(np.flatnonzero(sampled_topic_mask)[0])
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

    notes = [
        "Band centers are approximated from the nominal sensor range for visualization.",
        "RGB previews are built from the nearest approximate visible bands.",
    ]
    if gt is None:
        notes.append("The label preview is an inferred topic-stratum map, not an official ground-truth map.")
    else:
        notes.append("Label previews come from the official ground-truth maps bundled with the scene.")
    if config.notes:
        notes.append(config.notes)

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
        "example_documents": example_documents[:10],
        "local_raw_files": local_raw_files(config),
        "rgb_preview_path": build_rgb_preview(config.id, cube, wavelengths),
        "label_preview_path": label_preview_path,
        "label_coverage_ratio": label_coverage_ratio,
        "notes": " ".join(notes),
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    scenes = []
    for config in SCENES:
        cube_path = config.raw_dir / config.cube_file
        gt_path = config.raw_dir / config.gt_file if config.gt_file else None
        if not cube_path.exists() or (gt_path is not None and not gt_path.exists()):
            print(f"Skipping {config.id}: raw files not found.")
            continue
        print(f"Building compact asset for {config.name} ...")
        scenes.append(build_scene_payload(config))

    payload = {
        "source": "Official UPV/EHU scenes and compact public unmixing scenes",
        "scenes": scenes,
    }
    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    print(f"Wrote derived real-scene payload to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
