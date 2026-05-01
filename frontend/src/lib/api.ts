/**
 * Typed API client for the CAOS LDA HSI backend.
 */

export interface LocalizedText {
  en: string;
  es: string;
}

export interface HeroStat {
  label: LocalizedText;
  value: string;
  detail: LocalizedText;
}

export interface ProjectSection {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
}

export interface Principle {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
  emphasis: string;
}

export interface Citation {
  id: string;
  title: string;
  source: string;
  url: string;
  note: LocalizedText;
}

export interface RepoLink {
  owner: string;
  name: string;
  url: string;
}

export interface ProjectOverview {
  slug: string;
  title: string;
  tagline: LocalizedText;
  hypothesis: LocalizedText;
  hero_stats: HeroStat[];
  sections: ProjectSection[];
  principles: Principle[];
  citations: Citation[];
  repo: RepoLink;
}

export interface DatasetSupervision {
  family_id: string;
  states: string[];
  label_scope: string;
  measurement_scope: string;
  caveat: string;
}

export interface DatasetAcquisition {
  status: string;
  access: string;
  direct_download: boolean;
  license_note: string;
  checksum_status: string;
  raw_asset_policy: string;
  last_verified: string | null;
}

export interface DatasetEntry {
  id: string;
  name: string;
  modality: string;
  domains: string[];
  bands: number | null;
  spatial_shape: number[] | null;
  file_size_mb: number | null;
  source: string;
  source_url: string;
  local_status: LocalizedText;
  repository_strategy: LocalizedText;
  notes: LocalizedText;
  fit_for_demo: string;
  supervision: DatasetSupervision;
  acquisition: DatasetAcquisition;
}

export interface DatasetExclusion {
  name: string;
  source_url: string;
  reason: LocalizedText;
}

export interface DatasetCatalog {
  selection_policy: LocalizedText;
  datasets: DatasetEntry[];
  exclusions: DatasetExclusion[];
}

export interface DataFamily {
  id: string;
  code: string;
  title: LocalizedText;
  definition: LocalizedText;
  supervision_states: string[];
  current_dataset_ids: string[];
  candidate_dataset_ids: string[];
  valid_recipe_ids: string[];
  valid_baseline_ids: string[];
  valid_outputs: LocalizedText[];
  caveats: LocalizedText[];
}

export interface DataFamiliesPayload {
  source: string;
  families: DataFamily[];
}

export interface CorpusRecipe {
  id: string;
  title: LocalizedText;
  summary: LocalizedText;
  alphabet_definition: LocalizedText;
  word_definition: LocalizedText;
  document_definition: LocalizedText;
  valid_family_ids: string[];
  required_metadata: string[];
  first_dataset_ids: string[];
  risks: LocalizedText[];
  validation_gates: string[];
}

export interface BaselineMethod {
  id: string;
  name: string;
  purpose: string;
  valid_family_ids: string[];
  feature_space: string;
  metrics: string[];
  caveat: string;
}

export interface ValidationBlock {
  id: string;
  title: string;
  question: string;
  metrics: string[];
  failure_conditions: string[];
}

export interface CorpusRecipesPayload {
  source: string;
  recipes: CorpusRecipe[];
  baselines: BaselineMethod[];
  validation_blocks: ValidationBlock[];
}

export interface CorpusDefinition {
  alphabet: string;
  word: string;
  document: string;
  corpus: string;
  topic_ready: boolean;
}

export interface CorpusLengthStats {
  min: number;
  median: number;
  max: number;
  mean: number;
}

export interface CorpusTokenCount {
  token: string;
  count: number;
}

export interface CorpusExampleDocument {
  id: string;
  label: string;
  source: string;
  token_count: number;
  source_spectra_count: number | null;
  tokens: string[];
  token_explanation: string;
}

export interface CorpusPreview {
  id: string;
  dataset_id: string;
  dataset_name: string;
  family_id: string;
  recipe_id: string;
  document_count: number;
  vocabulary_size: number;
  zero_token_documents: number;
  document_length: CorpusLengthStats;
  corpus_definition: CorpusDefinition;
  top_tokens: CorpusTokenCount[];
  example_documents: CorpusExampleDocument[];
  reversible_token_examples: Record<string, string>;
  caveats: string[];
}

export interface CorpusPreviewsPayload {
  source: string;
  generated_at: string;
  previews: CorpusPreview[];
}

export interface SegmentationMethod {
  id: string;
  name: string;
  purpose: string;
  uses_spatial_information: boolean;
  uses_supervision: boolean;
  caveat: string;
}

export interface SlicParameters {
  n_segments_requested: number;
  compactness: number;
  convert2lab: boolean;
  enforce_connectivity: boolean;
}

export interface SegmentSizeStats {
  min: number;
  median: number;
  max: number;
  mean: number;
}

export interface SegmentationLabelMetrics {
  label_available: boolean;
  label_coverage_ratio: number | null;
  weighted_label_purity: number | null;
  segments_with_labels: number;
}

export interface SegmentExample {
  segment_id: number;
  pixel_count: number;
  labeled_pixel_count: number | null;
  majority_label_id: number | null;
  majority_label: string | null;
  purity: number | null;
}

export interface SegmentationSceneBaseline {
  scene_id: string;
  dataset_id: string;
  scene_name: string;
  family_id: string;
  method_id: string;
  feature_space: string;
  spatial_information_used: boolean;
  supervision_used: boolean;
  slic_parameters: SlicParameters;
  segment_count: number;
  segment_size_pixels: SegmentSizeStats;
  label_metrics: SegmentationLabelMetrics;
  segment_examples: SegmentExample[];
  preview_path: string;
  caveats: string[];
}

export interface SegmentationBaselinesPayload {
  source: string;
  generated_at: string;
  methods: SegmentationMethod[];
  scenes: SegmentationSceneBaseline[];
}

export interface LocalValidationMatrixPayload {
  source: string;
  thesis: LocalizedText;
  workflow_stages: Array<Record<string, string>>;
  dataset_groups: Array<Record<string, unknown>>;
  representation_families: Array<Record<string, unknown>>;
  segmentation_methods: Array<Record<string, unknown>>;
  clustering_methods: Array<Record<string, unknown>>;
  topic_methods: Array<Record<string, unknown>>;
  training_methods: Array<Record<string, unknown>>;
  web_projection_rules: Record<string, unknown>;
}

export interface LocalDatasetInventoryPayload {
  source: string;
  generated_at: string;
  summary: Record<string, unknown>;
  family_views: Array<Record<string, unknown>>;
  theme_groups: Array<Record<string, unknown>>;
  datasets: Array<Record<string, unknown>>;
}

export interface LocalCoreBenchmarksPayload {
  source: string;
  generated_at: string;
  methods: Record<string, unknown>;
  labeled_scene_runs: Array<Record<string, unknown>>;
  topic_stability_runs: Array<Record<string, unknown>>;
  unlabeled_scene_runs: Array<Record<string, unknown>>;
  unmixing_runs: Array<Record<string, unknown>>;
  spectral_library_runs: Array<Record<string, unknown>>;
}

export interface WorkflowStep {
  order: number;
  title: LocalizedText;
  body: LocalizedText;
}

export interface RepresentationVariant {
  id: string;
  name: LocalizedText;
  summary: LocalizedText;
  document_definition: LocalizedText;
  word_definition: LocalizedText;
  strength: LocalizedText;
  caution: LocalizedText;
  token_example: string[];
}

export interface InferenceMode {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface Methodology {
  workflow: WorkflowStep[];
  representations: RepresentationVariant[];
  inference_modes: InferenceMode[];
}

export interface TopicWord {
  token: string;
  weight: number;
}

export interface TopicProfile {
  id: string;
  name: LocalizedText;
  summary: LocalizedText;
  color: string;
  top_words: TopicWord[];
  band_profile: number[];
}

export interface TokenPreview {
  preview: string[];
  total_tokens: number;
}

export interface DemoSample {
  id: string;
  label: LocalizedText;
  source_group: LocalizedText;
  spectrum: number[];
  quantized_levels: number[];
  tokens_by_representation: Record<string, TokenPreview>;
  latent_mixture: number[];
  inferred_topic_mixture: number[];
  dominant_topic_id: string;
  target_value: number;
  predictions: Record<string, number>;
}

export interface ModelMetric {
  id: string;
  label: LocalizedText;
  rmse: number;
  note: LocalizedText;
}

export interface DemoPayload {
  title: LocalizedText;
  narrative: LocalizedText;
  quantization_levels: number;
  wavelengths_nm: number[];
  topics: TopicProfile[];
  samples: DemoSample[];
  model_metrics: ModelMetric[];
  routing_rule: LocalizedText;
}

export interface RealSceneRawFile {
  name: string;
  size_bytes: number;
}

export interface RealClassSummary {
  label_id: number;
  name: string;
  count: number;
  mean_spectrum: number[];
  mean_topic_mixture: number[];
}

export interface RealExampleDocument {
  label_id: number;
  class_name: string;
  spectrum: number[];
  quantized_levels: number[];
  topic_mixture: number[];
}

export interface RealSceneTopic {
  id: string;
  name: string;
  top_words: TopicWord[];
  band_profile: number[];
}

export interface RealSceneSnapshot {
  id: string;
  name: string;
  modality: string;
  sensor: string;
  source_url: string;
  cube_shape: number[];
  labeled_pixels: number;
  approximate_wavelengths_nm: number[];
  class_summaries: RealClassSummary[];
  topics: RealSceneTopic[];
  example_documents: RealExampleDocument[];
  local_raw_files: RealSceneRawFile[];
  rgb_preview_path: string | null;
  label_preview_path: string | null;
  label_coverage_ratio: number | null;
  notes: string;
}

export interface RealScenesPayload {
  source: string;
  scenes: RealSceneSnapshot[];
}

export interface FieldStratumSummary {
  label_id: number;
  name: string;
  count: number;
  mean_spectrum: number[];
  mean_topic_mixture: number[];
  mean_ndvi: number;
}

export interface FieldExampleDocument {
  label_id: number;
  class_name: string;
  spectrum: number[];
  quantized_levels: number[];
  topic_mixture: number[];
  mean_ndvi: number;
}

export interface FieldSceneSnapshot {
  id: string;
  name: string;
  modality: string;
  sensor: string;
  source_url: string;
  raster_shape: number[];
  patch_size: number;
  patch_count: number;
  band_names: string[];
  band_centers_nm: number[];
  rgb_preview_path: string;
  ndvi_preview_path: string;
  strata_summaries: FieldStratumSummary[];
  topics: RealSceneTopic[];
  example_documents: FieldExampleDocument[];
  local_raw_files: RealSceneRawFile[];
  notes: string;
}

export interface FieldScenesPayload {
  source: string;
  scenes: FieldSceneSnapshot[];
}

export interface SpectralLibrarySample {
  id: string;
  name: string;
  group: string;
  sensor: string;
  source_url: string;
  source_file: string;
  band_count: number;
  wavelengths_nm: number[];
  spectrum: number[];
  quantized_levels: number[];
  token_preview: string[];
  absorption_tokens: string[];
  notes: string;
}

export interface SpectralLibraryPayload {
  source: string;
  source_url: string;
  samples: SpectralLibrarySample[];
}

export interface AnalysisMethod {
  id: string;
  name: string;
  description: string;
}

export interface AnalysisPoint {
  id: string;
  label: string;
  group: string;
  item_count: number;
  cluster: number;
  x: number;
  y: number;
  size: number;
  dominant_feature_index: number;
  vector: number[];
}

export interface ClusterProfile {
  cluster_id: number;
  item_count: number;
  support_count: number;
  centroid: number[];
  mean_vector: number[];
  dominant_feature_index: number;
  top_labels: string[];
}

export interface NearestPair {
  a_label: string;
  b_label: string;
  feature_distance: number;
  spectral_distance: number | null;
}

export interface SceneClusterDiagnostic {
  scene_id: string;
  scene_name: string;
  feature_space: string;
  method_id: string;
  item_count: number;
  cluster_count: number;
  silhouette_score: number | null;
  explained_variance_ratio: number[];
  points: AnalysisPoint[];
  cluster_profiles: ClusterProfile[];
  nearest_pairs: NearestPair[];
}

export interface LibraryClusterDiagnostic {
  library_id: string;
  library_name: string;
  band_count: number;
  feature_space: string;
  method_id: string;
  item_count: number;
  cluster_count: number;
  silhouette_score: number | null;
  explained_variance_ratio: number[];
  points: AnalysisPoint[];
  cluster_profiles: ClusterProfile[];
  nearest_pairs: NearestPair[];
}

export interface AnalysisPayload {
  source: string;
  methods: AnalysisMethod[];
  scene_diagnostics: SceneClusterDiagnostic[];
  library_diagnostics: LibraryClusterDiagnostic[];
}

export interface AppPayload {
  overview: ProjectOverview;
  datasets: DatasetCatalog;
  data_families: DataFamiliesPayload;
  corpus_recipes: CorpusRecipesPayload;
  corpus_previews: CorpusPreviewsPayload;
  segmentation_baselines: SegmentationBaselinesPayload;
  real_scenes: RealScenesPayload;
  field_samples: FieldScenesPayload;
  spectral_library: SpectralLibraryPayload;
  analysis: AnalysisPayload;
  methodology: Methodology;
  demo: DemoPayload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} on ${path}`);
  }
  return (await response.json()) as T;
}

export function pickText(value: LocalizedText, language: string): string {
  return language.startsWith("en") ? value.en : value.es;
}

export const api = {
  getDataFamilies: () => getJson<DataFamiliesPayload>("/api/data-families"),
  getCorpusRecipes: () => getJson<CorpusRecipesPayload>("/api/corpus-recipes"),
  getCorpusPreviews: () => getJson<CorpusPreviewsPayload>("/api/corpus-previews"),
  getSegmentationBaselines: () => getJson<SegmentationBaselinesPayload>("/api/segmentation-baselines"),
  getLocalValidationMatrix: () => getJson<LocalValidationMatrixPayload>("/api/local-validation-matrix"),
  getLocalDatasetInventory: () => getJson<LocalDatasetInventoryPayload>("/api/local-dataset-inventory"),
  getLocalCoreBenchmarks: () => getJson<LocalCoreBenchmarksPayload>("/api/local-core-benchmarks"),
  getFieldSamples: () => getJson<FieldScenesPayload>("/api/field-samples"),
  getSpectralLibrary: () => getJson<SpectralLibraryPayload>("/api/spectral-library"),
  getAnalysis: () => getJson<AnalysisPayload>("/api/analysis"),
  getAppData: () => getJson<AppPayload>("/api/app-data")
};
