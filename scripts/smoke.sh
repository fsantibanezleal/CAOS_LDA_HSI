#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8105}"
BASE_URL="${BASE_URL%/}"

paths=(
  "/healthz"
  "/api/app-data"
  "/api/data-families"
  "/api/corpus-recipes"
  "/api/interactive-subsets"
  "/api/corpus-previews"
  "/api/segmentation-baselines"
  "/api/local-validation-matrix"
  "/api/local-dataset-inventory"
  "/api/local-core-benchmarks"
  "/api/subset-cards"
  "/api/subset-cards/salinas-labeled-scene-pack"
  "/api/subset-cards/cuprite-exploratory-mineral-pack"
  "/api/subset-cards/usgs-material-reference-slice"
  "/api/spectral-library"
  "/api/analysis"
  "/generated/real/previews/cuprite-aviris-reflectance-rgb.png"
  "/generated/spectral/library_samples.json"
  "/generated/analysis/analysis.json"
  "/generated/corpus/corpus_previews.json"
  "/generated/baselines/segmentation_baselines.json"
  "/generated/core/local_dataset_inventory.json"
  "/generated/core/local_core_benchmarks.json"
  "/generated/subsets/index.json"
  "/generated/subsets/salinas-labeled-scene-pack.json"
  "/generated/baselines/previews/cuprite-aviris-reflectance-slic.png"
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
