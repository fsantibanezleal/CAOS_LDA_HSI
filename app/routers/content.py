"""Content API for the CAOS LDA HSI demo application."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AnalysisPayload,
    AppPayload,
    CorpusPreviewsPayload,
    CorpusRecipesPayload,
    DataFamiliesPayload,
    DatasetCatalog,
    DemoPayload,
    HidsagBandQualityPayload,
    FieldScenesPayload,
    HidsagCuratedSubsetPayload,
    HidsagPreprocessingSensitivityPayload,
    HidsagRegionDocumentsPayload,
    HidsagSubsetInventoryPayload,
    InteractiveSubsetsPayload,
    LocalCoreBenchmarksPayload,
    LocalDatasetInventoryPayload,
    LocalValidationMatrixPayload,
    Methodology,
    ProjectOverview,
    RealScenesPayload,
    SegmentationBaselinesPayload,
    SpectralLibraryPayload,
    SubsetCard,
    SubsetCardsIndex,
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
    get_hidsag_band_quality,
    get_hidsag_curated_subset,
    get_hidsag_preprocessing_sensitivity,
    get_hidsag_region_documents,
    get_hidsag_subset_inventory,
    get_interactive_subsets,
    get_local_core_benchmarks,
    get_local_dataset_inventory,
    get_local_validation_matrix,
    get_methodology,
    get_overview,
    get_real_scenes,
    get_segmentation_baselines,
    get_spectral_library,
    get_subset_card,
    get_subset_cards_index,
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


@router.get("/interactive-subsets", response_model=InteractiveSubsetsPayload)
def interactive_subsets() -> InteractiveSubsetsPayload:
    return get_interactive_subsets()


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


@router.get("/hidsag-subset-inventory", response_model=HidsagSubsetInventoryPayload)
def hidsag_subset_inventory() -> HidsagSubsetInventoryPayload:
    return get_hidsag_subset_inventory()


@router.get("/hidsag-curated-subset", response_model=HidsagCuratedSubsetPayload)
def hidsag_curated_subset() -> HidsagCuratedSubsetPayload:
    return get_hidsag_curated_subset()


@router.get("/hidsag-region-documents", response_model=HidsagRegionDocumentsPayload)
def hidsag_region_documents() -> HidsagRegionDocumentsPayload:
    return get_hidsag_region_documents()


@router.get("/hidsag-band-quality", response_model=HidsagBandQualityPayload)
def hidsag_band_quality() -> HidsagBandQualityPayload:
    return get_hidsag_band_quality()


@router.get("/hidsag-preprocessing-sensitivity", response_model=HidsagPreprocessingSensitivityPayload)
def hidsag_preprocessing_sensitivity() -> HidsagPreprocessingSensitivityPayload:
    return get_hidsag_preprocessing_sensitivity()


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


@router.get("/subset-cards", response_model=SubsetCardsIndex)
def subset_cards_index() -> SubsetCardsIndex:
    try:
        return get_subset_cards_index()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="subset cards index not generated yet; run scripts/local.* build-subset-cards",
        ) from exc


@router.get("/subset-cards/{subset_id}", response_model=SubsetCard)
def subset_card(subset_id: str) -> SubsetCard:
    try:
        return get_subset_card(subset_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"subset card '{subset_id}' not generated yet; run scripts/local.* build-subset-cards",
        ) from exc


@router.get("/app-data", response_model=AppPayload)
def app_data() -> AppPayload:
    return get_app_payload()
