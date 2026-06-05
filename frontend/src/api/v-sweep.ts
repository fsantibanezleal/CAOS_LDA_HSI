/**
 * V-sweep API surface (issue #606). One-shot per-method report or sweep
 * status snapshot. The shards are written by the data pipeline as the
 * 19-recipe (V1-V20; V16 scaffold) × multi-axis sweep progresses; while the pipeline is mid-run the
 * /status endpoint reports current coverage and /methods/:recipe returns
 * whatever shards exist with the rest as null fields.
 */
import { request } from "./_http";

export type VSweepTopicViewSummary = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  status: string;
  K?: number | null;
  D?: number | null;
  V?: number | null;
  mean_doc_length?: number | null;
  perplexity?: number | null;
  fit_seconds?: number | null;
};

export type VSweepF1Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  D: number;
  V: number;
  mean_doc_length: number;
  raw_logistic_per_fold: number[];
  topic_routed_soft_per_fold: number[];
  raw_logistic_mean: number;
  topic_routed_soft_mean: number;
  gain_routed_over_raw: number;
};

export type VSweepF2Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  V: number;
  top_n: number;
  u_mass?: number | null;
  c_npmi?: number | null;
  c_v?: number | null;
};

export type VSweepF7Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  n_classes: number;
  H_label_marginal_bits: number;
  H_label_given_topic_bits: number;
  mutual_information_bits: number;
  normalised_mi: number;
};

export type VSweepF14Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  top_n: number;
  mean_pairwise_jaccard: number;
  max_pairwise_jaccard: number;
  n_redundant_pairs_above_0_5: number;
};

export type VSweepF18Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  n_seeds: number;
  top_n: number;
  seeds_used: number[];
  mean_matched_cosine: number;
  frac_above_0_5: number;
  frac_above_0_7: number;
};

export type VSweepHdpRecord = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  backbone: string;
  T_truncation: number;
  K_inferred_total: number;
  K_effective: number;
  K_ground_truth_classes: number;
  f16_model_selection_adequacy: number | null;
  f2_c_v: number;
  f14_mean_pairwise_jaccard: number;
  fit_seconds: number;
};

export type VSweepBackboneRecord = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  backbone: string;
  K: number;
  D: number;
  V: number;
  mean_doc_length: number;
  f2_c_v: number;
  f14_mean_pairwise_jaccard: number;
  fit_seconds: number;
  status: string;
};

export type VSweepF13TopFeature = {
  vocab_index?: number | null;
  token?: string | null;
  name?: string | null;
  mean_abs_shap: number;
};

export type VSweepF13Topic = {
  topic: number;
  features?: VSweepF13TopFeature[] | null;
  top_features?: VSweepF13TopFeature[] | null;
};

export type VSweepF13Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  top_m: number;
  n_samples_explained?: number | null;
  n_background?: number | null;
  top_features_per_topic?: VSweepF13Topic[] | null;
};

export type VSweepF22Record = {
  scene_id: string;
  recipe: string;
  scheme: string;
  Q: number;
  K: number;
  n_samples: number;
  n_flipped_within_max_steps?: number | null;
  n_not_flipped?: number | null;
  counterfactual_l1_median?: number | null;
  counterfactual_l1_mean?: number | null;
};

export type VSweepRecipeScene = {
  scene_id: string;
  topic_view?: VSweepTopicViewSummary | null;
  f1?: VSweepF1Record | null;
  f2?: VSweepF2Record | null;
  f7?: VSweepF7Record | null;
  f13?: VSweepF13Record | null;
  f14?: VSweepF14Record | null;
  f18?: VSweepF18Record | null;
  f22?: VSweepF22Record | null;
  hdp?: VSweepHdpRecord | null;
  prodlda?: VSweepBackboneRecord | null;
  etm?: VSweepBackboneRecord | null;
};

export type VSweepRecipeReport = {
  recipe: string;
  scheme: string;
  Q: number;
  scenes: VSweepRecipeScene[];
};

export type VSweepStatus = {
  recipes: string[];
  scenes: string[];
  topic_view_count: number;
  f1_count: number;
  f2_count: number;
  total_expected: number;
};

export function vSweepStatus(scheme = "uniform", q = 8) {
  const params = new URLSearchParams({ scheme, q: String(q) });
  return request<VSweepStatus>(`/api/v-sweep/status?${params.toString()}`);
}

export function vSweepMethodReport(recipe: string, scheme = "uniform", q = 8) {
  const params = new URLSearchParams({ scheme, q: String(q) });
  return request<VSweepRecipeReport>(
    `/api/v-sweep/methods/${encodeURIComponent(recipe)}?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Q-trajectory — how refining quantisation Q∈{8,16,32} moves a single
// recipe's score on one evaluation axis. Backed by GET /v-sweep/q-trajectory.
// Each Q level carries the per-scene cells plus the mean across the scenes
// that have a shard at that Q. `lower_is_better` flips the winner direction
// (only F-14 repetitiveness in the surfaced axis set).
// ---------------------------------------------------------------------------

/** Evaluation axes the q-trajectory endpoint accepts. */
export const Q_TRAJECTORY_AXES = ["F-1", "F-2", "F-7", "F-14", "F-18", "F-22"] as const;
export type QTrajectoryAxis = (typeof Q_TRAJECTORY_AXES)[number];

export type VSweepQTrajectoryLevel = {
  /** Mean of `per_scene` across the scenes present at this Q level. */
  mean: number;
  /** Number of scenes contributing to `mean`. */
  n_scenes: number;
  /** scene_id → axis value at this Q level. */
  per_scene: Record<string, number>;
};

export type VSweepQTrajectory = {
  recipe: string;
  axis: string;
  lower_is_better: boolean;
  /** Keyed "Q=8" | "Q=16" | "Q=32"; a key is absent if no shard exists. */
  trajectory: Record<string, VSweepQTrajectoryLevel>;
};

export function vSweepQTrajectory(recipe: string, axis: QTrajectoryAxis) {
  const params = new URLSearchParams({ recipe, axis });
  return request<VSweepQTrajectory>(
    `/api/v-sweep/q-trajectory?${params.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// Backbones F-7 — topic-to-label NMI under each non-LDA backbone (HDP /
// ProdLDA / ETM) plus LDA, for every (recipe, scene) cell on disk at the
// requested quantisation level. Backed by GET /v-sweep/backbones-f7.
// ---------------------------------------------------------------------------

export type VSweepBackboneF7 = {
  backbone: string;
  /** scene_id → recipe → NMI. */
  cells: Record<string, Record<string, number>>;
  /** recipe → mean NMI across scenes. */
  recipe_means: Record<string, number>;
  n_cells: number;
};

export type VSweepBackbonesF7 = {
  q: number;
  backbones: VSweepBackboneF7[];
};

export function vSweepBackbonesF7(q: 8 | 16 | 32) {
  const params = new URLSearchParams({ q: String(q) });
  return request<VSweepBackbonesF7>(
    `/api/v-sweep/backbones-f7?${params.toString()}`,
  );
}
