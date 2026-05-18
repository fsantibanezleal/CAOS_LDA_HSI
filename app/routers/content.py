"""Content API for the CAOS LDA HSI demo application."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.band_masks import (
    BandMaskCanonicalComparisonResponse,
    BandMaskHidsagSummaryResponse,
    BandMaskSummaryResponse,
    BandMasksHidsagIndexResponse,
    BandMasksIndexResponse,
)
from app.models.precompute import (
    CrossMethodAgreement,
    CrossSceneTransfer,
    DeepAnomaly,
    DmrLdaHidsag,
    EdaHidsag,
    EdaPerScene,
    EmbeddedBaseline,
    EndmemberBaseline,
    ExternalValidationHidsagMethods,
    ExternalValidationLiterature,
    HidsagCrossPreprocessingStability,
    InterpretabilityCards,
    LdaSweep,
    LinearProbePanel,
    MethodStatisticsHidsag,
    MutualInformation,
    MutualInformationHidsag,
    Narratives,
    NeuralTopicComparison,
    NeuralTopicSeedStability,
    OptunaSearch,
    QuantizationSensitivity,
    RateDistortionCurve,
    Representation,
    SeedStability,
    SpatialValidationResponse,
    SpectralBrowserMetadata,
    SpectralDensityManifest,
    SuperTopics,
    TopicAnomaly,
    TopicRoutedClassifier,
    TopicRoutedDeepGate,
    TopicSpatialContinuous,
    TopicSpatialFull,
    TopicStability,
    TopicToDataResponse,
    TopicToLibrary,
    TopicToUsgsV7,
    TopicViewsResponse,
    ValidationBlocksResponse,
    WordificationResponse,
    WordificationsIndexResponse,
)
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
    get_band_mask_summary,
    get_band_masks_canonical_comparison,
    get_band_masks_hidsag_index,
    get_band_masks_hidsag_summary,
    get_band_masks_index,
    get_bayesian_classification_labelled,
    get_bayesian_classification_labelled_deep,
    get_bayesian_comparison,
    get_classical_seed_stability,
    get_corpus_previews,
    get_corpus_recipes,
    get_cross_method_agreement,
    get_cross_scene_transfer,
    get_data_families,
    get_datasets,
    get_deep_anomaly,
    get_deep_seed_stability,
    get_demo,
    get_derived_manifest,
    get_dmr_lda_hidsag,
    get_eda_hidsag,
    get_eda_per_scene,
    get_embedded_baseline,
    get_endmember_baseline,
    get_exploration_views,
    get_external_validation_hidsag_methods,
    get_external_validation_literature,
    get_field_samples,
    get_grouping,
    get_groupings_index,
    get_hidsag_band_quality,
    get_hidsag_cross_preprocessing_stability,
    get_hidsag_curated_subset,
    get_hidsag_preprocessing_sensitivity,
    get_hidsag_region_documents,
    get_hidsag_subset_inventory,
    get_interactive_subsets,
    get_interpretability,
    get_lda_sweep,
    get_linear_probe_panel,
    get_llm_tea_leaves,
    get_local_core_benchmarks,
    get_local_dataset_inventory,
    get_local_validation_matrix,
    get_method_statistics,
    get_method_statistics_hidsag,
    get_methodology,
    get_mutual_information,
    get_mutual_information_hidsag,
    get_narratives,
    get_neural_topic_comparison,
    get_neural_topic_seed_stability,
    get_optuna_search,
    get_overview,
    get_quantization_sensitivity,
    get_rate_distortion_curve,
    get_real_scenes,
    get_representation,
    get_representations_index,
    get_segmentation_baselines,
    get_spatial_validation,
    get_spectral_browser_metadata,
    get_spectral_density_manifest,
    get_spectral_library,
    get_subset_card,
    get_subset_cards_index,
    get_super_topics,
    get_topic_anomaly,
    get_topic_routed_classifier,
    get_topic_routed_deep_gate,
    get_topic_spatial_continuous,
    get_topic_spatial_full,
    get_topic_stability,
    get_topic_to_data,
    get_topic_to_library,
    get_topic_to_usgs_v7,
    get_topic_variant,
    get_topic_variants_index,
    get_topic_views,
    get_validation_blocks,
    get_wordification,
    get_wordifications_index,
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


def _serve_or_404(loader, *args, hint: str):
    """Invoke `loader(*args)` and translate FileNotFoundError to 404.

    Closes the dead-helper finding from issue #440 (1.1 + 1.3) — the
    previous body imported six callables it never used and only worked
    for the (loader, scene_id) shape. The new signature accepts any
    positional args, so handlers that take 0, 1, 2 or 4 path params all
    use the same helper.
    """
    try:
        return loader(*args)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=hint) from exc


def _typed_or_404(model, loader, *args, hint: str):
    """`_serve_or_404` + Pydantic `model_validate` in one call.

    Lets a typed route body collapse to a single statement.
    """
    return model.model_validate(_serve_or_404(loader, *args, hint=hint))


@router.get("/manifest")
def derived_manifest() -> dict:
    return _serve_or_404(
        get_derived_manifest,
        hint="manifest not generated yet; run scripts/local.* curate-for-web",
    )


@router.get(
    "/eda/per-scene/{scene_id}",
    response_model=EdaPerScene,
    response_model_exclude_none=True,
)
def eda_per_scene(scene_id: str) -> EdaPerScene:
    return _typed_or_404(
        EdaPerScene,
        get_eda_per_scene,
        scene_id,
        hint=f"eda views for '{scene_id}' not generated yet; run scripts/local.* build-eda-per-scene",
    )


@router.get(
    "/topic-views/{scene_id}",
    response_model=TopicViewsResponse,
    response_model_exclude_none=True,
)
def topic_views(scene_id: str) -> TopicViewsResponse:
    return _typed_or_404(
        TopicViewsResponse,
        get_topic_views,
        scene_id,
        hint=f"topic views for '{scene_id}' not generated yet; run scripts/local.* build-topic-views",
    )


@router.get(
    "/topic-to-data/{scene_id}",
    response_model=TopicToDataResponse,
    response_model_exclude_none=True,
)
def topic_to_data(scene_id: str) -> TopicToDataResponse:
    return _typed_or_404(
        TopicToDataResponse,
        get_topic_to_data,
        scene_id,
        hint=f"topic-to-data for '{scene_id}' not generated yet; run scripts/local.* build-topic-to-data",
    )


@router.get(
    "/spectral-browser/{scene_id}",
    response_model=SpectralBrowserMetadata,
    response_model_exclude_none=True,
)
def spectral_browser(scene_id: str) -> SpectralBrowserMetadata:
    return _typed_or_404(
        SpectralBrowserMetadata,
        get_spectral_browser_metadata,
        scene_id,
        hint=f"spectral browser for '{scene_id}' not generated yet; run scripts/local.* build-spectral-browser",
    )


@router.get(
    "/spectral-density/{scene_id}",
    response_model=SpectralDensityManifest,
    response_model_exclude_none=True,
)
def spectral_density(scene_id: str) -> SpectralDensityManifest:
    return _typed_or_404(
        SpectralDensityManifest,
        get_spectral_density_manifest,
        scene_id,
        hint=f"spectral density for '{scene_id}' not generated yet; run scripts/local.* build-spectral-density",
    )


@router.get(
    "/validation-blocks/{scene_id}",
    response_model=ValidationBlocksResponse,
    response_model_exclude_none=True,
)
def validation_blocks(scene_id: str) -> ValidationBlocksResponse:
    return _typed_or_404(
        ValidationBlocksResponse,
        get_validation_blocks,
        scene_id,
        hint=f"validation blocks for '{scene_id}' not generated yet; run scripts/local.* build-validation-blocks",
    )


@router.get(
    "/eda/hidsag/{subset_code}",
    response_model=EdaHidsag,
    response_model_exclude_none=True,
)
def eda_hidsag(subset_code: str) -> EdaHidsag:
    return _typed_or_404(
        EdaHidsag,
        get_eda_hidsag,
        subset_code,
        hint=f"HIDSAG EDA for '{subset_code}' not generated yet; run scripts/local.* build-eda-hidsag",
    )


@router.get(
    "/topic-to-library/{scene_id}",
    response_model=TopicToLibrary,
    response_model_exclude_none=True,
)
def topic_to_library(scene_id: str) -> TopicToLibrary:
    return _typed_or_404(
        TopicToLibrary,
        get_topic_to_library,
        scene_id,
        hint=f"topic-to-library for '{scene_id}' not generated yet; run scripts/local.* build-topic-to-library",
    )


@router.get(
    "/spatial/{scene_id}",
    response_model=SpatialValidationResponse,
    response_model_exclude_none=True,
)
def spatial_validation(scene_id: str) -> SpatialValidationResponse:
    return _typed_or_404(
        SpatialValidationResponse,
        get_spatial_validation,
        scene_id,
        hint=f"spatial validation for '{scene_id}' not generated yet; run scripts/local.* build-spatial-validation",
    )


@router.get(
    "/wordifications",
    response_model=WordificationsIndexResponse,
    response_model_exclude_none=True,
)
def wordifications_index() -> WordificationsIndexResponse:
    return _typed_or_404(
        WordificationsIndexResponse,
        get_wordifications_index,
        hint="wordifications not generated yet; run scripts/local.* build-wordifications",
    )


@router.get(
    "/wordifications/{scene_id}/{recipe}/{scheme}/{q}",
    response_model=WordificationResponse,
    response_model_exclude_none=True,
)
def wordification(
    scene_id: str, recipe: str, scheme: str, q: int
) -> WordificationResponse:
    return _typed_or_404(
        WordificationResponse,
        get_wordification,
        scene_id, recipe, scheme, q,
        hint=f"wordification {scene_id}/{recipe}/{scheme}/Q{q} not generated yet",
    )


@router.get(
    "/band-masks",
    response_model=BandMasksIndexResponse,
    response_model_exclude_none=True,
)
def band_masks_index() -> BandMasksIndexResponse:
    return _typed_or_404(
        BandMasksIndexResponse,
        get_band_masks_index,
        hint=(
            "band_masks index not generated yet; run "
            "scripts/local.* build-band-masked-topic-models"
        ),
    )


@router.get(
    "/band-masks/canonical-comparison",
    response_model=BandMaskCanonicalComparisonResponse,
    response_model_exclude_none=True,
)
def band_masks_canonical_comparison() -> BandMaskCanonicalComparisonResponse:
    return _typed_or_404(
        BandMaskCanonicalComparisonResponse,
        get_band_masks_canonical_comparison,
        hint=(
            "band_masks canonical_comparison not generated yet; run "
            "scripts/local.* build-band-mask-canonical-comparison"
        ),
    )


@router.get(
    "/band-masks/{scene_id}/{mask_id}",
    response_model=BandMaskSummaryResponse,
    response_model_exclude_none=True,
)
def band_mask_summary(scene_id: str, mask_id: str) -> BandMaskSummaryResponse:
    return _typed_or_404(
        BandMaskSummaryResponse,
        get_band_mask_summary,
        scene_id, mask_id,
        hint=f"band_mask {scene_id}/{mask_id} not generated yet",
    )


@router.get(
    "/band-masks-hidsag",
    response_model=BandMasksHidsagIndexResponse,
    response_model_exclude_none=True,
)
def band_masks_hidsag_index() -> BandMasksHidsagIndexResponse:
    return _typed_or_404(
        BandMasksHidsagIndexResponse,
        get_band_masks_hidsag_index,
        hint=(
            "band_masks_hidsag index not generated yet; run "
            "scripts/local.* build-band-masked-topic-models-hidsag"
        ),
    )


@router.get(
    "/band-masks-hidsag/{subset_code}/{mask_id}",
    response_model=BandMaskHidsagSummaryResponse,
    response_model_exclude_none=True,
)
def band_masks_hidsag_summary(
    subset_code: str, mask_id: str
) -> BandMaskHidsagSummaryResponse:
    return _typed_or_404(
        BandMaskHidsagSummaryResponse,
        get_band_masks_hidsag_summary,
        subset_code, mask_id,
        hint=f"band_masks_hidsag {subset_code}/{mask_id} not generated yet",
    )


@router.get("/groupings")
def groupings_index() -> dict:
    return _serve_or_404(
        get_groupings_index,
        hint="groupings not generated yet; run scripts/local.* build-groupings",
    )


@router.get("/groupings/{method}/{scene_id}")
def grouping(method: str, scene_id: str) -> dict:
    return _serve_or_404(
        get_grouping, method, scene_id,
        hint=f"grouping {method}/{scene_id} not generated yet",
    )


@router.get(
    "/cross-method-agreement/{scene_id}",
    response_model=CrossMethodAgreement,
    response_model_exclude_none=True,
)
def cross_method_agreement(scene_id: str) -> CrossMethodAgreement:
    return _typed_or_404(
        CrossMethodAgreement, get_cross_method_agreement, scene_id,
        hint=f"cross-method agreement for '{scene_id}' not generated yet",
    )


@router.get(
    "/method-statistics-hidsag/{subset_code}",
    response_model=MethodStatisticsHidsag,
    response_model_exclude_none=True,
)
def method_statistics_hidsag(subset_code: str) -> MethodStatisticsHidsag:
    return _typed_or_404(
        MethodStatisticsHidsag, get_method_statistics_hidsag, subset_code,
        hint=f"method statistics for HIDSAG '{subset_code}' not generated yet",
    )


@router.get(
    "/external-validation/{scene_id}/literature",
    response_model=ExternalValidationLiterature,
    response_model_exclude_none=True,
)
def external_validation_literature(scene_id: str) -> ExternalValidationLiterature:
    return _typed_or_404(
        ExternalValidationLiterature, get_external_validation_literature, scene_id,
        hint=f"literature alignment for '{scene_id}' not generated yet",
    )


@router.get(
    "/external-validation/hidsag/{subset_code}/methods",
    response_model=ExternalValidationHidsagMethods,
    response_model_exclude_none=True,
)
def external_validation_hidsag_methods(subset_code: str) -> ExternalValidationHidsagMethods:
    return _typed_or_404(
        ExternalValidationHidsagMethods, get_external_validation_hidsag_methods, subset_code,
        hint=f"HIDSAG method summary for '{subset_code}' not generated yet",
    )


@router.get(
    "/narratives/{scene_id}",
    response_model=Narratives,
    response_model_exclude_none=True,
)
def narratives(scene_id: str) -> Narratives:
    return _typed_or_404(
        Narratives, get_narratives, scene_id,
        hint=f"narrative for '{scene_id}' not generated yet",
    )


@router.get(
    "/interpretability/{scene_id}/{card_type}",
    response_model=InterpretabilityCards,
    response_model_exclude_none=True,
)
def interpretability(scene_id: str, card_type: str) -> InterpretabilityCards:
    if card_type not in ("topic_cards", "band_cards", "document_cards"):
        raise HTTPException(status_code=400, detail="card_type must be topic_cards | band_cards | document_cards")
    return _typed_or_404(
        InterpretabilityCards, get_interpretability, scene_id, card_type,
        hint=f"interpretability {card_type} for '{scene_id}' not generated yet",
    )


@router.get(
    "/quantization-sensitivity/{scene_id}",
    response_model=QuantizationSensitivity,
    response_model_exclude_none=True,
)
def quantization_sensitivity(scene_id: str) -> QuantizationSensitivity:
    return _typed_or_404(
        QuantizationSensitivity, get_quantization_sensitivity, scene_id,
        hint=f"quantization sensitivity for '{scene_id}' not generated yet",
    )


@router.get("/topic-variants")
def topic_variants_index() -> dict:
    return _serve_or_404(
        get_topic_variants_index,
        hint="topic variants not generated yet",
    )


@router.get("/topic-variants/{variant}/{scene_id}")
def topic_variant(variant: str, scene_id: str) -> dict:
    return _serve_or_404(
        get_topic_variant, variant, scene_id,
        hint=f"topic variant {variant}/{scene_id} not generated yet",
    )


@router.get(
    "/lda-sweep/{scene_id}",
    response_model=LdaSweep,
    response_model_exclude_none=True,
)
def lda_sweep(scene_id: str) -> LdaSweep:
    return _typed_or_404(
        LdaSweep, get_lda_sweep, scene_id,
        hint=f"lda_sweep for '{scene_id}' not generated yet",
    )


@router.get("/representations")
def representations_index() -> dict:
    return _serve_or_404(
        get_representations_index,
        hint="representations not generated yet",
    )


@router.get(
    "/representations/{method}/{scene_id}",
    response_model=Representation,
    response_model_exclude_none=True,
)
def representation(method: str, scene_id: str) -> Representation:
    return _typed_or_404(
        Representation, get_representation, method, scene_id,
        hint=f"representation {method}/{scene_id} not generated yet",
    )


@router.get(
    "/dmr-lda-hidsag/{subset_code}",
    response_model=DmrLdaHidsag,
    response_model_exclude_none=True,
)
def dmr_lda_hidsag(subset_code: str) -> DmrLdaHidsag:
    return _typed_or_404(
        DmrLdaHidsag, get_dmr_lda_hidsag, subset_code,
        hint=f"dmr_lda_hidsag for '{subset_code}' not generated yet",
    )


@router.get("/bayesian-comparison/{task_type}")
def bayesian_comparison(task_type: str) -> dict:
    if task_type == "classification-labelled":
        return _serve_or_404(
            get_bayesian_classification_labelled,
            hint="bayesian_comparison labelled-classification not generated yet",
        )
    if task_type == "classification-labelled-deep":
        return _serve_or_404(
            get_bayesian_classification_labelled_deep,
            hint="bayesian_comparison labelled-classification-deep not generated yet",
        )
    if task_type not in ("regression", "classification"):
        raise HTTPException(
            status_code=400,
            detail="task_type must be regression | classification | classification-labelled | classification-labelled-deep",
        )
    return _serve_or_404(
        get_bayesian_comparison, task_type,
        hint=f"bayesian_comparison for '{task_type}' not generated yet",
    )


@router.get(
    "/optuna-search/{scene_id}",
    response_model=OptunaSearch,
    response_model_exclude_none=True,
)
def optuna_search(scene_id: str) -> OptunaSearch:
    return _typed_or_404(
        OptunaSearch, get_optuna_search, scene_id,
        hint=f"optuna_search for '{scene_id}' not generated yet",
    )


@router.get(
    "/linear-probe-panel/{scene_id}",
    response_model=LinearProbePanel,
    response_model_exclude_none=True,
)
def linear_probe_panel(scene_id: str) -> LinearProbePanel:
    return _typed_or_404(
        LinearProbePanel, get_linear_probe_panel, scene_id,
        hint=f"linear_probe_panel for '{scene_id}' not generated yet",
    )


@router.get(
    "/mutual-information/{scene_id}",
    response_model=MutualInformation,
    response_model_exclude_none=True,
)
def mutual_information(scene_id: str) -> MutualInformation:
    return _typed_or_404(
        MutualInformation, get_mutual_information, scene_id,
        hint=f"mutual_information for '{scene_id}' not generated yet",
    )


@router.get(
    "/mutual-information/hidsag/{subset_code}",
    response_model=MutualInformationHidsag,
    response_model_exclude_none=True,
)
def mutual_information_hidsag(subset_code: str) -> MutualInformationHidsag:
    return _typed_or_404(
        MutualInformationHidsag, get_mutual_information_hidsag, subset_code,
        hint=f"mutual_information for HIDSAG '{subset_code}' not generated yet",
    )


@router.get(
    "/rate-distortion-curve/{scene_id}",
    response_model=RateDistortionCurve,
    response_model_exclude_none=True,
)
def rate_distortion_curve(scene_id: str) -> RateDistortionCurve:
    return _typed_or_404(
        RateDistortionCurve, get_rate_distortion_curve, scene_id,
        hint=f"rate_distortion_curve for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-routed-classifier/{scene_id}",
    response_model=TopicRoutedClassifier,
    response_model_exclude_none=True,
)
def topic_routed_classifier(scene_id: str) -> TopicRoutedClassifier:
    return _typed_or_404(
        TopicRoutedClassifier, get_topic_routed_classifier, scene_id,
        hint=f"topic_routed_classifier for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-routed-deep-gate/{scene_id}",
    response_model=TopicRoutedDeepGate,
    response_model_exclude_none=True,
)
def topic_routed_deep_gate(scene_id: str) -> TopicRoutedDeepGate:
    return _typed_or_404(
        TopicRoutedDeepGate, get_topic_routed_deep_gate, scene_id,
        hint=f"topic_routed_deep_gate for '{scene_id}' not generated yet",
    )


@router.get(
    "/neural-topic-comparison/{scene_id}",
    response_model=NeuralTopicComparison,
    response_model_exclude_none=True,
)
def neural_topic_comparison(scene_id: str) -> NeuralTopicComparison:
    return _typed_or_404(
        NeuralTopicComparison, get_neural_topic_comparison, scene_id,
        hint=f"neural_topic_comparison for '{scene_id}' not generated yet",
    )


@router.get(
    "/neural-topic-seed-stability/{scene_id}",
    response_model=NeuralTopicSeedStability,
    response_model_exclude_none=True,
)
def neural_topic_seed_stability(scene_id: str) -> NeuralTopicSeedStability:
    return _typed_or_404(
        NeuralTopicSeedStability, get_neural_topic_seed_stability, scene_id,
        hint=f"neural_topic_seed_stability for '{scene_id}' not generated yet",
    )


@router.get(
    "/embedded-baseline/{scene_id}",
    response_model=EmbeddedBaseline,
    response_model_exclude_none=True,
)
def embedded_baseline(scene_id: str) -> EmbeddedBaseline:
    return _typed_or_404(
        EmbeddedBaseline, get_embedded_baseline, scene_id,
        hint=f"embedded_baseline for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-stability/{scene_id}",
    response_model=TopicStability,
    response_model_exclude_none=True,
)
def topic_stability(scene_id: str, k_offset: int = 0) -> TopicStability:
    try:
        return TopicStability.model_validate(
            get_topic_stability(scene_id, k_offset=k_offset)
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"topic_stability for '{scene_id}' k_offset={k_offset} not generated yet",
        ) from exc


@router.get(
    "/deep-seed-stability/{scene_id}",
    response_model=SeedStability,
    response_model_exclude_none=True,
)
def deep_seed_stability(
    scene_id: str, method: str = "cae_1d_8", n_seeds: int = 7
) -> SeedStability:
    try:
        return SeedStability.model_validate(
            get_deep_seed_stability(scene_id, method=method, n_seeds=n_seeds)
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"deep_seed_stability for '{scene_id}' method '{method}' n_seeds={n_seeds} not generated yet",
        ) from exc


@router.get(
    "/deep-anomaly/{scene_id}",
    response_model=DeepAnomaly,
    response_model_exclude_none=True,
)
def deep_anomaly(scene_id: str) -> DeepAnomaly:
    return _typed_or_404(
        DeepAnomaly, get_deep_anomaly, scene_id,
        hint=f"deep_anomaly for '{scene_id}' not generated yet",
    )


@router.get(
    "/classical-seed-stability/{scene_id}",
    response_model=SeedStability,
    response_model_exclude_none=True,
)
def classical_seed_stability(scene_id: str, method: str = "pca_8") -> SeedStability:
    try:
        return SeedStability.model_validate(
            get_classical_seed_stability(scene_id, method=method)
        )
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail=f"classical_seed_stability for '{scene_id}' method '{method}' not generated yet",
        ) from exc


@router.get(
    "/topic-to-usgs-v7/{scene_id}",
    response_model=TopicToUsgsV7,
    response_model_exclude_none=True,
)
def topic_to_usgs_v7(scene_id: str) -> TopicToUsgsV7:
    return _typed_or_404(
        TopicToUsgsV7, get_topic_to_usgs_v7, scene_id,
        hint=f"topic_to_usgs_v7 for '{scene_id}' not generated yet",
    )


@router.get(
    "/hidsag-cross-preprocessing-stability/{subset_code}",
    response_model=HidsagCrossPreprocessingStability,
    response_model_exclude_none=True,
)
def hidsag_cross_preprocessing_stability(subset_code: str) -> HidsagCrossPreprocessingStability:
    return _typed_or_404(
        HidsagCrossPreprocessingStability, get_hidsag_cross_preprocessing_stability, subset_code,
        hint=f"hidsag_cross_preprocessing_stability for '{subset_code}' not generated yet",
    )


@router.get(
    "/topic-anomaly/{scene_id}",
    response_model=TopicAnomaly,
    response_model_exclude_none=True,
)
def topic_anomaly(scene_id: str) -> TopicAnomaly:
    return _typed_or_404(
        TopicAnomaly, get_topic_anomaly, scene_id,
        hint=f"topic_anomaly for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-spatial-continuous/{scene_id}",
    response_model=TopicSpatialContinuous,
    response_model_exclude_none=True,
)
def topic_spatial_continuous(scene_id: str) -> TopicSpatialContinuous:
    return _typed_or_404(
        TopicSpatialContinuous, get_topic_spatial_continuous, scene_id,
        hint=f"topic_spatial_continuous for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-spatial-full/{scene_id}",
    response_model=TopicSpatialFull,
    response_model_exclude_none=True,
)
def topic_spatial_full(scene_id: str) -> TopicSpatialFull:
    return _typed_or_404(
        TopicSpatialFull, get_topic_spatial_full, scene_id,
        hint=f"topic_spatial_full for '{scene_id}' not generated yet",
    )


@router.get(
    "/endmember-baseline/{scene_id}",
    response_model=EndmemberBaseline,
    response_model_exclude_none=True,
)
def endmember_baseline(scene_id: str) -> EndmemberBaseline:
    return _typed_or_404(
        EndmemberBaseline, get_endmember_baseline, scene_id,
        hint=f"endmember_baseline for '{scene_id}' not generated yet",
    )


@router.get("/llm-tea-leaves/{scene_id}")
def llm_tea_leaves(scene_id: str) -> dict:
    return _serve_or_404(
        get_llm_tea_leaves, scene_id,
        hint=(
            f"llm_tea_leaves for '{scene_id}' not generated yet "
            "(set ANTHROPIC_API_KEY and run build_b12_llm_tea_leaves)"
        ),
    )


@router.get(
    "/super-topics",
    response_model=SuperTopics,
    response_model_exclude_none=True,
)
def super_topics() -> SuperTopics:
    return _typed_or_404(
        SuperTopics, get_super_topics,
        hint="super_topics not generated yet",
    )


@router.get(
    "/cross-scene-transfer",
    response_model=CrossSceneTransfer,
    response_model_exclude_none=True,
)
def cross_scene_transfer() -> CrossSceneTransfer:
    return _typed_or_404(
        CrossSceneTransfer, get_cross_scene_transfer,
        hint="cross_scene_transfer not generated yet",
    )
