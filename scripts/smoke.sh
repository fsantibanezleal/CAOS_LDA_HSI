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
  "/api/exploration-views"
  "/api/method-statistics"
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
  # ---- precompute layer (master-plan section 18) ----
  "/api/manifest"
  "/api/eda/per-scene/indian-pines-corrected"
  "/api/topic-views/indian-pines-corrected"
  "/api/topic-to-data/indian-pines-corrected"
  "/api/spectral-browser/indian-pines-corrected"
  "/api/spectral-density/indian-pines-corrected"
  "/api/validation-blocks/indian-pines-corrected"
  "/api/eda/hidsag/GEOMET"
  "/api/topic-to-library/indian-pines-corrected"
  "/api/spatial/indian-pines-corrected"
  "/api/wordifications"
  "/api/wordifications/indian-pines-corrected/V3/uniform/16"
  "/api/wordifications/indian-pines-corrected/V4/uniform/8"
  "/api/wordifications/indian-pines-corrected/V5/quantile/16"
  "/api/wordifications/indian-pines-corrected/V10/uniform/8"
  "/api/wordifications/indian-pines-corrected/V6/quantile/16"
  "/api/wordifications/indian-pines-corrected/V8/uniform/8"
  "/api/wordifications/indian-pines-corrected/V9/uniform/8"
  "/api/wordifications/indian-pines-corrected/V12/uniform/16"
  "/api/wordifications/indian-pines-corrected/V7/uniform/8"
  "/api/wordifications/indian-pines-corrected/V11/uniform/8"
  "/api/groupings"
  "/api/groupings/felzenszwalb/indian-pines-corrected"
  "/api/cross-method-agreement/indian-pines-corrected"
  "/api/method-statistics-hidsag/GEOMET"
  "/api/external-validation/indian-pines-corrected/literature"
  "/api/external-validation/hidsag/GEOMET/methods"
  "/api/narratives/indian-pines-corrected"
  "/api/interpretability/indian-pines-corrected/topic_cards"
  "/api/interpretability/indian-pines-corrected/band_cards"
  "/api/interpretability/indian-pines-corrected/document_cards"
  "/api/quantization-sensitivity/indian-pines-corrected"
  "/api/topic-variants"
  "/api/lda-sweep/indian-pines-corrected"
  "/api/band-masks"
  "/api/band-masks/indian-pines-corrected/vnir"
  "/api/band-masks/indian-pines-corrected/swir"
  "/api/band-masks/indian-pines-corrected/no_water"
  "/api/band-masks/indian-pines-corrected/top_50_fisher"
  "/api/representations"
  "/api/representations/pca_30/indian-pines-corrected"
  "/api/dmr-lda-hidsag/MINERAL1"
  "/api/bayesian-comparison/regression"
  "/api/linear-probe-panel/indian-pines-corrected"
  "/api/mutual-information/indian-pines-corrected"
  "/api/mutual-information/hidsag/MINERAL1"
  "/api/rate-distortion-curve/indian-pines-corrected"
  "/api/topic-routed-classifier/indian-pines-corrected"
  "/api/embedded-baseline/indian-pines-corrected"
  "/api/topic-stability/indian-pines-corrected"
  "/api/deep-seed-stability/indian-pines-corrected"
  "/api/deep-anomaly/indian-pines-corrected"
  "/api/classical-seed-stability/indian-pines-corrected"
  "/api/topic-to-usgs-v7/indian-pines-corrected"
  "/api/topic-anomaly/indian-pines-corrected"
  "/api/topic-spatial-continuous/indian-pines-corrected"
  "/api/topic-spatial-full/indian-pines-corrected"
  "/api/endmember-baseline/indian-pines-corrected"
  "/api/cross-scene-transfer"
  "/api/super-topics"
  "/api/bayesian-comparison/classification-labelled"
  "/api/bayesian-comparison/classification-labelled-deep"
  "/api/neural-topic-comparison/indian-pines-corrected"
  "/api/neural-topic-seed-stability/indian-pines-corrected"
  "/generated/groupings/felzenszwalb/indian-pines-corrected.json"
  "/generated/cross_method_agreement/indian-pines-corrected.json"
  "/generated/method_statistics_hidsag/GEOMET.json"
  "/generated/external_validation/indian-pines-corrected_literature.json"
  "/generated/external_validation/GEOMET_methods.json"
  "/generated/narratives/indian-pines-corrected.json"
  "/generated/interpretability/indian-pines-corrected/topic_cards.json"
  "/generated/interpretability/indian-pines-corrected/band_cards.json"
  "/generated/interpretability/indian-pines-corrected/document_cards.json"
  "/generated/quantization_sensitivity/indian-pines-corrected.json"
  "/generated/spectral_browser/indian-pines-corrected/spectra.bin"
  "/generated/spectral_density/indian-pines-corrected/density_global.bin"
  "/generated/eda/per_scene/indian-pines-corrected.json"
  "/generated/eda/hidsag/GEOMET.json"
  "/generated/topic_views/indian-pines-corrected.json"
  "/generated/topic_to_data/indian-pines-corrected.json"
  "/generated/validation_blocks/indian-pines-corrected.json"
  "/generated/topic_to_library/indian-pines-corrected.json"
  "/generated/spatial/indian-pines-corrected.json"
  "/generated/wordifications/indian-pines-corrected_V3_uniform_Q16.json"
  "/generated/manifests/index.json"
  # ---- SPA root (only present once frontend/dist exists) ----
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

# ---- SPA shell content checks (cycle 108) -------------------------------
# Status-code-only checks let an empty/broken React build pass smoke green
# (lesson from cycle 99-101: xstate matching bug shipped to prod with
# smoke 84/84). Below we verify the SPA shell is non-trivial AND that its
# entry chunk contains the canonical version marker baked in by Vite.
root_url="${BASE_URL}/"
root_body="$(curl -L -s "$root_url")"
root_len=${#root_body}
if [[ "$root_len" -lt 500 ]]; then
  echo "SPA shell check failed: body of $root_url is only $root_len chars (<500)" >&2
  exit 1
fi
if ! grep -q '<div id="root"' <<<"$root_body"; then
  echo "SPA shell check failed: body of $root_url has no <div id=\"root\">" >&2
  exit 1
fi
entry_src="$(grep -oE '<script[^>]+type="module"[^>]+src="[^"]+"' <<<"$root_body" \
  | head -1 \
  | grep -oE 'src="[^"]+"' \
  | sed -E 's/.*src="([^"]+)".*/\1/')"
if [[ -z "$entry_src" ]]; then
  echo "SPA shell check failed: no <script type=\"module\" src=\"...\"> in $root_url" >&2
  exit 1
fi
case "$entry_src" in
  http://*|https://*)
    entry_url="$entry_src"
    ;;
  /*)
    entry_url="${BASE_URL}${entry_src}"
    ;;
  *)
    entry_url="${BASE_URL}/${entry_src}"
    ;;
esac
entry_body="$(curl -L -s "$entry_url")"
entry_len=${#entry_body}
if [[ "$entry_len" -lt 1000 ]]; then
  echo "SPA bundle check failed: $entry_url is only $entry_len bytes (<1000)" >&2
  exit 1
fi
# The version string lives in version.ts and is normally bundled into the
# main entry chunk (because AppFooter imports it). If a future refactor
# moves it into a lazy chunk, search modulepreload assets too.
version_found=""
if grep -qE 'cycle [0-9]+' <<<"$entry_body"; then
  version_found="entry"
else
  preload_srcs="$(grep -oE '<link[^>]+rel="modulepreload"[^>]+href="[^"]+"' <<<"$root_body" \
    | grep -oE 'href="[^"]+"' \
    | sed -E 's/.*href="([^"]+)".*/\1/')"
  while IFS= read -r preload_src; do
    [[ -z "$preload_src" ]] && continue
    case "$preload_src" in
      http://*|https://*) preload_url="$preload_src" ;;
      /*) preload_url="${BASE_URL}${preload_src}" ;;
      *) preload_url="${BASE_URL}/${preload_src}" ;;
    esac
    if curl -L -s "$preload_url" | grep -qE 'cycle [0-9]+'; then
      version_found="preload:$preload_url"
      break
    fi
  done <<<"$preload_srcs"
fi
if [[ -z "$version_found" ]]; then
  echo "SPA bundle check failed: no \"cycle N\" version marker in entry chunk or modulepreload chunks" >&2
  exit 1
fi
echo "OK shell ${root_len}B + entry bundle ${entry_len}B at $entry_url (version marker in $version_found)"

echo "Smoke checks passed for $BASE_URL"
