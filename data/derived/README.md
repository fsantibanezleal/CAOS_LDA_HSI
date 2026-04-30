# Derived Data

This folder stores compact artifacts derived from public raw datasets.

Design rules:

- raw third-party files stay under `data/raw/` and are not tracked in Git
- derived assets should be small, documented, and reproducible
- the web app should consume derived assets rather than full raw cubes
- `real/` contains compact HSI summaries plus generated preview images
- `field/` contains compact MSI field summaries plus generated preview
  images
- `spectral/` contains compact spectra extracted from public spectral
  libraries for material-reference workflows
- `analysis/` contains compact PCA/KMeans diagnostics generated from the
  derived scene and spectral-library summaries
