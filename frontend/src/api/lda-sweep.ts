/**
 * LDA-sweep family API surface. Extracted from `api/client.ts` (#441
 * P1 item 2.4, c325).
 *
 * Endpoint:
 *   - GET /api/lda-sweep/{scene} → LdaSweep
 *
 * Backs the canonical-K recommendation grid (per-seed perplexity +
 * topic diversity + matched-cosine).
 */
import { request } from "./_http";

// ---- types ----------------------------------------------------------

export type LdaSweepEntry = {
  K: number;
  n_seeds: number;
  perplexity_test_mean: number;
  perplexity_test_std: number;
  npmi_mean?: number | null;
  topic_diversity_mean: number;
  matched_cosine_mean?: number;
  matched_cosine_min?: number;
  per_seed?: {
    seed: number;
    perplexity_train: number;
    perplexity_test: number;
    npmi: number | null;
    topic_diversity: number;
  }[];
};

export type LdaSweep = {
  scene_id: string;
  K_grid: number[];
  seeds: number[];
  samples_per_class: number;
  wordification: string;
  quantization_scale: number;
  train_fraction: number;
  grid: LdaSweepEntry[];
  recommended_K?: number;
  recommendation_method?: string;
  generated_at?: string;
  builder_version?: string;
};

// ---- runtime --------------------------------------------------------

export function ldaSweep(sceneId: string) {
  return request<LdaSweep>(`/api/lda-sweep/${encodeURIComponent(sceneId)}`);
}
