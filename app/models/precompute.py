"""Pydantic response models for the second slice of precompute routes.

Mirrors the frontend types in `frontend/src/api/client.ts` for 6 routes
(continues issue #440 P1 item 1.2 after the band-masks family in c236):

- /wordifications                         WordificationsIndexResponse
- /wordifications/{scene}/{recipe}/...    WordificationResponse
- /topic-views/{scene}                    TopicViewsResponse
- /topic-to-data/{scene}                  TopicToDataResponse
- /spatial/{scene}                        SpatialValidationResponse
- /validation-blocks/{scene}              ValidationBlocksResponse

Conventions inherited from app/models/band_masks.py:
- ConfigDict(extra='allow') so backend JSON drift does not silently
  drop fields under FastAPI's response_model filtering.
- Deeply-nested or variable-shape areas (top_words_per_topic by
  λ-variant; topic_pair_log_odds keyed by 'i->j'; etc) stay as
  dict[str, Any] / list[Any] to keep the OpenAPI surface readable
  without locking down every interior shape.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


_PassThroughConfig = ConfigDict(extra="allow")


# ---------------- shared atoms ----------------


class LdaConfig(BaseModel):
    model_config = _PassThroughConfig
    method: str
    max_iter: int
    doc_topic_prior: float
    topic_word_prior: float
    random_state: int
    wordification: str
    quantization_scale: int | None = None
    samples_per_class: int | None = None


class DocLengthDistribution(BaseModel):
    model_config = _PassThroughConfig
    mean: float
    std: float
    min: int
    p25: float
    p50: float
    p75: float
    max: int


class DominantTopicMapMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    sentinel_unlabelled: int
    path: str | None = None
    served_path: str | None = None


class ThetaGridMeta(BaseModel):
    model_config = _PassThroughConfig
    format: str
    shape: list[int]
    dtype: str
    sentinel: str
    byte_order: str | None = None
    path: str | None = None
    served_path: str | None = None


# ---------------- wordifications ----------------


class WordificationsIndexItem(BaseModel):
    model_config = _PassThroughConfig
    id: str
    path: str
    bytes: int


class WordificationsIndexResponse(BaseModel):
    model_config = _PassThroughConfig
    count: int
    items: list[WordificationsIndexItem] = Field(default_factory=list)


class WordificationTopToken(BaseModel):
    model_config = _PassThroughConfig
    token: str
    count: int
    p_global: float


class WordificationResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    recipe: str
    scheme: str
    Q: int
    B: int
    D: int
    V_full: int
    V_actual: int
    doc_length_distribution: DocLengthDistribution
    zero_token_doc_rate: float
    corpus_marginal_entropy_bits: float
    top_tokens_by_count: list[WordificationTopToken]
    wavelengths_nm_first_last: list[float]
    local_doc_term_path: str | None = None
    generated_at: str
    builder_version: str


# ---------------- topic-views ----------------


class TopicViewsResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    topic_count: int
    vocabulary_size: int
    document_count: int
    wavelengths_nm: list[float]
    vocabulary: list[str]
    corpus_marginal: list[float] | None = None
    topic_prevalence: list[float]
    topic_band_profiles: list[list[float]]
    topic_distance_cosine: list[list[float]]
    topic_distance_js: list[list[float]] | None = None
    topic_distance_hellinger: list[list[float]] | None = None
    topic_word_jaccard_top15: list[list[float]] | None = None
    topic_intertopic_2d_js: list[list[float]]
    topic_intertopic_3d_js: list[list[float]]
    # keyed by λ-variant ("lambda_0.0", "lambda_0.3", ...) -> [topic][rank] -> word obj
    top_words_per_topic: dict[str, list[list[dict[str, Any]]]]
    topic_pair_log_odds: dict[str, list[dict[str, Any]]] | None = None
    lda_config: LdaConfig | None = None
    perplexity: float | None = None
    generated_at: str
    builder_version: str


# ---------------- topic-to-data ----------------


class TopicLabelCell(BaseModel):
    model_config = _PassThroughConfig
    label_id: int
    name: str
    count: int
    p: float


class TopDocumentForTopic(BaseModel):
    model_config = _PassThroughConfig
    doc_id: str
    theta_k: float
    label_id: int | None = None
    label_name: str | None = None
    xy: list[int]
    theta_full: list[float]


class ThetaEmbeddingPoint2D(BaseModel):
    model_config = _PassThroughConfig
    doc_id: int
    x: float
    y: float
    label_id: int | None = None
    dominant_topic_k: int | None = None
    confidence: float | None = None


class ThetaEmbeddingPoint3D(ThetaEmbeddingPoint2D):
    z: float


class TopicToDataResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    topic_count: int
    document_count: int
    spatial_shape: list[int]
    p_label_given_topic_dominant: list[list[TopicLabelCell]]
    p_label_given_topic_strict_theta_gt_0_5: list[list[TopicLabelCell]] | None = None
    docs_per_topic_dominant: list[int]
    docs_per_topic_strict: list[int] | None = None
    kl_to_label_prior_per_topic: list[float] | None = None
    top_documents_per_topic: list[list[TopDocumentForTopic]] | None = None
    dominant_topic_map: DominantTopicMapMeta | None = None
    theta_grid: ThetaGridMeta | None = None
    theta_embedding_pca_2d: list[ThetaEmbeddingPoint2D] | None = None
    theta_embedding_pca_3d: list[ThetaEmbeddingPoint3D] | None = None
    theta_embedding_explained_variance: list[float] | None = None
    generated_at: str
    builder_version: str


# ---------------- spatial ----------------


class SpatialConnectedComponents(BaseModel):
    model_config = _PassThroughConfig
    n_components: int
    support: int
    size_p50: float
    size_p95: float
    size_max: int


class SpatialTopicLabelIoU(BaseModel):
    model_config = _PassThroughConfig
    topic_k: int
    best_label_id: int | None = None
    best_label_name: str | None = None
    best_iou: float
    iou_per_label: dict[str, float] = Field(default_factory=dict)


class SpatialBestIouSummary(BaseModel):
    model_config = _PassThroughConfig
    max_iou_overall: float
    mean_best_iou: float


class SpatialValidationResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    spatial_shape: list[int]
    topic_count: int
    n_assigned_pixels: int
    morans_I_weighted_by_topic_support: float
    connected_components_per_topic: dict[str, SpatialConnectedComponents]
    topic_label_iou: list[SpatialTopicLabelIoU]
    best_iou_summary: SpatialBestIouSummary
    generated_at: str
    builder_version: str


# ---------------- validation-blocks ----------------


class ValidationBlock(BaseModel):
    """A single validation block (e.g. corpus-integrity, topic-distinctness).

    Schema varies across blocks — metrics shape depends on block_id.
    Keeping metrics as dict[str, Any] preserves that flexibility while
    making the OpenAPI envelope explicit.
    """
    model_config = _PassThroughConfig
    block_id: str
    status: str
    metrics: dict[str, Any] = Field(default_factory=dict)


class ValidationBlocksResponse(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    blocks: list[ValidationBlock] = Field(default_factory=list)
    generated_at: str
    builder_version: str


# ---------------- eda per-scene ----------------


class EdaClassDistributionRow(BaseModel):
    model_config = _PassThroughConfig
    label_id: int
    name: str | None = None
    count: int
    p: float | None = None
    color: str | None = None


class EdaPerScene(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    sensor: str | None = None
    family_id: str | None = None
    spatial_shape: list[int]
    n_pixels: int
    n_labelled_pixels: int
    n_classes: int
    imbalance_gini: float
    wavelengths_nm: list[float]
    class_distribution: list[EdaClassDistributionRow]
    # Builder ships per-label spectrum stats as a dict keyed by label_id;
    # value is {mean: [...], std: [...], ...}, not just the mean vector.
    class_mean_spectra: dict[str, dict[str, Any]] = Field(default_factory=dict)
    class_distance_cosine: dict[str, Any] = Field(default_factory=dict)
    class_distance_sam_radians: dict[str, Any] = Field(default_factory=dict)
    band_discriminative: list[dict[str, Any]] = Field(default_factory=list)
    silhouette_label_as_cluster_cosine: dict[str, Any] = Field(default_factory=dict)
    generated_at: str
    builder_version: str


# ---------------- eda hidsag ----------------


class EdaHidsag(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    sample_count: int
    measurement_count_total: int
    numeric_variable_names: list[str]
    numeric_variables: dict[str, dict[str, Any]] = Field(default_factory=dict)
    dominant_targets_by_mean: list[dict[str, Any]] = Field(default_factory=list)
    correlation_pearson: dict[str, Any] = Field(default_factory=dict)
    correlation_spearman: dict[str, Any] = Field(default_factory=dict)
    modality_band_counts: dict[str, int] = Field(default_factory=dict)
    measurement_tags_top: list[Any] = Field(default_factory=list)
    spectrum_axis: list[dict[str, Any]] = Field(default_factory=list)
    mean_spectrum_by_measurement: list[dict[str, Any]] = Field(default_factory=list)
    mean_spectrum_by_measurement_stratum: list[Any] = Field(default_factory=list)
    generated_at: str
    builder_version: str


# ---------------- spectral browser ----------------


class SpectralBrowserMetadata(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    spatial_shape: list[int]
    sampling_strategy: str
    random_state: int
    N: int
    B: int
    format: str
    spectra_path: str
    wavelengths_nm: list[float]
    rows: list[dict[str, Any]]
    generated_at: str
    builder_version: str


# ---------------- spectral density ----------------


class SpectralDensityBinPath(BaseModel):
    model_config = _PassThroughConfig
    path: str
    n_pixels_sampled: int | None = None


class SpectralDensityByLabel(BaseModel):
    model_config = _PassThroughConfig
    label_id: int
    path: str
    n_pixels_sampled: int | None = None


class SpectralDensityByTopic(BaseModel):
    model_config = _PassThroughConfig
    topic_k: int
    path: str
    n_pixels_sampled: int | None = None


class SpectralDensityManifest(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    scene_name: str
    B: int
    R_bins: int
    reflectance_range: list[float]
    wavelengths_nm: list[float]
    format: str
    shape_per_file: list[int]
    density_global: SpectralDensityBinPath
    density_by_label: list[dict[str, Any]] = Field(default_factory=list)
    density_by_topic: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: str
    builder_version: str


# ---------------- topic-to-library ----------------


class TopicToLibrary(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    library_sensor_subset: str
    library_sample_names: list[str]
    library_sample_groups: list[str]
    library_sample_count: int
    topic_x_library_cosine: list[list[float]]
    topic_x_library_sam_radians: list[list[float]]
    top_n_per_topic: list[list[dict[str, Any]]]
    generated_at: str
    builder_version: str


# ---------------- quantization sensitivity ----------------


class QuantizationProbe(BaseModel):
    model_config = _PassThroughConfig
    recipe: str | None = None
    scheme: str | None = None
    Q: int | None = None
    matched_cosine_mean: float | None = None
    ari: float | None = None


class QuantizationSummary(BaseModel):
    model_config = _PassThroughConfig
    n_configs_compared: int
    matched_cosine_mean_overall_mean: float
    matched_cosine_mean_overall_min: float
    ari_overall_mean: float
    ari_overall_min: float
    verdict: str | None = None


class QuantizationSensitivity(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    canonical_recipe: str
    canonical_scheme: str
    canonical_Q: int
    probes: list[dict[str, Any]] = Field(default_factory=list)
    summary: QuantizationSummary
    generated_at: str
    builder_version: str


# ---------------- super-topics ----------------


class SuperTopicMember(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str | None = None
    topic_k: int | None = None
    leaf_index: int | None = None


class SuperTopicCut(BaseModel):
    model_config = _PassThroughConfig
    K_super: int | None = None
    assignments: list[int] | None = None
    cluster_sizes: list[int] | None = None


class SuperTopics(BaseModel):
    model_config = _PassThroughConfig
    n_topics_total: int
    n_scenes: int
    scenes: list[str]
    common_grid: dict[str, Any]
    linkage_method: str
    distance: str
    linkage_matrix_round6: list[list[float]]
    cuts: list[dict[str, Any]] = Field(default_factory=list)
    scene_pair_super_topic_overlap_at_cut8: dict[str, Any] = Field(default_factory=dict)
    members: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: str
    builder_version: str


# ---------------- cross-scene transfer ----------------


class CrossSceneTransferPair(BaseModel):
    model_config = _PassThroughConfig
    source_scene: str | None = None
    target_scene: str | None = None
    macro_f1: float | None = None


class CrossSceneTransfer(BaseModel):
    model_config = _PassThroughConfig
    scene_order: list[str]
    common_wavelength_grid: dict[str, Any]
    wordification: str
    quantization_scale: int
    samples_per_class: int
    split: str
    head: str
    transfer_matrix_macro_f1: list[list[float]]
    transfer_pairs: list[dict[str, Any]]
    scene_meta: list[dict[str, Any]]
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


# ---------------- lda sweep ----------------


class LdaSweepGridEntry(BaseModel):
    model_config = _PassThroughConfig
    K: int | None = None
    perplexity_test_norm: float | None = None
    npmi_mean: float | None = None
    matched_cosine_mean: float | None = None
    score: float | None = None


class LdaSweep(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K_grid: list[int]
    seeds: list[int]
    samples_per_class: int
    wordification: str
    quantization_scale: int
    train_fraction: float
    grid: list[dict[str, Any]]
    recommended_K: int
    recommendation_method: str
    generated_at: str
    builder_version: str


# ---------------- linear probe panel ----------------


class LinearProbeMethodMetrics(BaseModel):
    model_config = _PassThroughConfig
    accuracy: float | None = None
    balanced_accuracy: float | None = None
    macro_f1: float | None = None
    latent_dim: int | None = None


class LinearProbePairwiseHolm(BaseModel):
    model_config = _PassThroughConfig
    method: str | None = None
    delta_macro_f1: float | None = None
    p_holm: float | None = None
    significant: bool | None = None


class LinearProbeRanking(BaseModel):
    model_config = _PassThroughConfig
    method: str
    macro_f1_mean: float | None = None
    macro_f1_std: float | None = None
    rank: int | None = None


class LinearProbePanel(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    n_classes: int
    n_documents: int
    head: str
    split: str
    metric: str
    method_metrics: dict[str, dict[str, Any]] = Field(default_factory=dict)
    pairwise_vs_theta_holm: list[dict[str, Any]] = Field(default_factory=list)
    ranking_by_macro_f1_mean: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


# ---------------- mutual information ----------------


class MutualInformationRanking(BaseModel):
    model_config = _PassThroughConfig
    method: str
    joint_mi: float | None = None
    rank: int | None = None


class MutualInformation(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    n_documents: int
    label_entropy_nats: float
    label_entropy_bits: float
    method_mi: dict[str, dict[str, Any]] = Field(default_factory=dict)
    ranking_by_joint_mi: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class MutualInformationHidsagRanking(BaseModel):
    model_config = _PassThroughConfig
    target: str | None = None
    max_mi: float | None = None
    rank: int | None = None


class MutualInformationHidsag(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    topic_count: int
    document_count: int
    covariates_in_dmr: list[str]
    target_mi_against_theta: dict[str, Any] = Field(default_factory=dict)
    ranking_by_max_mi: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


# ============================================================================
# c249: fourth-slice models — agreement, narrative, interpretability,
# representations, topic-routed, neural-topic, rate-distortion, stability,
# anomaly, USGS, endmember.
# ============================================================================


class CrossMethodAgreement(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    spatial_shape: list[int]
    n_compared_pixels: int
    method_names: list[str]
    ari_matrix: list[list[float]]
    nmi_matrix: list[list[float]]
    v_measure_matrix: list[list[float]] | None = None
    agreement_vs_label_summary: list[dict[str, Any]] = Field(default_factory=list)
    agreement_vs_topic_dominant_summary: list[dict[str, Any]] = Field(default_factory=list)
    generated_at: str
    builder_version: str


class Narratives(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    method_narratives: dict[str, Any] = Field(default_factory=dict)
    generated_at: str
    builder_version: str


class InterpretabilityCards(BaseModel):
    """Common envelope for topic_cards / band_cards / document_cards.

    The interior structure differs per card_type so the cards list is
    typed as dict[str, Any]; the route returns this same envelope for
    all three card_type variants.
    """
    model_config = _PassThroughConfig
    scene_id: str
    K: int | None = None
    topic_cards: list[dict[str, Any]] | None = None
    band_cards: list[dict[str, Any]] | None = None
    document_cards: list[dict[str, Any]] | None = None
    generated_at: str
    builder_version: str


class RepresentationFitMeta(BaseModel):
    model_config = _PassThroughConfig
    explained_variance_ratio: list[float] | None = None
    explained_variance_total: float | None = None
    reconstruction_rmse: float | None = None


class Representation(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    method: str
    n_documents: int
    n_bands_input: int
    latent_dim: int
    fit_meta: dict[str, Any] | None = None
    silhouette_label: dict[str, Any] | None = None
    downstream_kmeans_vs_label: dict[str, Any] | None = None
    scatter_pca_3d_explained_variance: list[float] | None = None
    scatter_2d_3d_subsample: list[dict[str, Any]] | None = None
    features_local_path: str | None = None
    generated_at: str
    builder_version: str


class TopicRoutedClassifier(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K: int
    n_classes: int
    n_documents: int
    samples_per_class: int
    wordification: str
    quantization_scale: int
    head: str
    split: str
    method_metrics: dict[str, dict[str, Any]] = Field(default_factory=dict)
    ranking_by_macro_f1_mean: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class NeuralTopicComparison(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    n_documents: int
    n_classes: int | None = None
    methods: dict[str, dict[str, Any]] = Field(default_factory=dict)
    ranking_by_ari: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class NeuralTopicSeedStability(BaseModel):
    """Per-scene seed stability for ProdLDA / ETM / LDA."""
    model_config = _PassThroughConfig
    scene_id: str
    n_seeds: int | None = None
    methods: dict[str, dict[str, Any]] | None = None
    method_metrics: dict[str, dict[str, Any]] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class RateDistortionCurve(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K_grid: list[int]
    doc_term_shape: list[int]
    train_fraction: float
    wordification: str
    quantization_scale: int
    samples_per_class: int
    method_curves: dict[str, Any] = Field(default_factory=dict)
    rmse_test_table_by_K: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicStability(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K: int
    seeds: list[int]
    wordification: str
    quantization_scale: int
    samples_per_class: int
    seed_pair_matched_cosine_mean: list[list[float]]
    seed_pair_matched_cosine_min: list[list[float]] | None = None
    seed_pair_matched_cosine_std: list[list[float]] | None = None
    per_topic_matched_cosine_vs_seed0: list[list[float]] | None = None
    per_topic_stability_summary: list[dict[str, Any]] | None = None
    scene_stability_summary: dict[str, Any] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class SeedStability(BaseModel):
    """Common envelope for classical_seed_stability + deep_seed_stability."""
    model_config = _PassThroughConfig
    scene_id: str
    method: str
    n_seeds: int
    latent_dim: int | None = None
    samples_per_class: int | None = None
    ari_vs_gt_per_seed: list[float] | None = None
    nmi_vs_gt_per_seed: list[float] | None = None
    ari_mean: float | None = None
    ari_std: float | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class DeepAnomaly(BaseModel):
    """Per-method anomaly-indicator block. Methods like cae_1d_8 and
    beta_vae_8 appear as top-level keys with method-specific payloads.
    """
    model_config = _PassThroughConfig
    scene_id: str
    n_documents: int
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicAnomaly(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    n_documents: int
    indicators: dict[str, Any]
    anomaly_to_misclassification_correlation: dict[str, Any]
    per_class_summary: list[dict[str, Any]] = Field(default_factory=list)
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicSpatialContinuous(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    spatial_shape: list[int]
    n_sampled_pixels: int
    per_topic_continuous_spatial: list[dict[str, Any]] = Field(default_factory=list)
    aggregated_morans_I_mean_over_topics: float | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicSpatialFull(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int | None = None
    spatial_shape: list[int] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicToUsgsV7(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    topic_count: int
    library_subset: str
    library_sample_count: int
    library_chapter_counts: dict[str, int] | None = None
    top_n_per_topic: list[list[dict[str, Any]]]
    generated_at: str
    builder_version: str


class EndmemberBaseline(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K: int | None = None
    n_pixels_used: int | None = None
    n_bands: int | None = None
    endmember_extractors: list[str] | dict[str, Any] | None = None
    unmixing_method: str | None = None
    generated_at: str
    builder_version: str


class HidsagCrossPreprocessingStability(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str | None = None
    methods: list[str] | None = None
    matched_jaccard_top15: list[list[float]] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class TopicRoutedDeepGate(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K: int | None = None
    n_classes: int | None = None
    n_documents: int | None = None
    method_metrics: dict[str, dict[str, Any]] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class EmbeddedBaseline(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    K: int | None = None
    n_classes: int | None = None
    n_documents: int | None = None
    method_metrics: dict[str, dict[str, Any]] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class OptunaSearch(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    trials: list[dict[str, Any]] | None = None
    best_trial: dict[str, Any] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class DmrLdaHidsag(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    K: int | None = None
    covariates: list[str] | None = None
    framework_axis: str | None = None
    generated_at: str
    builder_version: str


class ExternalValidationLiterature(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    entries: list[dict[str, Any]] | None = None
    methods: list[dict[str, Any]] | None = None
    generated_at: str | None = None
    builder_version: str | None = None


class ExternalValidationHidsagMethods(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str
    methods: list[dict[str, Any]] | None = None
    generated_at: str | None = None
    builder_version: str | None = None


class MethodStatisticsHidsag(BaseModel):
    model_config = _PassThroughConfig
    subset_code: str | None = None
    dataset_id: str | None = None
    dataset_name: str | None = None
    methods: dict[str, dict[str, Any]] | None = None
    paired_comparisons: dict[str, Any] | None = None
    ranking: dict[str, Any] | None = None
    generated_at: str | None = None
    builder_version: str | None = None


# ============================================================================
# c254: final-slice models — manifest, groupings, topic-variants,
# representations index, bayesian-comparison, llm-tea-leaves.
# Closes #440 P1 1.2 fully at 82 of 82 routes (100%).
# ============================================================================


class ManifestArtifact(BaseModel):
    model_config = _PassThroughConfig
    path: str | None = None
    bytes: int | None = None
    sha256: str | None = None
    builder: str | None = None


class ManifestClaim(BaseModel):
    model_config = _PassThroughConfig
    claim: str | None = None
    source: str | None = None


class Manifest(BaseModel):
    """Derived-artefacts manifest emitted by curate-for-web."""
    model_config = _PassThroughConfig
    generated_at: str
    git_sha: str | None = None
    builders: dict[str, Any] = Field(default_factory=dict)
    scenes: list[str] = Field(default_factory=list)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    claims_allowed: list[dict[str, Any]] = Field(default_factory=list)
    rule: str | None = None


# Index envelopes for groupings / topic-variants / representations all
# share the {count, items: [...]} shape (computed dynamically by the
# service layer). One generic model handles all three.


class IndexItem(BaseModel):
    model_config = _PassThroughConfig
    # No fixed keys — different routes name the discriminator field
    # differently (method vs variant vs subset_code etc).


class CountItemsIndex(BaseModel):
    """Generic envelope for groupings/topic-variants/representations
    index responses: {count: int, items: [...]}.
    """
    model_config = _PassThroughConfig
    count: int
    items: list[dict[str, Any]] = Field(default_factory=list)


class GroupingDetail(BaseModel):
    model_config = _PassThroughConfig
    scene_id: str
    method: str
    n_groups: int | None = None
    group_size_distribution: dict[str, Any] | None = None
    between_within_variance_ratio: float | None = None
    agreement_vs_label: dict[str, Any] | None = None
    mean_spectrum_per_group: list[dict[str, Any]] | None = None
    spatial_shape: list[int] | None = None
    assignment_path: str | None = None
    assignment_format: str | None = None
    assignment_dtype_max_id: int | None = None
    wavelengths_nm: list[float] | None = None
    served_path: str | None = None
    generated_at: str | None = None
    builder_version: str | None = None


class TopicVariantDetail(BaseModel):
    """ETM / ProdLDA / DMR-LDA / Gensim multicore variant detail."""
    model_config = _PassThroughConfig
    scene_id: str
    variant: str
    topic_count: int
    vocabulary_size: int | None = None
    topic_prevalence: list[float] | None = None
    top_words_per_topic: list[Any] | None = None
    wavelengths_nm: list[float] | None = None
    fit_meta: dict[str, Any] | None = None
    downstream_kmeans_vs_label: dict[str, Any] | None = None
    generated_at: str | None = None
    builder_version: str | None = None


class BayesianMethodPosterior(BaseModel):
    model_config = _PassThroughConfig
    method: str
    posterior_mean: float | None = None
    posterior_std: float | None = None
    hdi94_lo: float | None = None
    hdi94_hi: float | None = None


class BayesianComparison(BaseModel):
    """Common envelope for all task_type variants of /bayesian-comparison.

    Different task_types ("regression" | "classification" |
    "classification-labelled" | "classification-labelled-deep")
    populate slightly different subsets of fields; all fields are
    optional to absorb the polymorphism without separate response
    models per task.
    """
    # Disable the "model_" protected-namespace warning for model_summary.
    model_config = ConfigDict(extra="allow", protected_namespaces=())
    task_type: str | None = None
    scope: str | None = None
    n_observations: int | None = None
    n_methods: int | None = None
    n_scenes: int | None = None
    n_subsets: int | None = None
    n_folds: int | None = None
    n_targets: int | None = None
    method_names: list[str] | None = None
    scene_names: list[str] | None = None
    subset_names: list[str] | None = None
    method_posteriors: list[dict[str, Any]] | None = None
    pairwise_p_a_gt_b: dict[str, Any] | None = None
    model_summary: str | None = None
    generated_at: str | None = None
    builder_version: str | None = None


class LlmTeaLeaves(BaseModel):
    """Permissive envelope — no live JSON exists in the test fixture
    tree, so we cannot tighten the schema. The route returns whatever
    `build_b12_llm_tea_leaves` produced when ANTHROPIC_API_KEY was set.
    """
    model_config = _PassThroughConfig
    scene_id: str
    framework_axis: str | None = None
    generated_at: str | None = None
    builder_version: str | None = None
