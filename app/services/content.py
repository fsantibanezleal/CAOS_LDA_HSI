"""Load and validate static JSON content shipped with the repository."""
from __future__ import annotations

import json
from functools import lru_cache

from app.config import get_settings
from app.models.schemas import (
    AnalysisPayload,
    AppPayload,
    CorpusPreviewsPayload,
    CorpusRecipesPayload,
    DataFamiliesPayload,
    DatasetCatalog,
    DemoPayload,
    FieldScenesPayload,
    HidsagCuratedSubsetPayload,
    HidsagBandQualityPayload,
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
def get_data_families() -> DataFamiliesPayload:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "data_families.json"))
    return DataFamiliesPayload.model_validate(data)


@lru_cache
def get_corpus_recipes() -> CorpusRecipesPayload:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "corpus_recipes.json"))
    return CorpusRecipesPayload.model_validate(data)


@lru_cache
def get_interactive_subsets() -> InteractiveSubsetsPayload:
    settings = get_settings()
    data = _load_json(str(settings.manifests_path / "interactive_subsets.json"))
    return InteractiveSubsetsPayload.model_validate(data)


@lru_cache
def get_corpus_previews() -> CorpusPreviewsPayload:
    settings = get_settings()
    data = _load_json(str(settings.corpus_previews_path))
    return CorpusPreviewsPayload.model_validate(data)


@lru_cache
def get_segmentation_baselines() -> SegmentationBaselinesPayload:
    settings = get_settings()
    data = _load_json(str(settings.segmentation_baselines_path))
    return SegmentationBaselinesPayload.model_validate(data)


@lru_cache
def get_local_validation_matrix() -> LocalValidationMatrixPayload:
    settings = get_settings()
    data = _load_json(str(settings.local_validation_matrix_path))
    return LocalValidationMatrixPayload.model_validate(data)


@lru_cache
def get_local_dataset_inventory() -> LocalDatasetInventoryPayload:
    settings = get_settings()
    data = _load_json(str(settings.local_dataset_inventory_path))
    return LocalDatasetInventoryPayload.model_validate(data)


@lru_cache
def get_local_core_benchmarks() -> LocalCoreBenchmarksPayload:
    settings = get_settings()
    data = _load_json(str(settings.local_core_benchmarks_path))
    return LocalCoreBenchmarksPayload.model_validate(data)


@lru_cache
def get_hidsag_subset_inventory() -> HidsagSubsetInventoryPayload:
    settings = get_settings()
    data = _load_json(str(settings.hidsag_subset_inventory_path))
    return HidsagSubsetInventoryPayload.model_validate(data)


@lru_cache
def get_hidsag_curated_subset() -> HidsagCuratedSubsetPayload:
    settings = get_settings()
    data = _load_json(str(settings.hidsag_curated_subset_path))
    return HidsagCuratedSubsetPayload.model_validate(data)


@lru_cache
def get_hidsag_region_documents() -> HidsagRegionDocumentsPayload:
    settings = get_settings()
    data = _load_json(str(settings.hidsag_region_documents_path))
    return HidsagRegionDocumentsPayload.model_validate(data)


@lru_cache
def get_hidsag_band_quality() -> HidsagBandQualityPayload:
    settings = get_settings()
    data = _load_json(str(settings.hidsag_band_quality_path))
    return HidsagBandQualityPayload.model_validate(data)


@lru_cache
def get_hidsag_preprocessing_sensitivity() -> HidsagPreprocessingSensitivityPayload:
    settings = get_settings()
    data = _load_json(str(settings.hidsag_preprocessing_sensitivity_path))
    return HidsagPreprocessingSensitivityPayload.model_validate(data)


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
def get_subset_cards_index() -> SubsetCardsIndex:
    settings = get_settings()
    data = _load_json(str(settings.subset_cards_index_path))
    return SubsetCardsIndex.model_validate(data)


@lru_cache
def get_subset_card(subset_id: str) -> SubsetCard:
    settings = get_settings()
    data = _load_json(str(settings.subset_card_path(subset_id)))
    return SubsetCard.model_validate(data)


@lru_cache
def get_app_payload() -> AppPayload:
    return AppPayload(
        overview=get_overview(),
        datasets=get_datasets(),
        data_families=get_data_families(),
        corpus_recipes=get_corpus_recipes(),
        corpus_previews=get_corpus_previews(),
        segmentation_baselines=get_segmentation_baselines(),
        real_scenes=get_real_scenes(),
        field_samples=get_field_samples(),
        spectral_library=get_spectral_library(),
        analysis=get_analysis(),
        methodology=get_methodology(),
        demo=get_demo(),
    )
