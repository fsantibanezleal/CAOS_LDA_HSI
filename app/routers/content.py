"""Content API for the CAOS LDA HSI demo application.

Routing convention:

- Every route is a `GET` returning either a typed Pydantic model
  (`response_model=...`) or a binary buffer for sidecar artefacts.
- The handler body is a thin shim: it reads a derived JSON or a
  precomputed source via the matching `get_*` helper in
  `app.services.precompute`, then returns the typed payload. No
  computation happens at request time.
- For path-parametric routes (e.g. `/topic-views/{scene_id}`), the
  handler delegates to `_typed_or_404(...)` / `_serve_or_404(...)`
  which raise HTTP 404 if the underlying derived file is missing.
- Reads only - there are no POST/PUT/DELETE endpoints on this router.

The per-route docstring is the authoritative one-line description of
what the route returns and which derived artefact it reads.
"""
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
    BayesianComparison,
    CountItemsIndex,
    CrossMethodAgreement,
    CrossSceneTransfer,
    DeepAnomaly,
    GroupingDetail,
    LlmTeaLeaves,
    Manifest,
    TopicVariantDetail,
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
    HidsagPreprocessingSensitivityPayload,
    LocalDatasetInventoryPayload,
    MethodStatisticsPayload,
)
from app.services.content import (
    get_band_mask_summary,
    get_band_masks_canonical_comparison,
    get_band_masks_hidsag_index,
    get_band_masks_hidsag_summary,
    get_band_masks_index,
    get_bayesian_classification_labelled,
    get_bayesian_classification_labelled_deep,
    get_bayesian_comparison,
    get_classical_seed_stability,
    get_cross_method_agreement,
    get_cross_scene_transfer,
    get_deep_anomaly,
    get_deep_seed_stability,
    get_derived_manifest,
    get_dmr_lda_hidsag,
    get_eda_hidsag,
    get_eda_per_scene,
    get_embedded_baseline,
    get_endmember_baseline,
    get_external_validation_hidsag_methods,
    get_external_validation_literature,
    get_grouping,
    get_groupings_index,
    get_hidsag_cross_preprocessing_stability,
    get_hidsag_preprocessing_sensitivity,
    get_interpretability,
    get_lda_sweep,
    get_linear_probe_panel,
    get_llm_tea_leaves,
    get_local_dataset_inventory,
    get_method_statistics,
    get_method_statistics_hidsag,
    get_mutual_information,
    get_mutual_information_hidsag,
    get_narratives,
    get_neural_topic_comparison,
    get_neural_topic_seed_stability,
    get_optuna_search,
    get_quantization_sensitivity,
    get_rate_distortion_curve,
    get_representation,
    get_representations_index,
    get_spatial_validation,
    get_spectral_browser_metadata,
    get_spectral_density_manifest,
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


# Routes the frontend actively consumes — kept and audited 2026-05-26 (c351):
#   /local-dataset-inventory     → api.inventory() in client.ts
#   /hidsag-preprocessing-sensitivity → BenchmarksHidsag
#   /method-statistics           → Benchmarks
# Everything else from the prior 23-route static-content cluster was
# deleted; the audit dated 2026-05-24 found zero frontend consumers.
# See _CAOS_MANAGE/wip/caos-lda-hsi/audits/2026-05-24-source-pipeline-audit.md
# (Tier-1 #2) for the route-by-route inventory.

@router.get("/local-dataset-inventory", response_model=LocalDatasetInventoryPayload)
def local_dataset_inventory() -> LocalDatasetInventoryPayload:
    """Local raw / derived presence + size per dataset."""
    return get_local_dataset_inventory()


@router.get("/hidsag-preprocessing-sensitivity", response_model=HidsagPreprocessingSensitivityPayload)
def hidsag_preprocessing_sensitivity() -> HidsagPreprocessingSensitivityPayload:
    """B-9 — how downstream metrics shift across 4 spectral preprocessing recipes."""
    return get_hidsag_preprocessing_sensitivity()


@router.get("/method-statistics", response_model=MethodStatisticsPayload)
def method_statistics() -> MethodStatisticsPayload:
    """Per-fold + per-seed method statistics with paired Wilcoxon / Friedman tests (Demsar 2006)."""
    try:
        return get_method_statistics()
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=404,
            detail="method statistics not generated yet; run scripts/local.* build-method-stats",
        ) from exc


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


@router.get(
    "/manifest",
    response_model=Manifest,
    response_model_exclude_none=True,
)
def derived_manifest() -> Manifest:
    """Returns the Manifest payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        Manifest, get_derived_manifest,
        hint="manifest not generated yet; run scripts/local.* curate-for-web",
    )


@router.get(
    "/eda/per-scene/{scene_id}",
    response_model=EdaPerScene,
    response_model_exclude_none=True,
)
def eda_per_scene(scene_id: str) -> EdaPerScene:
    """Per-scene EDA: class distribution, mean spectra, n_pixels, n_classes."""
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
    """LDAvis-faithful topic views: intertopic 2D coords + top-30 words per topic at lambda in {0, 0.3, 0.5, 0.7, 1.0} (Sievert-Shirley 2014)."""
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
    """Per-topic dominant-pixel map + P(label|topic) per scene."""
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
    """Spectra-browser metadata (per-scene index of available spectra)."""
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
    """Per-band x reflectance density manifest."""
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
    """Validation-block payload (9 blocks across the methodology)."""
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
    """Per-subset HIDSAG EDA: per-target distributions + measurement covariates."""
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
    """Topic-to-spectral-library cosine + SAM payload per scene."""
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
    """Moran's I + connected-component IoU per scene."""
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
    """Returns the WordificationsIndexResponse payload (reads the matching derived JSON or precomputed source)."""
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
    """Wordification payload for a (scene, recipe, scheme, Q) tuple."""
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
    """Returns the BandMasksIndexResponse payload (reads the matching derived JSON or precomputed source)."""
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
    """F-5 — paired comparison of band-mask refits against the canonical fit."""
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
    """Single band-mask summary for one (scene, mask_id) pair."""
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
    """Returns the BandMasksHidsagIndexResponse payload (reads the matching derived JSON or precomputed source)."""
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
    """Single HIDSAG band-mask summary for one (subset, mask_id) pair."""
    return _typed_or_404(
        BandMaskHidsagSummaryResponse,
        get_band_masks_hidsag_summary,
        subset_code, mask_id,
        hint=f"band_masks_hidsag {subset_code}/{mask_id} not generated yet",
    )


@router.get(
    "/groupings",
    response_model=CountItemsIndex,
    response_model_exclude_none=True,
)
def groupings_index() -> CountItemsIndex:
    """Returns the CountItemsIndex payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        CountItemsIndex, get_groupings_index,
        hint="groupings not generated yet; run scripts/local.* build-groupings",
    )


@router.get(
    "/groupings/{method}/{scene_id}",
    response_model=GroupingDetail,
    response_model_exclude_none=True,
)
def grouping(method: str, scene_id: str) -> GroupingDetail:
    """Returns the GroupingDetail payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        GroupingDetail, get_grouping, method, scene_id,
        hint=f"grouping {method}/{scene_id} not generated yet",
    )


@router.get(
    "/cross-method-agreement/{scene_id}",
    response_model=CrossMethodAgreement,
    response_model_exclude_none=True,
)
def cross_method_agreement(scene_id: str) -> CrossMethodAgreement:
    """F-6 — pairwise ARI / NMI / V across partition methods on a labelled scene."""
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
    """HIDSAG-side method statistics with Friedman + Nemenyi post-hoc."""
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
    """Per-scene topic anchors against published HSI literature."""
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
    """HIDSAG-side topic anchors against geochemistry methods."""
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
    """Captures / separates / unites / enables roll-up per scene."""
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
    """B-7 — topic / band / document cards (interpretability scaffold)."""
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
    """Per-scene quantisation-sensitivity probes vs canonical Q."""
    return _typed_or_404(
        QuantizationSensitivity, get_quantization_sensitivity, scene_id,
        hint=f"quantization sensitivity for '{scene_id}' not generated yet",
    )


@router.get(
    "/topic-variants",
    response_model=CountItemsIndex,
    response_model_exclude_none=True,
)
def topic_variants_index() -> CountItemsIndex:
    """Returns the CountItemsIndex payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        CountItemsIndex, get_topic_variants_index,
        hint="topic variants not generated yet",
    )


@router.get(
    "/topic-variants/{variant}/{scene_id}",
    response_model=TopicVariantDetail,
    response_model_exclude_none=True,
)
def topic_variant(variant: str, scene_id: str) -> TopicVariantDetail:
    """Returns the TopicVariantDetail payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        TopicVariantDetail, get_topic_variant, variant, scene_id,
        hint=f"topic variant {variant}/{scene_id} not generated yet",
    )


@router.get(
    "/lda-sweep/{scene_id}",
    response_model=LdaSweep,
    response_model_exclude_none=True,
)
def lda_sweep(scene_id: str) -> LdaSweep:
    """F-4 K-sweep: per-K perplexity + topic diversity + Hungarian-matched cosine across seeds."""
    return _typed_or_404(
        LdaSweep, get_lda_sweep, scene_id,
        hint=f"lda_sweep for '{scene_id}' not generated yet",
    )


@router.get(
    "/representations",
    response_model=CountItemsIndex,
    response_model_exclude_none=True,
)
def representations_index() -> CountItemsIndex:
    """Returns the CountItemsIndex payload (reads the matching derived JSON or precomputed source)."""
    return _typed_or_404(
        CountItemsIndex, get_representations_index,
        hint="representations not generated yet",
    )


@router.get(
    "/representations/{method}/{scene_id}",
    response_model=Representation,
    response_model_exclude_none=True,
)
def representation(method: str, scene_id: str) -> Representation:
    """Representation payload per (method, scene): 2D/3D scatter + downstream cluster metrics + per-class silhouette."""
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
    """DMR-LDA on HIDSAG with measurement covariates (Mimno-McCallum 2008)."""
    return _typed_or_404(
        DmrLdaHidsag, get_dmr_lda_hidsag, subset_code,
        hint=f"dmr_lda_hidsag for '{subset_code}' not generated yet",
    )


@router.get(
    "/bayesian-comparison/{task_type}",
    response_model=BayesianComparison,
    response_model_exclude_none=True,
)
def bayesian_comparison(task_type: str) -> BayesianComparison:
    """Hierarchical Bayesian posterior for the given task_type. Reads the corresponding cross_classification_bayesian{,_deep,_regression}.json. task_type must be one of: regression, classification, classification-labelled, classification-labelled-deep."""
    if task_type == "classification-labelled":
        return _typed_or_404(
            BayesianComparison, get_bayesian_classification_labelled,
            hint="bayesian_comparison labelled-classification not generated yet",
        )
    if task_type == "classification-labelled-deep":
        return _typed_or_404(
            BayesianComparison, get_bayesian_classification_labelled_deep,
            hint="bayesian_comparison labelled-classification-deep not generated yet",
        )
    if task_type not in ("regression", "classification"):
        raise HTTPException(
            status_code=400,
            detail="task_type must be regression | classification | classification-labelled | classification-labelled-deep",
        )
    return _typed_or_404(
        BayesianComparison, get_bayesian_comparison, task_type,
        hint=f"bayesian_comparison for '{task_type}' not generated yet",
    )


@router.get(
    "/optuna-search/{scene_id}",
    response_model=OptunaSearch,
    response_model_exclude_none=True,
)
def optuna_search(scene_id: str) -> OptunaSearch:
    """Optuna TPE hyper-parameter search per scene."""
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
    """B-1 — theta-as-feature vs PCA-K, NMF-K, ICA-K, dense-AE-K linear probes."""
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
    """B-4 — MI(theta; label) for canonical and competing K-dim representations."""
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
    """Returns the MutualInformationHidsag payload (reads the matching derived JSON or precomputed source)."""
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
    """B-2 — held-out RMSE on doc-term matrix for K in {4, 6, 8, 10, 12, 16}, LDA vs NMF vs PCA."""
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
    """B-3 — soft theta-gated specialists (master-plan Addendum B Axis C-2)."""
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
    """B-3 follow-up — theta gate vs PCA-8 / CAE-1D-8 / beta-VAE-8 deep gates."""
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
    """Cross-method LDA / ProdLDA / ETM head-to-head (Srivastava 2017, Dieng 2020)."""
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
    """Multi-seed ProdLDA / ETM stability companion."""
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
    """B-5 — [theta || PCA-K] concat readout with sample-weighted logistic regression."""
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
    """B-6 — Hungarian-matched cosine seed stability for LDA (Greene 2014)."""
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
    """Multi-seed neural-topic stability for CAE / beta-VAE family."""
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
    """B-9 deep-anomaly payload (reconstruction NLL from CAE-1D K=8) per scene."""
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
    """Multi-seed classical-baseline stability for PCA / NMF / ICA / dense-AE."""
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
    """B-7 — topic-to-USGS splib07 alignment via cosine + SAM (Kruse 1993)."""
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
    """HIDSAG cross-preprocessing stability (Hungarian-matched top-15 token Jaccard across 4 policies)."""
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
    """B-9 topic-anomaly payload (1 - max theta) per scene."""
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
    """B-10 — Moran's I (1950) over theta_k abundance per scene."""
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
    """B-10 full-pixel mask + boundary-displacement error per scene."""
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
    """B-11 — NFINDR / ATGP / NNLS unmixing comparison."""
    return _typed_or_404(
        EndmemberBaseline, get_endmember_baseline, scene_id,
        hint=f"endmember_baseline for '{scene_id}' not generated yet",
    )


@router.get(
    "/llm-tea-leaves/{scene_id}",
    response_model=LlmTeaLeaves,
    response_model_exclude_none=True,
)
def llm_tea_leaves(scene_id: str) -> LlmTeaLeaves:
    """B-12 — Stammbach 2024 LLM tea-leaves word/topic intrusion per scene."""
    return _typed_or_404(
        LlmTeaLeaves, get_llm_tea_leaves, scene_id,
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
    """Hierarchical super-topics across scenes (agglomerative)."""
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
    """B-8 — Hungarian-matched topic transfer across labelled scenes."""
    return _typed_or_404(
        CrossSceneTransfer, get_cross_scene_transfer,
        hint="cross_scene_transfer not generated yet",
    )


# ---------------------------------------------------------------------------
# V-sweep (issue #606) — the 19 built wordification recipes (V1-V15, V17-V20;
# V16 is a foundation-model scaffold) evaluated across the multi-axis framework.
# Reads small per-(scene, recipe, scheme, Q) JSON shards.
# ---------------------------------------------------------------------------
import json as _json  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.models.v_sweep import (  # noqa: E402
    VSweepRecipeReport,
    VSweepRecipeScene,
    VSweepStatus,
    VSweepWinMatrix,
)


def _read_json_or_none(path):
    try:
        with path.open("r", encoding="utf-8") as h:
            return _json.load(h)
    except FileNotFoundError:
        return None


_V_SWEEP_RECIPES = [f"V{i}" for i in range(1, 16)] + ["V17", "V18", "V19", "V20"]  # V1..V15, V17..V20 (V16 = HyperSIGMA scaffold-only)
_V_SWEEP_SCENES = [
    "indian-pines-corrected",
    "salinas-corrected",
    "salinas-a-corrected",
    "pavia-university",
    "kennedy-space-center",
    "botswana",
]


@router.get("/v-sweep/status", response_model=VSweepStatus, response_model_exclude_none=True)
def v_sweep_status(scheme: str = "uniform", q: int = 8) -> VSweepStatus:
    """Sweep coverage — how many (V, scene) shards exist for the given grid."""
    s = get_settings()
    tv_count = f1_count = f2_count = 0
    for scene in _V_SWEEP_SCENES:
        for recipe in _V_SWEEP_RECIPES:
            if s.v_sweep_topic_view_path(scene, recipe, scheme, q).exists():
                tv_count += 1
            if s.v_sweep_f1_path(scene, recipe, scheme, q).exists():
                f1_count += 1
            if s.v_sweep_f2_path(scene, recipe, scheme, q).exists():
                f2_count += 1
    total = len(_V_SWEEP_RECIPES) * len(_V_SWEEP_SCENES)
    return VSweepStatus(
        recipes=_V_SWEEP_RECIPES,
        scenes=_V_SWEEP_SCENES,
        topic_view_count=tv_count,
        f1_count=f1_count,
        f2_count=f2_count,
        total_expected=total,
    )


@router.get(
    "/v-sweep/methods/{recipe}",
    response_model=VSweepRecipeReport,
    response_model_exclude_none=True,
)
def v_sweep_method_report(recipe: str, scheme: str = "uniform", q: int = 8) -> VSweepRecipeReport:
    """All available sweep results for one V-recipe across the six labelled scenes."""
    if recipe not in _V_SWEEP_RECIPES:
        raise HTTPException(status_code=404, detail=f"unknown recipe '{recipe}'")
    s = get_settings()
    scenes_payload: list[VSweepRecipeScene] = []
    for scene in _V_SWEEP_SCENES:
        tv = _read_json_or_none(s.v_sweep_topic_view_path(scene, recipe, scheme, q))
        f1 = _read_json_or_none(s.v_sweep_f1_path(scene, recipe, scheme, q))
        f2 = _read_json_or_none(s.v_sweep_f2_path(scene, recipe, scheme, q))
        f7 = _read_json_or_none(s.v_sweep_f7_path(scene, recipe, scheme, q))
        f14 = _read_json_or_none(s.v_sweep_f14_path(scene, recipe, scheme, q))
        f18 = _read_json_or_none(s.v_sweep_f18_path(scene, recipe, scheme, q))
        f13 = _read_json_or_none(s.v_sweep_f13_path(scene, recipe, scheme, q))
        f22 = _read_json_or_none(s.v_sweep_f22_path(scene, recipe, scheme, q))
        hdp = _read_json_or_none(s.v_sweep_hdp_path(scene, recipe, scheme, q))
        prod = _read_json_or_none(s.v_sweep_prodlda_path(scene, recipe, scheme, q))
        etm = _read_json_or_none(s.v_sweep_etm_path(scene, recipe, scheme, q))
        scenes_payload.append(VSweepRecipeScene(
            scene_id=scene,
            topic_view=tv,
            f1=f1,
            f2=f2,
            f7=f7,
            f13=f13,
            f14=f14,
            f18=f18,
            f22=f22,
            hdp=hdp,
            prodlda=prod,
            etm=etm,
        ))
    return VSweepRecipeReport(
        recipe=recipe,
        scheme=scheme,
        Q=q,
        scenes=scenes_payload,
    )


@router.get(
    "/v-sweep/f1-win-matrix",
    response_model=VSweepWinMatrix,
    response_model_exclude_none=True,
)
def v_sweep_f1_win_matrix() -> VSweepWinMatrix:
    """The aggregate F-1 win-matrix (12 V x 6 scenes)."""
    s = get_settings()
    data = _read_json_or_none(s.v_sweep_f1_win_matrix_path)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="f1_win_matrix.json not generated yet (sweep in progress)",
        )
    return VSweepWinMatrix(**data)


@router.get("/v-sweep/coverage")
def v_sweep_coverage() -> dict:
    """Per-axis × scene × recipe boolean coverage matrix."""
    s = get_settings()
    data = _read_json_or_none(s.v_sweep_coverage_matrix_path)
    if data is None:
        raise HTTPException(
            status_code=404,
            detail="coverage_matrix.json not generated yet",
        )
    return data


@router.get("/v-sweep/backbones-f7")
def v_sweep_backbones_f7(q: int = 8) -> dict:
    """F-7 NMI under each non-LDA backbone (HDP / ProdLDA / ETM) for
    every (recipe, scene) pair currently on disk at the requested
    quantisation level Q.

    Defaults to Q=8 (the full sweep). Q=16 returns the V20/V8/V2
    cross-axis composite sweep for the 4 backbones; Q=32 returns
    whatever cells are present (currently LDA only)."""
    if q not in (8, 16, 32):
        raise HTTPException(status_code=400, detail="q must be 8, 16, or 32")
    s = get_settings()
    out_dir = s.v_sweep_dir / "backbones_f7"
    if not out_dir.is_dir():
        raise HTTPException(status_code=404, detail="backbones_f7 dir missing")
    from collections import defaultdict
    by_backbone: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(dict)
    )
    q_suffix = f"_uniform_Q{q}"
    # LDA F-7 comes from f7_topic_to_label
    lda_dir = s.v_sweep_dir / "f7_topic_to_label"
    if lda_dir.is_dir():
        for p in lda_dir.glob(f"*{q_suffix}.json"):
            stem = p.stem.replace(q_suffix, "")
            # split scene_recipe by trailing _V<digit>
            import re
            m = re.match(r"^(.+)_(V\d+)$", stem)
            if not m:
                continue
            scene, recipe = m.group(1), m.group(2)
            data = _json.loads(p.read_text(encoding="utf-8"))
            nmi = data.get("normalised_mi")
            if nmi is not None:
                by_backbone["LDA"][scene][recipe] = float(nmi)
    # HDP / ProdLDA / ETM from backbones_f7 dir
    for p in out_dir.glob(f"*{q_suffix}.json"):
        parts = p.stem.split("_", 1)
        if len(parts) != 2:
            continue
        backbone = parts[0].upper().replace("PRODLDA", "ProdLDA")
        rest = parts[1].replace(q_suffix, "")
        import re
        m = re.match(r"^(.+)_(V\d+)$", rest)
        if not m:
            continue
        scene, recipe = m.group(1), m.group(2)
        data = _json.loads(p.read_text(encoding="utf-8"))
        nmi = data.get("normalised_mi")
        if nmi is not None:
            by_backbone[backbone][scene][recipe] = float(nmi)
    # Compute per-backbone per-recipe mean
    summary: list[dict] = []
    for backbone in ("LDA", "HDP", "ProdLDA", "ETM"):
        scene_dict = by_backbone.get(backbone, {})
        all_recipes: dict[str, list[float]] = {}
        cells = {}
        for scene, rd in scene_dict.items():
            cells[scene] = rd
            for r, v in rd.items():
                all_recipes.setdefault(r, []).append(v)
        recipe_means = {
            r: round(sum(v) / len(v), 4) for r, v in all_recipes.items()
        }
        summary.append({
            "backbone": backbone,
            "cells": cells,
            "recipe_means": recipe_means,
            "n_cells": sum(len(rd) for rd in scene_dict.values()),
        })
    return {"backbones": summary, "q": q}


@router.get("/v-sweep/q-trajectory")
def v_sweep_q_trajectory(
    recipe: str,
    axis: str = "F-7",
) -> dict:
    """Per-recipe Q-trajectory across Q={8, 16, 32} for the requested
    evaluation axis. Returns mean across scenes plus per-scene cells.

    Axis options:
    - F-1: per-fold mean macro-F1 (topic_routed_soft)
    - F-2: c_v coherence
    - F-7: topic-to-label NMI
    - F-14: mean_pairwise_jaccard (lower=better)
    - F-18: mean_matched_cosine
    - F-22: counterfactual_l1_median (higher=more robust)
    """
    axis_map = {
        "F-1":  ("f1_per_fold",        "topic_routed_soft_per_fold",  False, "list_mean"),
        "F-2":  ("f2_coherence",       "c_v",                         False, "scalar"),
        "F-7":  ("f7_topic_to_label",  "normalised_mi",               False, "scalar"),
        "F-14": ("f14_repetitiveness", "mean_pairwise_jaccard",       True,  "scalar"),
        "F-18": ("f18_reliability",    "mean_matched_cosine",         False, "scalar"),
        "F-22": ("f22_counterfactual", "counterfactual_l1_median",    False, "scalar"),
    }
    if axis not in axis_map:
        raise HTTPException(status_code=400, detail=f"axis must be one of {list(axis_map)}")
    sub_dir, key, lower_is_better, value_kind = axis_map[axis]

    s = get_settings()
    scenes = [
        "indian-pines-corrected", "salinas-corrected", "salinas-a-corrected",
        "pavia-university", "kennedy-space-center", "botswana",
    ]
    trajectory: dict[str, dict] = {}
    for q in (8, 16, 32):
        per_scene = {}
        for sc in scenes:
            p = s.v_sweep_dir / sub_dir / f"{sc}_{recipe}_uniform_Q{q}.json"
            if not p.is_file():
                continue
            d = _json.loads(p.read_text(encoding="utf-8"))
            v = d.get(key)
            if v is None:
                continue
            if value_kind == "list_mean":
                if isinstance(v, list) and v:
                    per_scene[sc] = float(sum(v) / len(v))
            else:
                try:
                    per_scene[sc] = float(v)
                except (TypeError, ValueError):
                    continue
        if per_scene:
            mean = sum(per_scene.values()) / len(per_scene)
            trajectory[f"Q={q}"] = {
                "per_scene": {sc: round(v, 6) for sc, v in per_scene.items()},
                "mean": round(mean, 6),
                "n_scenes": len(per_scene),
            }

    return {
        "recipe": recipe,
        "axis": axis,
        "lower_is_better": lower_is_better,
        "trajectory": trajectory,
    }
