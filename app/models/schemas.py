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
    real_scenes: RealScenesPayload
    field_samples: FieldScenesPayload
    spectral_library: SpectralLibraryPayload
    analysis: AnalysisPayload
    methodology: Methodology
    demo: DemoPayload


JSONDict = dict[str, Any]
