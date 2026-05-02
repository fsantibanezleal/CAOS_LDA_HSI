# CAOS LDA HSI

CAOS LDA HSI is a local-first research and validation repository for
probabilistic topic modeling, clustering, segmentation, and supervised
learning over multispectral and hyperspectral data.

The central thesis is methodological, not cosmetic:

> Spectral variability is not disposable noise. It can be represented as
> a corpus, inspected through PTM/LDA-style models, compared against
> spatial and spectral baselines, and used for inference when labels or
> measurements exist.

The backend, data pipeline, local experiments, and documentation are the
primary product. The web app is a compact interactive projection of a
validated subset of those outputs.

## Current Scope

The repository now includes:

- a FastAPI backend and React + Vite frontend
- a local validation package in `research_core/`
- curated manifests for datasets, families, corpus recipes, and workflow
  rules
- reproducible acquisition scripts for public raw data under
  `data-pipeline/`
- deterministic derived assets for scenes, field data, spectral-library
  slices, corpus previews, segmentation baselines, and analytical
  diagnostics
- local-core outputs in `data/derived/core/`:
  - unified dataset inventory
  - offline PTM/LDA, clustering, supervised, topic-stability, SAM, and
    NMF/unmixing benchmarks
- dense technical documentation under `docs/`
- `legacy/` material retained as historical reference

## Current Status

- the deployed SPA is a technical checkpoint only
- the old app direction was rejected
- the repo is being rebuilt around a local scientific workflow first
- the new accepted app direction is interactive-only for spectral and
  scene evidence
- persistent branch, plan, and deploy state lives in
  `../_CAOS_MANAGE/wip/caos-lda-hsi/`

## Repository Layout

- `app/`: FastAPI backend
- `frontend/`: React + Vite SPA
- `research_core/`: reusable local validation utilities
- `data/`: manifests, demo assets, derived outputs, and ignored raw
  downloads
- `data-pipeline/`: acquisition and derivation scripts
- `docs/`: theory, datasets, architecture, reset memo, and roadmap
- `deploy/`: VPS deployment templates
- `scripts/`: local development, build, and smoke-test commands
- `legacy/`: earlier experiments kept for context

## Key Generated Assets

- `data/derived/core/local_dataset_inventory.json`
- `data/derived/core/local_core_benchmarks.json`
- `data/derived/core/hidsag_subset_inventory.json`
- `data/derived/core/hidsag_curated_subset.json`
- `data/derived/core/hidsag_band_quality.json`
- `data/derived/core/hidsag_preprocessing_sensitivity.json`
- `data/derived/corpus/corpus_previews.json`
- `data/derived/baselines/segmentation_baselines.json`
- `data/derived/real/real_samples.json`
- `data/derived/field/field_samples.json`
- `data/derived/spectral/library_samples.json`

## Local Workflow

Raw third-party files live under `data/raw/` and stay out of Git.
Offline validation regenerates derived artifacts from those local raw
sources. The public app should load only compact exported subsets.

Current first-pass local-core evidence now includes:

- labeled-scene classification and clustering baselines
- multi-seed topic-stability diagnostics
- spectral-angle reference alignment
- NMF/unmixing baselines over Borsoi ROIs
- Cuprite reference-alignment experiments against compact USGS 224-band
  group centroids
- HIDSAG raw-subset metadata with sample-level targets, multi-measurement
  summaries, acquisition-mode tags, and wavelength metadata
- HIDSAG curated spectral subset with per-cube mean and standard
  deviation spectra for `GEOMET`, `MINERAL1`, `MINERAL2`, `GEOCHEM`,
  and `PORPHYRY`
- HIDSAG patch-level region-document export
  (`hidsag_region_documents.json` + `.npz`) for local hierarchical
  validation
- HIDSAG heuristic bad-band summary and preprocessing-sensitivity
  benchmark over the five current local subsets
- supervised Family D benchmarks on `HIDSAG GEOMET`, `MINERAL1`,
  `MINERAL2`, `GEOCHEM`, and `PORPHYRY`, including cross-validated
  classification/regression baselines, group-aware splits where
  available, and topic-mixture comparisons at sample, cube, and region
  levels

Useful commands:

```powershell
.\scripts\local.ps1 fetch
.\scripts\local.ps1 fetch-msi
.\scripts\local.ps1 fetch-spectral
.\scripts\local.ps1 fetch-unmixing
.\scripts\local.ps1 fetch-hidsag
.\scripts\local.ps1 fetch-ecostress
.\scripts\local.ps1 fetch-all
.\scripts\local.ps1 build-real
.\scripts\local.ps1 build-field
.\scripts\local.ps1 build-spectral
.\scripts\local.ps1 build-analysis
.\scripts\local.ps1 build-corpus
.\scripts\local.ps1 build-baselines
.\scripts\local.ps1 build-inventory
.\scripts\local.ps1 inspect-hidsag
.\scripts\local.ps1 build-hidsag
.\scripts\local.ps1 build-hidsag-band-quality
.\scripts\local.ps1 run-core
.\scripts\local.ps1 run-hidsag-sensitivity
.\scripts\local.ps1 build-local-core
.\scripts\local.ps1 smoke
.\scripts\local.ps1 demo
.\scripts\local.ps1 dev
```

```bash
./scripts/local.sh fetch
./scripts/local.sh fetch-msi
./scripts/local.sh fetch-spectral
./scripts/local.sh fetch-unmixing
./scripts/local.sh fetch-hidsag
./scripts/local.sh fetch-ecostress
./scripts/local.sh fetch-all
./scripts/local.sh build-real
./scripts/local.sh build-field
./scripts/local.sh build-spectral
./scripts/local.sh build-analysis
./scripts/local.sh build-corpus
./scripts/local.sh build-baselines
./scripts/local.sh build-inventory
./scripts/local.sh inspect-hidsag
./scripts/local.sh build-hidsag
./scripts/local.sh build-hidsag-band-quality
./scripts/local.sh run-core
./scripts/local.sh run-hidsag-sensitivity
./scripts/local.sh build-local-core
./scripts/local.sh smoke
./scripts/local.sh demo
./scripts/local.sh dev
```

## Main Documents

- `docs/theory.md`
- `docs/datasets.md`
- `docs/architecture.md`
- `docs/functional-scope.md`
- `docs/product-reset-research.md`
- `docs/technical-roadmap.md`
- `docs/sources.md`
- public wiki:
  <https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki>
- `../_CAOS_MANAGE/wip/caos-lda-hsi/README.md`
- `../_CAOS_MANAGE/wip/caos-lda-hsi/current-state.md`
- `../_CAOS_MANAGE/wip/caos-lda-hsi/offline-validation-plan.md`
- `../_CAOS_MANAGE/wip/caos-lda-hsi/web-app-projection-plan.md`

## Immediate Next Steps

1. extend local acquisition for real high-value datasets
2. deepen offline comparisons: topic models, clustering, segmentation,
   unmixing-style baselines, and validation
3. curate compact interactive subsets for publication
4. rebuild the app around `Context` and `Workspace`
5. keep production deploys gated behind local build and smoke checks
