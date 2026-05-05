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
    ExplorationViewsPayload,
    MethodStatisticsPayload,
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
def get_exploration_views() -> ExplorationViewsPayload:
    settings = get_settings()
    data = _load_json(str(settings.exploration_views_path))
    return ExplorationViewsPayload.model_validate(data)


@lru_cache
def get_method_statistics() -> MethodStatisticsPayload:
    settings = get_settings()
    data = _load_json(str(settings.method_statistics_path))
    return MethodStatisticsPayload.model_validate(data)


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


# ============================================================================
# Master-plan §18 precompute layer — generic JSON loaders for the new derived
# files. Returns plain dicts because the schemas are large and the frontend
# already declares its own TypeScript types.
# ============================================================================


def _load_or_404(path) -> dict:
    if not path.exists():
        raise FileNotFoundError(str(path))
    return _load_json(str(path))


def get_eda_per_scene(scene_id: str) -> dict:
    return _load_or_404(get_settings().eda_per_scene_path(scene_id))


def get_topic_views(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_views_path(scene_id))


def get_topic_to_data(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_to_data_path(scene_id))


def get_spectral_browser_metadata(scene_id: str) -> dict:
    return _load_or_404(get_settings().spectral_browser_metadata_path(scene_id))


def get_spectral_density_manifest(scene_id: str) -> dict:
    return _load_or_404(get_settings().spectral_density_manifest_path(scene_id))


def get_validation_blocks(scene_id: str) -> dict:
    return _load_or_404(get_settings().validation_blocks_path(scene_id))


def get_derived_manifest() -> dict:
    return _load_or_404(get_settings().derived_manifest_path)


def get_eda_hidsag(subset_code: str) -> dict:
    return _load_or_404(get_settings().eda_hidsag_path(subset_code))


def get_topic_to_library(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_to_library_path(scene_id))


def get_spatial_validation(scene_id: str) -> dict:
    return _load_or_404(get_settings().spatial_validation_path(scene_id))


def get_wordification(scene_id: str, recipe: str, scheme: str, q: int) -> dict:
    return _load_or_404(get_settings().wordification_path(scene_id, recipe, scheme, q))


def get_wordifications_index() -> dict:
    """Walk the wordifications directory and return an index of available
    (scene, recipe, scheme, Q) configurations."""
    base = get_settings().wordifications_dir
    if not base.exists():
        raise FileNotFoundError(str(base))
    items = []
    for path in sorted(base.glob("*.json")):
        stem = path.stem  # scene_id_RECIPE_scheme_Qn
        items.append({
            "id": stem,
            "path": str(path.relative_to(get_settings().data_path.parent)).replace("\\", "/"),
            "bytes": path.stat().st_size,
        })
    return {"count": len(items), "items": items}


def get_grouping(method: str, scene_id: str) -> dict:
    return _load_or_404(get_settings().grouping_path(method, scene_id))


def get_groupings_index() -> dict:
    base = get_settings().groupings_dir
    if not base.exists():
        raise FileNotFoundError(str(base))
    items = []
    for method_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        for path in sorted(method_dir.glob("*.json")):
            items.append({
                "method": method_dir.name,
                "scene_id": path.stem,
                "path": str(path.relative_to(get_settings().data_path.parent)).replace("\\", "/"),
                "bytes": path.stat().st_size,
            })
    return {"count": len(items), "items": items}


def get_cross_method_agreement(scene_id: str) -> dict:
    return _load_or_404(get_settings().cross_method_agreement_path(scene_id))


def get_method_statistics_hidsag(subset_code: str) -> dict:
    return _load_or_404(get_settings().method_statistics_hidsag_path(subset_code))


def get_external_validation_literature(scene_id: str) -> dict:
    return _load_or_404(get_settings().external_validation_literature_path(scene_id))


def get_external_validation_hidsag_methods(subset_code: str) -> dict:
    return _load_or_404(get_settings().external_validation_hidsag_methods_path(subset_code))


def get_narratives(scene_id: str) -> dict:
    return _load_or_404(get_settings().narratives_path(scene_id))


def get_interpretability(scene_id: str, card_type: str) -> dict:
    return _load_or_404(get_settings().interpretability_path(scene_id, card_type))


def get_quantization_sensitivity(scene_id: str) -> dict:
    return _load_or_404(get_settings().quantization_sensitivity_path(scene_id))


def get_topic_variant(variant: str, scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_variant_path(variant, scene_id))


def get_topic_variants_index() -> dict:
    base = get_settings().topic_variants_dir
    if not base.exists():
        raise FileNotFoundError(str(base))
    items = []
    for variant_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        for path in sorted(variant_dir.glob("*.json")):
            items.append({
                "variant": variant_dir.name,
                "scene_id": path.stem,
                "path": str(path.relative_to(get_settings().data_path.parent)).replace("\\", "/"),
                "bytes": path.stat().st_size,
            })
    return {"count": len(items), "items": items}


def get_lda_sweep(scene_id: str) -> dict:
    return _load_or_404(get_settings().lda_sweep_path(scene_id))


def get_representation(method: str, scene_id: str) -> dict:
    return _load_or_404(get_settings().representations_path(method, scene_id))


def get_representations_index() -> dict:
    base = get_settings().representations_dir
    if not base.exists():
        raise FileNotFoundError(str(base))
    items = []
    for method_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        for path in sorted(method_dir.glob("*.json")):
            items.append({
                "method": method_dir.name,
                "scene_id": path.stem,
                "path": str(path.relative_to(get_settings().data_path.parent)).replace("\\", "/"),
                "bytes": path.stat().st_size,
            })
    return {"count": len(items), "items": items}


def get_dmr_lda_hidsag(subset_code: str) -> dict:
    return _load_or_404(get_settings().dmr_lda_hidsag_path(subset_code))


def get_bayesian_comparison(task_type: str) -> dict:
    return _load_or_404(get_settings().bayesian_comparison_path(task_type))


def get_optuna_search(scene_id: str) -> dict:
    return _load_or_404(get_settings().optuna_search_path(scene_id))


def get_linear_probe_panel(scene_id: str) -> dict:
    return _load_or_404(get_settings().linear_probe_panel_path(scene_id))


def get_mutual_information(scene_id: str) -> dict:
    return _load_or_404(get_settings().mutual_information_path(scene_id))


def get_mutual_information_hidsag(subset_code: str) -> dict:
    return _load_or_404(get_settings().mutual_information_hidsag_path(subset_code))


def get_rate_distortion_curve(scene_id: str) -> dict:
    return _load_or_404(get_settings().rate_distortion_curve_path(scene_id))


def get_topic_routed_classifier(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_routed_classifier_path(scene_id))


def get_embedded_baseline(scene_id: str) -> dict:
    return _load_or_404(get_settings().embedded_baseline_path(scene_id))


def get_topic_stability(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_stability_path(scene_id))


def get_topic_to_usgs_v7(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_to_usgs_v7_path(scene_id))


def get_hidsag_cross_preprocessing_stability(subset_code: str) -> dict:
    return _load_or_404(
        get_settings().hidsag_cross_preprocessing_stability_path(subset_code)
    )


def get_topic_anomaly(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_anomaly_path(scene_id))


def get_topic_spatial_continuous(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_spatial_continuous_path(scene_id))


def get_topic_spatial_full(scene_id: str) -> dict:
    return _load_or_404(get_settings().topic_spatial_full_path(scene_id))


def get_endmember_baseline(scene_id: str) -> dict:
    return _load_or_404(get_settings().endmember_baseline_path(scene_id))


def get_cross_scene_transfer() -> dict:
    return _load_or_404(get_settings().cross_scene_transfer_path)


def get_bayesian_classification_labelled() -> dict:
    return _load_or_404(get_settings().bayesian_classification_labelled_path)
