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
  topicRoutedDeepGate: (sceneId: string) =>
    request<TopicRoutedDeepGate>(
      `/api/topic-routed-deep-gate/${encodeURIComponent(sceneId)}`,
    ),
  neuralTopicComparison: (sceneId: string) =>
    request<NeuralTopicComparison>(
      `/api/neural-topic-comparison/${encodeURIComponent(sceneId)}`,
    ),
  neuralTopicSeedStability: (sceneId: string) =>
    request<NeuralTopicSeedStability>(
      `/api/neural-topic-seed-stability/${encodeURIComponent(sceneId)}`,
    ),
  hidsagMethodStatistics: (subsetCode: string) =>
    request<HidsagMethodStatistics>(
      `/api/method-statistics-hidsag/${encodeURIComponent(subsetCode)}`,
    ),
  edaHidsag: (subsetCode: string) =>
    request<HidsagEda>(
      `/generated/eda/hidsag/${encodeURIComponent(subsetCode)}.json`,
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
  topicStability: (sceneId: string, kOffset = 0) =>
    request<TopicStability>(
      `/api/topic-stability/${encodeURIComponent(sceneId)}${kOffset !== 0 ? `?k_offset=${kOffset}` : ""}`,
    ),
  deepSeedStability: (
    sceneId: string,
    method: "cae_1d_8" | "beta_vae_8" | "cae_2d_8" | "cae_3d_8" = "cae_1d_8",
    nSeeds: 7 | 15 = 7,
  ) =>
    request<SeedStability>(
      `/api/deep-seed-stability/${encodeURIComponent(sceneId)}?method=${method}${nSeeds !== 7 ? `&n_seeds=${nSeeds}` : ""}`,
    ),
  classicalSeedStability: (
    sceneId: string,
    method: "pca_8" | "nmf_8" | "ica_8" | "dense_ae_8" = "pca_8",
    nSeeds: 7 | 15 = 7,
  ) =>
    request<SeedStability>(
      `/api/classical-seed-stability/${encodeURIComponent(sceneId)}?method=${method}${nSeeds !== 7 ? `&n_seeds=${nSeeds}` : ""}`,
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
  superTopics: () => request<SuperTopics>(`/api/super-topics`),
  linearProbePanel: (sceneId: string) =>
    request<LinearProbePanel>(
      `/api/linear-probe-panel/${encodeURIComponent(sceneId)}`,
    ),
  bayesianClassificationLabelled: () =>
    request<BayesianComparison>(
      `/api/bayesian-comparison/classification-labelled`,
    ),
  bayesianClassificationLabelledDeep: () =>
    request<BayesianComparison>(
      `/api/bayesian-comparison/classification-labelled-deep`,
    ),
  bayesianRegression: () =>
    request<BayesianComparison>(`/api/bayesian-comparison/regression`),
  representation: (method: string, sceneId: string) =>
    request<RepresentationPayload>(
      `/api/representations/${encodeURIComponent(method)}/${encodeURIComponent(sceneId)}`,
    ),
  crossSceneTransfer: () =>
    request<CrossSceneTransfer>(`/api/cross-scene-transfer`),
  topicSpatialContinuous: (sceneId: string) =>
    request<TopicSpatialContinuous>(
      `/api/topic-spatial-continuous/${encodeURIComponent(sceneId)}`,
    ),
  topicSpatialFull: (sceneId: string) =>
    request<TopicSpatialContinuous>(
      `/api/topic-spatial-full/${encodeURIComponent(sceneId)}`,
    ),
  endmemberBaseline: (sceneId: string) =>
    request<EndmemberBaseline>(
      `/api/endmember-baseline/${encodeURIComponent(sceneId)}`,
    ),
  interpretabilityTopicCards: (sceneId: string) =>
    request<TopicCardsFile>(
      `/generated/interpretability/${encodeURIComponent(sceneId)}/topic_cards.json`,
    ),
  interpretabilityBandCards: (sceneId: string) =>
    request<BandCardsFile>(
      `/generated/interpretability/${encodeURIComponent(sceneId)}/band_cards.json`,
    ),
  interpretabilityDocumentCards: (sceneId: string) =>
    request<DocumentCardsFile>(
      `/generated/interpretability/${encodeURIComponent(sceneId)}/document_cards.json`,
    ),
  quantizationSensitivity: (sceneId: string) =>
    request<QuantizationSensitivity>(
      `/generated/quantization_sensitivity/${encodeURIComponent(sceneId)}.json`,
    ),
  felzenszwalbGroupings: (sceneId: string) =>
    request<FelzenszwalbGroupings>(
      `/generated/groupings/felzenszwalb/${encodeURIComponent(sceneId)}.json`,
    ),
  crossMethodAgreement: (sceneId: string) =>
    request<CrossMethodAgreement>(
      `/generated/cross_method_agreement/${encodeURIComponent(sceneId)}.json`,
    ),
  methodNarratives: (sceneId: string) =>
    request<MethodNarratives>(
      `/generated/narratives/${encodeURIComponent(sceneId)}.json`,
    ),
  topicAnomaly: (sceneId: string) =>
    request<TopicAnomaly>(
      `/api/topic-anomaly/${encodeURIComponent(sceneId)}`,
    ),
  deepAnomaly: (sceneId: string) =>
    request<DeepAnomaly>(
      `/api/deep-anomaly/${encodeURIComponent(sceneId)}`,
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

export type HidsagEda = {
  subset_code: string;
  sample_count: number;
  measurement_count_total: number;
  numeric_variable_names: string[];
  numeric_variables: Record<string, { mean: number; std: number; min: number; max: number; n_finite: number }>;
  modality_band_counts: Record<string, number>;
  spectrum_axis: { wavelength_nm: number[] };
  mean_spectrum_by_measurement: Record<string, { mean: number[]; n: number }>;
  mean_spectrum_by_measurement_stratum?: Record<string, Record<string, { mean: number[]; n: number; stratum_value: number | string | null }>>;
  correlation_pearson?: number[][] | null;
  correlation_spearman?: number[][] | null;
  measurement_tags_top?: string[];
  dominant_targets_by_mean?: { name: string; mean: number; std: number }[];
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

export type TopicRoutedDeepGate = {
  scene_id: string;
  n_documents: number;
  n_classes: number;
  gate_methods: string[];
  method_metrics: Record<string, RoutedMethodMetrics>;
  ranked_by_macro_f1_mean: {
    method: string;
    macro_f1_mean: number;
    macro_f1_ci95: [number, number];
  }[];
  framework_axis?: string;
};

export type NeuralTopicComparisonMethod = {
  K: number;
  downstream_kmeans_vs_label: {
    ari: number;
    nmi: number;
    silhouette: number;
    n_classes: number;
  };
  theta_entropy: {
    K: number;
    max_entropy_uniform: number;
    doc_entropy_mean: number;
    doc_entropy_std: number;
    doc_entropy_normalised_mean: number;
  };
  coherence?: {
    top_n: number;
    c_v?: number | null;
    c_npmi?: number | null;
    u_mass?: number | null;
    error?: string;
  };
  error?: string;
};

export type NeuralTopicComparison = {
  scene_id: string;
  n_documents: number;
  n_classes: number;
  methods: Record<string, NeuralTopicComparisonMethod>;
  ranking_by_ari: { method: string; ari: number }[];
  framework_axis?: string;
};

export type NeuralTopicSeedStabilityMethod = {
  K: number;
  n_seeds: number;
  per_seed: { seed: number; ari?: number; nmi?: number; c_v?: number | null; error?: string }[];
  ari_mean: number | null;
  ari_std: number | null;
  ari_min: number | null;
  ari_max: number | null;
  c_v_mean: number | null;
  c_v_std: number | null;
};

export type NeuralTopicSeedStability = {
  scene_id: string;
  n_documents: number;
  n_classes: number;
  K: number;
  n_seeds: number;
  methods: Record<string, NeuralTopicSeedStabilityMethod>;
  ranking_by_ari_mean: { method: string; ari_mean: number }[];
  framework_axis?: string;
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

export type SuperTopicMember = {
  scene_id: string;
  topic_k: number;
  scene_wavelength_coverage: string;
};

export type SuperTopicCluster = {
  cluster_id: number;
  n_members: number;
  scene_set: string[];
  members: SuperTopicMember[];
  centroid_profile_round6: number[];
};

export type SuperTopicCut = {
  cut_level: number;
  n_clusters: number;
  clusters: SuperTopicCluster[];
};

export type SuperTopics = {
  n_topics_total: number;
  n_scenes: number;
  scenes: string[];
  common_grid: { low_nm: number; high_nm: number; n_bands: number };
  linkage_method: string;
  distance: string;
  linkage_matrix_round6: number[][];
  cuts: SuperTopicCut[];
  scene_pair_super_topic_overlap_at_cut8: Record<string, Record<string, number>>;
  members: SuperTopicMember[];
  generated_at: string;
  builder_version: string;
};

export type LinearProbeMethodMetrics = {
  macro_f1: { mean: number; ci95?: [number, number]; per_fold?: number[] };
  accuracy: { mean: number; ci95?: [number, number] };
  balanced_accuracy?: { mean: number; ci95?: [number, number] };
  latent_dim?: number;
};

export type TopicSpatialContinuous = {
  scene_id: string;
  topic_count: number;
  spatial_shape: [number, number];
  n_sampled_pixels?: number;
  per_topic_continuous_spatial: {
    topic_id: number;
    morans_I_continuous?: number;
    morans_I_continuous_full?: number;
    gearys_C_continuous?: number;
    gearys_C_continuous_full?: number;
    mean_abundance_in_mask?: number;
  }[];
  aggregated_morans_I_mean_over_topics: number;
  aggregated_gearys_C_mean_over_topics: number;
};

export type TopicCard = {
  topic_k: number;
  peak_wavelength_nm: number;
  peak_value: number;
  fwhm_nm: number;
  p_label_given_topic_top3: { label_id: number; name: string; p: number }[];
};
export type TopicCardsFile = {
  scene_id: string;
  K: number;
  topic_cards: TopicCard[];
};

export type BandCard = {
  band_index: number;
  wavelength_nm: number;
  fisher_ratio: number;
  f_stat: number;
  p_value: number;
  mutual_info_vs_label: number;
};
export type BandCardsFile = {
  scene_id: string;
  n_bands: number;
  band_cards: BandCard[];
};

export type DocumentCard = {
  doc_id: string;
  topic_k_dominant: number;
  theta_full: number[];
  theta_k_at_dominant: number;
  label_id: number;
  label_name: string;
};
export type DocumentCardsFile = {
  scene_id: string;
  n_documents: number;
  document_cards: DocumentCard[];
};

export type QuantizationProbe = {
  config: string;
  status: string;
  matched_cosine_mean?: number;
  matched_cosine_min?: number;
  ari_dominant_vs_canonical?: number;
  K?: number;
  V_probe?: number;
  comment?: string;
};
export type QuantizationSensitivity = {
  scene_id: string;
  topic_count: number;
  canonical_recipe: string;
  canonical_scheme: string;
  canonical_Q: number;
  probes: QuantizationProbe[];
};

export type CrossMethodAgreement = {
  scene_id: string;
  spatial_shape: [number, number];
  n_compared_pixels: number;
  method_names: string[];
  ari_matrix: number[][];
  nmi_matrix: number[][];
  v_measure_matrix: number[][];
};

export type MethodNarrativeEntry = {
  method: string;
  captures: Record<string, number | string | null>;
  separates: string | null;
  unites: string | null;
  enables: string | null;
};
export type MethodNarratives = {
  scene_id: string;
  method_narratives: Record<string, MethodNarrativeEntry>;
};

export type FelzenszwalbGroupings = {
  n_groups: number;
  group_size_distribution: { min: number; p25: number; p50: number; p75: number; max: number };
  between_within_variance_ratio: number;
  agreement_vs_label: { ari: number; nmi: number; v_measure: number; n_labelled_pixels: number };
  mean_spectrum_per_group: { group_id: number; size: number; mean: number[] }[];
};

export type EndmemberBaseline = {
  scene_id: string;
  K: number;
  n_pixels_used: number;
  n_bands: number;
  endmember_extractors: string[];
  unmixing_method: string;
  nfindr_endmembers?: number[][];
  atgp_endmembers?: number[][];
  reconstruction_rmse_full_set: number | Record<string, number>;
  reconstruction_rmse_normalised: number | Record<string, number>;
  topic_endmember_match: {
    best_endmember_per_topic?: { topic_id: number; endmember_id: number; cosine: number }[];
    best_topic_per_endmember?: { endmember_id: number; topic_id: number; cosine: number }[];
    topic_x_endmember_cosine?: number[][];
  };
  framework_axis?: string;
  generated_at?: string;
  builder_version?: string;
};

export type CrossSceneTransfer = {
  scene_order: string[];
  common_wavelength_grid: { min_nm: number; max_nm: number; n_bands: number; spacing_nm?: number };
  transfer_matrix_macro_f1: number[][];
  wordification: string;
  quantization_scale?: number | string;
  samples_per_class: number;
  split: string;
  head: string;
  transfer_pairs?: {
    source_scene: string;
    target_scene: string;
    K_source: number;
    macro_f1_mean: number;
    macro_f1_std?: number;
    accuracy_mean?: number;
    balanced_accuracy_mean?: number;
    per_fold?: number[];
  }[];
};

export type TopicAnomaly = {
  scene_id: string;
  topic_count: number;
  n_documents: number;
  anomaly_to_misclassification_correlation: {
    spearman_rho_softmax: number;
    spearman_p_softmax: number;
    spearman_rho_nll: number;
    spearman_p_nll: number;
    comment?: string;
  };
};

export type DeepAnomaly = {
  scene_id: string;
  n_documents: number;
  cae_1d_8: {
    anomaly_indicator: string;
    spearman_rho_vs_misclass: number;
    rmse_overall: { median: number; p95: number };
  };
  beta_vae_8: {
    anomaly_indicators: string[];
    spearman_rho_rmse_vs_misclass: number;
    spearman_rho_kl_vs_misclass: number;
    rmse_overall: { median: number; p95: number };
    kl_overall: { median: number; p95: number };
  };
};

export type RepresentationPayload = {
  scene_id: string;
  method: string;
  n_documents: number;
  latent_dim: number;
  fit_meta: Record<string, number | string>;
  silhouette_label?: { overall: number; per_class?: Record<string, number> };
  downstream_kmeans_vs_label: { ari: number; nmi: number };
  scatter_pca_3d_explained_variance?: number[];
  scatter_2d_3d_subsample?: {
    i: number;
    label_id: number;
    x_2d: number;
    y_2d: number;
    x_3d: number;
    y_3d: number;
    z_3d: number;
  }[];
};

export type BayesianComparison = {
  task_type: string;
  scope: string;
  n_observations: number;
  n_methods: number;
  n_scenes?: number;
  n_subsets?: number;
  n_folds: number;
  method_names: string[];
  scene_names?: string[];
  subset_names?: string[];
  method_posteriors: {
    method: string;
    posterior_mean: number;
    posterior_std: number;
    hdi94_lo: number;
    hdi94_hi: number;
  }[];
  pairwise_p_a_gt_b: Record<string, Record<string, number>>;
  model_summary: string;
  generated_at: string;
  builder_version: string;
};

export type LinearProbePanel = {
  scene_id: string;
  K?: number;
  n_documents?: number;
  n_classes?: number;
  method_metrics: Record<string, LinearProbeMethodMetrics>;
  ranking_by_macro_f1_mean?: { method: string; macro_f1_mean: number }[];
  framework_axis?: string;
};

export type SeedStability = {
  scene_id: string;
  method: string;
  n_seeds: number;
  latent_dim: number;
  samples_per_class: number;
  ari_vs_gt_per_seed: number[];
  ari_vs_gt_summary: {
    mean: number;
    std: number;
    min: number;
    max: number;
  };
  seed_pair_ari: number[][];
  seed_pair_procrustes_dist: number[][];
  off_diagonal_summary: {
    ari_mean: number;
    ari_min: number;
    ari_std: number;
    procrustes_mean: number;
    procrustes_max: number;
  };
  framework_axis: string;
  generated_at: string;
  builder_version: string;
};

