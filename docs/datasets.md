# Dataset Notes

The project needs public MSI / HSI examples that satisfy two competing
constraints:

1. they should be realistic enough to support meaningful demos
2. they should stay small enough that a public Git repository remains
   practical

## Downloaded HSI Benchmarks

The current local pipeline downloads the following official UPV/EHU
benchmarks into `data/raw/upv_ehu/` and converts them into compact app
assets under `data/derived/real/`:

- `Indian Pines corrected`: 5.7 MB
- `Salinas-A corrected`: 1.5 MB
- `Pavia University`: 33.2 MB
- `Kennedy Space Center`: 56.8 MB
- `Botswana`: 78.9 MB

These scenes are a good first wave because they span agriculture, urban
surfaces, wetlands, water, and soil while staying below the current
per-file target.

## Downloaded MSI Field Samples

The current local pipeline also downloads official MicaSense RedEdge
samples into `data/raw/micasense/` and converts the orthomosaics into
compact app assets under `data/derived/field/`:

- `rededge_geotiff_example1.tif`: about 18.2 MB
- `rededge_geotiff_example2.tif`: about 68.6 MB
- raw sample captures for examples 1, 2, and 3 as ZIP archives

These field samples are especially useful because they offer a compact,
real MSI complement to the HSI remote-sensing scenes while preserving
local spectral variability over vegetation patches.

## Cataloged Complementary Sources

- `EuroSAT`: strong MSI complement, but better handled as a curated
  subset or downloader-driven asset rather than a full committed archive
- `CAVE Multispectral Image Database`: useful laboratory-scale reference
  for reflectance scenes, but official direct access is brittle enough
  that it is treated as cataloged rather than automated for now
- `USGS Spectral Library Version 7`: especially relevant for mineral and
  clay-oriented one-dimensional spectra
- `ECOSTRESS Spectral Library`: useful when the demo needs broader
  material diversity and richer spectral variability

## Current Repository Strategy

- keep dataset discovery and editorial notes in `data/manifests/`
- keep the interactive release powered by both a synthetic compact demo
  and compact summaries derived from real public scenes
- keep raw benchmark cubes and orthomosaics under `data/raw/` outside
  Git tracking
- regenerate app-friendly assets with:
  `data-pipeline/fetch_public_hsi.py`,
  `data-pipeline/fetch_public_msi.py`,
  `data-pipeline/build_real_samples.py`, and
  `data-pipeline/build_field_samples.py`
