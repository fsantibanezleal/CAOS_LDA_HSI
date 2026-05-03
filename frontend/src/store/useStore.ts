import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

export type AppTab =
  | "landing"
  | "overview"
  | "datasets"
  | "workspace"
  | "benchmarks"
  | "usage";

export type OverviewSubTab =
  | "concept"
  | "theory"
  | "representations"
  | "methodology"
  | "references";

export type WorkspaceStep =
  | "data"
  | "corpus"
  | "topics"
  | "comparison"
  | "inference"
  | "validation";

export const APP_TABS: AppTab[] = [
  "landing",
  "overview",
  "datasets",
  "workspace",
  "benchmarks",
  "usage"
];

export const OVERVIEW_SUBTABS: OverviewSubTab[] = [
  "concept",
  "theory",
  "representations",
  "methodology",
  "references"
];

export const WORKSPACE_STEPS: WorkspaceStep[] = [
  "data",
  "corpus",
  "topics",
  "comparison",
  "inference",
  "validation"
];

/**
 * Page-level WorkspaceSelection, per the interactive-workspace research
 * memo §8.2. Every panel reads from this; panels do NOT own state.
 */
export interface WorkspaceSelection {
  subsetId: string | null;
  recipeId: string | null;
  k: number | null;
  seed: number | null;
  /** LDAvis relevance metric trade-off, default 0.6. */
  lambda: number;
  /** How many top words/tokens to display in ranked lists. */
  topNWords: number;
  /** Active wavelength range in nanometres; null = full sensor range. */
  wavelengthRange: [number, number] | null;
  /** Multi-select of class label ids (the first is "primary"). */
  activeClassIds: number[];
  /** Multi-select of topic indices (the first is "primary"). */
  activeTopicIds: number[];
  /** Pinned single pixel (image families only). */
  activePixel: { x: number; y: number } | null;
  /** Inference preview rectangle. */
  lensRect: { x0: number; y0: number; x1: number; y1: number } | null;
}

const DEFAULT_SELECTION: WorkspaceSelection = {
  subsetId: null,
  recipeId: null,
  k: null,
  seed: null,
  lambda: 0.6,
  topNWords: 12,
  wavelengthRange: null,
  activeClassIds: [],
  activeTopicIds: [],
  activePixel: null,
  lensRect: null
};

interface StoreState {
  theme: Theme;
  toggleTheme: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  overviewSubTab: OverviewSubTab;
  setOverviewSubTab: (tab: OverviewSubTab) => void;
  selectedFamilyId: string | null;
  setSelectedFamilyId: (id: string | null) => void;
  workspaceStep: WorkspaceStep;
  setWorkspaceStep: (step: WorkspaceStep) => void;
  selection: WorkspaceSelection;
  setSubset: (id: string | null) => void;
  setRecipe: (id: string | null) => void;
  setK: (k: number | null) => void;
  setSeed: (seed: number | null) => void;
  setLambda: (lambda: number) => void;
  setTopNWords: (n: number) => void;
  setWavelengthRange: (range: [number, number] | null) => void;
  toggleClass: (id: number) => void;
  toggleTopic: (id: number) => void;
  clearTopics: () => void;
  clearClasses: () => void;
  setActivePixel: (pos: { x: number; y: number } | null) => void;
  setLensRect: (rect: { x0: number; y0: number; x1: number; y1: number } | null) => void;
  resetWorkspaceSelection: () => void;
}

const MAX_PINS = 3;

function toggleInList(list: number[], id: number): number[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  if (list.length >= MAX_PINS) return [...list.slice(1), id];
  return [...list, id];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      toggleTheme: () => {
        const next = get().theme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        set({ theme: next });
      },
      activeTab: "landing",
      setActiveTab: (tab) => set({ activeTab: tab }),
      overviewSubTab: "concept",
      setOverviewSubTab: (tab) => set({ overviewSubTab: tab }),
      selectedFamilyId: null,
      setSelectedFamilyId: (id) => set({ selectedFamilyId: id }),
      workspaceStep: "data",
      setWorkspaceStep: (step) => set({ workspaceStep: step }),
      selection: DEFAULT_SELECTION,
      setSubset: (id) =>
        set((state) => ({
          selection: {
            ...state.selection,
            subsetId: id,
            // Reset everything subset-scoped per memo §8.2 propagation rules.
            recipeId: null,
            k: null,
            seed: null,
            activeClassIds: [],
            activeTopicIds: [],
            activePixel: null,
            lensRect: null
          }
        })),
      setRecipe: (id) =>
        set((state) => ({
          selection: {
            ...state.selection,
            recipeId: id,
            // Recipe change resets k/seed/topics/pixel (kept: classes, lambda, range)
            k: null,
            seed: null,
            activeTopicIds: [],
            activePixel: null
          }
        })),
      setK: (k) =>
        set((state) => ({ selection: { ...state.selection, k } })),
      setSeed: (seed) =>
        set((state) => ({ selection: { ...state.selection, seed } })),
      setLambda: (lambda) =>
        set((state) => ({
          selection: { ...state.selection, lambda: Math.max(0, Math.min(1, lambda)) }
        })),
      setTopNWords: (n) =>
        set((state) => ({
          selection: { ...state.selection, topNWords: Math.max(3, Math.min(40, Math.round(n))) }
        })),
      setWavelengthRange: (range) =>
        set((state) => ({ selection: { ...state.selection, wavelengthRange: range } })),
      toggleClass: (id) =>
        set((state) => ({
          selection: { ...state.selection, activeClassIds: toggleInList(state.selection.activeClassIds, id) }
        })),
      toggleTopic: (id) =>
        set((state) => ({
          selection: { ...state.selection, activeTopicIds: toggleInList(state.selection.activeTopicIds, id) }
        })),
      clearTopics: () =>
        set((state) => ({ selection: { ...state.selection, activeTopicIds: [] } })),
      clearClasses: () =>
        set((state) => ({ selection: { ...state.selection, activeClassIds: [] } })),
      setActivePixel: (pos) =>
        set((state) => ({ selection: { ...state.selection, activePixel: pos } })),
      setLensRect: (rect) =>
        set((state) => ({ selection: { ...state.selection, lensRect: rect } })),
      resetWorkspaceSelection: () => set({ selection: DEFAULT_SELECTION })
    }),
    {
      name: "caos-lda-hsi-state",
      partialize: (state) => ({
        theme: state.theme,
        activeTab: state.activeTab,
        overviewSubTab: state.overviewSubTab,
        selectedFamilyId: state.selectedFamilyId,
        workspaceStep: state.workspaceStep,
        selection: {
          subsetId: state.selection.subsetId,
          recipeId: state.selection.recipeId,
          k: state.selection.k,
          seed: state.selection.seed,
          lambda: state.selection.lambda,
          topNWords: state.selection.topNWords,
          wavelengthRange: state.selection.wavelengthRange,
          activeClassIds: state.selection.activeClassIds,
          activeTopicIds: state.selection.activeTopicIds
          // activePixel and lensRect intentionally not persisted.
        }
      })
    }
  )
);

if (typeof document !== "undefined") {
  const storedTheme = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", storedTheme);
}
