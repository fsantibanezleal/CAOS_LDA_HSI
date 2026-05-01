# Technical Roadmap

This roadmap now treats the repo as a local scientific validation system
with a secondary interactive presentation layer.

## Current Reset Status

Status: active reset in progress.

The deployed SPA is a technical checkpoint only. The accepted direction
is:

1. local acquisition and organization of real spectral data
2. offline representations, segmentation, PTM/LDA, clustering, and
   supervised modeling
3. dense methodological documentation
4. compact interactive export into the web app

## Phase 0: Historical Recovery Baseline

Status: complete.

Delivered historically:

- FastAPI backend serving a React SPA
- public repo and VPS deployment
- bilingual UI and theme support
- compact demo and first derived scene assets

Limitation:

- the UI direction was rejected because it behaved like a confused
  workbench/report hybrid and did not express the real methodological
  flow

## Phase 1: Method Review And Product Reset

Status: first pass delivered, ongoing expansion.

Delivered:

- `docs/product-reset-research.md`
- `data/manifests/data_families.json`
- `data/manifests/corpus_recipes.json`
- `data/manifests/local_validation_matrix.json`
- explicit supervision and acquisition metadata in
  `data/manifests/datasets.json`

Acceptance:

- every product-visible method must state alphabet, word, document,
  corpus, feature space, supervision, and caveat

## Phase 2: Local Data Acquisition And Inventory

Status: first pass delivered.

Delivered:

- reproducible raw acquisition scripts in `data-pipeline/`
- unified local inventory in `data/derived/core/local_dataset_inventory.json`
- local raw evidence currently indexed across UPV/EHU, Borsoi MUA,
  MicaSense, and USGS compact spectral-library archives

Next work:

- reproduce a session-backed ECOSTRESS export path beyond the current
  public metadata manifest
- turn the downloaded HIDSAG MINERAL2 package into the first curated
  measured-target subset
- reproduce at least one cross-scene transfer dataset
- keep raw-local, git-public, and web-public policies clearly separated

## Phase 3: Representation And Corpus Engine

Status: first pass delivered.

Delivered:

- deterministic corpus previews in
  `data/derived/corpus/corpus_previews.json`
- first-pass recipes for magnitude phrase, band frequency,
  band-magnitude words, and region-style documents

Next work:

- absorption/shape vocabularies
- hierarchical documents for measured regions
- stronger token diagnostics and reversibility metadata

## Phase 4: Segmentation, Clustering, And Topic Benchmarks

Status: first pass delivered and now extended.

Delivered:

- SLIC baseline payload in
  `data/derived/baselines/segmentation_baselines.json`
- offline benchmark payload in
  `data/derived/core/local_core_benchmarks.json`
- first-pass LDA runs over real local scenes
- first-pass supervised baselines on labeled scenes
- KMeans, GMM, and hierarchical clustering comparisons in raw and
  topic-space views
- first-pass topic-stability diagnostics across multiple seeds
- first-pass SAM-style reference alignment
- first-pass NMF/unmixing comparisons on Borsoi ROIs and Cuprite
  alignment probes

Current limitation:

- semantic segmentation overlays are still planned
- PM-LDA and semi-supervised PM-LDA are still pending
- topic stability is still compact-sample-based and not yet a full
  preprocessing-sensitivity study

## Phase 5: Measured-Target Training And Validation

Status: planned.

Scope:

- regression and classification over measured datasets such as HIDSAG,
  starting from MINERAL2 mineral-abundance targets
- topic-routed and hierarchical models
- split definitions, model cards, residual/error analysis
- topic stability and sensitivity studies

Acceptance:

- no trained model becomes product-visible without split definition,
  metrics, caveats, and provenance

## Phase 6: Publishable Interactive Subsets

Status: planned.

Scope:

- select only compact, high-value subsets from the local core
- export band metadata, spectral samples, overlays, topic maps, and
  comparison summaries in app-friendly form
- version those subsets independently from raw local archives

Acceptance:

- every exported subset must link back to a validated local workflow
- static screenshots are auxiliary only, never the primary evidence

## Phase 7: Web App Rebuild

Status: blocked on Phase 6 assets, but the target structure is already
defined.

Target product structure:

- `Context` surface for explanation and conceptual framing
- `Workspace` surface with left method scope, central interactive
  evidence, and right inference/validation

Mandatory capabilities:

- interactive spectral plots
- band-selectable image views
- overlay switching for labels, SLIC, topics, clusters, and semantic
  maps where available
- explicit comparison and caveat panels

## Phase 8: Scientific Validation Layer

Status: planned.

Scope:

- repeated fits across seeds
- quantization sensitivity
- document-definition sensitivity
- spectral-library alignment
- label/measurement association
- cross-scene transfer validation

Acceptance:

- the app must distinguish exploratory evidence from validated evidence
- the docs must distinguish demo assets from publishable scientific
  claims

## Immediate Engineering Focus

1. keep growing the local validation core
2. deepen acquisition for real high-value datasets
3. extend offline method comparisons beyond the first SAM/NMF/stability
   layer
4. export only compact subsets with interactive value
5. rebuild the app only after the above is materially in place
