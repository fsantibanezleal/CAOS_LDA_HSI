# Dataset Scope And Expansion

This document records what data exists in the product today, what is
cataloged for expansion, and what must remain external or subset-only.

## Active Size Rule

Public raw files are eligible only when each individual file is below
100 MB and licensing/provenance are acceptable. This rule is about single
files, not total repository size. Even if every file is below 100 MB, the
repo must still avoid becoming heavy enough to make development and VPS
deployment fragile.

## Current Local Data

The current pipeline downloads official public sources into `data/raw/`
and creates compact app assets under `data/derived/`. Raw data is not
tracked in Git.

### UPV/EHU HSI Scenes

The following scenes are already represented in compact app summaries:

| Scene | Theme | Bands | Raw Size | Current Use |
|---|---|---:|---:|---|
| Indian Pines corrected | Agriculture, vegetation | 200 | 5.7 MB | Real-scene summary and preview |
| Salinas corrected | Agriculture, vegetation, soil, vineyards | 204 | 25.3 MB | Real-scene summary and preview |
| Salinas-A corrected | Agriculture, vegetation | 204 | 1.5 MB | Real-scene summary and preview |
| Cuprite AVIRIS reflectance | Minerals, clays, geology | 224 | 95.3 MB | Mineral scene summary and inferred topic-stratum preview |
| Pavia University | Urban materials | 103 | 33.2 MB | Real-scene summary and preview |
| Kennedy Space Center | Wetlands, vegetation, water | 176 | 56.8 MB | Real-scene summary and preview |
| Botswana | Wetlands, vegetation, soil | 145 | 78.9 MB | Real-scene summary and preview |

These are useful because they already cover agriculture, urban, wetland,
water, vegetation, and soil examples while staying below 100 MB per raw
file.

### MicaSense Field MSI Samples

The app also includes compact summaries derived from official MicaSense
RedEdge examples:

| Asset | Theme | Bands | Raw Size | Current Use |
|---|---|---:|---:|---|
| Example 1 orthomosaic | Field vegetation | 4 | about 18.2 MB | Field MSI summary, RGB preview, NDVI preview |
| Example 2 orthomosaic | Field vegetation | 4 | about 68.6 MB | Field MSI summary, RGB preview, NDVI preview |

These samples are important because they prove the workflow can handle
field multispectral imagery, not only academic hyperspectral cubes.

### Public Unmixing ROIs

The app now includes compact summaries derived from the Borsoi
MUA_SparseUnmixing `real_data` examples:

| Asset | Theme | Bands | Raw Size | Current Use |
|---|---|---:|---:|---|
| Samson ROI | Water, soil/tree style unmixing | 156 | 3.6 MB | Unlabeled topic-stratum preview and scene summary |
| Jasper Ridge ROI | Vegetation, soil, water, road | 198 | 3.0 MB | Unlabeled topic-stratum preview and scene summary |
| Urban HYDICE ROI | Urban materials | 162 | 17.7 MB | Unlabeled topic-stratum preview and scene summary |

These scenes are unlabeled in the current app. Their colored previews are
inferred topic-stratum maps, not official ground truth.

### USGS Spectral Library Samples

The app now includes 26 compact material spectra extracted from official
USGS Spectral Library Version 7 ASCII sensor subsets:

| Source Archive | Bands | Current Use |
|---|---:|---|
| AVIRIS-Classic 1997 convolution | 224 | Clay, alteration mineral, oxide, carbonate, urban, and vegetation reference spectra |
| Sentinel-2 MSI resampling | 13 | MSI-scale comparison references for the same material vocabulary |

The full USGS library is not committed. Only compact derived material
samples are tracked.

## Under-100 MB Expansion Candidates

The first priority additions below have been implemented locally. They
remain documented here because they define the current data policy.

### Full Salinas Corrected

- Source: UPV/EHU Hyperspectral Remote Sensing Scenes
- Size: 25.3 MB
- Theme: agriculture, vegetation, soil, vineyards
- Value: expands the current Salinas-A subset into a full agricultural
  scene with richer spatial context
- Handling: downloaded through `fetch_public_hsi.py`, derived through
  `build_real_samples.py`

### Cuprite Reflectance

- Source: UPV/EHU / AVIRIS
- Size: about 95.3 MB
- Theme: minerals, clays, geology, unmixing
- Value: directly supports the first serious mineral/clay workflow
- Handling: downloaded through `fetch_public_hsi.py`; raw file stays out
  of Git because it is close to the 100 MB rule
- Risk: close to the GitHub individual-file limit, so derived summaries
  should stay compact

### Small Unmixing ROI Suite

- Source family: Borsoi MUA_SparseUnmixing `real_data`
- Theme: minerals, urban, vegetation, water, endmember variability
- Value: enables topic-mixture versus unmixing comparisons
- Handling: Samson, Jasper Ridge, and Urban are downloaded through
  `fetch_public_unmixing.py`; Cuprite ROI remains pending source
  verification

## Cataloged Subset Sources

These are useful for demonstrating broad method transfer, but they should
not be committed as full raw datasets.

| Source | Theme | Constraint | Intended Use |
|---|---|---|---|
| EuroSAT | Sentinel-2 cities, agriculture, vegetation, rivers, sea/lake | Full archive should remain external | Curated class-balanced MSI patches |
| BigEarthNet v2.0 | Sentinel-1/Sentinel-2 multi-label land cover | Full S2 archive is about 59 GiB | Metadata-driven selected patches |
| WHU-Hi | UAV HSI agriculture and fine crop classes | Download/licensing/per-file sizes need verification | UAV crop and high-resolution vegetation demo |
| HyRANK | Cross-scene HSI | Canonical source and sizes need verification | Domain-shift and topic stability testing |
| HySpecNet-11k | EnMAP HSI patches | Large patch collection | Selected satellite HSI patch manifests |
| Houston 2013 GRSS | Urban HSI + LiDAR | Access and redistribution constraints | Urban multimodal demo |
| Cross-scene wetland HSI | Wetlands and domain adaptation | Zenodo archive is about 1.3 GB | External wetland source plus tiny derived patches |
| Landsat Collection 2 Level-2 | Surface reflectance, water, humidity, drought, temperature | Query-driven large scenes | Future geospatial ingestion and index comparisons |
| HIDSAG | Geometallurgy, VNIR/SWIR, supervised lab samples | Figshare package sizing and redistribution need verification | Mineral/geometallurgy research reference |

## Implementation Status Labels

Dataset entries should use explicit status labels:

- `Downloaded and derived locally`: compact app assets exist now.
- `Cataloged for expansion`: source is selected, but not ingested.
- `Catalog only`: useful source, no ingestion yet.
- `External library`: do not track raw data; use curated slices later.
- `External archive`: full archive is too large for Git.
- `Access-gated catalog entry`: access or redistribution is not yet clear.

## What Must Not Be Claimed Yet

- The app does not currently train LDA over every cataloged dataset.
- Catalog entries are not the same as local app data.
- Wetland, Landsat, BigEarthNet, HySpecNet, WHU-Hi, and Houston are not
  local first-class demos yet.
- Mineral/clay interpretation is not validated until Cuprite and curated
  spectral-library samples are linked to calibrated wavelength metadata,
  absorption-feature tokens, and explicit expert caveats.
- MicaSense strata are heuristic; they are not labeled agronomic ground
  truth.

## Near-Term Data Work

1. Add calibrated band-center vectors where reliable metadata is
   available.
2. Add stronger clustering, heatmap, and topic-map visualizations over the
   expanded real-scene payload.
3. Add ECOSTRESS compact samples with transparent attribution if direct
   public access and licensing are verified.
4. Add a tiny Sentinel-2 patch subset that includes urban, water,
   vegetation, and agriculture classes.
5. Add wetland patches only through an external-download plus
   derived-subset workflow.
6. Add a manifest field that clearly separates local data, optional raw
   data, external data, and planned data.
