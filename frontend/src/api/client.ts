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

export const api = {
  health: () => request<{ status: string }>("/api/healthz"),
  appData: () => request<unknown>("/api/app-data"),
  manifest: () => request<unknown>("/api/manifest"),
  buffer: (path: string) => requestBuffer(path),
};
