import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { request } from "@/api/_http";
import { Section } from "@/components/Section";

type CoverageAxis = {
  axis: string;
  cells: Record<string, Record<string, boolean>>;
  values?: Record<string, Record<string, number>>;
  recipe_means?: Record<string, number>;
  have: number;
  target: number;
  pct: number;
  lower_is_better?: boolean;
  value_min?: number;
  value_max?: number;
};

type CoverageMatrix = {
  scenes: string[];
  recipes: string[];
  axes: CoverageAxis[];
  generated_at: string;
};

const SCENE_SHORT: Record<string, string> = {
  "indian-pines-corrected": "IP",
  "salinas-corrected": "SAL",
  "salinas-a-corrected": "SAL-A",
  "pavia-university": "Pavia",
  "kennedy-space-center": "KSC",
  "botswana": "Bots",
};

type ViewMode = "boolean" | "values";

function valueColor(
  v: number | undefined,
  vMin: number | undefined,
  vMax: number | undefined,
  lowerIsBetter: boolean,
): string {
  if (v === undefined || vMin === undefined || vMax === undefined) return "transparent";
  const rng = Math.max(vMax - vMin, 1e-9);
  let norm = (v - vMin) / rng; // 0..1, where 1 is the max
  if (lowerIsBetter) norm = 1 - norm;
  // viridis-like: dark blue (low) → cyan → yellow → red
  const stops: [number, number, number][] = [
    [40, 30, 90],
    [40, 80, 160],
    [40, 150, 130],
    [180, 200, 60],
    [220, 70, 30],
  ];
  const i = Math.min(stops.length - 2, Math.max(0, Math.floor(norm * (stops.length - 1))));
  const t = norm * (stops.length - 1) - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function VSweepCoverageMatrix() {
  const { t } = useTranslation(["pages"]);
  const [mode, setMode] = useState<ViewMode>("values");
  const { data, isLoading, isError } = useQuery<CoverageMatrix>({
    queryKey: ["v-sweep-coverage"],
    queryFn: () => request<CoverageMatrix>("/api/v-sweep/coverage"),
    retry: false,
  });

  if (isLoading) return null;
  if (isError || !data) return null;

  return (
    <Section
      id="v-sweep-coverage"
      title={t("pages:benchmarks.vsweep_coverage.title")}
      lead={t("pages:benchmarks.vsweep_coverage.lead")}
    >
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode("values")}
          className="text-[12px] font-medium px-2.5 py-1 rounded transition-colors"
          style={{
            backgroundColor: mode === "values" ? "var(--color-accent)" : "var(--color-panel)",
            color: mode === "values" ? "var(--color-bg)" : "var(--color-fg-subtle)",
            border: "1px solid var(--color-border)",
          }}
        >
          {t("pages:benchmarks.vsweep_coverage.toggle.values")}
        </button>
        <button
          onClick={() => setMode("boolean")}
          className="text-[12px] font-medium px-2.5 py-1 rounded transition-colors"
          style={{
            backgroundColor: mode === "boolean" ? "var(--color-accent)" : "var(--color-panel)",
            color: mode === "boolean" ? "var(--color-bg)" : "var(--color-fg-subtle)",
            border: "1px solid var(--color-border)",
          }}
        >
          {t("pages:benchmarks.vsweep_coverage.toggle.boolean")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-[10.5px] border-collapse" style={{ borderColor: "var(--color-border)" }}>
          <thead>
            <tr>
              <th
                className="text-left px-2 py-1 border font-mono"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
              >
                {t("pages:benchmarks.vsweep_coverage.table.axisSceneRecipe")}
              </th>
              {data.scenes.map((sc) =>
                data.recipes.map((r) => (
                  <th
                    key={`${sc}-${r}`}
                    className="text-center px-0.5 py-1 border font-mono"
                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
                    title={`${sc} · ${r}`}
                  >
                    <span style={{ color: "var(--color-fg-faint)" }}>{r}</span>
                  </th>
                )),
              )}
              <th
                className="text-right px-2 py-1 border font-mono"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
              >
                %
              </th>
            </tr>
            <tr>
              <th />
              {data.scenes.map((sc) => (
                <th
                  key={`hdr-${sc}`}
                  colSpan={data.recipes.length}
                  className="text-center px-0.5 py-1 border font-mono"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
                >
                  {SCENE_SHORT[sc] ?? sc}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data.axes.map((axis) => (
              <tr key={axis.axis}>
                <td
                  className="px-2 py-0.5 border font-mono whitespace-nowrap"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-fg)" }}
                >
                  {axis.axis}
                </td>
                {data.scenes.flatMap((sc) =>
                  data.recipes.map((r) => {
                    const present = axis.cells?.[sc]?.[r] ?? false;
                    const v = axis.values?.[sc]?.[r];
                    const bg =
                      mode === "values" && v !== undefined
                        ? valueColor(v, axis.value_min, axis.value_max, !!axis.lower_is_better)
                        : present
                          ? "#16a34a"
                          : "transparent";
                    return (
                      <td
                        key={`${axis.axis}-${sc}-${r}`}
                        className="border"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: bg,
                          width: 8,
                          height: 14,
                        }}
                        title={`${axis.axis} · ${sc} · ${r}: ${v !== undefined ? v.toFixed(3) : present ? "✓" : "missing"}`}
                      />
                    );
                  }),
                )}
                <td
                  className="px-2 py-0.5 border text-right font-mono tabular-nums"
                  style={{
                    borderColor: "var(--color-border)",
                    color: axis.pct >= 99 ? "#16a34a" : axis.pct >= 80 ? "var(--color-fg)" : "var(--color-fg-subtle)",
                    fontWeight: axis.pct >= 99 ? 700 : 400,
                  }}
                >
                  {axis.pct.toFixed(0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:benchmarks.vsweep_coverage.footnote", {
          date: new Date(data.generated_at).toISOString().slice(0, 10),
        })}
      </p>
      <RecipeMeansTable axes={data.axes} recipes={data.recipes} />
    </Section>
  );
}

function RecipeMeansTable({ axes, recipes }: { axes: CoverageAxis[]; recipes: string[] }) {
  const { t } = useTranslation(["pages"]);
  const axesWithMeans = axes.filter((a) => a.recipe_means && Object.keys(a.recipe_means).length > 0);
  if (axesWithMeans.length === 0) return null;

  // For each axis, find the winner recipe (best mean)
  const winners = new Map<string, string>();
  for (const a of axesWithMeans) {
    const entries = Object.entries(a.recipe_means ?? {});
    if (entries.length === 0) continue;
    let best = entries[0]!;
    for (const e of entries) {
      const lib = a.lower_is_better === true;
      if (lib ? e[1] < best[1] : e[1] > best[1]) best = e;
    }
    winners.set(a.axis, best[0]);
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <h3 className="text-[12.5px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:benchmarks.vsweep_coverage.recipeMeans.heading")}
      </h3>
      <table className="text-[11.5px] border-collapse w-full" style={{ borderColor: "var(--color-border)" }}>
        <thead>
          <tr>
            <th className="text-left px-2 py-1 border font-mono" style={{ borderColor: "var(--color-border)" }}>
              {t("pages:benchmarks.vsweep_coverage.recipeMeans.axis")}
            </th>
            {recipes.map((r) => (
              <th
                key={`mean-hdr-${r}`}
                className="text-center px-1 py-1 border font-mono"
                style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
              >
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {axesWithMeans.map((axis) => (
            <tr key={`means-${axis.axis}`}>
              <td className="px-2 py-1 border font-mono" style={{ borderColor: "var(--color-border)" }}>
                {axis.axis}
              </td>
              {recipes.map((r) => {
                const v = axis.recipe_means?.[r];
                const winner = winners.get(axis.axis) === r;
                return (
                  <td
                    key={`mean-${axis.axis}-${r}`}
                    className="text-right px-1 py-1 border tabular-nums font-mono"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: winner ? "var(--color-accent)" : "transparent",
                      color: winner ? "var(--color-bg)" : "var(--color-fg)",
                      fontWeight: winner ? 700 : 400,
                    }}
                    title={winner ? `${r} wins ${axis.axis}` : `${axis.axis} · ${r}`}
                  >
                    {v === undefined ? "—" : v < 1 ? v.toFixed(2) : v.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
