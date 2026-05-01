#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

show_help() {
  cat <<'EOF'
CAOS LDA HSI -- local dev runner

Subcommands:
  dev         Start backend (:8105) + frontend dev server (:5173)
  build       Build the frontend bundle into frontend/dist
  preview     Build the frontend, regenerate demo assets, and run FastAPI
  demo        Rebuild the synthetic demo payload
  fetch       Download official compact public HSI raw scenes into data/raw
  fetch-msi   Download official MicaSense MSI sample data into data/raw
  fetch-spectral Download compact USGS spectral-library archives
  fetch-unmixing Download compact public HSI unmixing scenes and libraries
  fetch-hidsag Fetch HIDSAG collection metadata and optionally selected subsets
  fetch-ecostress Record ECOSTRESS public category metadata and access blocker
  fetch-all   Download all public raw sources used by the local demo
  build-real  Rebuild compact real-scene HSI derived assets from downloaded raw scenes
  build-field Rebuild compact field MSI derived assets from downloaded raw scenes
  build-spectral Rebuild compact USGS spectral-library samples
  build-analysis Rebuild compact PCA/KMeans diagnostics from derived assets
  build-corpus Rebuild static corpus previews from derived assets
  build-baselines Rebuild static SLIC segmentation baselines from raw scenes
  build-inventory Build unified local dataset/raw inventory for the validation backend
  inspect-hidsag Inspect downloaded HIDSAG ZIP subsets without full extraction
  build-hidsag Build compact HIDSAG spectral subset from downloaded ZIP archives
  run-core    Run local PTM/LDA, clustering, stability, SAM, NMF, and supervised benchmarks
  build-local-core Run inventory + full local-core benchmarks
  smoke      Smoke test a running local app at http://127.0.0.1:8105
  clean       Remove build outputs and Python caches
  stop        Kill local Python and Node processes started from this repo
  help        Show this message
EOF
}

ensure_venv() {
  if [[ ! -d .venv ]]; then
    python3 -m venv .venv
  fi
  .venv/bin/python -m pip install --upgrade pip wheel >/dev/null
  .venv/bin/python -m pip install -r requirements.txt >/dev/null
}

ensure_pipeline_venv() {
  if [[ ! -d .venv-pipeline ]]; then
    python3 -m venv .venv-pipeline
  fi
  .venv-pipeline/bin/python -m pip install --upgrade pip wheel >/dev/null
  .venv-pipeline/bin/python -m pip install -r data-pipeline/requirements.txt >/dev/null
}

ensure_frontend() {
  if [[ ! -d frontend/node_modules ]]; then
    (
      cd frontend
      if command -v pnpm >/dev/null 2>&1; then
        pnpm install
      else
        npm install
      fi
    )
  fi
}

ensure_derived_if_missing() {
  if [[ -d data/raw/upv_ehu && ! -f data/derived/real/real_samples.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_real_samples.py >/dev/null
  fi
  if [[ -d data/raw/micasense && ! -f data/derived/field/field_samples.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_field_samples.py >/dev/null
  fi
  if [[ -d data/raw/usgs_splib07 && ! -f data/derived/spectral/library_samples.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_spectral_library_samples.py >/dev/null
  fi
  if [[ -f data/derived/real/real_samples.json && -f data/derived/spectral/library_samples.json && ! -f data/derived/analysis/analysis.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_analysis_payload.py >/dev/null
  fi
  if [[ -f data/derived/real/real_samples.json && -f data/derived/spectral/library_samples.json && ! -f data/derived/corpus/corpus_previews.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_corpus_previews.py >/dev/null
  fi
  if [[ -d data/raw/upv_ehu && ! -f data/derived/baselines/segmentation_baselines.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_segmentation_baselines.py >/dev/null
  fi
  if [[ -d data/raw && ! -f data/derived/core/local_dataset_inventory.json ]]; then
    .venv-pipeline/bin/python data-pipeline/build_local_inventory.py >/dev/null
  fi
}

command_name="${1:-help}"
case "$command_name" in
  dev)
    ensure_venv
    ensure_pipeline_venv
    ensure_frontend
    .venv-pipeline/bin/python data-pipeline/build_demo.py >/dev/null
    ensure_derived_if_missing
    .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8105 &
    backend_pid=$!
    trap 'kill "$backend_pid" >/dev/null 2>&1 || true' EXIT
    (
      cd frontend
      if command -v pnpm >/dev/null 2>&1; then
        pnpm dev
      else
        npm run dev
      fi
    )
    ;;
  build)
    ensure_frontend
    (
      cd frontend
      if command -v pnpm >/dev/null 2>&1; then
        pnpm build
      else
        npm run build
      fi
    )
    ;;
  preview)
    ensure_venv
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_demo.py
    ensure_derived_if_missing
    "$0" build
    .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8105
    ;;
  demo)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_demo.py
    ;;
  fetch)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_public_hsi.py
    ;;
  fetch-msi)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_public_msi.py
    ;;
  fetch-spectral)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_public_spectral_libraries.py
    ;;
  fetch-unmixing)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_public_unmixing.py
    ;;
  fetch-hidsag)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_hidsag.py
    ;;
  fetch-ecostress)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_ecostress_metadata.py
    ;;
  fetch-all)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/fetch_public_hsi.py
    .venv-pipeline/bin/python data-pipeline/fetch_public_msi.py
    .venv-pipeline/bin/python data-pipeline/fetch_public_spectral_libraries.py
    .venv-pipeline/bin/python data-pipeline/fetch_public_unmixing.py
    .venv-pipeline/bin/python data-pipeline/fetch_hidsag.py
    .venv-pipeline/bin/python data-pipeline/fetch_ecostress_metadata.py
    ;;
  build-real)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_real_samples.py
    ;;
  build-field)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_field_samples.py
    ;;
  build-spectral)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_spectral_library_samples.py
    ;;
  build-analysis)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_analysis_payload.py
    ;;
  build-corpus)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_corpus_previews.py
    ;;
  build-baselines)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_segmentation_baselines.py
    ;;
  build-inventory)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_local_inventory.py
    ;;
  inspect-hidsag)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/inspect_hidsag_zip.py
    ;;
  build-hidsag)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_hidsag_curated_subset.py
    ;;
  run-core)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/run_local_core_benchmarks.py
    ;;
  build-local-core)
    ensure_pipeline_venv
    .venv-pipeline/bin/python data-pipeline/build_local_inventory.py
    .venv-pipeline/bin/python data-pipeline/run_local_core_benchmarks.py
    ;;
  smoke)
    scripts/smoke.sh "http://127.0.0.1:8105"
    ;;
  clean)
    find . -type d -name "__pycache__" -prune -exec rm -rf {} +
    rm -rf frontend/dist frontend/.vite
    ;;
  stop)
    pkill -f "CAOS_LDA_HSI" || true
    ;;
  help|*)
    show_help
    ;;
esac
