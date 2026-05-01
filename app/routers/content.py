"""Content API for the CAOS LDA HSI demo application."""
from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import (
    AnalysisPayload,
    AppPayload,
    CorpusPreviewsPayload,
    CorpusRecipesPayload,
    DataFamiliesPayload,
    DatasetCatalog,
    DemoPayload,
    FieldScenesPayload,
    LocalCoreBenchmarksPayload,
    LocalDatasetInventoryPayload,
    LocalValidationMatrixPayload,
    Methodology,
    ProjectOverview,
    RealScenesPayload,
    SegmentationBaselinesPayload,
    SpectralLibraryPayload,
)
from app.services.content import (
    get_analysis,
    get_app_payload,
    get_corpus_previews,
    get_corpus_recipes,
    get_data_families,
    get_datasets,
    get_demo,
    get_field_samples,
    get_local_core_benchmarks,
    get_local_dataset_inventory,
    get_local_validation_matrix,
    get_methodology,
    get_overview,
    get_real_scenes,
    get_segmentation_baselines,
    get_spectral_library,
)


router = APIRouter(prefix="/api", tags=["content"])


@router.get("/overview", response_model=ProjectOverview)
def overview() -> ProjectOverview:
    return get_overview()


@router.get("/datasets", response_model=DatasetCatalog)
def datasets() -> DatasetCatalog:
    return get_datasets()


@router.get("/data-families", response_model=DataFamiliesPayload)
def data_families() -> DataFamiliesPayload:
    return get_data_families()


@router.get("/corpus-recipes", response_model=CorpusRecipesPayload)
def corpus_recipes() -> CorpusRecipesPayload:
    return get_corpus_recipes()


@router.get("/corpus-previews", response_model=CorpusPreviewsPayload)
def corpus_previews() -> CorpusPreviewsPayload:
    return get_corpus_previews()


@router.get("/segmentation-baselines", response_model=SegmentationBaselinesPayload)
def segmentation_baselines() -> SegmentationBaselinesPayload:
    return get_segmentation_baselines()


@router.get("/local-validation-matrix", response_model=LocalValidationMatrixPayload)
def local_validation_matrix() -> LocalValidationMatrixPayload:
    return get_local_validation_matrix()


@router.get("/local-dataset-inventory", response_model=LocalDatasetInventoryPayload)
def local_dataset_inventory() -> LocalDatasetInventoryPayload:
    return get_local_dataset_inventory()


@router.get("/local-core-benchmarks", response_model=LocalCoreBenchmarksPayload)
def local_core_benchmarks() -> LocalCoreBenchmarksPayload:
    return get_local_core_benchmarks()


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


@router.get("/analysis", response_model=AnalysisPayload)
def analysis() -> AnalysisPayload:
    return get_analysis()


@router.get("/demo", response_model=DemoPayload)
def demo() -> DemoPayload:
    return get_demo()


@router.get("/app-data", response_model=AppPayload)
def app_data() -> AppPayload:
    return get_app_payload()
