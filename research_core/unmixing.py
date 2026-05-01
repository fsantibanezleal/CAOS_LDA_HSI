"""Load local unmixing ROIs and their scene-specific spectral libraries."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.io import loadmat

from research_core.paths import RAW_DIR


UNMIXING_RAW_DIR = RAW_DIR / "borsoi_mua"


@dataclass(frozen=True)
class UnmixingSceneConfig:
    dataset_id: str
    name: str
    scene_file: str
    scene_key: str
    library_file: str
    band_min_nm: float
    band_max_nm: float
    sensor: str


SCENES = {
    "samson-unmixing-roi": UnmixingSceneConfig(
        dataset_id="samson-unmixing-roi",
        name="Samson unmixing ROI",
        scene_file="samson_1.mat",
        scene_key="V",
        library_file="spectral_library_samson.mat",
        band_min_nm=401.0,
        band_max_nm=889.0,
        sensor="Samson HSI",
    ),
    "jasper-ridge-unmixing-roi": UnmixingSceneConfig(
        dataset_id="jasper-ridge-unmixing-roi",
        name="Jasper Ridge unmixing ROI",
        scene_file="jasperRidge2_R198.mat",
        scene_key="Y",
        library_file="spectral_library_jasperRidge.mat",
        band_min_nm=380.0,
        band_max_nm=2500.0,
        sensor="AVIRIS subset",
    ),
    "urban-unmixing-roi": UnmixingSceneConfig(
        dataset_id="urban-unmixing-roi",
        name="Urban HYDICE unmixing ROI",
        scene_file="Urban_R162.mat",
        scene_key="Y",
        library_file="spectral_library_urban.mat",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="HYDICE",
    ),
}


def _scalar(mat: dict, key: str) -> int:
    return int(np.asarray(mat[key]).squeeze())


def _extract_material_names(mat: dict) -> list[str]:
    names = []
    for raw_name in np.asarray(mat["material_names"]).ravel():
        value = raw_name
        if isinstance(value, np.ndarray):
            value = value.item()
        names.append(str(value))
    return names


def _library_group_keys(mat: dict) -> list[str]:
    return sorted(
        (key for key in mat.keys() if key.startswith("lib")),
        key=lambda value: int(value.replace("lib", "")),
    )


def approximate_wavelengths(config: UnmixingSceneConfig, band_count: int) -> np.ndarray:
    return np.linspace(config.band_min_nm, config.band_max_nm, band_count, dtype=np.float32)


def get_scene_config(dataset_id: str) -> UnmixingSceneConfig:
    return SCENES[dataset_id]


def load_unmixing_scene(dataset_id: str) -> tuple[np.ndarray, np.ndarray, list[str], UnmixingSceneConfig]:
    config = get_scene_config(dataset_id)
    scene_mat = loadmat(UNMIXING_RAW_DIR / config.scene_file)
    library_mat = loadmat(UNMIXING_RAW_DIR / config.library_file)

    spectra = np.asarray(scene_mat[config.scene_key], dtype=np.float32).T
    if "maxValue" in scene_mat:
        max_value = float(np.asarray(scene_mat["maxValue"]).squeeze())
        if max_value > 0:
            spectra = spectra / max_value

    library_matrix = np.asarray(library_mat["A"], dtype=np.float32).T
    material_names = _extract_material_names(library_mat)

    return spectra, library_matrix, material_names, config


def load_unmixing_reference_groups(dataset_id: str) -> tuple[list[str], list[np.ndarray], UnmixingSceneConfig]:
    config = get_scene_config(dataset_id)
    library_mat = loadmat(UNMIXING_RAW_DIR / config.library_file)
    material_names = _extract_material_names(library_mat)
    group_keys = _library_group_keys(library_mat)
    groups = [np.asarray(library_mat[key], dtype=np.float32).T for key in group_keys]
    return material_names, groups, config


def load_unmixing_cube_shape(dataset_id: str) -> tuple[int, int, int]:
    config = get_scene_config(dataset_id)
    scene_mat = loadmat(UNMIXING_RAW_DIR / config.scene_file)
    rows = _scalar(scene_mat, "nRow")
    cols = _scalar(scene_mat, "nCol")
    bands = _scalar(scene_mat, "nBand")
    return rows, cols, bands
