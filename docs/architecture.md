# Architecture

CAOS LDA HSI is a local-first research stack. The primary product is not
the deployed SPA; it is the reproducible backend, data pipeline, local
experiments, and dense methodology that validate PTM/LDA-style spectral
workflows over real datasets. The web app is a secondary interactive
projection of compact, versioned subsets of those validated outputs.

## Repository Roles

- `research_core/`: local validation core for inventory building, raw
  scene loading, experiment wiring, and reusable offline utilities
- `data-pipeline/`: deterministic acquisition, derivation, corpus,
  segmentation, and benchmark scripts
- `data/raw/`: ignored local raw downloads and extracted third-party
  files used for validation
- `data/manifests/`: curated methodological, dataset, and workflow
  metadata
- `data/derived/core/`: local-first validation outputs such as dataset
  inventory and offline benchmarks, including topic stability,
  reference-alignment, and NMF/unmixing comparisons
- `data/derived/corpus/`: deterministic corpus previews that expose
  alphabet, word, document, vocabulary, and caveats
- `data/derived/baselines/`: deterministic segmentation and comparison
  payloads generated from local raw scenes
- `data/derived/real/`, `field/`, `spectral/`, `analysis/`: compact
  publishable assets or intermediate evidence for the web projection
- `app/`: FastAPI API that serves manifests, derived assets, and the
  built SPA in production
- `frontend/`: React + Vite client for the interactive presentation
  layer
- `deploy/`: VPS deployment templates for the compact public app

## Primary Workflow

1. Acquire and organize raw datasets locally.
2. Preprocess spectra, labels, measurements, and wavelength metadata.
3. Build document/corpus representations.
4. Run SLIC, clustering, PTM/LDA, and supervised baselines offline.
5. Validate stability, sensitivity, alignment, and predictive value.
6. Export only compact, versioned subsets for the public web app.

This ordering is mandatory. No web-facing screen should invent structure
that is not already justified by the local validation core.

## API Surface

The API currently exposes both the legacy compact app payloads and the
new local-core reset payloads.

- `GET /health`
- `GET /healthz`
- `GET /api/overview`
- `GET /api/datasets`
- `GET /api/data-families`
- `GET /api/corpus-recipes`
- `GET /api/corpus-previews`
- `GET /api/segmentation-baselines`
- `GET /api/local-validation-matrix`
- `GET /api/local-dataset-inventory`
- `GET /api/local-core-benchmarks`
- `GET /api/methodology`
- `GET /api/real-scenes`
- `GET /api/field-samples`
- `GET /api/spectral-library`
- `GET /api/analysis`
- `GET /api/demo`
- `GET /api/app-data`

The first six reset endpoints are the ones that now define the intended
product flow. The older `app-data` aggregate remains as a compatibility
surface for the current technical checkpoint.

## Derived Asset Policy

FastAPI mounts `data/derived/` under `/generated/`.

Representative outputs:

- `/generated/core/local_dataset_inventory.json`
- `/generated/core/local_core_benchmarks.json`
- `/generated/corpus/corpus_previews.json`
- `/generated/baselines/segmentation_baselines.json`
- `/generated/real/real_samples.json`
- `/generated/spectral/library_samples.json`

Important distinction:

- local validation outputs may be large enough to justify raw-local
  regeneration and should not be constrained by web deployment concerns
- public app assets must stay compact, versioned, attributable, and
  explainable
- preview images may exist as auxiliary context, but the accepted app
  direction requires interactive spectral curves, band-selectable scenes,
  and overlay switching rather than screenshot-style evidence

## Why JSON Plus Local Raw

The repo needs three layers, not one:

1. editorial and methodological manifests
2. local raw data plus offline experiment code
3. compact exported assets for the app

The current reset work makes layer 2 explicit through `research_core/`
and `data/derived/core/`. That is the architectural correction the repo
needed.
