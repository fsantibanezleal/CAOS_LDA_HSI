/**
 * Routed-classifier family API surface. Extracted from `api/client.ts`
 * as the second-slice continuation of #441 P1 item 2.4
 * ("api/client.ts split into per-family files").
 *
 * Endpoints (c323):
 *   - GET /api/topic-routed-classifier/{scene}     → TopicRoutedClassifier
 *   - GET /api/topic-routed-deep-gate/{scene}      → TopicRoutedDeepGate
 *
 * The runtime calls live here; `api/client.ts` re-exports for
 * backwards compatibility so existing imports keep working.
 */
import { request } from "./_http";

// ---- types ----------------------------------------------------------

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

// ---- runtime --------------------------------------------------------

export function topicRoutedClassifier(sceneId: string) {
  return request<TopicRoutedClassifier>(
    `/api/topic-routed-classifier/${encodeURIComponent(sceneId)}`,
  );
}

export function topicRoutedDeepGate(sceneId: string) {
  return request<TopicRoutedDeepGate>(
    `/api/topic-routed-deep-gate/${encodeURIComponent(sceneId)}`,
  );
}
