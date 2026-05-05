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

export const api = {
  health: () => request<{ status: string }>("/api/healthz"),
  appData: () => request<unknown>("/api/app-data"),
  manifest: () => request<unknown>("/api/manifest"),
  inventory: () => request<DatasetInventory>("/api/local-dataset-inventory"),
  buffer: (path: string) => requestBuffer(path),
};
