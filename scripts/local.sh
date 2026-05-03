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
  logs                        Tail the most recent backend dev log under .runtime/logs/

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
  build-exploration-views     Topic similarity, intertopic 2D, class loadings -> exploration_views.json
  build-method-stats          k-fold + multi-seed paired stats -> method_statistics.json (heavy)
  inspect-hidsag              Inspect HIDSAG ZIP subsets without full extraction
  build-hidsag                Compact HIDSAG curated subset
  build-hidsag-band-quality   Heuristic HIDSAG bad-band summary
  build-hidsag-region-documents   HIDSAG patch-level region documents

Pipeline -- precompute layer (master-plan section 18):
  build-eda-per-scene         EDA: class distribution, percentile envelopes, F-stat / MI per band
  build-eda-hidsag            HIDSAG measurement EDA: variable distributions, correlations
  build-topic-views           LDAvis-faithful topic views: JS-MDS 2D+3D, real corpus-marginal lambda
  build-topic-to-data         Posterior interpretation: P(label|topic), top docs, dominant_topic_map
  build-spectral-browser      Sampled spectra (binary float32) + metadata
  build-spectral-density      Precomputed band x reflectance density heatmaps per group
  build-validation-blocks     Real metrics replacing null in subset cards
  build-wordifications        V1, V2, V3 (incl. missing Procemin V3) at 3 schemes x 3 Q
  build-topic-to-library      Match each topic profile to closest USGS / AVIRIS library
  build-spatial-validation    Moran's I, connected components, IoU vs ground truth
  build-groupings             SLIC / patch / Felzenszwalb document constructors with ARI / NMI
  build-cross-method-agreement   Pairwise ARI / NMI / V between every grouping
  curate-for-web              Generate data/derived/manifests/index.json (the contract)
  build-precompute-all        Run every precompute builder in order

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
    # Route backend logs to .runtime/logs/ so nothing leaks into the repo root.
    mkdir -p .runtime/logs
    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT_LOG=".runtime/logs/uvicorn-dev-${STAMP}.out.log"
    ERR_LOG=".runtime/logs/uvicorn-dev-${STAMP}.err.log"
    echo "[backend] uvicorn :8105 -> ${OUT_LOG}"
    "$VENV/bin/python" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8105 \
      >"${OUT_LOG}" 2>"${ERR_LOG}" &
    BACK=$!
    trap 'kill $BACK 2>/dev/null || true' EXIT
    sleep 1
    pushd frontend >/dev/null
    if command -v pnpm >/dev/null 2>&1; then pnpm dev; else npm run dev; fi
    popd >/dev/null
    ;;

  logs)
    if [ ! -d .runtime/logs ]; then
      echo "No logs yet. Run dev first."
      exit 0
    fi
    LATEST=$(ls -1t .runtime/logs/*.out.log 2>/dev/null | head -1)
    if [ -z "${LATEST}" ]; then
      echo "No .out.log files in .runtime/logs/."
      exit 0
    fi
    echo "Tailing ${LATEST} ..."
    tail -n 50 -F "${LATEST}"
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
  build-exploration-views) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_exploration_views.py ;;
  build-method-stats) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_method_statistics.py ;;
  inspect-hidsag)   ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/inspect_hidsag_zip.py ;;
  build-hidsag)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_curated_subset.py ;;
  build-hidsag-band-quality)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_band_quality.py ;;
  build-hidsag-region-documents) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_hidsag_region_documents.py ;;

  # ---- pipeline -- precompute layer (master-plan section 18) ----------
  build-eda-per-scene)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_eda_per_scene.py ;;
  build-eda-hidsag)        ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_eda_hidsag.py ;;
  build-topic-views)       ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_topic_views.py ;;
  build-topic-to-data)     ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_topic_to_data.py ;;
  build-spectral-browser)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_spectral_browser.py ;;
  build-spectral-density)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_spectral_density.py ;;
  build-validation-blocks) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_validation_blocks.py ;;
  build-wordifications)    ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_wordifications.py ;;
  build-topic-to-library)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_topic_to_library.py ;;
  build-spatial-validation) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_spatial_validation.py ;;
  build-groupings)         ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_groupings.py ;;
  build-cross-method-agreement) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_cross_method_agreement.py ;;
  build-quantization-sensitivity) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_quantization_sensitivity.py ;;
  build-topic-model-variants) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_topic_model_variants.py ;;
  build-method-statistics-hidsag) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_method_statistics_hidsag.py ;;
  build-external-validation) ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_external_validation.py ;;
  build-narratives)        ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_narratives.py ;;
  build-interpretability)  ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/build_interpretability.py ;;
  curate-for-web)          ensure_pipeline_venv ; "$PVENV/bin/python" data-pipeline/curate_for_web.py ;;
  build-precompute-all)
    ensure_pipeline_venv
    "$PVENV/bin/python" data-pipeline/build_eda_per_scene.py
    "$PVENV/bin/python" data-pipeline/build_eda_hidsag.py
    "$PVENV/bin/python" data-pipeline/build_topic_views.py
    "$PVENV/bin/python" data-pipeline/build_topic_to_data.py
    "$PVENV/bin/python" data-pipeline/build_spectral_browser.py
    "$PVENV/bin/python" data-pipeline/build_spectral_density.py
    "$PVENV/bin/python" data-pipeline/build_wordifications.py
    "$PVENV/bin/python" data-pipeline/build_topic_to_library.py
    "$PVENV/bin/python" data-pipeline/build_spatial_validation.py
    "$PVENV/bin/python" data-pipeline/build_groupings.py
    "$PVENV/bin/python" data-pipeline/build_cross_method_agreement.py
    "$PVENV/bin/python" data-pipeline/build_validation_blocks.py
    "$PVENV/bin/python" data-pipeline/curate_for_web.py
    ;;

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
    rm -rf frontend/dist frontend/.vite .runtime
    # Purge any stray uvicorn-*.log files that older tooling may have left in repo root.
    find . -maxdepth 1 -type f -name "uvicorn-*.log" -delete 2>/dev/null || true
    echo "Cleaned build outputs and runtime logs."
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
