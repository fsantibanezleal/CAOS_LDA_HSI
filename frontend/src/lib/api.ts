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

export interface AppPayload {
  overview: ProjectOverview;
  datasets: DatasetCatalog;
  real_scenes: RealScenesPayload;
  field_samples: FieldScenesPayload;
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
  getFieldSamples: () => getJson<FieldScenesPayload>("/api/field-samples"),
  getAppData: () => getJson<AppPayload>("/api/app-data")
};
