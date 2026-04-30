"""Content API for the CAOS LDA HSI demo application."""
from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import (
    AppPayload,
    DatasetCatalog,
    DemoPayload,
    FieldScenesPayload,
    Methodology,
    ProjectOverview,
    RealScenesPayload,
    SpectralLibraryPayload,
)
from app.services.content import (
    get_app_payload,
    get_datasets,
    get_demo,
    get_field_samples,
    get_methodology,
    get_overview,
    get_real_scenes,
    get_spectral_library,
)


router = APIRouter(prefix="/api", tags=["content"])


@router.get("/overview", response_model=ProjectOverview)
def overview() -> ProjectOverview:
    return get_overview()


@router.get("/datasets", response_model=DatasetCatalog)
def datasets() -> DatasetCatalog:
    return get_datasets()


@router.get("/methodology", response_model=Methodology)
def methodology() -> Methodology:
    return get_methodology()


@router.get("/real-scenes", response_model=RealScenesPayload)
def real_scenes() -> RealScenesPayload:
    return get_real_scenes()


@router.get("/field-samples", response_model=FieldScenesPayload)
def field_samples() -> FieldScenesPayload:
    return get_field_samples()


@router.get("/spectral-library", response_model=SpectralLibraryPayload)
def spectral_library() -> SpectralLibraryPayload:
    return get_spectral_library()


@router.get("/demo", response_model=DemoPayload)
def demo() -> DemoPayload:
    return get_demo()


@router.get("/app-data", response_model=AppPayload)
def app_data() -> AppPayload:
    return get_app_payload()
