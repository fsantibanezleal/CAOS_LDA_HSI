// Type exports retained for Workspace.tsx. The runtime zustand store was
// removed in c343 (the hook was never imported; selection state lives in
// the XState workspace machine + URL params).

export type DatasetFamily =
  | "hsi-labelled"
  | "hidsag-mineral"
  | "usgs-reference"
  | "msi-field"
  | "unmixing-roi";

export type RepresentationKind =
  | "raw"
  | "lda"
  | "ntm"
  | "dmr"
  | "pca"
  | "nmf"
  | "ae";
