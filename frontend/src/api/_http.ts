/**
 * Shared HTTP primitives for the api/ subtree. Lives at `_http.ts` so
 * the bandmask / eda / topics / hidsag per-family modules can call
 * `request()` without circular imports through `client.ts`.
 *
 * Behaviour identical to the original implementation in `client.ts` —
 * extracted as part of the c261 api-client split (#441 P1 item 2.4).
 */

import { APP_COMMIT_SHA } from "@/lib/version";

const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// Per-deploy cache-buster. /api and /generated responses carry
// `Cache-Control: no-cache` (revalidate via ETag), but a client whose cache
// was poisoned BEFORE that header existed can keep serving a stale body under
// heuristic freshness. Stamping the build SHA into the query string changes
// the URL on every deploy, so a new build can never read a previous build's
// cached payload (this is why a regenerated EDA could still render n=0).
const CACHE_BUST =
  APP_COMMIT_SHA && APP_COMMIT_SHA !== "dev" ? APP_COMMIT_SHA.slice(0, 8) : "";

function withVersion(path: string): string {
  if (!CACHE_BUST) return path;
  return `${path}${path.includes("?") ? "&" : "?"}v=${CACHE_BUST}`;
}

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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}${withVersion(path)}`;
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

export async function requestBuffer(
  path: string,
  init?: RequestInit,
): Promise<ArrayBuffer> {
  const url = `${BASE}${withVersion(path)}`;
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
