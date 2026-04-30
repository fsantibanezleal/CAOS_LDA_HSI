# Technical Roadmap

This roadmap separates product recovery, data expansion, and research
validation. It is intentionally explicit about what is built and what is
only planned.

## Phase 0: Recovery Baseline

Status: complete before this document.

Delivered:

- FastAPI backend serving a React SPA.
- Public GitHub repository.
- VPS deployment at `https://lda-hsi.fasl-work.com`.
- `/healthz` and `/api/app-data` endpoints.
- Compact synthetic demo.
- Derived summaries from the first five HSI scenes and two MSI field
  samples.

Problem:

- The released UI was not a professional workbench. It presented the
  product like an editorial page, used a rejected green/teal/orange
  palette, and hid useful data behind a hero-first flow.

## Phase 1: Professional Workbench

Status: implemented locally; pending manual visual review before
production redeploy.

Acceptance criteria:

- First viewport exposes controls, datasets, topics, and inspector data.
- Layout uses a compact app shell: header, left navigator, center
  workbench, right inspector.
- No hero section, blog flow, decorative empty space, or anchor-section
  navigation.
- Palette is neutral technical with blue/cyan accents; green is only a
  semantic success/status color.
- ES/EN i18n works.
- Light/dark mode works.
- Public repository link is visible.
- Backend payload may grow only when the workbench needs a new data
  surface. The current local pass added `spectral_library`.
- A compact help/status modal is available from the header.
- The spectral-library navigator participates in the main search filter.
- Scene topic matrices and nearest spectral-library reference comparisons
  are implemented locally.

## Phase 2: Dataset Expansion

Status: partially implemented locally.

Immediate additions:

- full Salinas corrected: implemented
- Cuprite reflectance: implemented as an unlabeled mineral scene with
  inferred topic-stratum preview
- Samson, Jasper Ridge, and Urban unmixing ROIs: implemented as unlabeled
  scenes with inferred topic-stratum previews
- USGS Spectral Library v7 AVIRIS/Sentinel-2 compact samples: implemented

Catalog and subset additions:

- EuroSAT
- BigEarthNet
- WHU-Hi
- HyRANK
- HySpecNet-11k
- Houston 2013
- cross-scene wetland HSI
- Landsat Collection 2 Level-2
- HIDSAG

Remaining immediate data work:

- ECOSTRESS compact material samples
- verified Cuprite unmixing ROI
- curated Sentinel-2 / EuroSAT patch subset
- calibrated wavelength metadata where available
- reusable smoke-test scripts: implemented for PowerShell and Bash

Acceptance criteria:

- every added source has provenance, URL, status, and repository strategy
- every raw local file respects the 100 MB individual-file rule
- every large source is represented through metadata, manifests, or
  compact derived subsets
- app copy does not imply local availability when the data is only
  cataloged

## Phase 3: Tokenization Engine

Status: partially scaffolded through deterministic derived assets; the
full tokenizer engine is still planned.

Work:

- implement a stable tokenizer module
- add vocabulary manifests
- store document metadata
- support band-intensity, spectral group, slope, and patch-strata tokens
- add deterministic tests under fixed seeds

Acceptance criteria:

- tokenized corpora are reproducible
- token meaning can be inspected from JSON
- generated corpora stay compact enough for Git or are excluded with a
  manifest-only workflow

## Phase 4: Mineral/Clay Workflow

Status: partially scaffolded.

Work:

- integrate Cuprite or another mineral scene: first Cuprite scene is now
  local, but interpretation remains provisional
- add calibrated wavelength metadata
- add continuum-removal and absorption-feature tokens
- add curated USGS/ECOSTRESS mineral and clay reference slices: USGS
  compact samples are local; ECOSTRESS remains planned
- compare topic profiles with known wavelength regions

Acceptance criteria:

- topics are described as regimes, not as confirmed minerals
- every mineral interpretation states the supporting evidence
- the app distinguishes observed topic behavior from expert inference

## Phase 5: Transfer Demonstrations

Status: planned.

Work:

- vegetation demo with MicaSense, Salinas, and Sentinel-2 patches
- wetland demo with Kennedy Space Center, Botswana, and external wetland
  patches
- urban demo with Pavia University, Houston 2013, and Sentinel-2 patches
- satellite patch demo with EuroSAT, BigEarthNet, or HySpecNet-11k

Acceptance criteria:

- each theme has a clear local/external data status
- comparisons include simple baselines or known indices where applicable
- topic stability is checked before making claims about transfer

## Phase 6: Research Validation

Status: planned.

Work:

- repeated topic fits across random seeds
- topic stability metrics
- representation comparisons
- baseline model comparison
- cross-scene train/test reports
- documented failure cases

Acceptance criteria:

- validation outputs are reproducible
- reports explain when LDA helps and when it does not
- docs distinguish demo evidence from publishable evidence

## Open Engineering Questions

- Should generated corpora be stored as JSON, compressed NPZ, or SQLite?
- How should wavelength metadata be normalized across UPV/EHU, MicaSense,
  Sentinel-2, Landsat, and EnMAP?
- Should large external sources use a manifest plus checksum cache?
- Should the backend expose a future `/api/corpus/:id` endpoint or keep
  the existing single payload for simplicity?
- Which topic stability metric is easiest to explain in the public app?
