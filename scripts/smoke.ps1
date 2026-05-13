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
    "/api/wordifications/indian-pines-corrected/V4/uniform/8",
    "/api/wordifications/indian-pines-corrected/V5/quantile/16",
    "/api/wordifications/indian-pines-corrected/V10/uniform/8",
    "/api/wordifications/indian-pines-corrected/V6/quantile/16",
    "/api/wordifications/indian-pines-corrected/V8/uniform/8",
    "/api/wordifications/indian-pines-corrected/V9/uniform/8",
    "/api/wordifications/indian-pines-corrected/V12/uniform/16",
    "/api/wordifications/indian-pines-corrected/V7/uniform/8",
    "/api/wordifications/indian-pines-corrected/V11/uniform/8",
    "/api/groupings",
    "/api/groupings/felzenszwalb/indian-pines-corrected",
    "/api/cross-method-agreement/indian-pines-corrected",
    "/api/method-statistics-hidsag/GEOMET",
    "/api/external-validation/indian-pines-corrected/literature",
    "/api/external-validation/hidsag/GEOMET/methods",
    "/api/narratives/indian-pines-corrected",
    "/api/interpretability/indian-pines-corrected/topic_cards",
    "/api/interpretability/indian-pines-corrected/band_cards",
    "/api/interpretability/indian-pines-corrected/document_cards",
    "/api/quantization-sensitivity/indian-pines-corrected",
    "/api/topic-variants",
    "/api/lda-sweep/indian-pines-corrected",
    "/api/band-masks",
    "/api/band-masks/canonical-comparison",
    "/api/band-masks/indian-pines-corrected/vnir",
    "/api/band-masks/indian-pines-corrected/swir",
    "/api/band-masks/indian-pines-corrected/no_water",
    "/api/band-masks/indian-pines-corrected/top_50_fisher",
    "/api/representations",
    "/api/representations/pca_30/indian-pines-corrected",
    "/api/dmr-lda-hidsag/MINERAL1",
    "/api/bayesian-comparison/regression",
    "/api/linear-probe-panel/indian-pines-corrected",
    "/api/mutual-information/indian-pines-corrected",
    "/api/mutual-information/hidsag/MINERAL1",
    "/api/rate-distortion-curve/indian-pines-corrected",
    "/api/topic-routed-classifier/indian-pines-corrected",
    "/api/embedded-baseline/indian-pines-corrected",
    "/api/topic-stability/indian-pines-corrected",
    "/api/deep-seed-stability/indian-pines-corrected",
    "/api/deep-anomaly/indian-pines-corrected",
    "/api/classical-seed-stability/indian-pines-corrected",
    "/api/topic-to-usgs-v7/indian-pines-corrected",
    "/api/topic-anomaly/indian-pines-corrected",
    "/api/topic-spatial-continuous/indian-pines-corrected",
    "/api/topic-spatial-full/indian-pines-corrected",
    "/api/endmember-baseline/indian-pines-corrected",
    "/api/cross-scene-transfer",
    "/api/super-topics",
    "/api/bayesian-comparison/classification-labelled",
    "/api/bayesian-comparison/classification-labelled-deep",
    "/api/neural-topic-comparison/indian-pines-corrected",
    "/api/neural-topic-seed-stability/indian-pines-corrected",
    "/generated/groupings/felzenszwalb/indian-pines-corrected.json",
    "/generated/cross_method_agreement/indian-pines-corrected.json",
    "/generated/method_statistics_hidsag/GEOMET.json",
    "/generated/external_validation/indian-pines-corrected_literature.json",
    "/generated/external_validation/GEOMET_methods.json",
    "/generated/narratives/indian-pines-corrected.json",
    "/generated/interpretability/indian-pines-corrected/topic_cards.json",
    "/generated/interpretability/indian-pines-corrected/band_cards.json",
    "/generated/interpretability/indian-pines-corrected/document_cards.json",
    "/generated/quantization_sensitivity/indian-pines-corrected.json",
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
    # ---- SPA root (only present once frontend/dist exists) ----
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

# ---- SPA shell content checks (cycle 108) -------------------------------
# Status-code-only checks let an empty/broken React build pass smoke green
# (lesson from cycle 99-101: xstate matching bug shipped to prod with
# smoke 84/84). Below we verify the SPA shell is non-trivial AND that its
# entry chunk contains the canonical version marker baked in by Vite.
$baseTrimmed = $BaseUrl.TrimEnd('/')
$rootUrl = "$baseTrimmed/"
$rootResp = Invoke-WebRequest -UseBasicParsing -Uri $rootUrl
$rootBody = $rootResp.Content
$rootLen = $rootBody.Length
if ($rootLen -lt 500) {
    throw "SPA shell check failed: body of $rootUrl is only $rootLen chars (<500)"
}
if ($rootBody -notmatch '<div id="root"') {
    throw "SPA shell check failed: body of $rootUrl has no <div id=`"root`">"
}
$entryMatch = [regex]::Match($rootBody, '<script[^>]+type="module"[^>]+src="([^"]+)"')
if (-not $entryMatch.Success) {
    throw "SPA shell check failed: no <script type=`"module`" src=`"...`"> in $rootUrl"
}
$entrySrc = $entryMatch.Groups[1].Value
if ($entrySrc -match '^https?://') {
    $entryUrl = $entrySrc
} elseif ($entrySrc.StartsWith('/')) {
    $entryUrl = "$baseTrimmed$entrySrc"
} else {
    $entryUrl = "$baseTrimmed/$entrySrc"
}
$entryResp = Invoke-WebRequest -UseBasicParsing -Uri $entryUrl
$entryBody = $entryResp.Content
$entryLen = $entryBody.Length
if ($entryLen -lt 1000) {
    throw "SPA bundle check failed: $entryUrl is only $entryLen bytes (<1000)"
}
# The version string lives in version.ts and is normally bundled into the
# main entry chunk. If a future refactor moves it into a lazy chunk, search
# modulepreload assets too.
$versionFound = $null
if ($entryBody -match 'cycle [0-9]+') {
    $versionFound = "entry"
} else {
    $preloadMatches = [regex]::Matches($rootBody, '<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"')
    foreach ($pm in $preloadMatches) {
        $preloadSrc = $pm.Groups[1].Value
        if ($preloadSrc -match '^https?://') {
            $preloadUrl = $preloadSrc
        } elseif ($preloadSrc.StartsWith('/')) {
            $preloadUrl = "$baseTrimmed$preloadSrc"
        } else {
            $preloadUrl = "$baseTrimmed/$preloadSrc"
        }
        $pResp = Invoke-WebRequest -UseBasicParsing -Uri $preloadUrl
        if ($pResp.Content -match 'cycle [0-9]+') {
            $versionFound = "preload:$preloadUrl"
            break
        }
    }
}
if (-not $versionFound) {
    throw "SPA bundle check failed: no `"cycle N`" version marker in entry chunk or modulepreload chunks"
}
Write-Host "OK shell $($rootLen)B + entry bundle $($entryLen)B at $entryUrl (version marker in $versionFound)"

Write-Host "Smoke checks passed for $BaseUrl"
