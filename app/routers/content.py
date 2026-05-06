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
    ExplorationViewsPayload,
    MethodStatisticsPayload,
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
    get_exploration_views,
    get_method_statistics,
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


@router.get("/exploration-views", response_model=ExplorationViewsPayload)
def exploration_views() -> ExplorationViewsPayload:
    try:
        return get_exploration_views()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="exploration views not generated yet; run scripts/local.* build-exploration-views",
        ) from exc


@router.get("/method-statistics", response_model=MethodStatisticsPayload)
def method_statistics() -> MethodStatisticsPayload:
    try:
        return get_method_statistics()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="method statistics not generated yet; run scripts/local.* build-method-stats",
        ) from exc


@router.get("/app-data", response_model=AppPayload)
def app_data() -> AppPayload:
    return get_app_payload()


# ============================================================================
# Master-plan §18 precompute layer — endpoints for the new derived files.
# These return plain dicts (no Pydantic model) because the schemas are large
# and the frontend declares its own TypeScript interfaces.
# ============================================================================


def _serve_or_404(loader, scene_id: str | None, hint: str):
    from app.services.content import (
        get_eda_per_scene,
        get_topic_views,
        get_topic_to_data,
        get_spectral_browser_metadata,
        get_spectral_density_manifest,
        get_validation_blocks,
        get_derived_manifest,
    )
    try:
        return loader(scene_id) if scene_id else loader()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=hint) from exc


@router.get("/manifest")
def derived_manifest() -> dict:
    from app.services.content import get_derived_manifest
    try:
        return get_derived_manifest()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="manifest not generated yet; run scripts/local.* curate-for-web",
        ) from exc


@router.get("/eda/per-scene/{scene_id}")
def eda_per_scene(scene_id: str) -> dict:
    from app.services.content import get_eda_per_scene
    try:
        return get_eda_per_scene(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"eda views for '{scene_id}' not generated yet; run scripts/local.* build-eda-per-scene",
        ) from exc


@router.get("/topic-views/{scene_id}")
def topic_views(scene_id: str) -> dict:
    from app.services.content import get_topic_views
    try:
        return get_topic_views(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"topic views for '{scene_id}' not generated yet; run scripts/local.* build-topic-views",
        ) from exc


@router.get("/topic-to-data/{scene_id}")
def topic_to_data(scene_id: str) -> dict:
    from app.services.content import get_topic_to_data
    try:
        return get_topic_to_data(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"topic-to-data for '{scene_id}' not generated yet; run scripts/local.* build-topic-to-data",
        ) from exc


@router.get("/spectral-browser/{scene_id}")
def spectral_browser(scene_id: str) -> dict:
    from app.services.content import get_spectral_browser_metadata
    try:
        return get_spectral_browser_metadata(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"spectral browser for '{scene_id}' not generated yet; run scripts/local.* build-spectral-browser",
        ) from exc


@router.get("/spectral-density/{scene_id}")
def spectral_density(scene_id: str) -> dict:
    from app.services.content import get_spectral_density_manifest
    try:
        return get_spectral_density_manifest(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"spectral density for '{scene_id}' not generated yet; run scripts/local.* build-spectral-density",
        ) from exc


@router.get("/validation-blocks/{scene_id}")
def validation_blocks(scene_id: str) -> dict:
    from app.services.content import get_validation_blocks
    try:
        return get_validation_blocks(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"validation blocks for '{scene_id}' not generated yet; run scripts/local.* build-validation-blocks",
        ) from exc


@router.get("/eda/hidsag/{subset_code}")
def eda_hidsag(subset_code: str) -> dict:
    from app.services.content import get_eda_hidsag
    try:
        return get_eda_hidsag(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"HIDSAG EDA for '{subset_code}' not generated yet; run scripts/local.* build-eda-hidsag",
        ) from exc


@router.get("/topic-to-library/{scene_id}")
def topic_to_library(scene_id: str) -> dict:
    from app.services.content import get_topic_to_library
    try:
        return get_topic_to_library(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"topic-to-library for '{scene_id}' not generated yet; run scripts/local.* build-topic-to-library",
        ) from exc


@router.get("/spatial/{scene_id}")
def spatial_validation(scene_id: str) -> dict:
    from app.services.content import get_spatial_validation
    try:
        return get_spatial_validation(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"spatial validation for '{scene_id}' not generated yet; run scripts/local.* build-spatial-validation",
        ) from exc


@router.get("/wordifications")
def wordifications_index() -> dict:
    from app.services.content import get_wordifications_index
    try:
        return get_wordifications_index()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="wordifications not generated yet; run scripts/local.* build-wordifications",
        ) from exc


@router.get("/wordifications/{scene_id}/{recipe}/{scheme}/{q}")
def wordification(scene_id: str, recipe: str, scheme: str, q: int) -> dict:
    from app.services.content import get_wordification
    try:
        return get_wordification(scene_id, recipe, scheme, q)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"wordification {scene_id}/{recipe}/{scheme}/Q{q} not generated yet",
        ) from exc


@router.get("/groupings")
def groupings_index() -> dict:
    from app.services.content import get_groupings_index
    try:
        return get_groupings_index()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="groupings not generated yet; run scripts/local.* build-groupings",
        ) from exc


@router.get("/groupings/{method}/{scene_id}")
def grouping(method: str, scene_id: str) -> dict:
    from app.services.content import get_grouping
    try:
        return get_grouping(method, scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"grouping {method}/{scene_id} not generated yet",
        ) from exc


@router.get("/cross-method-agreement/{scene_id}")
def cross_method_agreement(scene_id: str) -> dict:
    from app.services.content import get_cross_method_agreement
    try:
        return get_cross_method_agreement(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"cross-method agreement for '{scene_id}' not generated yet",
        ) from exc


@router.get("/method-statistics-hidsag/{subset_code}")
def method_statistics_hidsag(subset_code: str) -> dict:
    from app.services.content import get_method_statistics_hidsag
    try:
        return get_method_statistics_hidsag(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"method statistics for HIDSAG '{subset_code}' not generated yet",
        ) from exc


@router.get("/external-validation/{scene_id}/literature")
def external_validation_literature(scene_id: str) -> dict:
    from app.services.content import get_external_validation_literature
    try:
        return get_external_validation_literature(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"literature alignment for '{scene_id}' not generated yet",
        ) from exc


@router.get("/external-validation/hidsag/{subset_code}/methods")
def external_validation_hidsag_methods(subset_code: str) -> dict:
    from app.services.content import get_external_validation_hidsag_methods
    try:
        return get_external_validation_hidsag_methods(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"HIDSAG method summary for '{subset_code}' not generated yet",
        ) from exc


@router.get("/narratives/{scene_id}")
def narratives(scene_id: str) -> dict:
    from app.services.content import get_narratives
    try:
        return get_narratives(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"narrative for '{scene_id}' not generated yet",
        ) from exc


@router.get("/interpretability/{scene_id}/{card_type}")
def interpretability(scene_id: str, card_type: str) -> dict:
    from app.services.content import get_interpretability
    if card_type not in ("topic_cards", "band_cards", "document_cards"):
        raise HTTPException(status_code=400, detail="card_type must be topic_cards | band_cards | document_cards")
    try:
        return get_interpretability(scene_id, card_type)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"interpretability {card_type} for '{scene_id}' not generated yet",
        ) from exc


@router.get("/quantization-sensitivity/{scene_id}")
def quantization_sensitivity(scene_id: str) -> dict:
    from app.services.content import get_quantization_sensitivity
    try:
        return get_quantization_sensitivity(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"quantization sensitivity for '{scene_id}' not generated yet",
        ) from exc


@router.get("/topic-variants")
def topic_variants_index() -> dict:
    from app.services.content import get_topic_variants_index
    try:
        return get_topic_variants_index()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="topic variants not generated yet",
        ) from exc


@router.get("/topic-variants/{variant}/{scene_id}")
def topic_variant(variant: str, scene_id: str) -> dict:
    from app.services.content import get_topic_variant
    try:
        return get_topic_variant(variant, scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"topic variant {variant}/{scene_id} not generated yet",
        ) from exc


@router.get("/lda-sweep/{scene_id}")
def lda_sweep(scene_id: str) -> dict:
    from app.services.content import get_lda_sweep
    try:
        return get_lda_sweep(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"lda_sweep for '{scene_id}' not generated yet") from exc


@router.get("/representations")
def representations_index() -> dict:
    from app.services.content import get_representations_index
    try:
        return get_representations_index()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="representations not generated yet") from exc


@router.get("/representations/{method}/{scene_id}")
def representation(method: str, scene_id: str) -> dict:
    from app.services.content import get_representation
    try:
        return get_representation(method, scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"representation {method}/{scene_id} not generated yet") from exc


@router.get("/dmr-lda-hidsag/{subset_code}")
def dmr_lda_hidsag(subset_code: str) -> dict:
    from app.services.content import get_dmr_lda_hidsag
    try:
        return get_dmr_lda_hidsag(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"dmr_lda_hidsag for '{subset_code}' not generated yet") from exc


@router.get("/bayesian-comparison/{task_type}")
def bayesian_comparison(task_type: str) -> dict:
    from app.services.content import (
        get_bayesian_classification_labelled,
        get_bayesian_comparison,
    )
    if task_type == "classification-labelled":
        try:
            return get_bayesian_classification_labelled()
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="bayesian_comparison labelled-classification not generated yet") from exc
    if task_type not in ("regression", "classification"):
        raise HTTPException(
            status_code=400,
            detail="task_type must be regression | classification | classification-labelled",
        )
    try:
        return get_bayesian_comparison(task_type)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"bayesian_comparison for '{task_type}' not generated yet") from exc


@router.get("/optuna-search/{scene_id}")
def optuna_search(scene_id: str) -> dict:
    from app.services.content import get_optuna_search
    try:
        return get_optuna_search(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"optuna_search for '{scene_id}' not generated yet") from exc


@router.get("/linear-probe-panel/{scene_id}")
def linear_probe_panel(scene_id: str) -> dict:
    from app.services.content import get_linear_probe_panel
    try:
        return get_linear_probe_panel(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"linear_probe_panel for '{scene_id}' not generated yet") from exc


@router.get("/mutual-information/{scene_id}")
def mutual_information(scene_id: str) -> dict:
    from app.services.content import get_mutual_information
    try:
        return get_mutual_information(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"mutual_information for '{scene_id}' not generated yet") from exc


@router.get("/mutual-information/hidsag/{subset_code}")
def mutual_information_hidsag(subset_code: str) -> dict:
    from app.services.content import get_mutual_information_hidsag
    try:
        return get_mutual_information_hidsag(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"mutual_information for HIDSAG '{subset_code}' not generated yet") from exc


@router.get("/rate-distortion-curve/{scene_id}")
def rate_distortion_curve(scene_id: str) -> dict:
    from app.services.content import get_rate_distortion_curve
    try:
        return get_rate_distortion_curve(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"rate_distortion_curve for '{scene_id}' not generated yet") from exc


@router.get("/topic-routed-classifier/{scene_id}")
def topic_routed_classifier(scene_id: str) -> dict:
    from app.services.content import get_topic_routed_classifier
    try:
        return get_topic_routed_classifier(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_routed_classifier for '{scene_id}' not generated yet") from exc


@router.get("/embedded-baseline/{scene_id}")
def embedded_baseline(scene_id: str) -> dict:
    from app.services.content import get_embedded_baseline
    try:
        return get_embedded_baseline(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"embedded_baseline for '{scene_id}' not generated yet") from exc


@router.get("/topic-stability/{scene_id}")
def topic_stability(scene_id: str) -> dict:
    from app.services.content import get_topic_stability
    try:
        return get_topic_stability(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_stability for '{scene_id}' not generated yet") from exc


@router.get("/deep-seed-stability/{scene_id}")
def deep_seed_stability(scene_id: str) -> dict:
    from app.services.content import get_deep_seed_stability
    try:
        return get_deep_seed_stability(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"deep_seed_stability for '{scene_id}' not generated yet") from exc


@router.get("/topic-to-usgs-v7/{scene_id}")
def topic_to_usgs_v7(scene_id: str) -> dict:
    from app.services.content import get_topic_to_usgs_v7
    try:
        return get_topic_to_usgs_v7(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_to_usgs_v7 for '{scene_id}' not generated yet") from exc


@router.get("/hidsag-cross-preprocessing-stability/{subset_code}")
def hidsag_cross_preprocessing_stability(subset_code: str) -> dict:
    from app.services.content import get_hidsag_cross_preprocessing_stability
    try:
        return get_hidsag_cross_preprocessing_stability(subset_code)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"hidsag_cross_preprocessing_stability for '{subset_code}' not generated yet",
        ) from exc


@router.get("/topic-anomaly/{scene_id}")
def topic_anomaly(scene_id: str) -> dict:
    from app.services.content import get_topic_anomaly
    try:
        return get_topic_anomaly(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_anomaly for '{scene_id}' not generated yet") from exc


@router.get("/topic-spatial-continuous/{scene_id}")
def topic_spatial_continuous(scene_id: str) -> dict:
    from app.services.content import get_topic_spatial_continuous
    try:
        return get_topic_spatial_continuous(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_spatial_continuous for '{scene_id}' not generated yet") from exc


@router.get("/topic-spatial-full/{scene_id}")
def topic_spatial_full(scene_id: str) -> dict:
    from app.services.content import get_topic_spatial_full
    try:
        return get_topic_spatial_full(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"topic_spatial_full for '{scene_id}' not generated yet") from exc


@router.get("/endmember-baseline/{scene_id}")
def endmember_baseline(scene_id: str) -> dict:
    from app.services.content import get_endmember_baseline
    try:
        return get_endmember_baseline(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"endmember_baseline for '{scene_id}' not generated yet") from exc


@router.get("/llm-tea-leaves/{scene_id}")
def llm_tea_leaves(scene_id: str) -> dict:
    from app.services.content import get_llm_tea_leaves
    try:
        return get_llm_tea_leaves(scene_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"llm_tea_leaves for '{scene_id}' not generated yet (set ANTHROPIC_API_KEY and run build_b12_llm_tea_leaves)") from exc


@router.get("/super-topics")
def super_topics() -> dict:
    from app.services.content import get_super_topics
    try:
        return get_super_topics()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="super_topics not generated yet") from exc


@router.get("/cross-scene-transfer")
def cross_scene_transfer() -> dict:
    from app.services.content import get_cross_scene_transfer
    try:
        return get_cross_scene_transfer()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="cross_scene_transfer not generated yet") from exc
