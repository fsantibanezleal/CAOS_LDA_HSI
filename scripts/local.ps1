# CAOS LDA HSI -- local dev runner (Windows / PowerShell 5.1+)
#
# Subcommands are documented in CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md
# and in the Local Reproduction Guide page of the public wiki.

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet(
        # setup
        "setup-web", "setup-pipeline", "setup-frontend", "setup-all",
        # web
        "dev", "build", "preview", "demo", "smoke", "logs",
        # pipeline -- fetch
        "fetch", "fetch-msi", "fetch-spectral", "fetch-unmixing",
        "fetch-hidsag", "fetch-ecostress", "fetch-all",
        # pipeline -- build derived
        "build-real", "build-field", "build-spectral", "build-analysis",
        "build-corpus", "build-baselines", "build-inventory",
        "build-subset-cards", "build-exploration-views", "build-method-stats",
        "inspect-hidsag", "build-hidsag", "build-hidsag-band-quality",
        "build-hidsag-region-documents",
        # pipeline -- precompute layer (master-plan §18)
        "build-eda-per-scene", "build-eda-hidsag", "build-topic-views",
        "build-topic-to-data", "build-spectral-browser", "build-spectral-density",
        "build-validation-blocks", "build-wordifications",
        "build-topic-to-library", "build-spatial-validation",
        "build-groupings", "build-cross-method-agreement",
        "build-quantization-sensitivity", "build-topic-model-variants",
        "build-method-statistics-hidsag", "build-external-validation",
        "build-narratives", "build-interpretability",
        "build-representations", "build-lda-sweep",
        "build-neural-topic-models", "build-dmr-lda-hidsag",
        "build-bayesian-method-comparison", "build-optuna-hyperparam-search",
        "build-linear-probe-panel", "build-mutual-information",
        "build-rate-distortion-curve", "build-topic-routed-classifier",
        "build-embedded-baseline", "build-topic-stability",
        "build-topic-to-usgs-v7", "build-topic-anomaly",
        "build-topic-spatial-continuous", "build-endmember-baseline",
        "curate-for-web", "build-precompute-all",
        # pipeline -- benchmarks
        "run-core", "run-hidsag-sensitivity", "build-local-core",
        # maintenance
        "clean", "stop", "help"
    )]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Show-Help {
    Write-Host ""
    Write-Host "CAOS LDA HSI -- local dev runner" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Setup:" -ForegroundColor Yellow
    Write-Host "  setup-web                   Create .venv and install backend requirements"
    Write-Host "  setup-pipeline              Create .venv-pipeline and install pipeline requirements"
    Write-Host "  setup-frontend              Install frontend node modules (pnpm or npm)"
    Write-Host "  setup-all                   setup-web + setup-pipeline + setup-frontend"
    Write-Host ""
    Write-Host "Web:" -ForegroundColor Yellow
    Write-Host "  dev                         Backend (uvicorn :8105) + frontend dev server (Vite :5173)"
    Write-Host "  build                       Build the frontend bundle into frontend/dist"
    Write-Host "  preview                     Build the frontend, regenerate demo, run FastAPI on :8105"
    Write-Host "  demo                        Rebuild the synthetic demo payload"
    Write-Host "  smoke                       Smoke-test a running local app at http://127.0.0.1:8105"
    Write-Host "  logs                        Tail the most recent backend dev log under .runtime/logs/"
    Write-Host ""
    Write-Host "Pipeline -- fetch:" -ForegroundColor Yellow
    Write-Host "  fetch                       UPV/EHU public HSI scenes"
    Write-Host "  fetch-msi                   MicaSense MSI sample data"
    Write-Host "  fetch-spectral              USGS spectral-library compact archives"
    Write-Host "  fetch-unmixing              Borsoi Samson / Jasper Ridge / Urban ROIs"
    Write-Host "  fetch-hidsag                HIDSAG metadata (and opt-in ZIPs via CAOS_HIDSAG_DOWNLOAD_IDS)"
    Write-Host "  fetch-ecostress             ECOSTRESS public-category metadata"
    Write-Host "  fetch-all                   Run every fetch script in sequence"
    Write-Host ""
    Write-Host "Pipeline -- build derived:" -ForegroundColor Yellow
    Write-Host "  build-real                  Compact real-scene HSI derived assets"
    Write-Host "  build-field                 Compact field MSI derived assets"
    Write-Host "  build-spectral              Compact USGS spectral-library samples"
    Write-Host "  build-analysis              PCA / KMeans diagnostics"
    Write-Host "  build-corpus                Static corpus previews per recipe"
    Write-Host "  build-baselines             SLIC segmentation baselines"
    Write-Host "  build-inventory             Unified local dataset / raw inventory"
    Write-Host "  build-subset-cards          Compact per-subset cards under data/derived/subsets/"
    Write-Host "  build-exploration-views     Topic similarity, intertopic 2D, class loadings -> data/derived/core/exploration_views.json"
    Write-Host "  build-method-stats          k-fold + multi-seed paired stats -> data/derived/core/method_statistics.json (heavy)"
    Write-Host "  inspect-hidsag              Inspect HIDSAG ZIP subsets without full extraction"
    Write-Host "  build-hidsag                Compact HIDSAG curated subset"
    Write-Host "  build-hidsag-band-quality   Heuristic HIDSAG bad-band summary"
    Write-Host "  build-hidsag-region-documents   HIDSAG patch-level region documents"
    Write-Host ""
    Write-Host "Pipeline -- precompute layer (master-plan ?18):" -ForegroundColor Yellow
    Write-Host "  build-eda-per-scene         EDA: class distribution, percentile envelopes, F-stat / MI per band, class-class distances"
    Write-Host "  build-eda-hidsag            HIDSAG measurement EDA: variable distributions, correlations, dominant targets"
    Write-Host "  build-topic-views           LDAvis-faithful topic views: JS-MDS 2D+3D, real corpus-marginal lambda, log-odds tokens"
    Write-Host "  build-topic-to-data         Posterior interpretation: P(label|topic), top docs per topic, dominant_topic_map"
    Write-Host "  build-spectral-browser      Sampled spectra (binary float32) + metadata for thousands-of-spectra rendering"
    Write-Host "  build-spectral-density      Precomputed band x reflectance density heatmaps per group"
    Write-Host "  build-validation-blocks     Real metrics for corpus-integrity / topic-stability / supervision-association blocks"
    Write-Host "  build-wordifications        V1, V2, V3 recipes (incl. missing Procemin V3) at 3 schemes x 3 Q (162 configs)"
    Write-Host "  build-topic-to-library      Match each topic profile to closest USGS / AVIRIS library samples"
    Write-Host "  build-spatial-validation    Moran's I, connected components, IoU vs ground-truth labels"
    Write-Host "  build-groupings             SLIC / patch / Felzenszwalb document constructors with ARI/NMI vs label"
    Write-Host "  build-cross-method-agreement   Pairwise ARI / NMI / V-measure between every grouping method"
    Write-Host "  curate-for-web              Generate data/derived/manifests/index.json (the contract the web app reads)"
    Write-Host "  build-precompute-all        Run every precompute builder in order"
    Write-Host ""
    Write-Host "Pipeline -- benchmarks:" -ForegroundColor Yellow
    Write-Host "  run-core                    Local PTM/LDA, clustering, stability, SAM, NMF, supervised"
    Write-Host "  run-hidsag-sensitivity      HIDSAG preprocessing-sensitivity benchmark"
    Write-Host "  build-local-core            inventory + run-core + band-quality + sensitivity"
    Write-Host ""
    Write-Host "Maintenance:" -ForegroundColor Yellow
    Write-Host "  clean                       Remove frontend/dist, frontend/.vite, __pycache__"
    Write-Host "  stop                        Kill local Python and Node processes started from this repo"
    Write-Host "  help                        Show this message"
}

function Initialize-WebVenv {
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating .venv ..." -ForegroundColor DarkGray
        python -m venv .venv
    }
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt | Out-Null
}

function Initialize-PipelineVenv {
    if (-not (Test-Path ".venv-pipeline")) {
        Write-Host "Creating .venv-pipeline ..." -ForegroundColor DarkGray
        python -m venv .venv-pipeline
    }
    & .\.venv-pipeline\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    if (Test-Path "data-pipeline\requirements.txt") {
        & .\.venv-pipeline\Scripts\python.exe -m pip install -r data-pipeline\requirements.txt | Out-Null
    } else {
        & .\.venv-pipeline\Scripts\python.exe -m pip install numpy scipy scikit-learn scikit-image gensim pyLDAvis matplotlib requests tqdm spectral pillow pandas | Out-Null
    }
}

function Initialize-Frontend {
    if (-not (Test-Path "frontend\node_modules")) {
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm install } else { npm install }
        } finally { Pop-Location }
    }
}

function Update-DerivedIfMissing {
    if ((Test-Path "data\\raw\\upv_ehu") -and -not (Test-Path "data\\derived\\real\\real_samples.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_real_samples.py | Out-Null
    }
    if ((Test-Path "data\\raw\\micasense") -and -not (Test-Path "data\\derived\\field\\field_samples.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_field_samples.py | Out-Null
    }
    if ((Test-Path "data\\raw\\usgs_splib07") -and -not (Test-Path "data\\derived\\spectral\\library_samples.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_library_samples.py | Out-Null
    }
    if ((Test-Path "data\\derived\\real\\real_samples.json") -and (Test-Path "data\\derived\\spectral\\library_samples.json") -and -not (Test-Path "data\\derived\\analysis\\analysis.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_analysis_payload.py | Out-Null
    }
    if ((Test-Path "data\\derived\\real\\real_samples.json") -and (Test-Path "data\\derived\\spectral\\library_samples.json") -and -not (Test-Path "data\\derived\\corpus\\corpus_previews.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_corpus_previews.py | Out-Null
    }
    if ((Test-Path "data\\raw\\upv_ehu") -and -not (Test-Path "data\\derived\\baselines\\segmentation_baselines.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_segmentation_baselines.py | Out-Null
    }
    if ((Test-Path "data\\raw") -and -not (Test-Path "data\\derived\\core\\local_dataset_inventory.json")) {
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_local_inventory.py | Out-Null
    }
}

switch ($Command) {

    # ---- setup -----------------------------------------------------------
    "setup-web"      { Initialize-WebVenv ;          Write-Host ".venv ready." -ForegroundColor Green }
    "setup-pipeline" { Initialize-PipelineVenv ;  Write-Host ".venv-pipeline ready." -ForegroundColor Green }
    "setup-frontend" { Initialize-Frontend ;      Write-Host "frontend modules ready." -ForegroundColor Green }
    "setup-all"      {
        Initialize-WebVenv
        Initialize-PipelineVenv
        Initialize-Frontend
        Write-Host "All local environments ready." -ForegroundColor Green
    }

    # ---- web -------------------------------------------------------------
    "dev" {
        Initialize-WebVenv
        Initialize-Frontend
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py | Out-Null
        Update-DerivedIfMissing
        # Route backend logs to .runtime/logs/ so nothing leaks into the repo root.
        if (-not (Test-Path ".runtime\logs")) {
            New-Item -ItemType Directory -Path ".runtime\logs" -Force | Out-Null
        }
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $outLog = ".runtime\logs\uvicorn-dev-$stamp.out.log"
        $errLog = ".runtime\logs\uvicorn-dev-$stamp.err.log"
        Write-Host "[backend] uvicorn :8105 -> $outLog" -ForegroundColor Green
        $back = Start-Process -PassThru -NoNewWindow -FilePath ".\.venv\Scripts\python.exe" `
            -ArgumentList "-m","uvicorn","app.main:app","--reload","--host","127.0.0.1","--port","8105" `
            -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        Start-Sleep -Seconds 1
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm dev } else { npm run dev }
        } finally {
            Pop-Location
            if ($back -and -not $back.HasExited) { Stop-Process -Id $back.Id -Force }
        }
    }

    "logs" {
        if (-not (Test-Path ".runtime\logs")) {
            Write-Host "No logs yet. Run dev first." -ForegroundColor DarkGray
            break
        }
        $latest = Get-ChildItem ".runtime\logs" -Filter "*.out.log" |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if (-not $latest) {
            Write-Host "No .out.log files in .runtime/logs/." -ForegroundColor DarkGray
            break
        }
        Write-Host "Tailing $($latest.FullName) ..." -ForegroundColor Green
        Get-Content -Path $latest.FullName -Tail 50 -Wait
    }

    "build" {
        Initialize-Frontend
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm build } else { npm run build }
        } finally { Pop-Location }
    }

    "preview" {
        Initialize-WebVenv
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py
        Update-DerivedIfMissing
        & "$PSCommandPath" build
        Write-Host "Backend serving the built SPA at http://127.0.0.1:8105" -ForegroundColor Green
        & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8105
    }

    "demo" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py
    }

    "smoke" {
        if (Test-Path ".\scripts\smoke.ps1") {
            & .\scripts\smoke.ps1 -BaseUrl "http://127.0.0.1:8105"
        } else {
            Write-Host "scripts/smoke.ps1 not found." -ForegroundColor Red
            exit 1
        }
    }

    # ---- pipeline -- fetch -----------------------------------------------
    "fetch"            { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_hsi.py }
    "fetch-msi"        { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_msi.py }
    "fetch-spectral"   { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_spectral_libraries.py }
    "fetch-unmixing"   { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_unmixing.py }
    "fetch-hidsag"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_hidsag.py }
    "fetch-ecostress"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_ecostress_metadata.py }
    "fetch-all" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_hsi.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_msi.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_spectral_libraries.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_unmixing.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_hidsag.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_ecostress_metadata.py
    }

    # ---- pipeline -- build derived ---------------------------------------
    "build-real"      { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_real_samples.py }
    "build-field"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_field_samples.py }
    "build-spectral"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_library_samples.py }
    "build-analysis"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_analysis_payload.py }
    "build-corpus"    { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_corpus_previews.py }
    "build-baselines" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_segmentation_baselines.py }
    "build-inventory" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_local_inventory.py }
    "build-subset-cards" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_subset_cards.py }
    "build-exploration-views" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_exploration_views.py }
    "build-method-stats" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_method_statistics.py }
    "inspect-hidsag"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\inspect_hidsag_zip.py }
    "build-hidsag"    { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_hidsag_curated_subset.py }
    "build-hidsag-band-quality"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_hidsag_band_quality.py }
    "build-hidsag-region-documents" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_hidsag_region_documents.py }

    # ---- pipeline -- precompute layer (master-plan §18) -----------------
    "build-eda-per-scene"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_eda_per_scene.py }
    "build-eda-hidsag"        { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_eda_hidsag.py }
    "build-topic-views"       { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_views.py }
    "build-topic-to-data"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_to_data.py }
    "build-spectral-browser"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_browser.py }
    "build-spectral-density"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_density.py }
    "build-validation-blocks" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_validation_blocks.py }
    "build-wordifications"    { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_wordifications.py }
    "build-topic-to-library"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_to_library.py }
    "build-spatial-validation" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spatial_validation.py }
    "build-groupings"         { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_groupings.py }
    "build-cross-method-agreement" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_cross_method_agreement.py }
    "build-quantization-sensitivity" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_quantization_sensitivity.py }
    "build-topic-model-variants" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_model_variants.py }
    "build-method-statistics-hidsag" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_method_statistics_hidsag.py }
    "build-external-validation" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_external_validation.py }
    "build-narratives"        { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_narratives.py }
    "build-interpretability"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_interpretability.py }
    "build-representations"   { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_representations.py }
    "build-lda-sweep"         { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_lda_sweep.py }
    "build-neural-topic-models" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_neural_topic_models.py }
    "build-dmr-lda-hidsag"    { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_dmr_lda_hidsag.py }
    "build-bayesian-method-comparison" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_bayesian_method_comparison.py }
    "build-optuna-hyperparam-search" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_optuna_hyperparam_search.py }
    "build-linear-probe-panel" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_linear_probe_panel.py }
    "build-mutual-information" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_mutual_information.py }
    "build-rate-distortion-curve" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_rate_distortion_curve.py }
    "build-topic-routed-classifier" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_routed_classifier.py }
    "build-embedded-baseline" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_embedded_baseline.py }
    "build-topic-stability"   { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_stability.py }
    "build-topic-to-usgs-v7"  { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_to_usgs_v7.py }
    "build-topic-anomaly"     { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_anomaly.py }
    "build-topic-spatial-continuous" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_spatial_continuous.py }
    "build-endmember-baseline" { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_endmember_baseline.py }
    "curate-for-web"          { Initialize-PipelineVenv ; & .\.venv-pipeline\Scripts\python.exe data-pipeline\curate_for_web.py }
    "build-precompute-all" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_eda_per_scene.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_eda_hidsag.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_views.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_to_data.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_browser.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_density.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_wordifications.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_topic_to_library.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spatial_validation.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_groupings.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_cross_method_agreement.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_validation_blocks.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\curate_for_web.py
    }

    # ---- pipeline -- benchmarks ------------------------------------------
    "run-core" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_local_core_benchmarks.py
    }

    "run-hidsag-sensitivity" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_hidsag_preprocessing_sensitivity.py
    }

    "build-local-core" {
        Initialize-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_local_inventory.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_local_core_benchmarks.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_hidsag_band_quality.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_hidsag_preprocessing_sensitivity.py
    }

    # ---- maintenance -----------------------------------------------------
    "clean" {
        Get-ChildItem -Recurse -Force -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
        if (Test-Path "frontend\dist") { Remove-Item -Recurse -Force "frontend\dist" }
        if (Test-Path "frontend\.vite") { Remove-Item -Recurse -Force "frontend\.vite" }
        if (Test-Path ".runtime") { Remove-Item -Recurse -Force ".runtime" }
        # Purge any stray uvicorn-*.log files that older tooling may have left in repo root.
        Get-ChildItem -File -Filter "uvicorn-*.log" -ErrorAction SilentlyContinue | Remove-Item -Force
        Write-Host "Cleaned build outputs and runtime logs." -ForegroundColor Green
    }

    "stop" {
        Get-Process -Name "uvicorn","python","node","pnpm","npm" -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -match "CAOS_LDA_HSI" } |
            ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Write-Host "Stopped local dev processes." -ForegroundColor Green
    }

    default { Show-Help }
}
