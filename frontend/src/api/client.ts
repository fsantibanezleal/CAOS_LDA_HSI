/**
 * Typed FastAPI client. Endpoints are intentionally narrow; subsequent
 * task branches add per-page wrappers as their pages are implemented.
 *
 * Both relative and absolute base paths are supported. In dev the Vite
 * proxy forwards `/api` and `/generated` to FastAPI on `:8105`; in
 * production the same nginx that fronts FastAPI also serves `dist/`,
 * so `/api` and `/generated` are same-origin too.
 */

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  url: string;
  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.url = url;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ApiError(
      `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
    );
  }
  return (await res.json()) as T;
}

async function requestBuffer(
  path: string,
  init?: RequestInit,
): Promise<ArrayBuffer> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new ApiError(
      `Request failed: ${res.status} ${res.statusText}`,
      res.status,
      url,
    );
  }
  return await res.arrayBuffer();
}

export type RawFile = {
  raw_dataset_id: string;
  source_group: string;
  source: string;
  name: string;
  kind: string;
  url: string;
  size_bytes: number;
  sha256?: string;
};

export type DatasetEntry = {
  id: string;
  name: string;
  family_id: string;
  family_title: string;
  modality: string;
  domains: string[];
  fit_for_demo: string;
  supervision_states: string[];
  label_scope?: string | null;
  measurement_scope?: string | null;
  supervision_caveat?: string | null;
  acquisition_status: string;
  access: string;
  direct_download: boolean;
  license_note?: string | null;
  last_verified?: string | null;
  local_raw_available: boolean;
  raw_file_count: number;
  raw_total_size_bytes: number;
  raw_total_size_gb: number;
  raw_files: RawFile[];
};

export type FamilyView = {
  family_id: string;
  family_title: string;
  cataloged_count: number;
  local_raw_count: number;
};

export type DatasetInventory = {
  source: string;
  generated_at: string;
  summary: {
    cataloged_dataset_count: number;
    datasets_with_local_raw: number;
    raw_total_size_bytes: number;
    raw_total_size_gb: number;
    source_group_counts: Record<string, number>;
  };
  family_views: FamilyView[];
  theme_groups: unknown[];
  datasets: DatasetEntry[];
};

export type MetricStats = {
  mean: number;
  std: number;
  median: number;
  ci95_lo: number;
  ci95_hi: number;
  min: number;
  max: number;
  values: number[];
};

export type MethodSummary = {
  n_evaluations: number;
  accuracy: MetricStats;
  balanced_accuracy: MetricStats;
  macro_f1: MetricStats;
};

export type PairedComparison = {
  a: string;
  b: string;
  delta_mean: number;
  delta_std: number;
  delta_min: number;
  delta_max: number;
};

export type SceneMethodStats = {
  dataset_id: string;
  dataset_name: string;
  family_id: string;
  scene_summary: {
    cube_shape: number[];
    sampled_documents: number;
    class_count: number;
    topic_count: number;
    pca_components: number;
  };
  methods: Record<string, MethodSummary>;
  paired_comparisons: PairedComparison[][];
};

export type MethodStatistics = {
  source: string;
  generated_at: string;
  method_definitions: Record<string, string>;
  alpha_significance: number;
  labeled_scenes: SceneMethodStats[];
};

export type ClassEntry = {
  label_id: number;
  name: string;
  count: number;
  rel_freq: number;
  color: string;
};

export type ClassMeanSpectrum = {
  mean: number[];
  std: number[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
};

export type ScenePerScene = {
  scene_id: string;
  scene_name: string;
  sensor: string;
  family_id: string;
  spatial_shape: [number, number];
  n_pixels: number;
  n_labelled_pixels: number;
  n_classes: number;
  imbalance_gini: number;
  wavelengths_nm: number[];
  class_distribution: ClassEntry[];
  class_mean_spectra: Record<string, ClassMeanSpectrum>;
};

export type TopWord = {
  token: string;
  p_w_given_topic: number;
  p_w_global: number;
  lift: number;
  relevance: number;
};

export type TopicViews = {
  scene_id: string;
  scene_name: string;
  topic_count: number;
  vocabulary_size: number;
  document_count: number;
  wavelengths_nm: number[];
  vocabulary: string[];
  topic_prevalence: number[];
  topic_band_profiles: number[][];
  topic_distance_cosine: number[][];
  topic_intertopic_2d_js: [number, number][];
  topic_intertopic_3d_js: [number, number, number][];
  top_words_per_topic: Record<string, TopWord[][]>;
};

export type LabelCell = {
  label_id: number;
  name: string;
  color: string;
  count: number;
  p: number;
};

export type EmbeddingPoint2D = {
  doc_id: number;
  x: number;
  y: number;
  label_id?: number;
  dominant_topic_k?: number;
  confidence?: number;
};

export type EmbeddingPoint3D = EmbeddingPoint2D & {
  z: number;
};

export type TopicToData = {
  scene_id: string;
  topic_count: number;
  document_count: number;
  spatial_shape: [number, number];
  p_label_given_topic_dominant: LabelCell[][];
  p_label_given_topic_strict_theta_gt_0_5: LabelCell[][];
  docs_per_topic_dominant: number[];
  docs_per_topic_strict: number[];
  kl_to_label_prior_per_topic: number[];
  theta_embedding_pca_2d: EmbeddingPoint2D[];
  theta_embedding_pca_3d: EmbeddingPoint3D[];
  theta_embedding_explained_variance: number[];
};

export const api = {
  health: () => request<{ status: string }>("/api/healthz"),
  appData: () => request<unknown>("/api/app-data"),
  manifest: () => request<unknown>("/api/manifest"),
  inventory: () => request<DatasetInventory>("/api/local-dataset-inventory"),
  methodStatistics: () => request<MethodStatistics>("/api/method-statistics"),
  edaPerScene: (sceneId: string) =>
    request<ScenePerScene>(`/api/eda/per-scene/${encodeURIComponent(sceneId)}`),
  topicViews: (sceneId: string) =>
    request<TopicViews>(`/api/topic-views/${encodeURIComponent(sceneId)}`),
  topicToData: (sceneId: string) =>
    request<TopicToData>(`/api/topic-to-data/${encodeURIComponent(sceneId)}`),
  topicRoutedClassifier: (sceneId: string) =>
    request<TopicRoutedClassifier>(
      `/api/topic-routed-classifier/${encodeURIComponent(sceneId)}`,
    ),
  hidsagMethodStatistics: (subsetCode: string) =>
    request<HidsagMethodStatistics>(
      `/api/method-statistics-hidsag/${encodeURIComponent(subsetCode)}`,
    ),
  buffer: (path: string) => requestBuffer(path),
};

export type HidsagDistribution = {
  mean: number | null;
  std: number | null;
  ci95_lo: number | null;
  ci95_hi: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

export type HidsagMethodAggregate = {
  n_targets: number;
  r2_distribution?: HidsagDistribution;
  macro_f1_distribution?: HidsagDistribution;
};

export type HidsagBlock = {
  primary_metric: string;
  n_targets: number;
  n_targets_complete?: number;
  target_names: string[];
  method_aggregates: Record<string, HidsagMethodAggregate>;
  ranking?: { method: string; mean: number; rank: number }[];
};

export type HidsagMethodStatistics = {
  subset_code: string;
  dataset_id: string;
  sample_count: number;
  measurement_count_total: number;
  regression: HidsagBlock | null;
  classification: HidsagBlock | null;
};

export type RoutedFoldMetric = {
  per_fold: number[];
  mean: number;
  std: number;
  ci95_lo: number;
  ci95_hi: number;
};

export type RoutedMethodMetrics = {
  macro_f1: RoutedFoldMetric;
  accuracy: RoutedFoldMetric;
  balanced_accuracy?: RoutedFoldMetric;
};

export type TopicRoutedClassifier = {
  scene_id: string;
  K: number;
  n_classes: number;
  n_documents: number;
  method_metrics: Record<string, RoutedMethodMetrics>;
  ranking_by_macro_f1_mean: {
    method: string;
    macro_f1_mean: number;
    macro_f1_ci95: [number, number];
  }[];
};
