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

export const api = {
  health: () => request<{ status: string }>("/api/healthz"),
  appData: () => request<unknown>("/api/app-data"),
  manifest: () => request<unknown>("/api/manifest"),
  inventory: () => request<DatasetInventory>("/api/local-dataset-inventory"),
  methodStatistics: () => request<MethodStatistics>("/api/method-statistics"),
  edaPerScene: (sceneId: string) =>
    request<ScenePerScene>(`/api/eda/per-scene/${encodeURIComponent(sceneId)}`),
  buffer: (path: string) => requestBuffer(path),
};
