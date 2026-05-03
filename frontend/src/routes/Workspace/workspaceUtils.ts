import type {
  ExplorationSceneView,
  ExplorationViewsPayload,
  SubsetCard
} from "../../lib/api";

const DATASET_ALIASES: Record<string, string[]> = {
  "cuprite-upv-reflectance": ["cuprite-aviris-reflectance", "cuprite"],
  "cuprite-aviris-reflectance": ["cuprite-upv-reflectance", "cuprite"],
  "salinas-corrected": ["salinas", "salinas-a-corrected"],
  "salinas-a-corrected": ["salinas-a", "salinas-corrected"],
  "indian-pines-corrected": ["indian-pines"],
  "samson-unmixing-roi": ["samson"],
  "jasper-ridge-unmixing-roi": ["jasper-ridge", "jasper"],
  "urban-unmixing-roi": ["urban"]
};

export function datasetMatches(target: string, candidate: string): boolean {
  if (target === candidate) return true;
  const aliases = DATASET_ALIASES[target] ?? [];
  return aliases.includes(candidate);
}

export function findExplorationScene(
  card: SubsetCard | null,
  explorations: ExplorationViewsPayload | null
): ExplorationSceneView | null {
  if (!card || !explorations) return null;
  const datasetIds = card.evidence.map((e) => e.dataset_id);
  for (const scene of explorations.scenes) {
    const sid = scene.scene_id ?? "";
    if (datasetIds.includes(sid)) return scene;
    for (const did of datasetIds) {
      if (datasetMatches(did, sid)) return scene;
    }
  }
  return null;
}

export function clampedIndex(value: number, size: number): number {
  if (size <= 0) return 0;
  return Math.max(0, Math.min(size - 1, value));
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

export function tokenToWavelength(token: string): number | null {
  // Tokens like "0653nm" or "1295nm".
  const match = token.match(/^(\d+(?:\.\d+)?)nm/i);
  return match ? Number.parseFloat(match[1]) : null;
}
