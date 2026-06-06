/**
 * HIDSAG family API surface. Third slice of the c261 api/client.ts
 * split (#441 P1 2.4).
 *
 * Carries the 8 HIDSAG-specific types from the original client.ts:
 *   HidsagPreprocessingSubset, HidsagCrossPreprocessingStability,
 *   HidsagPreprocessingSensitivity, HidsagDistribution,
 *   HidsagMethodAggregate, HidsagBlock, HidsagMethodStatistics,
 *   HidsagEda.
 *
 * Runtime calls (hidsagEda, hidsagPreprocessingSensitivity, etc.)
 * stay inside the existing `api` object in client.ts for back-compat;
 * a future cycle can migrate them to a `hidsagApi` namespace once
 * call sites are ready.
 */

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

// Per-variable distribution stats. `n` is always present; the rest are
// present only when n > 0 (build_eda_hidsag emits {n: 0} for empty variables).
export type HidsagVariableStats = {
  n: number;
  n_nonzero?: number;
  mean?: number;
  std?: number;
  min?: number;
  p5?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p95?: number;
  max?: number;
};

// One mean spectrum per measurement (average of the patch grid).
export type HidsagMeanSpectrum = {
  measurement_name: string;
  sample_name: string;
  patch_count: number;
  tags: string[];
  mean_spectrum_round4: number[];
};

export type HidsagSpectrumAxisBand = {
  modality: string;
  band_index_within_modality: number;
  wavelength_nm: number;
};

export type HidsagCorrelation = {
  variables: string[];
  matrix: number[][];
};

export type HidsagEda = {
  subset_code: string;
  sample_count: number;
  measurement_count_total: number;
  numeric_variable_names: string[];
  numeric_variables: Record<string, HidsagVariableStats>;
  modality_band_counts: Record<string, number>;
  spectrum_axis: HidsagSpectrumAxisBand[];
  mean_spectrum_by_measurement: HidsagMeanSpectrum[];
  mean_spectrum_by_measurement_stratum?: {
    stratum: string;
    measurement_count: number;
    mean_spectrum_round4: number[];
  }[];
  correlation_pearson?: HidsagCorrelation | null;
  correlation_spearman?: HidsagCorrelation | null;
  measurement_tags_top?: string[];
  dominant_targets_by_mean?: {
    name: string;
    mean: number;
    max?: number;
    nonzero_samples?: number;
    std?: number | null;
    min?: number | null;
  }[];
  generated_at?: string;
  builder_version?: string;
};
