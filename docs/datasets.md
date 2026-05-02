# Datasets — repo-local snapshot

This is the **repo-local short reference** of the project's dataset
layer. The canonical extended description lives on the wiki page
[Dataset Families and Sources](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Dataset-Families-and-Sources)
and the HIDSAG-specific page
[HIDSAG Family D Workflows](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/HIDSAG-Family-D-Workflows).

## The four families

| Family | Definition | Supervision | Valid recipes | Public claims allowed |
|---|---|---|---|---|
| **A** | individual labelled or measured spectra | material label / sample ID / response variable | V1, V2, V3, V4, V5 | material similarity, library alignment, supervised tasks if targets exist |
| **B** | spectral images with pixel labels | per-pixel / per-region labels | V1, V3, V4, V6, V7 | classification baselines, topic-vs-cluster comparison |
| **C** | spectral images without labels | none | V1, V3, V4, V7 | exploratory regimes only — explicit caveat layer |
| **D** | regions / samples with measured response variables | per-sample / per-region targets | V1, V3, V4, V7, V8 | hierarchical topic-routed regression and classification |

Every dataset registered in `data/manifests/datasets.json` carries a
family tag through its `supervision.family_id` field. The frontend
filters by family before showing dataset cards.

## Active local datasets

Snapshot from `data/derived/core/local_dataset_inventory.json`
(2026-05-02): 21 catalogued datasets, 10 with local raw evidence,
~31.6 GB local raw footprint.

### Family A

- **USGS Spectral Library v7** — AVIRIS (224 bands) and Sentinel-2
  convolutions of the official USGS material reference library.
  Compact JSON in `data/derived/spectral/library_samples.json` (26
  samples). Pipeline: `fetch_public_spectral_libraries.py` →
  `build_spectral_library_samples.py`.
- **ECOSTRESS** — public catalogue metadata reproduced through
  `fetch_ecostress_metadata.py`. Bulk download is currently login-gated
  and is the dominant blocker for a full Family A reproduction.

### Family B

- **Indian Pines (corrected)**, **Salinas**, **Salinas-A**,
  **Pavia University**, **Kennedy Space Center**, **Botswana** —
  classic UPV/EHU GIC research-public scenes. Pipeline:
  `fetch_public_hsi.py` → `build_real_samples.py`.

### Family C

- **Cuprite AVIRIS reflectance** — UPV/EHU slice (224 bands).
- **Borsoi Samson / Jasper Ridge / Urban** — public unmixing ROIs
  (`ricardoborsoi/MUA_GIST_release`).
- **MicaSense RedEdge field samples** — official MicaSense public MSI
  examples (5 bands).

### Family D

- **HIDSAG** — Santibáñez-Leal et al., *Scientific Data* 2023, CC-BY
  4.0. Subsets used locally: `GEOMET`, `MINERAL1`, `MINERAL2`,
  `GEOCHEM`, `PORPHYRY`. Modalities: `SWIR_low`, `VNIR_low`,
  `VNIR_high`. Pipeline:
  `fetch_hidsag.py` → `inspect_hidsag_zip.py` →
  `build_hidsag_curated_subset.py` → `build_hidsag_band_quality.py` →
  `build_hidsag_region_documents.py` →
  `run_hidsag_preprocessing_sensitivity.py`.

## Acquisition discipline

Every dataset card in the public app records:

- direct source URL or DOI
- license note
- file size
- access mode (direct / login-gated / request-only / private)
- supervision status
- acquisition mode (sensor, wavelength range, spatial resolution)
- recipe compatibility
- baseline applicability
- date accessed
- bad-band notes
- redistribution policy (compact-derived only / not redistributable)

The schema is enforced by
`DatasetEntry`, `DatasetSupervision` and `DatasetAcquisition` in
`app/models/schemas.py`.

## Why some datasets are catalogued but not active

- **license unclear** — for example several commercial UAV scenes are
  catalogued but excluded from public app payloads.
- **size-prohibitive** — full SpectralEarth (3.3 TB), full WHU-Hi
  cubes, and several airborne archives are too large for direct repo
  redistribution. Sampled tiles are planned.
- **access-gated** — ECOSTRESS bulk export currently requires a
  session.
- **wavelength calibration weak** — some public scenes lack documented
  calibration metadata for serious mineral comparison.

## Where to add a new dataset

1. Append the dataset record to `data/manifests/datasets.json` with
   the full metadata above.
2. Implement (or extend) a `data-pipeline/fetch_*` script.
3. Implement (or extend) a `data-pipeline/build_*` script that produces
   the compact derived asset.
4. Run `scripts/local.* run-core` so the dataset enters the validation
   benchmarks where applicable.
5. If the dataset is ready for public exposure, register it inside an
   `interactive_subsets.json` entry and run
   `scripts/local.* build-subset-cards`.

The wiki page
[Public Interactive Subset Layer](https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Public-Interactive-Subset-Layer)
describes the gating between local-only datasets and public-app
datasets.
