# CAOS LDA HSI smoke-test runner.

[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8105"
)

$ErrorActionPreference = "Stop"

$paths = @(
    "/healthz",
    "/api/app-data",
    "/api/data-families",
    "/api/corpus-recipes",
    "/api/interactive-subsets",
    "/api/corpus-previews",
    "/api/segmentation-baselines",
    "/api/local-validation-matrix",
    "/api/local-dataset-inventory",
    "/api/local-core-benchmarks",
    "/api/exploration-views",
    "/api/method-statistics",
    "/api/subset-cards",
    "/api/subset-cards/salinas-labeled-scene-pack",
    "/api/subset-cards/cuprite-exploratory-mineral-pack",
    "/api/subset-cards/usgs-material-reference-slice",
    "/api/spectral-library",
    "/api/analysis",
    "/generated/real/previews/cuprite-aviris-reflectance-rgb.png",
    "/generated/spectral/library_samples.json",
    "/generated/analysis/analysis.json",
    "/generated/corpus/corpus_previews.json",
    "/generated/baselines/segmentation_baselines.json",
    "/generated/core/local_dataset_inventory.json",
    "/generated/core/local_core_benchmarks.json",
    "/generated/subsets/index.json",
    "/generated/subsets/salinas-labeled-scene-pack.json",
    "/generated/baselines/previews/cuprite-aviris-reflectance-slic.png",
    # ---- precompute layer (master-plan section 18) ----
    "/api/manifest",
    "/api/eda/per-scene/indian-pines-corrected",
    "/api/topic-views/indian-pines-corrected",
    "/api/topic-to-data/indian-pines-corrected",
    "/api/spectral-browser/indian-pines-corrected",
    "/api/spectral-density/indian-pines-corrected",
    "/api/validation-blocks/indian-pines-corrected",
    "/api/eda/hidsag/GEOMET",
    "/api/topic-to-library/indian-pines-corrected",
    "/api/spatial/indian-pines-corrected",
    "/api/wordifications",
    "/api/wordifications/indian-pines-corrected/V3/uniform/16",
    "/api/groupings",
    "/api/groupings/felzenszwalb/indian-pines-corrected",
    "/api/cross-method-agreement/indian-pines-corrected",
    "/generated/groupings/felzenszwalb/indian-pines-corrected.json",
    "/generated/cross_method_agreement/indian-pines-corrected.json",
    "/generated/spectral_browser/indian-pines-corrected/spectra.bin",
    "/generated/spectral_density/indian-pines-corrected/density_global.bin",
    "/generated/eda/per_scene/indian-pines-corrected.json",
    "/generated/eda/hidsag/GEOMET.json",
    "/generated/topic_views/indian-pines-corrected.json",
    "/generated/topic_to_data/indian-pines-corrected.json",
    "/generated/validation_blocks/indian-pines-corrected.json",
    "/generated/topic_to_library/indian-pines-corrected.json",
    "/generated/spatial/indian-pines-corrected.json",
    "/generated/wordifications/indian-pines-corrected_V3_uniform_Q16.json",
    "/generated/manifests/index.json",
    "/"
)

foreach ($path in $paths) {
    $url = "$($BaseUrl.TrimEnd('/'))$path"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "Smoke check failed for $url with status $($response.StatusCode)"
    }
    Write-Host "OK $($response.StatusCode) $url"
}

Write-Host "Smoke checks passed for $BaseUrl"
