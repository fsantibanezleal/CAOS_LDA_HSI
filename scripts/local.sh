#!/usr/bin/env bash
# CAOS LDA HSI -- local dev runner (Linux / macOS)
#
# Subcommands are documented in CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md
# and in the Local Reproduction Guide page of the public wiki.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VENV=".venv"
PVENV=".venv-pipeline"
PIPELINE_REQS="data-pipeline/requirements.txt"

show_help() {
  cat <<'EOF'

CAOS LDA HSI -- local dev runner

Setup:
  setup-web                   Create .venv and install backend requirements
  setup-pipeline              Create .venv-pipeline and install pipeline requirements
  setup-frontend              Install frontend node modules (pnpm or npm)
  setup-all                   setup-web + setup-pipeline + setup-frontend

Web:
  dev                         Backend (uvicorn :8105) + frontend dev server (Vite :5173)
  build                       Build the frontend bundle into frontend/dist
  preview                     Build the frontend, regenerate demo, run FastAPI on :8105
  demo                        Rebuild the synthetic demo payload
  smoke                       Smoke-test a running local app at http://127.0.0.1:8105

Pipeline -- fetch:
  fetch                       UPV/EHU public HSI scenes
  fetch-msi                   MicaSense MSI sample data
  fetch-spectral              USGS spectral-library compact archives
  fetch-unmixing              Borsoi Samson / Jasper Ridge / Urban ROIs
  fetch-hidsag                HIDSAG metadata (and opt-in ZIPs via CAOS_HIDSAG_DOWNLOAD_IDS)
  fetch-ecostress             ECOSTRESS public-category metadata
  fetch-all                   Run every fetch script in sequence

Pipeline -- build derived:
  build-real                  Compact real-scene HSI derived assets
  build-field                 Compact field MSI derived assets
  build-spectral              Compact USGS spectral-library samples
  build-analysis              PCA / KMeans diagnostics
  build-corpus                Static corpus previews per recipe
  build-baselines             SLIC segmentation baselines
  build-inventory             Unified local dataset / raw inventory
  build-subset-cards          Compact per-subset cards under data/derived/subsets/
  inspect-hidsag              Inspect HIDSAG ZIP subsets without full extraction
  build-hidsag                Compact HIDSAG curated subset
  build-hidsag-band-quality   Heuristic HIDSAG bad-band summary
  build-hidsag-region-documents   HIDSAG patch-level region documents

Pipeline -- benchmarks:
  run-core                    Local PTM/LDA, clustering, stability, SAM, NMF, supervised
  run-hidsag-sensitivity      HIDSAG preprocessing-sensitivity benchmark
  build-local-core            inventory + run-core + band-quality + sensitivity

Maintenance:
  clean                       Remove frontend/dist, frontend/.vite, __pycache__
  stop                        Kill local Python and Node processes started from this repo
  help                        Show this message

EOF
}

ensure_web_venv() {
  if [ ! -d "$VENV" ]; then
    echo "Creating $VENV ..."
    python3 -m venv "$VENV"
  fi
  "$VENV/bin/python" -m pip install --upgrade pip wheel >/dev/null
  "$VENV/bin/python" -m pip install -r requirements.txt >/dev/null
}

ensure_pipeline_venv() {
  if [ ! -d "$PVENV" ]; then
    echo "Creating $PVENV ..."
    python3 -m venv "$PVENV"
  fi
  "$PVENV/bin/python" -m pip install --upgrade pip wheel >/dev/null
  if [ -f "$PIPELINE_REQS" ]; then
    "$PVENV/bin/python" -m pip install -r "$PIPELINE_REQS" >/dev/null
  else
    "$PVENV/bin/python" -m pip install \
      numpy scipy scikit-learn scikit-image gensim pyLDAvis \
      matplotlib requests tqdm spectral pillow pandas >/dev/null
  fi
}

ensure_frontend() {
  if [ ! -d "frontend/node_modules" ]; then
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm install; else npm install; fi
    popd >/dev/null
  fi
}

update_derived_if_missing() {
  if [ -d "data/raw/upv_ehu" ] && [ ! -f "data/derived/real/real_samples.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_real_samples.py >/dev/null
  fi
  if [ -d "data/raw/micasense" ] && [ ! -f "data/derived/field/field_samples.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_field_samples.py >/dev/null
  fi
  if [ -d "data/raw/usgs_splib07" ] && [ ! -f "data/derived/spectral/library_samples.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_spectral_library_samples.py >/dev/null
  fi
  if [ -f "data/derived/real/real_samples.json" ] && [ -f "data/derived/spectral/library_samples.json" ] && [ ! -f "data/derived/analysis/analysis.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_analysis_payload.py >/dev/null
  fi
  if [ -f "data/derived/real/real_samples.json" ] && [ -f "data/derived/spectral/library_samples.json" ] && [ ! -f "data/derived/corpus/corpus_previews.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_corpus_previews.py >/dev/null
  fi
  if [ -d "data/raw/upv_ehu" ] && [ ! -f "data/derived/baselines/segmentation_baselines.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_segmentation_baselines.py >/dev/null
  fi
  if [ -d "data/raw" ] && [ ! -f "data/derived/core/local_dataset_inventory.json" ]; then
    "$PVENV/bin/python" data-pipeline/build_local_inventory.py >/dev/null
  fi
}

cmd="${1:-help}"

case "$cmd" in
  # ---- setup -----------------------------------------------------------
  setup-web)      ensure_web_venv ;       echo ".venv ready." ;;
  setup-pipeline) ensure_pipeline_venv ;  echo ".venv-pipeline ready." ;;
  setup-frontend) ensure_frontend ;       echo "frontend modules ready." ;;
  setup-all)
    ensure_web_venv
    ensure_pipeline_venv
    ensure_frontend
    echo "All local environments ready."
    ;;

  # ---- web -------------------------------------------------------------
  dev)
    ensure_web_venv
    ensure_frontend
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/build_demo.py >/dev/null
    update_derived_if_missing
    echo "[backend] uvicorn :8105 (in background)"
    "$VENV/bin/python" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8105 &
    BACK=$!
    trap 'kill $BACK 2>/dev/null || true' EXIT
    sleep 1
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm dev; else npm run dev; fi
    popd >/dev/null
    ;;

  build)
    ensure_frontend
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm build; else npm run build; fi
    popd >/dev/null
    ;;

  preview)
    ensure_web_venv
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/build_demo.py
    update_derived_if_missing
    "$0" build
    echo "Backend serving the built SPA at http://127.0.0.1:8105"
    "$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8105
    ;;

  demo)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/build_demo.py
    ;;

  smoke)
    if [ -f "scripts/smoke.sh" ]; then
      bash scripts/smoke.sh "http://127.0.0.1:8105"
    else
      echo "scripts/smoke.sh not found." >&2
      exit 1
    fi
    ;;

  # ---- pipeline -- fetch -----------------------------------------------
  fetch)           ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_public_hsi.py ;;
  fetch-msi)       ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_public_msi.py ;;
  fetch-spectral)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_public_spectral_libraries.py ;;
  fetch-unmixing)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_public_unmixing.py ;;
  fetch-hidsag)    ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_hidsag.py ;;
  fetch-ecostress) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/fetch_ecostress_metadata.py ;;
  fetch-all)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/fetch_public_hsi.py
    "$PVENV/bin/python" data-pipeline/fetch_public_msi.py
    "$PVENV/bin/python" data-pipeline/fetch_public_spectral_libraries.py
    "$PVENV/bin/python" data-pipeline/fetch_public_unmixing.py
    "$PVENV/bin/python" data-pipeline/fetch_hidsag.py
    "$PVENV/bin/python" data-pipeline/fetch_ecostress_metadata.py
    ;;

  # ---- pipeline -- build derived ---------------------------------------
  build-real)       ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_real_samples.py ;;
  build-field)      ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_field_samples.py ;;
  build-spectral)   ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_spectral_library_samples.py ;;
  build-analysis)   ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_analysis_payload.py ;;
  build-corpus)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_corpus_previews.py ;;
  build-baselines)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_segmentation_baselines.py ;;
  build-inventory)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_local_inventory.py ;;
  build-subset-cards) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_subset_cards.py ;;
  inspect-hidsag)   ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/inspect_hidsag_zip.py ;;
  build-hidsag)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_curated_subset.py ;;
  build-hidsag-band-quality)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_band_quality.py ;;
  build-hidsag-region-documents) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_region_documents.py ;;

  # ---- pipeline -- benchmarks ------------------------------------------
  run-core)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/run_local_core_benchmarks.py
    ;;

  run-hidsag-sensitivity)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/run_hidsag_preprocessing_sensitivity.py
    ;;

  build-local-core)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/build_local_inventory.py
    "$PVENV/bin/python" data-pipeline/run_local_core_benchmarks.py
    "$PVENV/bin/python" data-pipeline/build_hidsag_band_quality.py
    "$PVENV/bin/python" data-pipeline/run_hidsag_preprocessing_sensitivity.py
    ;;

  # ---- maintenance -----------------------------------------------------
  clean)
    find . -type d -name "__pycache__" -prune -exec rm -rf {} +
    rm -rf frontend/dist frontend/.vite
    echo "Cleaned build outputs."
    ;;

  stop)
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "vite" 2>/dev/null || true
    echo "Stopped local dev processes."
    ;;

  help|*)
    show_help
    ;;
esac
