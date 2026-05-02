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
    "/api/spectral-library",
    "/api/analysis",
    "/generated/real/previews/cuprite-aviris-reflectance-rgb.png",
    "/generated/spectral/library_samples.json",
    "/generated/analysis/analysis.json",
    "/generated/corpus/corpus_previews.json",
    "/generated/baselines/segmentation_baselines.json",
    "/generated/core/local_dataset_inventory.json",
    "/generated/core/local_core_benchmarks.json",
    "/generated/baselines/previews/cuprite-aviris-reflectance-slic.png",
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
