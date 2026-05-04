import { create } from "zustand";

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

type SelectionState = {
  family: DatasetFamily | null;
  subset: string | null;
  representation: RepresentationKind | null;
  setFamily: (family: DatasetFamily | null) => void;
  setSubset: (subset: string | null) => void;
  setRepresentation: (rep: RepresentationKind | null) => void;
  reset: () => void;
};

export const useSelectionStore = create<SelectionState>((set) => ({
  family: null,
  subset: null,
  representation: null,
  setFamily: (family) =>
    set({ family, subset: null, representation: null }),
  setSubset: (subset) => set({ subset, representation: null }),
  setRepresentation: (representation) => set({ representation }),
  reset: () => set({ family: null, subset: null, representation: null }),
}));
