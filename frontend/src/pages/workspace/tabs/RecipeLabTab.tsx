import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";

import {
  vSweepMethodReport,
  type VSweepRecipeReport,
  type VSweepRecipeScene,
} from "@/api/v-sweep";

/**
 * Recipe Lab tab (id "recipelab") — the flagship "representation is the
 * independent variable" panel.
 *
 * Pick a scene and up to three wordification recipes from the full
 * V1..V20 set (NOT capped at V12). For each recipe we fetch
 * /api/v-sweep/methods/<recipe> and surface, side by side:
 *
 *  - a token-bag summary (vocab size V, mean document length) read from
 *    the recipe's topic_view shard for the chosen scene, and
 *  - an F-1 / F-2 / F-7 / F-14 / F-18 scoreboard with the per-axis
 *    winner highlighted (F-14 is lower-is-better; everything else is
 *    higher-is-better).
 *
 * The takeaway: changing the representation — not K, not the scene —
 * changes the numbers, and you can read off what each representation
 * buys you.
 */

// All 20 recipe ids the methodCatalog exposes; V16 has no sweep
// artefacts but the report endpoint still 404-safe-returns null shards,
// so we keep the full V1..V20 picker (audit: "NOT capped at V12").
const RECIPE_IDS = [
  "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10",
  "V11", "V12", "V13", "V14", "V15", "V16", "V17", "V18", "V19", "V20",
];

const LABELLED_SCENES = [
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
];

const MAX_RECIPES = 3;
const DEFAULT_RECIPES = ["V1", "V8", "V20"];

type AxisDef = {
  id: string;
  label: string;
  title: string;
  higherIsBetter: boolean;
  get: (s: VSweepRecipeScene | undefined) => number | null;
};

const AXES: AxisDef[] = [
  {
    id: "f1",
    label: "F-1 macro-F1",
    title: "Topic-routed soft classification macro-F1 (per-fold mean)",
    higherIsBetter: true,
    get: (s) => s?.f1?.topic_routed_soft_mean ?? null,
  },
  {
    id: "f2",
    label: "F-2 c_v",
    title: "Topic-word coherence c_v",
    higherIsBetter: true,
    get: (s) => s?.f2?.c_v ?? null,
  },
  {
    id: "f7",
    label: "F-7 NMI",
    title: "Topic-to-label normalised mutual information",
    higherIsBetter: true,
    get: (s) => s?.f7?.normalised_mi ?? null,
  },
  {
    id: "f14",
    label: "F-14 Jaccard",
    title: "Mean pairwise top-token Jaccard (repetitiveness) — lower is better",
    higherIsBetter: false,
    get: (s) => s?.f14?.mean_pairwise_jaccard ?? null,
  },
  {
    id: "f18",
    label: "F-18 cosine",
    title: "Mean seed-matched topic cosine (reliability)",
    higherIsBetter: true,
    get: (s) => s?.f18?.mean_matched_cosine ?? null,
  },
];

function shortScene(sceneId: string): string {
  return sceneId.replace(/-corrected$/, "").replace(/-/g, " ");
}

export function RecipeLabTab({ sceneId }: { sceneId: string }) {
  const initialScene = LABELLED_SCENES.includes(sceneId)
    ? sceneId
    : LABELLED_SCENES[0]!;
  const [scene, setScene] = useState<string>(initialScene);
  const [recipes, setRecipes] = useState<string[]>(DEFAULT_RECIPES);

  const queries = useQueries({
    queries: recipes.map((r) => ({
      queryKey: ["v-sweep-method-report", r],
      queryFn: () => vSweepMethodReport(r),
      staleTime: 30 * 60_000,
    })),
  });

  const toggleRecipe = (id: string) => {
    setRecipes((prev) => {
      if (prev.includes(id)) {
        // keep at least one selected
        return prev.length > 1 ? prev.filter((r) => r !== id) : prev;
      }
      if (prev.length >= MAX_RECIPES) return prev; // cap at 3
      // preserve V1..V20 order for stable column layout
      return [...prev, id].sort(
        (a, b) =>
          parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10),
      );
    });
  };

  const anyLoading = queries.some((q) => q.isLoading);

  // For each selected recipe, resolve the scene row out of its report.
  const columns = useMemo(
    () =>
      recipes.map((r, i) => {
        const q = queries[i];
        const report = (q?.data as VSweepRecipeReport | undefined) ?? null;
        const sceneRow = report?.scenes.find((sc) => sc.scene_id === scene);
        return {
          recipe: r,
          report,
          sceneRow,
          isLoading: q?.isLoading ?? false,
          error: (q?.error as Error | null) ?? null,
        };
      }),
    [recipes, queries, scene],
  );

  // Per-axis winner: index of the column with the best value.
  const winners = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const axis of AXES) {
      let bestIdx: number | null = null;
      let bestVal: number | null = null;
      columns.forEach((col, idx) => {
        const v = axis.get(col.sceneRow);
        if (v === null) return;
        if (
          bestVal === null ||
          (axis.higherIsBetter ? v > bestVal : v < bestVal)
        ) {
          bestVal = v;
          bestIdx = idx;
        }
      });
      out[axis.id] = bestIdx;
    }
    return out;
  }, [columns]);

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background:
              "linear-gradient(90deg, rgba(40,160,80,1) 0%, rgba(234,179,8,1) 100%)",
          }}
        />
        <h3
          className="text-lg font-semibold tracking-tight mt-1 mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          Recipe Lab · the representation is the independent variable
        </h3>
        <p
          className="text-[12.5px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Fix the scene, then put up to three wordification recipes
          (V1..V20) side by side. Each column shows the token-bag the
          recipe builds (vocabulary size, mean document length) and how it
          scores across five evaluation axes. The per-axis winner is
          highlighted — read off what each representation buys you. F-14
          is lower-is-better; all other axes are higher-is-better.
        </p>

        <div className="mb-2">
          <span
            className="text-[10.5px] uppercase tracking-widest font-semibold mr-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            scene
          </span>
          <div className="inline-flex flex-wrap gap-1 align-middle">
            {LABELLED_SCENES.map((s) => {
              const active = s === scene;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScene(s)}
                  className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
                  style={{
                    borderColor: active
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    color: active
                      ? "var(--color-accent)"
                      : "var(--color-fg-subtle)",
                    backgroundColor: active
                      ? "var(--color-accent-soft)"
                      : "transparent",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {shortScene(s)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span
            className="text-[10.5px] uppercase tracking-widest font-semibold mr-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            recipes ({recipes.length}/{MAX_RECIPES})
          </span>
          <div className="inline-flex flex-wrap gap-1 align-middle">
            {RECIPE_IDS.map((id) => {
              const active = recipes.includes(id);
              const atCap = !active && recipes.length >= MAX_RECIPES;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={atCap}
                  onClick={() => toggleRecipe(id)}
                  className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
                  style={{
                    borderColor: active
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    color: active
                      ? "var(--color-accent)"
                      : atCap
                        ? "var(--color-fg-faint)"
                        : "var(--color-fg-subtle)",
                    backgroundColor: active
                      ? "var(--color-accent-soft)"
                      : "transparent",
                    fontWeight: active ? 600 : 400,
                    cursor: atCap ? "not-allowed" : "pointer",
                    opacity: atCap ? 0.5 : 1,
                  }}
                >
                  {id}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {anyLoading ? (
        <p style={{ color: "var(--color-fg-faint)" }}>
          Loading recipe reports for {shortScene(scene)}…
        </p>
      ) : (
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          {columns.map((col, idx) => (
            <RecipeColumn
              key={col.recipe}
              recipe={col.recipe}
              scene={scene}
              sceneRow={col.sceneRow}
              error={col.error}
              winners={winners}
              columnIndex={idx}
            />
          ))}
        </div>
      )}

      <p className="text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
        Vocabulary V and mean doc length come from each recipe's
        topic_view shard for this scene; the axis scores are the
        precomputed F-1/F-2/F-7/F-14/F-18 sweep results. A "—" means that
        shard is not on disk for this (recipe, scene) yet. For the full
        per-axis cross-scene table on a single recipe, open its deep-dive
        page under <span className="font-mono">/workspace/methods</span>.
      </p>
    </div>
  );
}

function RecipeColumn({
  recipe,
  scene,
  sceneRow,
  error,
  winners,
  columnIndex,
}: {
  recipe: string;
  scene: string;
  sceneRow: VSweepRecipeScene | undefined;
  error: Error | null;
  winners: Record<string, number | null>;
  columnIndex: number;
}) {
  const V = sceneRow?.topic_view?.V ?? null;
  const meanDoc = sceneRow?.topic_view?.mean_doc_length ?? null;
  const K = sceneRow?.topic_view?.K ?? null;

  return (
    <div
      className="rounded-lg border p-4 flex flex-col"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span
          className="font-mono text-[13px] px-2 py-0.5 rounded font-semibold"
          style={{
            backgroundColor: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          {recipe}
        </span>
        <span
          className="text-[11px] font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {shortScene(scene)}
        </span>
      </div>

      {error ? (
        <p className="text-[12px]" style={{ color: "var(--color-warn)" }}>
          load failed: {error.message}
        </p>
      ) : !sceneRow ? (
        <p className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
          No sweep shard for {recipe} on this scene.
        </p>
      ) : (
        <>
          <h5
            className="text-[10.5px] uppercase tracking-widest font-semibold mb-1.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Token bag
          </h5>
          <div
            className="space-y-1 text-[12.5px] font-mono mb-3"
            style={{ color: "var(--color-fg)" }}
          >
            <div className="flex justify-between">
              <span style={{ color: "var(--color-fg-faint)" }}>vocab V</span>
              <span>{V != null ? V.toLocaleString() : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--color-fg-faint)" }}>
                mean doc len
              </span>
              <span>{meanDoc != null ? meanDoc.toFixed(1) : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: "var(--color-fg-faint)" }}>topics K</span>
              <span>{K != null ? K : "—"}</span>
            </div>
          </div>

          <h5
            className="text-[10.5px] uppercase tracking-widest font-semibold mb-1.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Scoreboard
          </h5>
          <div className="space-y-1">
            {AXES.map((axis) => {
              const v = axis.get(sceneRow);
              const isWinner = winners[axis.id] === columnIndex && v !== null;
              return (
                <div
                  key={axis.id}
                  title={axis.title}
                  className="flex justify-between items-center rounded px-2 py-1 text-[12.5px]"
                  style={{
                    backgroundColor: isWinner
                      ? "var(--color-accent-soft)"
                      : "transparent",
                    border: isWinner
                      ? "1px solid var(--color-accent)"
                      : "1px solid transparent",
                  }}
                >
                  <span
                    className="font-mono text-[11px]"
                    style={{
                      color: isWinner
                        ? "var(--color-accent)"
                        : "var(--color-fg-faint)",
                    }}
                  >
                    {axis.label}
                  </span>
                  <span
                    className="font-mono"
                    style={{
                      color: isWinner
                        ? "var(--color-accent)"
                        : "var(--color-fg)",
                      fontWeight: isWinner ? 700 : 400,
                    }}
                  >
                    {v != null ? v.toFixed(4) : "—"}
                    {isWinner ? " ★" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
