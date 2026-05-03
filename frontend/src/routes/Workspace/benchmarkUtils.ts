import type { LocalCoreBenchmarksPayload, SegmentationBaselinesPayload } from "../../lib/api";

type LooseRecord = Record<string, unknown>;

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

export function asRecord(value: unknown): LooseRecord | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

export function asRecordArray(value: unknown): LooseRecord[] {
  return Array.isArray(value)
    ? (value
        .map(asRecord)
        .filter((r): r is LooseRecord => r !== null))
    : [];
}

export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function pickRunsForDatasets<T extends LooseRecord>(
  runs: unknown,
  datasetIds: string[]
): T[] {
  const list = Array.isArray(runs) ? runs : [];
  const targets = new Set(datasetIds);
  return list
    .map(asRecord)
    .filter((r): r is T => {
      if (!r) return false;
      const id = asString(r["dataset_id"]);
      if (targets.has(id)) return true;
      for (const t of targets) {
        if (datasetMatches(t, id)) return true;
      }
      return false;
    });
}

export function filterBenchmarks(
  benchmarks: LocalCoreBenchmarksPayload | null,
  datasetIds: string[]
) {
  const empty = {
    labeled: [] as LooseRecord[],
    unlabeled: [] as LooseRecord[],
    unmixing: [] as LooseRecord[],
    library: [] as LooseRecord[],
    measured: [] as LooseRecord[],
    stability: [] as LooseRecord[]
  };
  if (!benchmarks) return empty;
  return {
    labeled: pickRunsForDatasets(benchmarks.labeled_scene_runs, datasetIds),
    unlabeled: pickRunsForDatasets(benchmarks.unlabeled_scene_runs, datasetIds),
    unmixing: pickRunsForDatasets(benchmarks.unmixing_runs, datasetIds),
    library: pickRunsForDatasets(benchmarks.spectral_library_runs, datasetIds),
    measured: pickRunsForDatasets(benchmarks.measured_target_runs, datasetIds),
    stability: pickRunsForDatasets(benchmarks.topic_stability_runs, datasetIds)
  };
}

export function filterSegmentation(
  payload: SegmentationBaselinesPayload | null,
  datasetIds: string[]
): LooseRecord[] {
  if (!payload) return [];
  const targets = new Set(datasetIds);
  const scenes = (payload as unknown as LooseRecord)["scenes"];
  return asRecordArray(scenes).filter((scene) => {
    const id = asString(scene["dataset_id"]);
    if (targets.has(id)) return true;
    for (const t of targets) {
      if (datasetMatches(t, id)) return true;
    }
    return false;
  });
}
