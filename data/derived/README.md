# Derived Data

This folder stores compact artifacts derived from public raw datasets.

Design rules:

- raw third-party files stay under `data/raw/` and are not tracked in Git
- derived assets should be small, documented, and reproducible
- the local validation core may generate heavier intermediate artifacts,
  but the web app should consume compact exported assets rather than full
  raw cubes
- `core/` contains local-first validation outputs such as unified dataset
  inventory and offline PTM/LDA, clustering, and supervised benchmarks
- `real/` contains compact HSI summaries plus generated preview images
- `field/` contains compact MSI field summaries plus generated preview
  images
- `spectral/` contains compact spectra extracted from public spectral
  libraries for material-reference workflows
- `analysis/` contains compact PCA/KMeans diagnostics generated from the
  derived scene and spectral-library summaries
- `corpus/` contains static corpus previews generated from compact
  derived assets; each preview must state alphabet, word, document,
  corpus, vocabulary size, document lengths, and caveats
- `baselines/` contains static SLIC/superpixel baselines generated from
  local raw scenes; each result records feature space, supervision use,
  spatial use, segment statistics, label purity when labels exist, and
  caveats
