/**
 * Typed API helpers for the CAOS LDA HSI backend.
 * Single thin client: every helper is `getJson<T>(path)` with the
 * specific endpoint shape baked in. No auto-typing of the full
 * response — we only declare what we read.
 */

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${path}`);
  return r.json() as Promise<T>;
}

async function getBytes(path: string): Promise<ArrayBuffer> {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${r.status} for ${path}`);
  return r.arrayBuffer();
}

export const LABELLED_SCENES: { id: string; label: string; bands: number; classes: number }[] = [
  { id: "indian-pines-corrected", label: "Indian Pines", bands: 200, classes: 16 },
  { id: "salinas-corrected", label: "Salinas", bands: 204, classes: 16 },
  { id: "salinas-a-corrected", label: "Salinas-A", bands: 204, classes: 6 },
  { id: "pavia-university", label: "Pavia U", bands: 103, classes: 9 },
  { id: "kennedy-space-center", label: "KSC", bands: 176, classes: 13 },
  { id: "botswana", label: "Botswana", bands: 145, classes: 14 },
];

export const HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"];

/* ===== Manifest ===== */
export interface Manifest {
  generated_at: string;
  git_sha: string;
  artifact_count?: number;
  builder_count?: number;
  claims_allowed_count?: number;
  derived_total_bytes?: number;
  builders?: Record<string, { files_count: number; total_bytes: number }>;
}
export const fetchManifest = () => getJson<Manifest>("/api/manifest");

/* ===== EDA per scene ===== */
export interface EdaPerScene {
  scene_id: string;
  spatial_shape: [number, number];
  n_classes: number;
  n_pixels_total: number;
  n_pixels_labelled: number;
  imbalance_gini: number;
  class_distribution: { class_id: number; class_name: string; count: number; share: number }[];
  class_mean_spectra: {
    wavelengths_nm: number[];
    classes: { class_id: number; class_name: string; mean: number[]; p05: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }[];
  };
  band_discriminative: { wavelengths_nm: number[]; fisher_ratio: number[]; anova_F: number[]; mutual_information: number[] };
}
export const fetchEda = (scene: string) => getJson<EdaPerScene>(`/api/eda/per-scene/${encodeURIComponent(scene)}`);

/* ===== Topic views (LDAvis-faithful) ===== */
export interface TopicViews {
  scene_id: string;
  topic_count: number;
  wavelengths_nm: number[];
  topic_prevalence: number[];
  topic_band_profiles: number[][]; // K x B
  topic_intertopic_2d_js: { x: number; y: number }[];
  topic_intertopic_3d_js?: { x: number; y: number; z: number }[];
  top_words_per_topic: { lambda_0_3: { token: string; relevance: number }[]; lambda_0_6: { token: string; relevance: number }[]; lambda_1_0: { token: string; relevance: number }[] }[];
  topic_distance_cosine: number[][];
  topic_distance_js: number[][];
}
export const fetchTopicViews = (scene: string) => getJson<TopicViews>(`/api/topic-views/${encodeURIComponent(scene)}`);

/* ===== Topic-to-data ===== */
export interface TopicToData {
  scene_id: string;
  topic_count: number;
  spatial_shape: [number, number];
  topic_class_distribution: { topic_id: number; class_distribution: { class_id: number; class_name: string; share: number }[] }[];
  dominant_topic_map: { sentinel_unlabelled: number };
  theta_pca_2d?: { x: number; y: number; class_id: number }[];
  theta_pca_3d?: { x: number; y: number; z: number; class_id: number }[];
}
export const fetchTopicToData = (scene: string) => getJson<TopicToData>(`/api/topic-to-data/${encodeURIComponent(scene)}`);

/* ===== Spatial validation (categorical Moran's I + IoU) ===== */
export interface SpatialValidation {
  scene_id: string;
  spatial_shape: [number, number];
  topic_count: number;
  n_assigned_pixels: number;
  morans_I_weighted_by_topic_support: number;
  topic_label_iou: { topic_k: number; best_label_id: number | null; best_label_name: string | null; best_iou: number }[];
  best_iou_summary: { max_iou_overall: number; mean_best_iou: number };
}
export const fetchSpatial = (scene: string) => getJson<SpatialValidation>(`/api/spatial/${encodeURIComponent(scene)}`);

/* ===== Linear probe panel (B-1) ===== */
export interface LinearProbePanel {
  scene_id: string;
  topic_count: number;
  ranking_by_macro_f1_mean: { method: string; latent_dim: number; macro_f1_mean: number; macro_f1_ci95: [number, number] }[];
  pairwise_vs_theta_holm: { method: string; W: number; p_raw: number; p_holm: number; cliff_delta_theta_minus_method: number }[];
  method_metrics: Record<string, { latent_dim: number; macro_f1: { per_fold: number[]; mean: number; std: number; ci95_lo: number; ci95_hi: number } }>;
}
export const fetchLinearProbe = (scene: string) => getJson<LinearProbePanel>(`/api/linear-probe-panel/${encodeURIComponent(scene)}`);

/* ===== Topic-routed classifier (B-3) ===== */
export interface TopicRouted {
  scene_id: string;
  K: number;
  ranking_by_macro_f1_mean: { method: string; macro_f1_mean: number; macro_f1_ci95: [number, number] }[];
  method_metrics: Record<string, { macro_f1: { per_fold: number[]; mean: number; ci95_lo: number; ci95_hi: number } }>;
}
export const fetchTopicRouted = (scene: string) => getJson<TopicRouted>(`/api/topic-routed-classifier/${encodeURIComponent(scene)}`);

/* ===== Bayesian classification posterior on labelled scenes ===== */
export interface BayesianLabelled {
  task_type: string;
  scope: string;
  n_observations: number;
  method_names: string[];
  method_posteriors: { method: string; posterior_mean: number; posterior_std: number; hdi94_lo: number; hdi94_hi: number }[];
  pairwise_p_a_gt_b: Record<string, Record<string, number>>;
}
export const fetchBayesianLabelled = () => getJson<BayesianLabelled>("/api/bayesian-comparison/classification-labelled");

/* ===== Mutual information ===== */
export interface MutualInformation {
  scene_id: string;
  topic_count: number;
  ranking_by_joint_mi: { method: string; latent_dim: number; joint_mi_clipped: number; fraction_of_label_entropy_recovered: number }[];
  method_mi: Record<string, { label_entropy_nats: number; per_feature_mi_sum_nats: number; joint_mi_clipped_to_label_entropy: number; per_feature_mi: number[]; latent_dim: number }>;
}
export const fetchMutualInfo = (scene: string) => getJson<MutualInformation>(`/api/mutual-information/${encodeURIComponent(scene)}`);

/* ===== Rate-distortion (B-2) ===== */
export interface RateDistortion {
  scene_id: string;
  K_grid: number[];
  rmse_test_table_by_K: { K: number; rmse_test_lda?: number; rmse_test_nmf?: number; rmse_test_pca?: number; winner?: string }[];
  method_curves: Record<string, { K: number; rmse_test: number }[]>;
}
export const fetchRateDistortion = (scene: string) => getJson<RateDistortion>(`/api/rate-distortion-curve/${encodeURIComponent(scene)}`);

/* ===== Cross-scene transfer (B-8) ===== */
export interface CrossSceneTransfer {
  scene_order: string[];
  transfer_matrix_macro_f1: number[][];
  transfer_pairs: { source_scene: string; target_scene: string; macro_f1_mean: number; per_fold: number[] }[];
}
export const fetchCrossScene = () => getJson<CrossSceneTransfer>("/api/cross-scene-transfer");

/* ===== Topic stability ===== */
export interface TopicStability {
  scene_id: string;
  K: number;
  seeds: number[];
  seed_pair_matched_cosine_mean: number[][];
  per_topic_stability_summary: { topic_id: number; median_matched_cosine_vs_seed0: number; min_matched_cosine_vs_seed0: number }[];
  scene_stability_summary: { off_diagonal_mean: number; off_diagonal_min: number };
}
export const fetchTopicStability = (scene: string) => getJson<TopicStability>(`/api/topic-stability/${encodeURIComponent(scene)}`);

/* ===== Spatial continuous (B-10) ===== */
export interface TopicSpatialContinuous {
  scene_id: string;
  topic_count: number;
  per_topic_continuous_spatial: { topic_id: number; morans_I_continuous: number; gearys_C_continuous: number; mean_abundance_in_mask: number }[];
  aggregated_morans_I_mean_over_topics: number;
  aggregated_gearys_C_mean_over_topics: number;
}
export const fetchSpatialContinuous = (scene: string) => getJson<TopicSpatialContinuous>(`/api/topic-spatial-continuous/${encodeURIComponent(scene)}`);
export const fetchSpatialFull = (scene: string) => getJson<TopicSpatialContinuous>(`/api/topic-spatial-full/${encodeURIComponent(scene)}`);

/* ===== USGS v7 alignment ===== */
export interface TopicToUsgs {
  scene_id: string;
  topic_count: number;
  library_sample_count: number;
  top_n_per_topic: { rank: number; name: string; chapter: string; cosine: number }[][];
  chapter_histogram_top50_per_topic: Record<string, number>[];
  best_match_per_chapter_per_topic: Record<string, { name: string; cosine: number }>[];
}
export const fetchUsgs = (scene: string) => getJson<TopicToUsgs>(`/api/topic-to-usgs-v7/${encodeURIComponent(scene)}`);

/* ===== Endmember baseline (B-11) ===== */
export interface EndmemberBaseline {
  scene_id: string;
  K: number;
  reconstruction_rmse_normalised: number;
  topic_endmember_match: { topic_x_endmember_cosine: number[][] } | null;
}
export const fetchEndmember = (scene: string) => getJson<EndmemberBaseline>(`/api/endmember-baseline/${encodeURIComponent(scene)}`);

/* ===== Topic anomaly (B-9) ===== */
export interface TopicAnomaly {
  scene_id: string;
  topic_count: number;
  indicators: {
    anomaly_softmax_global: { mean: number; median: number; p95: number; max: number };
    nll_global: { mean: number; median: number; p95: number; max: number };
  };
  anomaly_to_misclassification_correlation: { spearman_rho_softmax: number; spearman_rho_nll: number };
  per_class_summary: { class_id: number; class_name: string | null; n_documents: number; anomaly_softmax_median: number; nll_median: number; fraction_misclassified: number }[];
}
export const fetchAnomaly = (scene: string) => getJson<TopicAnomaly>(`/api/topic-anomaly/${encodeURIComponent(scene)}`);

/* ===== LDA sweep (K × seed) ===== */
export interface LdaSweep {
  scene_id: string;
  K_grid: number[];
  recommended_K: number;
  grid: { K: number; perplexity_test_mean: number | null; npmi_mean: number; matched_cosine_mean: number; topic_diversity_mean: number }[];
}
export const fetchLdaSweep = (scene: string) => getJson<LdaSweep>(`/api/lda-sweep/${encodeURIComponent(scene)}`);

/* ===== Embedded baseline (B-5) ===== */
export interface EmbeddedBaseline {
  scene_id: string;
  K: number;
  ranking_by_macro_f1_mean: { method: string; macro_f1_mean: number; macro_f1_ci95: [number, number] }[];
  concat_vs_pca: { macro_f1_diff_mean_concat_minus_pca: number; cliff_delta_concat_minus_pca: number; wilcoxon_p_two_sided: number };
}
export const fetchEmbedded = (scene: string) => getJson<EmbeddedBaseline>(`/api/embedded-baseline/${encodeURIComponent(scene)}`);

/* ===== Spectral browser (sampled spectra binary) ===== */
export const fetchSpectralBrowserBin = (scene: string) => getBytes(`/generated/spectral_browser/${encodeURIComponent(scene)}/spectra.bin`);

/* ===== Dominant topic map (binary uint8) ===== */
export const fetchDominantMapBin = (scene: string) => getBytes(`/generated/topic_to_data/${encodeURIComponent(scene)}_dominant_topic_map.bin`);

/* ===== Method statistics HIDSAG (cross-method R^2 / F1 for HIDSAG) ===== */
export interface MethodStatHidsag {
  subset_code: string;
  regression: { method_aggregates: Record<string, { aggregate_mean: number; ci95_lo: number; ci95_hi: number }>; target_names: string[] };
  classification: { method_aggregates: Record<string, { aggregate_mean: number; ci95_lo: number; ci95_hi: number }>; target_names: string[] };
}
export const fetchMethodStatHidsag = (subset: string) => getJson<MethodStatHidsag>(`/api/method-statistics-hidsag/${encodeURIComponent(subset)}`);

/* ===== Cross-method agreement matrix (label, dominant LDA topic, groupings) ===== */
export interface CrossMethodAgreement {
  scene_id: string;
  partitions: string[];
  pairwise_ari: number[][];
  pairwise_nmi: number[][];
}
export const fetchCrossMethod = (scene: string) => getJson<CrossMethodAgreement>(`/api/cross-method-agreement/${encodeURIComponent(scene)}`);
