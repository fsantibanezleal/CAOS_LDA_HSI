# Architecture

This document is the **repo-local map** of CAOS_LDA_HSI. It is shorter
and more operational than the public wiki page
[Backend Architecture and Payloads](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Backend-Architecture-and-Payloads),
which remains the canonical extended description.

## Local-first principle

The product is not the FastAPI server alone. The product is the local
research stack made of three layers, in order of scientific importance:

1. **Data pipeline** (`data-pipeline/`, `research_core/`) — acquires
   raw third-party data, derives compact reproducible JSON, runs LDA
   and baseline benchmarks.
2. **Backend** (`app/`) — FastAPI service that loads the compact
   derived JSON, validates it against typed Pydantic schemas, and
   serves the public API and the SPA shell.
3. **Frontend** (`frontend/`) — React + Vite single-page application,
   bilingual (EN / ES), light / dark theme, that consumes the API and
   renders the public Workspace.

Heavy computation always lives in layer 1. The backend is read-only at
runtime. The frontend never reads the deep benchmarks file directly;
it goes through the typed payloads.

## Top-level tree

```
CAOS_LDA_HSI/
├── app/                FastAPI backend
│   ├── main.py         ASGI entrypoint
│   ├── config.py       Pydantic Settings + payload paths
│   ├── models/
│   │   └── schemas.py  Typed payload models (single source of truth)
│   ├── routers/
│   │   └── content.py  /api/* endpoint declarations
│   └── services/
│       └── content.py  LRU-cached payload loaders
├── frontend/           React + Vite SPA
├── research_core/      Reusable Python utilities (paths, raw scenes, spectral, unmixing, inventory)
├── data/
│   ├── manifests/      Static cards (datasets, families, recipes, interactive_subsets, ...)
│   ├── derived/        Compact reproducible JSON + previews
│   ├── raw/            Ignored — third-party scenes locally
│   └── samples/        Example pointers
├── data-pipeline/      Acquisition + derivation scripts (one Python file per step)
├── docs/               Repo-local technical documentation (this file)
├── deploy/             systemd + nginx + certbot templates
├── scripts/            local.ps1 / local.sh / smoke runners
└── legacy/             Source paper + proof-of-concept notebook (frozen reference)
```

## Two virtual environments

The repo deliberately ships two Python venvs — one for runtime
(`.venv`, light) and one for the data pipeline (`.venv-pipeline`,
heavy). The split keeps the production deploy small while the local
pipeline can pull in scientific stacks (numpy, scipy, scikit-learn,
scikit-image, h5py, tifffile) without bloating the deploy image.

The full contract is in
[`_CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md`](../../_CAOS_MANAGE/wip/caos-lda-hsi/local-environments-plan.md).

## API endpoints

The complete endpoint table lives on the wiki page
[Backend Architecture and Payloads](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Backend-Architecture-and-Payloads).
A repo-local quick reference:

```
GET /api/app-data                                aggregated payload
GET /api/overview                                project overview
GET /api/datasets                                dataset catalogue
GET /api/data-families                           four-family taxonomy
GET /api/corpus-recipes                          registered recipes
GET /api/corpus-previews                         per-(dataset, recipe) previews
GET /api/segmentation-baselines                  SLIC outputs
GET /api/real-scenes                             Family B / C scene evidence
GET /api/field-samples                           MicaSense field MSI evidence
GET /api/spectral-library                        Family A USGS / ECOSTRESS samples
GET /api/analysis                                PCA / KMeans diagnostics
GET /api/local-validation-matrix                 validation block coverage
GET /api/local-dataset-inventory                 unified inventory
GET /api/local-core-benchmarks                   deep benchmarks (frontend should NOT depend on this)
GET /api/interactive-subsets                     subset registry
GET /api/subset-cards                            compact public subset card index   (NEW)
GET /api/subset-cards/{subset_id}                compact public subset card          (NEW)
GET /api/hidsag-subset-inventory                 HIDSAG ZIP-level metadata
GET /api/hidsag-curated-subset                   HIDSAG curated cubes
GET /api/hidsag-region-documents                 HIDSAG patch documents
GET /api/hidsag-band-quality                     HIDSAG bad-band heuristic
GET /api/hidsag-preprocessing-sensitivity        HIDSAG preprocessing benchmark
GET /api/methodology                             methodology metadata
GET /api/demo                                    synthetic deterministic LDA demo
GET /healthz                                     smoke check
GET /generated/...                               static PNG / JSON delivery
```

## Subset cards (the decoupling layer)

`/api/subset-cards/{id}` and the index at `/api/subset-cards` are the
**decoupling boundary** between the deep benchmark file and the public
frontend. The extractor `data-pipeline/build_subset_cards.py` reads:

- `data/manifests/interactive_subsets.json`
- `data/manifests/datasets.json`, `corpus_recipes.json`
- `data/derived/corpus/corpus_previews.json`
- `data/derived/real/real_samples.json`
- `data/derived/field/field_samples.json`
- `data/derived/spectral/library_samples.json`
- `data/derived/core/local_core_benchmarks.json`

…and writes one compact JSON per subset to `data/derived/subsets/`.
Each card bundles per-dataset evidence, per-recipe corpus preview,
top topics, validation block status with selected metrics, and the
artifact pointers the frontend should follow. The frontend therefore
never has to parse the deep benchmark file to render a Workspace
view.

## Static asset serving

`main.py` mounts:

- `/assets/...`     → `frontend/dist/assets/` (Vite-hashed bundles)
- `/generated/...`  → `data/` (preview PNGs and selected JSONs)
- `/{path:path}`    → `frontend/dist/index.html` (SPA fallback)

Cache-control on `index.html` is `no-store`; the rest is hashed.

## Where the science lives

| Concern | Layer | Path |
|---|---|---|
| Acquisition | data-pipeline | `data-pipeline/fetch_*` |
| Derivation | data-pipeline | `data-pipeline/build_*` |
| Benchmarks | data-pipeline + research_core | `data-pipeline/run_*` + `research_core/*.py` |
| Subset cards | data-pipeline | `data-pipeline/build_subset_cards.py` |
| Schemas | backend | `app/models/schemas.py` |
| Loaders | backend | `app/services/content.py` |
| Routes | backend | `app/routers/content.py` |
| Visual primitives | frontend | `frontend/src/components/` |
| Routes / pages | frontend | `frontend/src/routes/` (target) |
| State | frontend | `frontend/src/store/useStore.ts` |
| Translation | frontend | `frontend/src/i18n/` |
| Theme | frontend | `frontend/src/styles/theme.css` |

## Deployment topology

The single FastAPI process serves the API and the built SPA. Behind
nginx + certbot on `lda-hsi.fasl-work.com`, port `127.0.0.1:8105`.
Detailed deployment procedure is intentionally **not** in this public
repo; it lives in the management repo `_CAOS_MANAGE`.
