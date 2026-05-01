# Dataset Scope And Expansion

This document records how data should be handled after the reset.

The repo is local-first. Real spectral datasets should be downloaded and
organized locally whenever licensing and access permit it. Git and the
public app are not the place for full raw archives. They are the place
for manifests, acquisition logic, validation code, and compact exported
subsets.

## Data Policy

Three different constraints must not be confused:

1. `Local validation`
   Raw files may be large if they are useful and reproducible.
2. `Git repository`
   Full archives should not be committed blindly.
3. `Public app`
   Only compact, versioned, inspectable subsets belong there.

The older per-file 100 MB heuristic is no longer the controlling design
rule for research work. It can still influence what gets committed or
shipped publicly, but it must not block local scientific validation.

## Current Local Inventory

The current local-core inventory is generated into:

- `data/derived/core/local_dataset_inventory.json`

Current first-pass summary:

- cataloged datasets: 21
- datasets with local raw evidence: 9
- local raw footprint currently indexed: about 0.323 GB
- current source groups with local evidence:
  - UPV/EHU scenes
  - Borsoi unmixing ROIs
  - MicaSense samples
  - USGS Spectral Library compact archives

This file is now the authoritative high-level inventory of what is truly
available for local validation.

## Current Local Validation Assets

### Labeled Spectral Images

Already available locally with raw evidence and ready for offline
validation:

| Dataset | Theme | Bands | Current role |
|---|---|---:|---|
| Indian Pines corrected | agriculture, vegetation | 200 | labeled benchmark for pixel/class experiments |
| Salinas corrected | agriculture, vegetation, soil, vineyards | 204 | richer agricultural validation scene |
| Salinas-A corrected | agriculture, vegetation | 204 | tiny reproducible benchmark |
| Pavia University | urban materials | 103 | urban labeled comparison |
| Kennedy Space Center | wetlands, vegetation, water | 176 | wetland label-alignment benchmark |
| Botswana | wetlands, vegetation, soil | 145 | wetland/soil benchmark |

### Unlabeled Spectral Images

Available locally for exploratory topic, clustering, and unmixing-style
workflows:

| Dataset | Theme | Bands | Current role |
|---|---|---:|---|
| Cuprite AVIRIS reflectance | minerals, clays, geology | 224 | mineral/clay exploratory benchmark |
| Samson ROI | unmixing | 156 | compact mixture comparison |
| Jasper Ridge ROI | vegetation, soil, water | 198 | compact mixture comparison |
| Urban ROI | urban materials | 162 | compact mixture comparison |

### Field MSI

Available locally:

| Dataset | Theme | Bands | Current role |
|---|---|---:|---|
| MicaSense Example 1 | field vegetation | 4 | field MSI transfer and NDVI comparison |
| MicaSense Example 2 | field vegetation | 4 | larger field MSI reference |
| MicaSense Example 3 raw capture | field acquisition | varies | raw-support evidence for local workflows |

### Spectral Libraries

Available locally:

| Dataset | Current local form | Current role |
|---|---|---|
| USGS Spectral Library v7 | compact AVIRIS and Sentinel-2 slices | material-reference and library-alignment workflows |

## Local-Core Benchmarks

The repo now generates:

- `data/derived/core/local_core_benchmarks.json`

This first-pass file already records offline evidence over real local
data:

- LDA over band-frequency corpora
- logistic-regression classification baselines
- KMeans, GMM, and hierarchical clustering comparisons in raw and
  topic-space feature views
- multi-seed topic-stability diagnostics on labeled scenes
- SAM-style reference alignment against compact spectral references
- NMF/unmixing comparisons on Borsoi ROIs and Cuprite alignment probes
- exploratory unlabeled clustering summaries
- compact spectral-library grouping diagnostics

This is the correct direction: validate offline first, then decide what
small subset deserves web publication.

## Cataloged High-Value Candidates

These remain important, but they are not local validation assets until
their acquisition path is reproduced.

| Source | Role | Constraint | Intended use |
|---|---|---|---|
| ECOSTRESS Spectral Library | Family A extension | public category metadata is reproducible, but bulk checkout currently routes to login | mineral, vegetation, soil, and man-made references |
| HIDSAG | Family D anchor | MINERAL2 raw subset is local, but split design and export policy are still pending | regression/classification over measured regions |
| WHU-Hi | UAV labeled imagery | source/licensing verification pending | fine-grained crop and high-resolution UAV validation |
| HyRANK | cross-scene HSI | canonical source and split reproduction pending | domain-transfer validation |
| HySpecNet-11k | large HSI patch collection | license and subset policy needed | unsupervised transfer and patch workflows |
| EuroSAT | MSI patch dataset | subset curation needed | compact Sentinel-2 thematic groups |
| BigEarthNet v2.0 | large multi-label archive | archive too large for direct commit | metadata-driven selected patches |
| Houston 2013 | multimodal urban benchmark | access-gated | spectral + LiDAR comparison |
| cross-scene wetland archive | wetland/domain adaptation | archive too large for direct publication | curated wetland patch subsets |
| Landsat Collection 2 Level-2 | query-based external source | geospatial ingestion not built yet | index and transfer workflows |
| CAVE multispectral | laboratory reference | stable acquisition path still pending | controlled lab/object scenes |

## Publication Rule

Only a compact subset should ever reach the app or Git-tracked public
artifacts. A candidate asset is publishable only when:

- provenance is recorded
- license and attribution are clear
- the local validation workflow is reproducible
- the exported subset is compact
- the resulting view is interpretable inside the app

## What Must Not Be Claimed

- cataloged datasets are not implemented datasets
- unlabeled scenes do not support semantic claims by themselves
- nearest spectral-library matches are evidence, not identification
- first-pass clustering is comparison evidence, not semantic truth
- field MSI strata remain heuristic until linked to real measurements or
  labels

## Near-Term Data Work

1. reproduce an ECOSTRESS session-backed or per-spectrum export path
   before claiming Family A expansion
2. curate the first HIDSAG response-variable subset from the downloaded
   MINERAL2 package
3. verify at least one cross-scene dataset for transfer experiments
4. add calibrated wavelength vectors wherever they are reliable
5. define publishable interactive subsets for the future web projection
