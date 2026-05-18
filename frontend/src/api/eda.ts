/**
 * EDA family API surface. Second slice of the c261 api/client.ts
 * split (#441 P1 2.4).
 *
 * Endpoints (c238 / c245):
 *   - GET /api/eda/per-scene/{scene}   → ScenePerScene
 *   - GET /api/eda/hidsag/{subset}     → HidsagEda
 *
 * Pulls out the three EDA-specific types (ClassEntry,
 * ClassMeanSpectrum, ScenePerScene) plus the two runtime calls into
 * their own module. `client.ts` re-exports the types so existing
 * consumers (`import { ScenePerScene } from '@/api/client'`) keep
 * working without per-file churn.
 */
import { request } from "./_http";

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

export const edaApi = {
  perScene: (sceneId: string) =>
    request<ScenePerScene>(
      `/api/eda/per-scene/${encodeURIComponent(sceneId)}`,
    ),
  // HidsagEda lives in client.ts (it depends on a long chain of HIDSAG
  // types) — the per-scene EDA call is the one we move now.
};
