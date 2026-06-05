import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";

import { UnmixingStat } from "../components/StatCard";

/**
 * Recipes tab (cycle 102) — Step 4 corpus exploration.
 *
 * Three axis pickers (recipe, scheme ∈ {U, Q, L}, Q ∈ {8,16,32}) with an
 * availability chip per combo. On selection, queries
 * /api/wordifications/<scene>/<recipe>/<scheme>/<q> and renders D, B,
 * V_full, V_actual, corpus entropy, doc-length distribution, and the
 * top-10 tokens with p_global.
 *
 * Recipe list: this corpus-inspection view covers the recipes that ship full
 * vocab-statistics artefacts (V1-V12). The complete V1-V20 representation
 * sweep, the F-axis evidence, and the optimal recipes (V8, V20) live in
 * Recipe Lab and the Methods deep-dives — see the banner below.
 */

const RECIPE_IDS_CORPUS = ["V1","V2","V3","V4","V5","V6","V7","V8","V9","V10","V11","V12"];
const SCHEMES = ["uniform", "quantile", "lloyd_max"] as const;
const Q_VALUES = [8, 16, 32] as const;

export function RecipesTab({
  sceneId,
  isLoading,
  error,
  index,
}: {
  sceneId: string;
  isLoading: boolean;
  error: Error | null;
  index: import("@/api/client").WordificationsIndex | null;
}) {
  const { t } = useTranslation(["pages"]);
  const [recipe, setRecipe] = useState<string>("V1");
  const [scheme, setScheme] = useState<typeof SCHEMES[number]>("uniform");
  const [q, setQ] = useState<typeof Q_VALUES[number]>(8);

  const detail = useQuery({
    queryKey: ["wordification", sceneId, recipe, scheme, q],
    queryFn: () => api.wordification(sceneId, recipe, scheme, q),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <p style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.tabs.RecipesTab.loading")}</p>;
  if (error) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p style={{ color: "var(--color-warn)" }}>{t("pages:workspace.tabs.RecipesTab.error")}</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }

  // Build availability matrix from index
  const available = new Set<string>();
  if (index) {
    const prefix = `${sceneId}_`;
    for (const item of index.items) {
      if (item.id.startsWith(prefix)) available.add(item.id.slice(prefix.length));
    }
  }

  const sceneAvailable = available.size;

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(40,160,80,1) 0%, rgba(56,189,248,1) 100%)" }}
        />
        <h3 className="text-lg font-semibold tracking-tight mt-1 mb-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:workspace.tabs.RecipesTab.title")}
        </h3>
        <p className="text-[12.5px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.RecipesTab.lead_pre", { scene: sceneId })}{" "}
          <strong>{sceneAvailable}</strong>{" "}
          {t("pages:workspace.tabs.RecipesTab.lead_post")}
        </p>
        <p className="text-[12px] mb-3 rounded border px-3 py-2" style={{ color: "var(--color-fg-subtle)", borderColor: "var(--color-border)", backgroundColor: "var(--color-accent-soft)" }}>
          {t("pages:workspace.tabs.RecipesTab.banner")}
        </p>

        <div className="space-y-2">
          <RecipeAxisPicker label={t("pages:workspace.tabs.RecipesTab.picker_recipe")} options={RECIPE_IDS_CORPUS} value={recipe} onChange={(v) => setRecipe(v)} />
          <RecipeAxisPicker label={t("pages:workspace.tabs.RecipesTab.picker_scheme")} options={SCHEMES as unknown as string[]} value={scheme} onChange={(v) => setScheme(v as typeof SCHEMES[number])} />
          <RecipeAxisPicker label="Q" options={Q_VALUES.map(String)} value={String(q)} onChange={(v) => setQ(parseInt(v, 10) as typeof Q_VALUES[number])} />
        </div>

        <div className="mt-3 text-[11.5px] font-mono" style={{ color: available.has(`${recipe}_${scheme}_Q${q}`) ? "rgba(40,160,80,1)" : "var(--color-warn)" }}>
          {available.has(`${recipe}_${scheme}_Q${q}`) ? t("pages:workspace.tabs.RecipesTab.combo_available") : t("pages:workspace.tabs.RecipesTab.combo_unavailable")}
        </div>
      </div>

      {detail.isLoading ? (
        <p style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.tabs.RecipesTab.loading_combo", { recipe, scheme, q })}</p>
      ) : detail.error ? (
        <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
          <p style={{ color: "var(--color-warn)" }}>{t("pages:workspace.tabs.RecipesTab.combo_error")}</p>
          <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{(detail.error as Error).message}</p>
        </div>
      ) : detail.data ? (
        <RecipeDetailCard payload={detail.data} />
      ) : null}
    </div>
  );
}

function RecipeAxisPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-[10.5px] uppercase tracking-widest font-semibold w-12" style={{ color: "var(--color-fg-faint)" }}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const isActive = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
              style={{
                borderColor: isActive ? "var(--color-accent)" : "var(--color-border)",
                color: isActive ? "var(--color-accent)" : "var(--color-fg-subtle)",
                backgroundColor: isActive ? "var(--color-accent-soft)" : "transparent",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RecipeDetailCard({ payload }: { payload: import("@/api/client").WordificationPayload }) {
  const { t } = useTranslation(["pages"]);
  const dl = payload.doc_length_distribution;
  const top = payload.top_tokens_by_count ?? [];
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        {payload.recipe} · {payload.scheme} · Q={payload.Q}
      </h4>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3 mb-4">
        <UnmixingStat label={t("pages:workspace.tabs.RecipesTab.stat_docs")} value={payload.D.toLocaleString()} />
        <UnmixingStat label={t("pages:workspace.tabs.RecipesTab.stat_bands")} value={String(payload.B)} />
        <UnmixingStat label={t("pages:workspace.tabs.RecipesTab.stat_vocab")} value={`${payload.V_full} / ${payload.V_actual}`} />
        <UnmixingStat label={t("pages:workspace.tabs.RecipesTab.stat_entropy")} value={payload.corpus_marginal_entropy_bits != null ? t("pages:workspace.tabs.RecipesTab.entropy_bits", { value: payload.corpus_marginal_entropy_bits.toFixed(3) }) : "—"} />
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <h5 className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.RecipesTab.doc_length_dist")}
          </h5>
          <div className="space-y-1 text-[12.5px] font-mono" style={{ color: "var(--color-fg)" }}>
            <div>{t("pages:workspace.tabs.RecipesTab.dl_minmax")}: {dl.min} / {dl.max}</div>
            <div>p25 / p50 / p75: {dl.p25.toFixed(0)} / {dl.p50.toFixed(0)} / {dl.p75.toFixed(0)}</div>
            <div>{t("pages:workspace.tabs.RecipesTab.dl_mean_std")}: {dl.mean.toFixed(2)} ± {dl.std.toFixed(2)}</div>
            <div style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.tabs.RecipesTab.dl_zero_rate")}: {((payload.zero_token_doc_rate ?? 0) * 100).toFixed(2)}%</div>
          </div>
        </div>
        {top.length > 0 ? (
          <div>
            <h5 className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.tabs.RecipesTab.top_tokens")}
            </h5>
            <table className="w-full text-[12px]" style={{ color: "var(--color-fg)" }}>
              <thead>
                <tr style={{ color: "var(--color-fg-faint)" }}>
                  <th className="text-left font-mono text-[10.5px] pb-1 pr-3">{t("pages:workspace.tabs.RecipesTab.col_token")}</th>
                  <th className="text-right font-mono text-[10.5px] pb-1 pr-3">{t("pages:workspace.tabs.RecipesTab.col_count")}</th>
                  <th className="text-right font-mono text-[10.5px] pb-1">p_global</th>
                </tr>
              </thead>
              <tbody>
                {top.slice(0, 10).map((t) => (
                  <tr key={t.token} style={{ borderTop: "1px solid var(--color-border)" }}>
                    <td className="py-1 pr-3 font-mono">{t.token}</td>
                    <td className="py-1 pr-3 text-right font-mono">{t.count.toLocaleString()}</td>
                    <td className="py-1 text-right font-mono text-[11px]" style={{ color: "var(--color-fg-faint)" }}>{(t.p_global * 100).toFixed(3)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
