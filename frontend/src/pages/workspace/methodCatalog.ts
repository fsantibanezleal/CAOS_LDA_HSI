export type MethodFamily = "wordification" | "neural";

export interface MethodEntry {
  id: string;
  family: MethodFamily;
  /** Whether F-axis sweep artefacts exist: true for the 19 built recipes (V1-V15, V17-V20); false for V16 (foundation-model scaffold) and the 4 neural baselines. */
  hasSweepArtefacts: boolean;
}

export const METHOD_CATALOG: MethodEntry[] = [
  { id: "V1", family: "wordification", hasSweepArtefacts: true },
  { id: "V2", family: "wordification", hasSweepArtefacts: true },
  { id: "V3", family: "wordification", hasSweepArtefacts: true },
  { id: "V4", family: "wordification", hasSweepArtefacts: true },
  { id: "V5", family: "wordification", hasSweepArtefacts: true },
  { id: "V6", family: "wordification", hasSweepArtefacts: true },
  { id: "V7", family: "wordification", hasSweepArtefacts: true },
  { id: "V8", family: "wordification", hasSweepArtefacts: true },
  { id: "V9", family: "wordification", hasSweepArtefacts: true },
  { id: "V10", family: "wordification", hasSweepArtefacts: true },
  { id: "V11", family: "wordification", hasSweepArtefacts: true },
  { id: "V12", family: "wordification", hasSweepArtefacts: true },
  { id: "V13", family: "wordification", hasSweepArtefacts: true },
  { id: "V14", family: "wordification", hasSweepArtefacts: true },
  { id: "V15", family: "wordification", hasSweepArtefacts: true },
  { id: "V16", family: "wordification", hasSweepArtefacts: false },
  { id: "V17", family: "wordification", hasSweepArtefacts: true },
  { id: "V18", family: "wordification", hasSweepArtefacts: true },
  { id: "V19", family: "wordification", hasSweepArtefacts: true },
  { id: "V20", family: "wordification", hasSweepArtefacts: true },
  { id: "ProdLDA", family: "neural", hasSweepArtefacts: false },
  { id: "ETM", family: "neural", hasSweepArtefacts: false },
  { id: "CAE", family: "neural", hasSweepArtefacts: false },
  { id: "BetaVAE", family: "neural", hasSweepArtefacts: false },
];

export function findMethod(id: string): MethodEntry | undefined {
  return METHOD_CATALOG.find((m) => m.id === id);
}
