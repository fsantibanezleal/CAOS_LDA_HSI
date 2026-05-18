/**
 * Band-mask family API surface. Extracted from `api/client.ts` as the
 * first slice of #441 P1 item 2.4 ("api/client.ts 1392 LOC / 96 exports").
 *
 * Endpoints (c236):
 *   - GET /api/band-masks                          → BandMaskIndex
 *   - GET /api/band-masks/canonical-comparison     → BandMaskCanonicalComparison
 *   - GET /api/band-masks/{scene}/{mask}           → BandMaskSummary
 *   - GET /api/band-masks-hidsag                   → BandMaskHidsagIndex
 *   - GET /api/band-masks-hidsag/{subset}/{mask}   → BandMaskHidsagSummary
 *
 * The runtime calls + their wrappers live here; `api/client.ts`
 * re-exports for backwards compatibility so existing imports keep
 * working without per-file churn.
 */
import type {
  DominantTopicMapMeta,
  LabelCell,
  LdaConfig,
  ThetaGridMeta,
} from "./client";

// ---- types ----------------------------------------------------------

export type BandMaskIndexEntry = {
  scene_id: string;
  mask_id: string;
  mask_label?: string;
  topic_count?: number;
  n_bands_full?: number;
  n_bands_kept?: number;
  perplexity_train?: number;
  ari_dominant_vs_label?: number;
  mean_confidence?: number;
  summary_path?: string;
  skipped?: boolean;
  reason?: string;
};

export type BandMaskIndex = {
  generated_at: string;
  builder_version: string;
  mask_definitions: Record<
    string,
    { label: string; description: string }
  >;
  entries: BandMaskIndexEntry[];
};

export type BandMaskComparisonEntry = {
  scene_id: string;
  mask_id: string;
  skipped?: boolean;
  reason?: string;
  n_paired_pixels?: number;
  paired_ari_dominant_topics?: number | null;
  swap_rate_under_hungarian_alignment?: number;
  n_topic_swaps?: number;
  kl_p_label_given_topic_mean?: number | null;
  kl_p_label_given_topic_max?: number | null;
  hungarian_assignment?: Record<string, number>;
  topic_count_canonical?: number;
  topic_count_masked?: number;
  n_bands_full?: number;
  n_bands_kept?: number;
  ari_dominant_vs_label_masked?: number;
  perplexity_train_masked?: number;
};

export type BandMaskCanonicalComparison = {
  generated_at: string;
  builder_version: string;
  description: string;
  entries: BandMaskComparisonEntry[];
};

export type BandMaskHidsagIndexEntry = {
  subset_code: string;
  mask_id: string;
  mask_label?: string;
  topic_count?: number;
  n_bands_full?: number;
  n_bands_kept?: number;
  perplexity_train?: number;
  mean_confidence?: number;
  summary_path?: string;
  skipped?: boolean;
  reason?: string;
};

export type BandMaskHidsagIndex = {
  generated_at: string;
  builder_version: string;
  modality: string;
  mask_definitions: Record<string, { label: string; description: string }>;
  entries: BandMaskHidsagIndexEntry[];
};

export type HidsagCovariateProbability = {
  covariate: string;
  count: number;
  p: number;
};

export type BandMaskHidsagSummary = {
  subset_code: string;
  mask_id: string;
  mask_label: string;
  mask_description: string;
  modality: string;
  topic_count: number;
  document_count: number;
  vocabulary_size: number;
  n_bands_full: number;
  n_bands_kept: number;
  kept_band_indices: number[];
  wavelengths_nm_kept_first_last: [number, number];
  wavelengths_nm_kept: number[];
  topic_prevalence: number[];
  topic_distance_cosine: number[][];
  top_words_per_topic_lambda_05: string[][];
  p_covariate_given_topic_dominant: HidsagCovariateProbability[][];
  docs_per_topic_dominant: number[];
  perplexity_train: number;
  mean_confidence: number;
  doc_names: string[];
  sample_names: string[];
  covariates: string[];
  theta_per_doc: number[][];
  lda_config: LdaConfig;
  generated_at: string;
  builder_version: string;
};

export type BandMaskSummary = {
  scene_id: string;
  mask_id: string;
  mask_label: string;
  mask_description: string;
  spatial_shape: [number, number];
  topic_count: number;
  document_count: number;
  vocabulary_size: number;
  n_bands_full: number;
  n_bands_kept: number;
  kept_band_indices: number[];
  wavelengths_nm_kept_first_last: [number, number];
  wavelengths_nm_kept: number[];
  topic_prevalence: number[];
  topic_distance_cosine: number[][];
  top_words_per_topic_lambda_05: string[][];
  p_label_given_topic_dominant: LabelCell[][];
  docs_per_topic_dominant: number[];
  perplexity_train: number;
  ari_dominant_vs_label: number;
  mean_confidence: number;
  lda_config: LdaConfig;
  dominant_topic_map: DominantTopicMapMeta;
  theta_grid: ThetaGridMeta;
  generated_at: string;
  builder_version: string;
};

// ---- runtime calls --------------------------------------------------

import { request } from "./_http";

export const bandMaskApi = {
  index: () => request<BandMaskIndex>(`/api/band-masks`),
  canonicalComparison: () =>
    request<BandMaskCanonicalComparison>(`/api/band-masks/canonical-comparison`),
  summary: (sceneId: string, maskId: string) =>
    request<BandMaskSummary>(
      `/api/band-masks/${encodeURIComponent(sceneId)}/${encodeURIComponent(maskId)}`,
    ),
  hidsagIndex: () =>
    request<BandMaskHidsagIndex>(`/api/band-masks-hidsag`),
  hidsagSummary: (subsetCode: string, maskId: string) =>
    request<BandMaskHidsagSummary>(
      `/api/band-masks-hidsag/${encodeURIComponent(subsetCode)}/${encodeURIComponent(maskId)}`,
    ),
};
