import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { request } from "@/api/_http";
import { Section } from "@/components/Section";

type BackboneSummary = {
  backbone: string;
  cells: Record<string, Record<string, number>>;
  recipe_means: Record<string, number>;
  n_cells: number;
};

type BackbonesF7Payload = {
  backbones: BackboneSummary[];
};

const RECIPES = [
  "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10",
  "V11", "V12", "V13", "V14", "V15", "V17", "V18", "V19", "V20",
];

function cellColour(v: number): string {
  // 0..1 → cyan to red gradient
  const norm = Math.max(0, Math.min(1, v));
  const r = Math.round(20 + norm * 200);
  const g = Math.round(180 - norm * 100);
  const b = Math.round(220 - norm * 200);
  return `rgb(${r}, ${g}, ${b})`;
}

export function BackboneF7Panel() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, isError } = useQuery<BackbonesF7Payload>({
    queryKey: ["backbones-f7"],
    queryFn: () => request<BackbonesF7Payload>("/api/v-sweep/backbones-f7"),
    retry: false,
  });

  if (isLoading || isError || !data) return null;
  const backbones = data.backbones;
  if (backbones.length === 0) return null;

  // Find winner per backbone for highlighting
  const winners = new Map<string, string>();
  for (const b of backbones) {
    const entries = Object.entries(b.recipe_means);
    if (entries.length === 0) continue;
    const top = entries.reduce((a, e) => (e[1] > a[1] ? e : a));
    winners.set(b.backbone, top[0]);
  }

  // Compute mean across backbones per recipe
  const meanAcrossBackbones: Record<string, number> = {};
  for (const r of RECIPES) {
    const vals: number[] = [];
    for (const b of backbones) {
      const m = b.recipe_means[r];
      if (m !== undefined) vals.push(m);
    }
    if (vals.length === 4) {
      meanAcrossBackbones[r] = vals.reduce((a, b) => a + b) / vals.length;
    }
  }
  const sortedRecipes = RECIPES.slice().sort((a, b) => {
    const av = meanAcrossBackbones[a] ?? -1;
    const bv = meanAcrossBackbones[b] ?? -1;
    return bv - av;
  });

  return (
    <Section
      id="backbone-f7"
      title={t("pages:benchmarks.backbone_f7.title")}
      lead={t("pages:benchmarks.backbone_f7.lead")}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-[12px] border-collapse" style={{ borderColor: "var(--color-border)" }}>
          <thead>
            <tr>
              <th className="text-left px-2 py-1 border font-mono" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
                {t("pages:benchmarks.backbone_f7.table.backboneRecipe")}
              </th>
              {sortedRecipes.map((r) => (
                <th
                  key={r}
                  className="text-center px-1 py-1 border font-mono"
                  style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
                >
                  {r}
                </th>
              ))}
              <th className="text-right px-2 py-1 border font-mono" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
                {t("pages:benchmarks.backbone_f7.table.mean")}
              </th>
            </tr>
          </thead>
          <tbody>
            {backbones.map((b) => {
              const allMeans = Object.values(b.recipe_means);
              const overall = allMeans.length > 0 ? allMeans.reduce((a, b) => a + b) / allMeans.length : 0;
              return (
                <tr key={b.backbone}>
                  <td className="px-2 py-1 border font-mono whitespace-nowrap" style={{ borderColor: "var(--color-border)", color: "var(--color-fg)" }}>
                    {b.backbone}
                  </td>
                  {sortedRecipes.map((r) => {
                    const v = b.recipe_means[r];
                    const winner = winners.get(b.backbone) === r;
                    return (
                      <td
                        key={`${b.backbone}-${r}`}
                        className="text-center px-1 py-1 border tabular-nums"
                        style={{
                          borderColor: "var(--color-border)",
                          backgroundColor: v !== undefined ? cellColour(v) : "transparent",
                          color: v !== undefined && v > 0.4 ? "white" : "var(--color-fg)",
                          fontWeight: winner ? 800 : 400,
                          outline: winner ? "2px solid var(--color-accent)" : undefined,
                          outlineOffset: winner ? -2 : undefined,
                        }}
                        title={`${b.backbone} · ${r}: ${v !== undefined ? v.toFixed(3) : "n/a"}`}
                      >
                        {v !== undefined ? v.toFixed(2) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 border text-right font-mono tabular-nums" style={{ borderColor: "var(--color-border)" }}>
                    {overall.toFixed(3)}
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td className="px-2 py-1 border font-mono" style={{ borderColor: "var(--color-border)", fontWeight: 700 }}>
                {t("pages:benchmarks.backbone_f7.table.meanFourBackbones")}
              </td>
              {sortedRecipes.map((r) => {
                const v = meanAcrossBackbones[r];
                const isFirst = v !== undefined && Math.max(...Object.values(meanAcrossBackbones)) === v;
                return (
                  <td
                    key={`mean-${r}`}
                    className="text-center px-1 py-1 border tabular-nums font-mono"
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor: isFirst ? "var(--color-accent)" : "transparent",
                      color: isFirst ? "var(--color-bg)" : "var(--color-fg)",
                      fontWeight: isFirst ? 800 : 600,
                    }}
                  >
                    {v !== undefined ? v.toFixed(3) : "—"}
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:benchmarks.backbone_f7.footnote")}
      </p>
    </Section>
  );
}
