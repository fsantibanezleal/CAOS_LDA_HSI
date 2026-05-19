import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TopicToData } from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { TabEmpty } from "../components/TabStates";

const Scatter3D = lazy(() =>
  import("@/components/plots/Scatter3D").then((m) => ({ default: m.Scatter3D })),
);

export function Embed3DTab({
  isLoading,
  error,
  data,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const [colorBy, setColorBy] = useState<"topic" | "label">("topic");
  const [pickedDoc, setPickedDoc] = useState<{
    docId: number;
    index: number;
  } | null>(null);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading embedding…</p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load the 3D embedding.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return <TabEmpty />;

  const points = data.theta_embedding_pca_3d;
  const ev = data.theta_embedding_explained_variance;
  const totalEv = ev.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Embedding 3D · θ-PCA
            </h4>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Cada punto es un documento de la muestra (n={points.length}).
              Coordenadas: PCA(θ) en 3D.{" "}
              {ev.length >= 3 && (
                <>
                  EV<sub>1..3</sub> = {ev[0]!.toFixed(3)} /{" "}
                  {ev[1]!.toFixed(3)} / {ev[2]!.toFixed(3)} (total{" "}
                  {(totalEv * 100).toFixed(1)}%).
                </>
              )}{" "}
              Click un punto para fijar su <code>doc_id</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              colouredr por
            </span>
            <select
              value={colorBy}
              onChange={(e) =>
                setColorBy(e.target.value as "topic" | "label")
              }
              className="rounded-md border px-2 py-1 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg)",
              }}
            >
              <option value="topic">
                {t("pages:workspace.embed3d_color_by_topic")}
              </option>
              <option value="label">
                {t("pages:workspace.embed3d_color_by_label")}
              </option>
            </select>
          </div>
        </header>

        <Suspense
          fallback={
            <p style={{ color: "var(--color-fg-faint)" }}>
              Loading 3D renderer…
            </p>
          }
        >
          <Scatter3D
            points={points}
            colorBy={colorBy}
            selectedTopic={selectedTopic}
            onPick={(info) => setPickedDoc(info)}
          />
        </Suspense>

        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <div>
            <div
              className="text-[11px] uppercase tracking-wider mb-1.5"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t("pages:workspace.embed3d_isolate_topic")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="rounded-md border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor:
                    selectedTopic === null
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                  backgroundColor:
                    selectedTopic === null
                      ? "var(--color-accent-soft)"
                      : "var(--color-panel)",
                  color:
                    selectedTopic === null
                      ? "var(--color-accent)"
                      : "var(--color-fg-subtle)",
                }}
              >
                Todos
              </button>
              {Array.from({ length: data.topic_count }, (_, k) => {
                const isSel = selectedTopic === k;
                const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedTopic(isSel ? null : k)}
                    className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                    style={{
                      borderColor: isSel
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                      backgroundColor: isSel
                        ? "var(--color-accent-soft)"
                        : "var(--color-panel)",
                      color: isSel
                        ? "var(--color-fg)"
                        : "var(--color-fg-subtle)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    topic {k + 1}
                  </button>
                );
              })}
            </div>
          </div>
          {pickedDoc && (
            <div
              className="rounded-md border p-2 text-[12.5px] font-mono"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg-subtle)",
              }}
            >
              doc_id: {pickedDoc.docId} · index: {pickedDoc.index}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
