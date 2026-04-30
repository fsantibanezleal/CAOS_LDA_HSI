import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

interface StoreState {
  theme: Theme;
  toggleTheme: () => void;
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
        selectedRepresentation: state.selectedRepresentation
      })
    }
  )
);

if (typeof document !== "undefined") {
  const storedTheme = useStore.getState().theme;
  document.documentElement.setAttribute("data-theme", storedTheme);
}
