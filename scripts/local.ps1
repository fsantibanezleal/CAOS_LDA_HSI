# CAOS LDA HSI -- local dev runner (Windows / PowerShell 5.1+)

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet("dev", "build", "preview", "demo", "fetch", "fetch-msi", "fetch-spectral", "fetch-unmixing", "fetch-all", "build-real", "build-field", "build-spectral", "build-analysis", "build-corpus", "build-baselines", "build-inventory", "run-core", "build-local-core", "smoke", "clean", "stop", "help")]
    [string]$Command = "help"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Show-Help {
    Write-Host ""
    Write-Host "CAOS LDA HSI -- local dev runner" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Subcommands:"
    Write-Host "  dev         Start backend (uvicorn :8105) + frontend dev server (Vite :5173)"
    Write-Host "  build       Build the frontend bundle into frontend/dist"
    Write-Host "  preview     Build the frontend, regenerate demo assets, and run FastAPI"
    Write-Host "  demo        Rebuild the synthetic demo payload"
    Write-Host "  fetch       Download official compact public HSI raw scenes into data/raw"
    Write-Host "  fetch-msi   Download official MicaSense MSI sample data into data/raw"
    Write-Host "  fetch-spectral Download compact USGS spectral-library archives"
    Write-Host "  fetch-unmixing Download compact public HSI unmixing scenes and libraries"
    Write-Host "  fetch-all   Download all public raw sources used by the local demo"
    Write-Host "  build-real  Rebuild compact real-scene HSI derived assets from downloaded raw scenes"
    Write-Host "  build-field Rebuild compact field MSI derived assets from downloaded raw scenes"
    Write-Host "  build-spectral Rebuild compact USGS spectral-library samples"
    Write-Host "  build-analysis Rebuild compact PCA/KMeans diagnostics from derived assets"
    Write-Host "  build-corpus Rebuild static corpus previews from derived assets"
    Write-Host "  build-baselines Rebuild static SLIC segmentation baselines from raw scenes"
    Write-Host "  build-inventory Build unified local dataset/raw inventory for the validation backend"
    Write-Host "  run-core    Run local PTM/LDA, clustering, stability, SAM, NMF, and supervised benchmarks"
    Write-Host "  build-local-core Run inventory + full local-core benchmarks"
    Write-Host "  smoke       Smoke test a running local app at http://127.0.0.1:8105"
    Write-Host "  clean       Remove build outputs and Python caches"
    Write-Host "  stop        Kill local Python and Node processes started from this repo"
    Write-Host "  help        Show this message"
}

function Ensure-Venv {
    if (-not (Test-Path ".venv")) {
        Write-Host "Creating .venv ..." -ForegroundColor DarkGray
        python -m venv .venv
    }
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    & .\.venv\Scripts\python.exe -m pip install -r requirements.txt | Out-Null
}

function Ensure-PipelineVenv {
    if (-not (Test-Path ".venv-pipeline")) {
        Write-Host "Creating .venv-pipeline ..." -ForegroundColor DarkGray
        python -m venv .venv-pipeline
    }
    & .\.venv-pipeline\Scripts\python.exe -m pip install --upgrade pip wheel | Out-Null
    & .\.venv-pipeline\Scripts\python.exe -m pip install -r data-pipeline\requirements.txt | Out-Null
}

function Ensure-Frontend {
    if (-not (Test-Path "frontend\node_modules")) {
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm install } else { npm install }
        } finally { Pop-Location }
    }
}

function Ensure-DerivedIfMissing {
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
    "dev" {
        Ensure-Venv
        Ensure-Frontend
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py | Out-Null
        Ensure-DerivedIfMissing
        Write-Host "[backend] uvicorn :8105 (in background)" -ForegroundColor Green
        $back = Start-Process -PassThru -NoNewWindow -FilePath ".\.venv\Scripts\python.exe" `
            -ArgumentList "-m","uvicorn","app.main:app","--reload","--host","127.0.0.1","--port","8105"
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

    "build" {
        Ensure-Frontend
        Push-Location frontend
        try {
            $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
            if ($pnpm) { pnpm build } else { npm run build }
        } finally { Pop-Location }
    }

    "preview" {
        Ensure-Venv
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py
        Ensure-DerivedIfMissing
        & "$PSCommandPath" build
        Write-Host "Backend serving the built SPA at http://127.0.0.1:8105" -ForegroundColor Green
        & .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8105
    }

    "demo" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_demo.py
    }

    "fetch" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_hsi.py
    }

    "fetch-msi" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_msi.py
    }

    "fetch-spectral" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_spectral_libraries.py
    }

    "fetch-unmixing" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_unmixing.py
    }

    "fetch-all" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_hsi.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_msi.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_spectral_libraries.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\fetch_public_unmixing.py
    }

    "build-real" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_real_samples.py
    }

    "build-field" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_field_samples.py
    }

    "build-spectral" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_spectral_library_samples.py
    }

    "build-analysis" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_analysis_payload.py
    }

    "build-corpus" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_corpus_previews.py
    }

    "build-baselines" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_segmentation_baselines.py
    }

    "build-inventory" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_local_inventory.py
    }

    "run-core" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_local_core_benchmarks.py
    }

    "build-local-core" {
        Ensure-PipelineVenv
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\build_local_inventory.py
        & .\.venv-pipeline\Scripts\python.exe data-pipeline\run_local_core_benchmarks.py
    }

    "smoke" {
        & .\scripts\smoke.ps1 -BaseUrl "http://127.0.0.1:8105"
    }

    "clean" {
        Get-ChildItem -Recurse -Force -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force
        if (Test-Path "frontend\dist") { Remove-Item -Recurse -Force "frontend\dist" }
        if (Test-Path "frontend\.vite") { Remove-Item -Recurse -Force "frontend\.vite" }
        Write-Host "Cleaned build outputs." -ForegroundColor Green
    }

    "stop" {
        Get-Process -Name "uvicorn","python","node","pnpm","npm" -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -match "CAOS_LDA_HSI" } |
            ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
        Write-Host "Stopped local dev processes." -ForegroundColor Green
    }

    default { Show-Help }
}
