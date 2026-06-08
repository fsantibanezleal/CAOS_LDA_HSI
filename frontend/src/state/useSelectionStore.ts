// Type exports retained for Workspace.tsx. The runtime zustand store was
// removed in c343 (the hook was never imported; selection state lives in
// the XState workspace machine + URL params).

// Dataset family ids — these MUST match the `family_id` values emitted by the
// inventory (`/api/local-dataset-inventory`). They were previously a stale
// fiction ("hsi-labelled", "hidsag-mineral", …) that matched nothing; the
// machine worked only because callers cast to this type. Kept in sync with the
// real ids so any literal branch (e.g. FAMILY_DESCRIPTIONS) is checkable.
export type DatasetFamily =
  | "labeled-spectral-image"
  | "unlabeled-spectral-image"
  | "individual-spectra"
  | "regions-with-measurements";

// Representation ids actually selectable in the Workspace (the `id` field of
// REPRESENTATIONS + "raw" for the EDA landing). Previously fiction
// ("ntm"/"dmr" never existed; most real ids were missing).
export type RepresentationKind =
  | "raw"
  | "lda"
  | "lda_sparse"
  | "lda_tomo"
  | "hdp"
  | "ctm"
  | "prodlda"
  | "nmf"
  | "pca"
  | "ae"
  | "ica"
  | "cae_1d"
  | "cae_2d"
  | "cae_3d"
  | "cae_3d_full"
  | "beta_vae";
