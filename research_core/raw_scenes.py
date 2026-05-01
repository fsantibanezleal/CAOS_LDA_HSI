"""Load local raw HSI scenes for offline validation experiments."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.io import loadmat

from research_core.paths import RAW_DIR


UPV_RAW_DIR = RAW_DIR / "upv_ehu"


@dataclass(frozen=True)
class RawSceneConfig:
    dataset_id: str
    name: str
    cube_file: str
    cube_key: str
    band_min_nm: float
    band_max_nm: float
    sensor: str
    family_id: str
    gt_file: str | None = None
    gt_key: str | None = None


SCENES = {
    "indian-pines-corrected": RawSceneConfig(
        dataset_id="indian-pines-corrected",
        name="Indian Pines corrected",
        cube_file="Indian_pines_corrected.mat",
        cube_key="indian_pines_corrected",
        gt_file="Indian_pines_gt.mat",
        gt_key="indian_pines_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="AVIRIS",
        family_id="labeled-spectral-image",
    ),
    "salinas-corrected": RawSceneConfig(
        dataset_id="salinas-corrected",
        name="Salinas corrected",
        cube_file="Salinas_corrected.mat",
        cube_key="salinas_corrected",
        gt_file="Salinas_gt.mat",
        gt_key="salinas_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="AVIRIS",
        family_id="labeled-spectral-image",
    ),
    "salinas-a-corrected": RawSceneConfig(
        dataset_id="salinas-a-corrected",
        name="Salinas-A corrected",
        cube_file="SalinasA_corrected.mat",
        cube_key="salinasA_corrected",
        gt_file="SalinasA_gt.mat",
        gt_key="salinasA_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="AVIRIS",
        family_id="labeled-spectral-image",
    ),
    "pavia-university": RawSceneConfig(
        dataset_id="pavia-university",
        name="Pavia University",
        cube_file="PaviaU.mat",
        cube_key="paviaU",
        gt_file="PaviaU_gt.mat",
        gt_key="paviaU_gt",
        band_min_nm=430.0,
        band_max_nm=860.0,
        sensor="ROSIS",
        family_id="labeled-spectral-image",
    ),
    "kennedy-space-center": RawSceneConfig(
        dataset_id="kennedy-space-center",
        name="Kennedy Space Center",
        cube_file="KSC.mat",
        cube_key="KSC",
        gt_file="KSC_gt.mat",
        gt_key="KSC_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="AVIRIS",
        family_id="labeled-spectral-image",
    ),
    "botswana": RawSceneConfig(
        dataset_id="botswana",
        name="Botswana",
        cube_file="Botswana.mat",
        cube_key="Botswana",
        gt_file="Botswana_gt.mat",
        gt_key="Botswana_gt",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="Hyperion",
        family_id="labeled-spectral-image",
    ),
    "cuprite-upv-reflectance": RawSceneConfig(
        dataset_id="cuprite-upv-reflectance",
        name="Cuprite reflectance",
        cube_file="Cuprite_f970619t01p02_r02_sc03.a.rfl.mat",
        cube_key="X",
        band_min_nm=400.0,
        band_max_nm=2500.0,
        sensor="AVIRIS",
        family_id="unlabeled-spectral-image",
    ),
}


def get_scene_config(dataset_id: str) -> RawSceneConfig:
    return SCENES[dataset_id]


def load_scene(dataset_id: str) -> tuple[np.ndarray, np.ndarray | None, RawSceneConfig]:
    config = get_scene_config(dataset_id)
    cube = loadmat(UPV_RAW_DIR / config.cube_file)[config.cube_key].astype(np.float32)
    gt = None
    if config.gt_file and config.gt_key:
        gt = loadmat(UPV_RAW_DIR / config.gt_file)[config.gt_key].astype(np.int32)
    return cube, gt, config


def approximate_wavelengths(config: RawSceneConfig, band_count: int) -> np.ndarray:
    return np.linspace(config.band_min_nm, config.band_max_nm, band_count, dtype=np.float32)


def valid_spectra_mask(flat_cube: np.ndarray) -> np.ndarray:
    finite = np.isfinite(flat_cube).all(axis=1)
    dynamic = np.nanmax(flat_cube, axis=1) > np.nanmin(flat_cube, axis=1)
    return finite & dynamic


def stratified_sample_indices(labels: np.ndarray, per_class: int, random_state: int = 42) -> np.ndarray:
    rng = np.random.default_rng(random_state)
    chosen = []
    for label_value in sorted(int(value) for value in np.unique(labels)):
        label_indices = np.flatnonzero(labels == label_value)
        if label_indices.size == 0:
            continue
        take = min(per_class, int(label_indices.size))
        chosen.append(rng.choice(label_indices, size=take, replace=False))
    return np.concatenate(chosen) if chosen else np.array([], dtype=np.int64)
