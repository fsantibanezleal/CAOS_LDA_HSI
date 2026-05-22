/**
 * Rate-distortion + Mutual-information family API surface. Extracted
 * from `api/client.ts` (#441 P1 item 2.4, c324).
 *
 * Endpoints:
 *   - GET /api/rate-distortion-curve/{scene} → RateDistortionCurve
 *   - GET /api/mutual-information/{scene}    → MutualInformation
 *
 * Both surfaces back the Benchmarks "axes" tab + the Workspace
 * Metrics tab; they share no callers with the Routed family but live
 * adjacent because both are scalar-per-K curves.
 */
import { request } from "./_http";

// ---- rate-distortion types ----------------------------------------

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

// ---- mutual-information types -------------------------------------

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

// ---- runtime --------------------------------------------------------

export function rateDistortionCurve(sceneId: string) {
  return request<RateDistortionCurve>(
    `/api/rate-distortion-curve/${encodeURIComponent(sceneId)}`,
  );
}

export function mutualInformation(sceneId: string) {
  return request<MutualInformation>(
    `/api/mutual-information/${encodeURIComponent(sceneId)}`,
  );
}
