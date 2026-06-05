import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import type { EmbeddingPoint3D, RepresentationPayload } from "@/api/client";
import { TabEmpty } from "../components/TabStates";
import { TOPIC_FAMILY_REPS } from "../topicFamilyReps";

const Scatter3D = lazy(() =>
  import("@/components/plots/Scatter3D").then((m) => ({ default: m.Scatter3D })),
);

export function RepresentationFitTab({
  rep,
  apiMethod,
  isLoading,
  error,
  data,
}: {
  rep: string | null;
  apiMethod: string | null;
  isLoading: boolean;
  error: Error | null;
  data: RepresentationPayload | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (!rep) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-fg-subtle)" }}>
          {t("pages:workspace.tabs.RepresentationFitTab.pick_representation")}
        </p>
      </div>
    );
  }
  if (!apiMethod) {
    const isTopic = TOPIC_FAMILY_REPS.has(rep);
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-fg-subtle)" }}>
          {isTopic ? (
            <>
              <strong>{rep}</strong>{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.is_topic_family")}{" "}
              <em>Embed 3D</em>{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.is_topic_family_mid")}{" "}
              <em>Topics</em>.
            </>
          ) : rep === "endmember" ? (
            <>
              <strong>endmember</strong>{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.is_endmember")}
            </>
          ) : (
            <>
              {t("pages:workspace.tabs.RepresentationFitTab.no_endpoint")}{" "}
              <strong>{rep}</strong>.
            </>
          )}
        </p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:workspace.tabs.RepresentationFitTab.loading_named", { name: apiMethod })}
      </p>
    );
  }
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          {t("pages:workspace.tabs.RepresentationFitTab.error")}
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  if (!data) return <TabEmpty />;

  const points: EmbeddingPoint3D[] = (data.scatter_2d_3d_subsample ?? []).map((p) => ({
    doc_id: p.i,
    x: p.x_3d,
    y: p.y_3d,
    z: p.z_3d,
    label_id: p.label_id,
  }));

  const evList = data.scatter_pca_3d_explained_variance ?? [];
  const evTotal = evList.reduce((a, b) => a + b, 0);

  const fitMetaEntries = Object.entries(data.fit_meta || {});

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <div>
            <h4 className="text-base font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
              {rep} · {t("pages:workspace.tabs.RepresentationFitTab.embedding_3d")} ·{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.documents_count", { count: data.n_documents })}
            </h4>
            <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.tabs.RepresentationFitTab.backend_method")}{" "}
              <code>{data.method}</code> ·{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.latent_dim_label", { dim: data.latent_dim })} ·{" "}
              {t("pages:workspace.tabs.RepresentationFitTab.scatter_pca3d")}
              {evList.length ? (
                <>
                  {" "}{t("pages:workspace.tabs.RepresentationFitTab.of_latent_space")} (Σ EV {(evTotal * 100).toFixed(1)}% — {t("pages:workspace.tabs.RepresentationFitTab.components")}{" "}
                  {evList.map((v, i) => (
                    <span key={i} className="font-mono text-[11px]">
                      {i > 0 ? " · " : ""}{(v * 100).toFixed(1)}%
                    </span>
                  ))}
                  )
                </>
              ) : null}
            </p>
          </div>
        </header>
        <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.tabs.RepresentationFitTab.loading_3d")}</p>}>
          <Scatter3D points={points} colorBy="label" selectedTopic={null} />
        </Suspense>
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.RepresentationFitTab.scatter_help")}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.RepresentationFitTab.kmeans_vs_label")}
          </div>
          <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
            {data.downstream_kmeans_vs_label.ari.toFixed(3)}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
            ARI · NMI {data.downstream_kmeans_vs_label.nmi.toFixed(3)}
          </div>
        </div>
        {data.silhouette_label ? (
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
          >
            <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.tabs.RepresentationFitTab.silhouette_supervised")}
            </div>
            <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
              {data.silhouette_label.overall.toFixed(3)}
            </div>
            <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.tabs.RepresentationFitTab.silhouette_overall_help")}
            </div>
          </div>
        ) : null}
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.RepresentationFitTab.latent_dim")}
          </div>
          <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
            {data.latent_dim}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>{t("pages:workspace.tabs.RepresentationFitTab.k_bottleneck")}</div>
        </div>
      </div>

      {fitMetaEntries.length > 0 ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.RepresentationFitTab.fit_metadata")}
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[12.5px]" style={{ color: "var(--color-fg)" }}>
            {fitMetaEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="font-mono text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>{k}</span>
                <span className="font-mono">
                  {typeof v === "number"
                    ? Array.isArray(v)
                      ? "—"
                      : v.toFixed(4)
                    : Array.isArray(v)
                      ? `[${(v as unknown as number[]).slice(0, 4).map((x) => x.toFixed(3)).join(", ")}${(v as unknown as number[]).length > 4 ? "…" : ""}]`
                      : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.silhouette_label?.per_class ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.RepresentationFitTab.silhouette_per_class")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
              <thead>
                <tr style={{ color: "var(--color-fg-faint)" }}>
                  <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.RepresentationFitTab.col_class")}</th>
                  <th className="text-right font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.RepresentationFitTab.col_silhouette")}</th>
                  <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.RepresentationFitTab.col_bar")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.silhouette_label.per_class)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([cls, val]) => {
                    const v = val as number;
                    const norm = Math.max(0, Math.min(1, (v + 1) / 2));
                    return (
                      <tr key={cls} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td className="py-1 pr-3 font-mono">{cls}</td>
                        <td className="py-1 pr-3 text-right font-mono">{v.toFixed(3)}</td>
                        <td className="py-1 w-[180px]">
                          <div className="relative w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                            <div
                              className="absolute top-0 bottom-0 rounded"
                              style={{
                                left: v >= 0 ? "50%" : `${50 + norm * 50 - 50}%`,
                                width: `${Math.abs(v) * 50}%`,
                                backgroundColor: v >= 0 ? "rgba(40,160,80,0.85)" : "rgba(214,39,40,0.85)",
                              }}
                            />
                            <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, backgroundColor: "var(--color-fg-faint)" }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
