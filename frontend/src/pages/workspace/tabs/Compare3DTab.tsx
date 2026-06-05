import { Suspense, lazy, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";

const Scatter3D = lazy(() =>
  import("@/components/plots/Scatter3D").then((m) => ({ default: m.Scatter3D })),
);

export const COMPARE_METHODS = [
  "pca_8",
  "nmf_8",
  "dense_ae_8",
  "cae_1d_8",
  "cae_3d_8",
  "beta_vae_8",
] as const;
export type CompareMethod = (typeof COMPARE_METHODS)[number];

export function Compare3DTab({ sceneId }: { sceneId: string }) {
  const { t } = useTranslation(["pages"]);
  const [picks, setPicks] = useState<CompareMethod[]>([
    "pca_8",
    "nmf_8",
    "cae_1d_8",
    "beta_vae_8",
  ]);
  const togglePick = (m: CompareMethod) => {
    setPicks((cur) => {
      if (cur.includes(m)) {
        if (cur.length <= 2) return cur;
        return cur.filter((c) => c !== m);
      }
      if (cur.length >= 4) {
        return [...cur.slice(1), m];
      }
      return [...cur, m];
    });
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.Compare3DTab.title")}
        </h4>
        <p
          className="text-[12px] mb-2"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.Compare3DTab.lead")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {COMPARE_METHODS.map((m) => {
            const active = picks.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => togglePick(m)}
                className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
                style={{
                  borderColor: active
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  color: active
                    ? "var(--color-accent)"
                    : "var(--color-fg-faint)",
                  backgroundColor: active
                    ? "var(--color-accent-soft)"
                    : "transparent",
                }}
              >
                {active ? "✓ " : ""}
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4",
          picks.length <= 2 ? "md:grid-cols-2" : "lg:grid-cols-2",
        )}
      >
        {picks.map((m) => (
          <Compare3DPanel
            key={`${sceneId}-${m}`}
            sceneId={sceneId}
            method={m}
          />
        ))}
      </div>
    </div>
  );
}

function Compare3DPanel({
  sceneId,
  method,
}: {
  sceneId: string;
  method: CompareMethod;
}) {
  const { t } = useTranslation(["pages"]);
  const q = useQuery({
    queryKey: ["rep-fit", sceneId, method],
    queryFn: () => api.representation(method, sceneId),
    staleTime: 5 * 60_000,
  });

  return (
    <div
      className="rounded-lg border p-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span
          className="text-[13px] font-semibold font-mono"
          style={{ color: "var(--color-fg)" }}
        >
          {method}
        </span>
        {q.data ? (
          <span
            className="text-[10.5px] font-mono"
            style={{ color: "var(--color-fg-faint)" }}
          >
            ARI {q.data.downstream_kmeans_vs_label.ari.toFixed(3)} · NMI{" "}
            {q.data.downstream_kmeans_vs_label.nmi.toFixed(3)}
            {q.data.silhouette_label
              ? ` · sil ${q.data.silhouette_label.overall.toFixed(3)}`
              : ""}
          </span>
        ) : null}
      </div>
      {q.isLoading ? (
        <p
          className="py-12 text-center text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.Compare3DTab.loading_method", { method })}
        </p>
      ) : q.error ? (
        <p
          className="py-12 text-center text-[12px]"
          style={{ color: "var(--color-warn)" }}
        >
          {t("pages:workspace.tabs.Compare3DTab.error_method", { method })}
        </p>
      ) : q.data ? (
        <Suspense
          fallback={
            <p
              className="py-12 text-center text-[12px]"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t("pages:workspace.tabs.Compare3DTab.loading_3d")}
            </p>
          }
        >
          <Scatter3D
            points={(q.data.scatter_2d_3d_subsample ?? []).map((p) => ({
              doc_id: p.i,
              x: p.x_3d,
              y: p.y_3d,
              z: p.z_3d,
              label_id: p.label_id,
            }))}
            colorBy="label"
            selectedTopic={null}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
