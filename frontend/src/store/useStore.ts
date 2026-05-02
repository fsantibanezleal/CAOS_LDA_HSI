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

interface StoreState {
  theme: Theme;
  toggleTheme: () => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  overviewSubTab: OverviewSubTab;
  setOverviewSubTab: (tab: OverviewSubTab) => void;
  selectedFamilyId: string | null;
  setSelectedFamilyId: (id: string | null) => void;
  selectedSubsetId: string | null;
  setSelectedSubsetId: (id: string | null) => void;
  selectedRepresentation: string;
  setSelectedRepresentation: (id: string) => void;
  selectedSampleId: string | null;
  setSelectedSampleId: (id: string) => void;
  selectedTopicId: string | null;
  setSelectedTopicId: (id: string) => void;
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
      selectedSubsetId: null,
      setSelectedSubsetId: (id) => set({ selectedSubsetId: id }),
      selectedRepresentation: "a",
      setSelectedRepresentation: (id) => set({ selectedRepresentation: id }),
      selectedSampleId: null,
      setSelectedSampleId: (id) => set({ selectedSampleId: id }),
      selectedTopicId: null,
      setSelectedTopicId: (id) => set({ selectedTopicId: id })
    }),
    {
      name: "caos-lda-hsi-state",
      partialize: (state) => ({
        theme: state.theme,
        activeTab: state.activeTab,
        overviewSubTab: state.overviewSubTab,
        selectedFamilyId: state.selectedFamilyId,
        selectedSubsetId: state.selectedSubsetId,
        selectedRepresentation: state.selectedRepresentation
      })
    }
  )
);

if (typeof document !== "undefined") {
  const storedTheme = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", storedTheme);
}
