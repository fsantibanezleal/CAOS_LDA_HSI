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
  hidsagPreprocessingSensitivity: () =>
    request<HidsagPreprocessingSensitivity>(
      `/api/hidsag-preprocessing-sensitivity`,
    ),
  hidsagCrossPreprocessingStability: (subsetCode: string) =>
    request<HidsagCrossPreprocessingStability>(
      `/api/hidsag-cross-preprocessing-stability/${encodeURIComponent(subsetCode)}`,
    ),
  spectralBrowserMeta: (sceneId: string) =>
    request<SpectralBrowserMeta>(
      `/api/spectral-browser/${encodeURIComponent(sceneId)}`,
    ),
  topicStability: (sceneId: string) =>
    request<TopicStability>(
      `/api/topic-stability/${encodeURIComponent(sceneId)}`,
    ),
  topicToUsgsV7: (sceneId: string) =>
    request<TopicToUsgsV7>(
      `/api/topic-to-usgs-v7/${encodeURIComponent(sceneId)}`,
    ),
  rateDistortionCurve: (sceneId: string) =>
    request<RateDistortionCurve>(
      `/api/rate-distortion-curve/${encodeURIComponent(sceneId)}`,
    ),
  mutualInformation: (sceneId: string) =>
    request<MutualInformation>(
      `/api/mutual-information/${encodeURIComponent(sceneId)}`,
    ),
  llmTeaLeaves: (sceneId: string) =>
    request<LlmTeaLeaves>(
      `/api/llm-tea-leaves/${encodeURIComponent(sceneId)}`,
    ),
  buffer: (path: string) => requestBuffer(path),
};

export type RateDistortionCurvePoint = {
  K: number;
  rmse_train: number;
  rmse_test: number;
  rmse_test_normalised?: number;
  perplexity_test?: number;
};

export type RateDistortionCurve = {
  scene_id: string;
  K_grid: number[];
  doc_term_shape: [number, number];
  method_curves: Record<string, RateDistortionCurvePoint[]>;
};

export type MutualInformationMethod = {
  label_entropy_nats: number;
  per_feature_mi_sum_nats: number;
  joint_mi_clipped_to_label_entropy: number;
  conditional_entropy_proxy_H_y_given_x: number;
  per_feature_mi: number[];
  latent_dim: number;
};

export type MutualInformation = {
  scene_id: string;
  topic_count: number;
  n_documents: number;
  label_entropy_nats: number;
  label_entropy_bits: number;
  method_mi: Record<string, MutualInformationMethod>;
  ranking_by_joint_mi: {
    method: string;
    latent_dim: number;
    joint_mi_clipped: number;
    fraction_of_label_entropy_recovered: number;
  }[];
};

export type UsgsMatch = {
  rank: number;
  name: string;
  chapter: string;
  filename: string;
  cosine: number;
  sam_radians: number;
};

export type TopicToUsgsV7 = {
  scene_id: string;
  topic_count: number;
  library_subset: string;
  library_sample_count: number;
  library_chapter_counts: Record<string, number>;
  top_n_per_topic: UsgsMatch[][];
  chapter_histogram_top50_per_topic: Record<string, number>[];
  best_match_per_chapter_per_topic: Record<
    string,
    { name: string; filename: string; cosine: number; sam_radians: number }
  >[];
};

export type TopicStability = {
  scene_id: string;
  K: number;
  seeds: number[];
  wordification: string;
  quantization_scale: number;
  samples_per_class: number;
  seed_pair_matched_cosine_mean: number[][];
  seed_pair_matched_cosine_min: number[][];
  per_topic_stability_summary: {
    topic_id: number;
    median_matched_cosine_vs_seed0: number;
    min_matched_cosine_vs_seed0: number;
    std_matched_cosine_vs_seed0: number;
  }[];
  scene_stability_summary: {
    off_diagonal_mean: number;
    off_diagonal_min: number;
    off_diagonal_std: number;
  };
};

export type HidsagPreprocessingSubset = {
  subset_code: string;
  sample_count: number;
  measurement_count_total: number;
  classification_policy_ranking: {
    policy_id: string;
    best_model: string;
    best_balanced_accuracy: number;
  }[];
  regression_policy_ranking: {
    policy_id: string;
    best_model: string;
    best_r2: number;
  }[];
};

export type HidsagCrossPreprocessingStability = {
  subset_code: string;
  topic_count: number;
  policies: string[];
  per_topic_jaccard_vs_policy0: {
    policy_id: string;
    matched_jaccard_top15_mean: number;
    matched_jaccard_top15_min: number;
    per_topic_matched_jaccard_top15: number[];
  }[];
  pairwise_matched_jaccard_top15_mean_matrix: number[][];
  pairwise_matched_jaccard_top15_min_matrix: number[][];
  off_diagonal_summary: {
    off_diagonal_mean: number;
    off_diagonal_min: number;
    off_diagonal_std: number;
    n_pairs: number;
  };
  methodology_note: string;
};

export type HidsagPreprocessingSensitivity = {
  source?: string;
  generated_at?: string;
  methods?: {
    policies?: {
      policy_id: string;
      policy_name: string;
      description: string;
    }[];
  };
  subsets: HidsagPreprocessingSubset[];
};

export type SpectralBrowserRow = {
  i: number;
  label_id: number;
  label_name: string;
  color: string;
  xy: [number, number];
};

export type SpectralBrowserMeta = {
  scene_id: string;
  scene_name: string;
  spatial_shape: [number, number];
  sampling_strategy: string;
  N: number;
  B: number;
  format: string;
  spectra_path: string;
  wavelengths_nm: number[];
  rows: SpectralBrowserRow[];
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

export type LlmTeaLeavesTopic = {
  topic_id: number;
  skipped?: boolean;
  reason?: string;
  top_words?: string[];
  intrusion_candidates?: string[];
  intruder?: string;
  llm_chose?: string | null;
  intrusion_correct?: boolean;
  llm_label?: string;
};

export type LlmTeaLeaves = {
  scene_id: string;
  topic_count: number;
  model: string;
  lambda_used: string;
  top_n_per_topic: number;
  n_attempted: number;
  n_correct_intrusion: number;
  intrusion_accuracy: number;
  per_topic: LlmTeaLeavesTopic[];
  framework_axis: string;
  generated_at: string;
  builder_version: string;
};

