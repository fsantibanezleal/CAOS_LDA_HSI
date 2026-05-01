"""Typed API payloads for the CAOS LDA HSI demo application."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class LocalizedText(BaseModel):
    """Simple bilingual text block."""

    en: str
    es: str


class HeroStat(BaseModel):
    """Hero metric displayed near the project summary."""

    label: LocalizedText
    value: str
    detail: LocalizedText


class ProjectSection(BaseModel):
    """Top-level section exposed by the web application."""

    id: str
    title: LocalizedText
    summary: LocalizedText


class Principle(BaseModel):
    """Conceptual principle behind the methodology."""

    id: str
    title: LocalizedText
    body: LocalizedText
    emphasis: str = Field(description="Short highlighted phrase for card accents.")


class Citation(BaseModel):
    """External source used to justify the product narrative."""

    id: str
    title: str
    source: str
    url: str
    note: LocalizedText


class RepoLink(BaseModel):
    """Repository metadata for the public source code link."""

    owner: str
    name: str
    url: str


class ProjectOverview(BaseModel):
    """Human-facing overview of the research app."""

    slug: str
    title: str
    tagline: LocalizedText
    hypothesis: LocalizedText
    hero_stats: list[HeroStat]
    sections: list[ProjectSection]
    principles: list[Principle]
    citations: list[Citation]
    repo: RepoLink


class DatasetSupervision(BaseModel):
    """What kind of labels, measurements, or supervision a dataset can support."""

    family_id: str
    states: list[str]
    label_scope: str
    measurement_scope: str
    caveat: str


class DatasetAcquisition(BaseModel):
    """Reproducibility and publication status for one dataset source."""

    status: str
    access: str
    direct_download: bool
    license_note: str
    checksum_status: str
    raw_asset_policy: str
    last_verified: str | None = None


class DatasetEntry(BaseModel):
    """Single dataset or spectral library candidate."""

    id: str
    name: str
    modality: str
    domains: list[str]
    bands: int | None = None
    spatial_shape: list[int] | None = None
    file_size_mb: float | None = None
    source: str
    source_url: str
    local_status: LocalizedText
    repository_strategy: LocalizedText
    notes: LocalizedText
    fit_for_demo: str
    supervision: DatasetSupervision
    acquisition: DatasetAcquisition


class DatasetExclusion(BaseModel):
    """Useful dataset that does not fit the size constraint directly."""

    name: str
    source_url: str
    reason: LocalizedText


class DatasetCatalog(BaseModel):
    """Curated catalog of public MSI / HSI data options."""

    selection_policy: LocalizedText
    datasets: list[DatasetEntry]
    exclusions: list[DatasetExclusion]


class DataFamily(BaseModel):
    """Methodological dataset family used by the product reset workflow."""

    id: str
    code: str
    title: LocalizedText
    definition: LocalizedText
    supervision_states: list[str]
    current_dataset_ids: list[str]
    candidate_dataset_ids: list[str]
    valid_recipe_ids: list[str]
    valid_baseline_ids: list[str]
    valid_outputs: list[LocalizedText]
    caveats: list[LocalizedText]


class DataFamiliesPayload(BaseModel):
    """Dataset family taxonomy for the reset workflow."""

    source: str
    families: list[DataFamily]


class CorpusRecipe(BaseModel):
    """Static corpus recipe that defines alphabet, words, and documents."""

    id: str
    title: LocalizedText
    summary: LocalizedText
    alphabet_definition: LocalizedText
    word_definition: LocalizedText
    document_definition: LocalizedText
    valid_family_ids: list[str]
    required_metadata: list[str]
    first_dataset_ids: list[str]
    risks: list[LocalizedText]
    validation_gates: list[str]


class BaselineMethod(BaseModel):
    """Comparison method that gives non-topic outputs a purpose."""

    id: str
    name: str
    purpose: str
    valid_family_ids: list[str]
    feature_space: str
    metrics: list[str]
    caveat: str


class ValidationBlock(BaseModel):
    """Validation question required before strong product claims."""

    id: str
    title: str
    question: str
    metrics: list[str]
    failure_conditions: list[str]


class CorpusRecipesPayload(BaseModel):
    """Corpus recipes, baselines, and validation blocks for the reset workflow."""

    source: str
    recipes: list[CorpusRecipe]
    baselines: list[BaselineMethod]
    validation_blocks: list[ValidationBlock]


class CorpusDefinition(BaseModel):
    """Concrete PTM/LDA mapping for one generated corpus preview."""

    alphabet: str
    word: str
    document: str
    corpus: str
    topic_ready: bool


class CorpusLengthStats(BaseModel):
    """Document-length diagnostics for a corpus preview."""

    min: int
    median: float
    max: int
    mean: float


class CorpusTokenCount(BaseModel):
    """Token frequency inside a corpus preview."""

    token: str
    count: int


class CorpusExampleDocument(BaseModel):
    """Inspectable example document from a corpus preview."""

    id: str
    label: str
    source: str
    token_count: int
    source_spectra_count: int | None = None
    tokens: list[str]
    token_explanation: str


class CorpusPreview(BaseModel):
    """Static, reversible corpus preview generated from a real compact asset."""

    id: str
    dataset_id: str
    dataset_name: str
    family_id: str
    recipe_id: str
    document_count: int
    vocabulary_size: int
    zero_token_documents: int
    document_length: CorpusLengthStats
    corpus_definition: CorpusDefinition
    top_tokens: list[CorpusTokenCount]
    example_documents: list[CorpusExampleDocument]
    reversible_token_examples: dict[str, str]
    caveats: list[str]


class CorpusPreviewsPayload(BaseModel):
    """Static corpus previews used to gate future topic charts."""

    source: str
    generated_at: str
    previews: list[CorpusPreview]


class SegmentationMethod(BaseModel):
    """Spatial baseline method metadata."""

    id: str
    name: str
    purpose: str
    uses_spatial_information: bool
    uses_supervision: bool
    caveat: str


class SlicParameters(BaseModel):
    """SLIC parameter values used to generate one baseline."""

    n_segments_requested: int
    compactness: float
    convert2lab: bool
    enforce_connectivity: bool


class SegmentSizeStats(BaseModel):
    """Pixel-size distribution for generated segments."""

    min: int
    median: float
    max: int
    mean: float


class SegmentationLabelMetrics(BaseModel):
    """Label-alignment diagnostics for a segmentation baseline."""

    label_available: bool
    label_coverage_ratio: float | None = None
    weighted_label_purity: float | None = None
    segments_with_labels: int


class SegmentExample(BaseModel):
    """Representative superpixel/segment diagnostic."""

    segment_id: int
    pixel_count: int
    labeled_pixel_count: int | None = None
    majority_label_id: int | None = None
    majority_label: str | None = None
    purity: float | None = None


class SegmentationSceneBaseline(BaseModel):
    """Static SLIC baseline for one scene."""

    scene_id: str
    dataset_id: str
    scene_name: str
    family_id: str
    method_id: str
    feature_space: str
    spatial_information_used: bool
    supervision_used: bool
    slic_parameters: SlicParameters
    segment_count: int
    segment_size_pixels: SegmentSizeStats
    label_metrics: SegmentationLabelMetrics
    segment_examples: list[SegmentExample]
    preview_path: str
    caveats: list[str]


class SegmentationBaselinesPayload(BaseModel):
    """SLIC/superpixel baselines generated from local raw scenes."""

    source: str
    generated_at: str
    methods: list[SegmentationMethod]
    scenes: list[SegmentationSceneBaseline]


class LocalValidationMatrixPayload(BaseModel):
    """Local-first workflow matrix that defines the repo thesis and method families."""

    source: str
    thesis: LocalizedText
    workflow_stages: list[dict[str, str]]
    dataset_groups: list[dict[str, Any]]
    representation_families: list[dict[str, Any]]
    segmentation_methods: list[dict[str, Any]]
    clustering_methods: list[dict[str, Any]]
    topic_methods: list[dict[str, Any]]
    training_methods: list[dict[str, Any]]
    web_projection_rules: dict[str, Any]


class LocalDatasetInventoryPayload(BaseModel):
    """Unified local inventory that merges manifests with raw-download evidence."""

    source: str
    generated_at: str
    summary: dict[str, Any]
    family_views: list[dict[str, Any]]
    theme_groups: list[dict[str, Any]]
    datasets: list[dict[str, Any]]


class LocalCoreBenchmarksPayload(BaseModel):
    """Offline PTM/LDA, clustering, and supervised benchmark outputs."""

    source: str
    generated_at: str
    methods: dict[str, Any]
    labeled_scene_runs: list[dict[str, Any]]
    topic_stability_runs: list[dict[str, Any]]
    unlabeled_scene_runs: list[dict[str, Any]]
    unmixing_runs: list[dict[str, Any]]
    spectral_library_runs: list[dict[str, Any]]
    measured_target_runs: list[dict[str, Any]]


class HidsagSubsetInventoryPayload(BaseModel):
    """Versioned metadata summary for downloaded HIDSAG subsets."""

    source: str
    generated_at: str
    subsets: list[dict[str, Any]]


class HidsagCuratedSubsetPayload(BaseModel):
    """Compact spectral subset extracted from local HIDSAG raw archives."""

    source: str
    generated_at: str
    subsets: list[dict[str, Any]]


class WorkflowStep(BaseModel):
    """Ordered methodology step."""

    order: int
    title: LocalizedText
    body: LocalizedText


class RepresentationVariant(BaseModel):
    """Alternative document / word encoding used for topic modelling."""

    id: str
    name: LocalizedText
    summary: LocalizedText
    document_definition: LocalizedText
    word_definition: LocalizedText
    strength: LocalizedText
    caution: LocalizedText
    token_example: list[str]


class InferenceMode(BaseModel):
    """Downstream use enabled by topic modelling."""

    id: str
    title: LocalizedText
    description: LocalizedText


class Methodology(BaseModel):
    """Methodology reference content for the frontend."""

    workflow: list[WorkflowStep]
    representations: list[RepresentationVariant]
    inference_modes: list[InferenceMode]


class TopicWord(BaseModel):
    """Single token with its importance inside one topic."""

    token: str
    weight: float


class TopicProfile(BaseModel):
    """One learned topic shown in the interactive demo."""

    id: str
    name: LocalizedText
    summary: LocalizedText
    color: str
    top_words: list[TopicWord]
    band_profile: list[float]


class TokenPreview(BaseModel):
    """Compact token preview for one representation."""

    preview: list[str]
    total_tokens: int


class DemoSample(BaseModel):
    """Synthetic spectrum plus derived document-level features."""

    id: str
    label: LocalizedText
    source_group: LocalizedText
    spectrum: list[float]
    quantized_levels: list[int]
    tokens_by_representation: dict[str, TokenPreview]
    latent_mixture: list[float]
    inferred_topic_mixture: list[float]
    dominant_topic_id: str
    target_value: float
    predictions: dict[str, float]


class ModelMetric(BaseModel):
    """Single model quality metric used in the inference section."""

    id: str
    label: LocalizedText
    rmse: float
    note: LocalizedText


class DemoPayload(BaseModel):
    """Interactive synthetic data demo served to the frontend."""

    model_config = ConfigDict(protected_namespaces=())

    title: LocalizedText
    narrative: LocalizedText
    quantization_levels: int
    wavelengths_nm: list[float]
    topics: list[TopicProfile]
    samples: list[DemoSample]
    model_metrics: list[ModelMetric]
    routing_rule: LocalizedText


class RealSceneRawFile(BaseModel):
    """Local raw file information for one downloaded public scene."""

    name: str
    size_bytes: int


class RealClassSummary(BaseModel):
    """Class-level compact summary extracted from a public scene."""

    label_id: int
    name: str
    count: int
    mean_spectrum: list[float]
    mean_topic_mixture: list[float]


class RealExampleDocument(BaseModel):
    """Single example pixel document derived from a public scene."""

    label_id: int
    class_name: str
    spectrum: list[float]
    quantized_levels: list[int]
    topic_mixture: list[float]


class RealSceneTopic(BaseModel):
    """Topic snapshot fitted on sampled documents from a real scene."""

    id: str
    name: str
    top_words: list[TopicWord]
    band_profile: list[float]


class RealSceneSnapshot(BaseModel):
    """Compact, app-friendly representation of one downloaded public scene."""

    id: str
    name: str
    modality: str
    sensor: str
    source_url: str
    cube_shape: list[int]
    labeled_pixels: int
    approximate_wavelengths_nm: list[float]
    class_summaries: list[RealClassSummary]
    topics: list[RealSceneTopic]
    example_documents: list[RealExampleDocument]
    local_raw_files: list[RealSceneRawFile]
    rgb_preview_path: str | None = None
    label_preview_path: str | None = None
    label_coverage_ratio: float | None = None
    notes: str


class RealScenesPayload(BaseModel):
    """Collection of real downloaded public scenes and derived summaries."""

    source: str
    scenes: list[RealSceneSnapshot]


class FieldStratumSummary(BaseModel):
    """Heuristic patch stratum summary for unlabeled MSI field data."""

    label_id: int
    name: str
    count: int
    mean_spectrum: list[float]
    mean_topic_mixture: list[float]
    mean_ndvi: float


class FieldExampleDocument(BaseModel):
    """Single example patch document extracted from a field orthomosaic."""

    label_id: int
    class_name: str
    spectrum: list[float]
    quantized_levels: list[int]
    topic_mixture: list[float]
    mean_ndvi: float


class FieldSceneSnapshot(BaseModel):
    """Compact MSI field-scene representation derived from orthomosaics."""

    id: str
    name: str
    modality: str
    sensor: str
    source_url: str
    raster_shape: list[int]
    patch_size: int
    patch_count: int
    band_names: list[str]
    band_centers_nm: list[float]
    rgb_preview_path: str
    ndvi_preview_path: str
    strata_summaries: list[FieldStratumSummary]
    topics: list[RealSceneTopic]
    example_documents: list[FieldExampleDocument]
    local_raw_files: list[RealSceneRawFile]
    notes: str


class FieldScenesPayload(BaseModel):
    """Collection of downloaded MSI field samples and derived summaries."""

    source: str
    scenes: list[FieldSceneSnapshot]


class SpectralLibrarySample(BaseModel):
    """Compact material spectrum extracted from a public spectral library."""

    id: str
    name: str
    group: str
    sensor: str
    source_url: str
    source_file: str
    band_count: int
    wavelengths_nm: list[float]
    spectrum: list[float]
    quantized_levels: list[int]
    token_preview: list[str]
    absorption_tokens: list[str]
    notes: str


class SpectralLibraryPayload(BaseModel):
    """Curated compact spectral-library samples used by the workbench."""

    source: str
    source_url: str
    samples: list[SpectralLibrarySample]


class AnalysisMethod(BaseModel):
    """Compact description of a derived analytical diagnostic."""

    id: str
    name: str
    description: str


class AnalysisPoint(BaseModel):
    """Projected point used by clustering and embedding visualizations."""

    id: str
    label: str
    group: str
    item_count: int
    cluster: int
    x: float
    y: float
    size: float
    dominant_feature_index: int
    vector: list[float]


class ClusterProfile(BaseModel):
    """Cluster-level summary for topic or spectral-vector diagnostics."""

    cluster_id: int
    item_count: int
    support_count: int
    centroid: list[float]
    mean_vector: list[float]
    dominant_feature_index: int
    top_labels: list[str]


class NearestPair(BaseModel):
    """Nearest pair in the diagnostic feature space."""

    a_label: str
    b_label: str
    feature_distance: float
    spectral_distance: float | None = None


class SceneClusterDiagnostic(BaseModel):
    """Clustering and projection diagnostic for one real HSI scene."""

    scene_id: str
    scene_name: str
    feature_space: str
    method_id: str
    item_count: int
    cluster_count: int
    silhouette_score: float | None = None
    explained_variance_ratio: list[float]
    points: list[AnalysisPoint]
    cluster_profiles: list[ClusterProfile]
    nearest_pairs: list[NearestPair]


class LibraryClusterDiagnostic(BaseModel):
    """Clustering and projection diagnostic for one spectral-library band group."""

    library_id: str
    library_name: str
    band_count: int
    feature_space: str
    method_id: str
    item_count: int
    cluster_count: int
    silhouette_score: float | None = None
    explained_variance_ratio: list[float]
    points: list[AnalysisPoint]
    cluster_profiles: list[ClusterProfile]
    nearest_pairs: list[NearestPair]


class AnalysisPayload(BaseModel):
    """Derived analytical diagnostics served by the workbench."""

    source: str
    methods: list[AnalysisMethod]
    scene_diagnostics: list[SceneClusterDiagnostic]
    library_diagnostics: list[LibraryClusterDiagnostic]


class AppPayload(BaseModel):
    """Single aggregated payload used by the SPA."""

    overview: ProjectOverview
    datasets: DatasetCatalog
    data_families: DataFamiliesPayload
    corpus_recipes: CorpusRecipesPayload
    corpus_previews: CorpusPreviewsPayload
    segmentation_baselines: SegmentationBaselinesPayload
    real_scenes: RealScenesPayload
    field_samples: FieldScenesPayload
    spectral_library: SpectralLibraryPayload
    analysis: AnalysisPayload
    methodology: Methodology
    demo: DemoPayload


JSONDict = dict[str, Any]
