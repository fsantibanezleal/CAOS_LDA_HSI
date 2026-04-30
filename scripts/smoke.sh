#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8105}"
BASE_URL="${BASE_URL%/}"

paths=(
  "/healthz"
  "/api/app-data"
  "/api/spectral-library"
  "/generated/real/previews/cuprite-aviris-reflectance-rgb.png"
  "/generated/spectral/library_samples.json"
  "/"
)

for path in "${paths[@]}"; do
  url="${BASE_URL}${path}"
  status="$(curl -L -s -o /dev/null -w "%{http_code}" "$url")"
  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    echo "Smoke check failed for $url with status $status" >&2
    exit 1
  fi
  echo "OK $status $url"
done

echo "Smoke checks passed for $BASE_URL"
