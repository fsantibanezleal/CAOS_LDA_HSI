"""Load and validate static JSON content shipped with the repository."""
from __future__ import annotations

import json
from functools import lru_cache

from app.config import get_settings
from app.models.schemas import (
    AnalysisPayload,
    AppPayload,
    DatasetCatalog,
    DemoPayload,
    FieldScenesPayload,
    Methodology,
    ProjectOverview,
    RealScenesPayload,
    SpectralLibraryPayload,
)


def _load_json(path: str):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache
def get_overview() -> ProjectOverview:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "project.json"))
    return ProjectOverview.model_validate(data)


@lru_cache
def get_datasets() -> DatasetCatalog:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "datasets.json"))
    return DatasetCatalog.model_validate(data)


@lru_cache
def get_methodology() -> Methodology:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "methodology.json"))
    return Methodology.model_validate(data)


@lru_cache
def get_demo() -> DemoPayload:
    settings = get_settings()
    data = _load_json(str(settings.demo_path))
    return DemoPayload.model_validate(data)


@lru_cache
def get_real_scenes() -> RealScenesPayload:
    settings = get_settings()
    data = _load_json(str(settings.real_samples_path))
    return RealScenesPayload.model_validate(data)


@lru_cache
def get_field_samples() -> FieldScenesPayload:
    settings = get_settings()
    data = _load_json(str(settings.field_samples_path))
    return FieldScenesPayload.model_validate(data)


@lru_cache
def get_spectral_library() -> SpectralLibraryPayload:
    settings = get_settings()
    data = _load_json(str(settings.spectral_library_path))
    return SpectralLibraryPayload.model_validate(data)


@lru_cache
def get_analysis() -> AnalysisPayload:
    settings = get_settings()
    data = _load_json(str(settings.analysis_path))
    return AnalysisPayload.model_validate(data)


@lru_cache
def get_app_payload() -> AppPayload:
    return AppPayload(
        overview=get_overview(),
        datasets=get_datasets(),
        real_scenes=get_real_scenes(),
        field_samples=get_field_samples(),
        spectral_library=get_spectral_library(),
        analysis=get_analysis(),
        methodology=get_methodology(),
        demo=get_demo(),
    )
