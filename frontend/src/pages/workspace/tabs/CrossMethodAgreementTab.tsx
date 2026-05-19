/**
 * Cross-method agreement tab (extracted from Workspace.tsx in c287 as
 * part of #441 P1 2.1).
 *
 * Two stacked cards:
 *   1. AgreementMatrixCard — N×N {ARI, NMI, V-measure} heatmap for
 *      every method-vs-method comparison on the same pixels.
 *   2. NarrativesGrid — per-method "what does it capture" card grid.
 *
 * Both helpers are module-local; only this tab consumes them.
 */
import { useState } from "react";
import type {
  CrossMethodAgreement,
  MethodNarratives,
} from "@/api/client";

export function CrossMethodAgreementTab({
  isLoading,
  error,
  agreement,
  narratives,
}: {
  isLoading: boolean;
  error: Error | null;
  agreement: CrossMethodAgreement | null;
  narratives: MethodNarratives | null;
}) {
  const [metric, setMetric] = useState<"ari" | "nmi" | "v_measure">("ari");
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading cross-method agreement…
      </p>
    );
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load cross-method agreement.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {agreement ? (
        <AgreementMatrixCard
          agreement={agreement}
          metric={metric}
          setMetric={setMetric}
        />
      ) : null}
      {narratives ? <NarrativesGrid narratives={narratives} /> : null}
    </div>
  );
}

function AgreementMatrixCard({
  agreement,
  metric,
  setMetric,
}: {
  agreement: CrossMethodAgreement;
  metric: "ari" | "nmi" | "v_measure";
  setMetric: (m: "ari" | "nmi" | "v_measure") => void;
}) {
  const N = agreement.method_names.length;
  const labelW = 110;
  const cell = 60;
  const cellH = 38;
  const W = labelW + N * cell + 8;
  const H = labelW + N * cellH + 8;
  const mat =
    metric === "ari"
      ? agreement.ari_matrix
      : metric === "nmi"
        ? agreement.nmi_matrix
        : agreement.v_measure_matrix;
  const colour = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(180 * t + 60 * (1 - t));
    const b = Math.round(60 * t + 60 * (1 - t));
    return `rgb(${r}, ${g}, ${b})`;
  };
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h4
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          Cross-method agreement · {N}×{N} {metric.toUpperCase()} matrix
        </h4>
        <div className="flex items-baseline gap-1.5">
          {(["ari", "nmi", "v_measure"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className="rounded border px-2 py-0.5 text-[11px] font-mono"
              style={{
                borderColor:
                  metric === m
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                color:
                  metric === m
                    ? "var(--color-accent)"
                    : "var(--color-fg-faint)",
                backgroundColor:
                  metric === m
                    ? "var(--color-accent-soft)"
                    : "transparent",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Compares dominant-cluster assignments across {N} segmentation/topic
        methods on the same {agreement.n_compared_pixels.toLocaleString()}{" "}
        pixels (grid {agreement.spatial_shape[0]}×
        {agreement.spatial_shape[1]}). High off-diagonal ⇒ methods agree on
        partition; low ⇒ they disagree.
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="max-w-full h-auto"
          style={{ maxWidth: 1080 }}
        >
          {agreement.method_names.map((m, j) => (
            <text
              key={`c-${m}`}
              x={labelW + j * cell + cell / 2}
              y={labelW - 4}
              fontSize="10"
              textAnchor="end"
              transform={`rotate(-30 ${labelW + j * cell + cell / 2} ${labelW - 4})`}
              fill="currentColor"
              opacity={0.7}
              fontFamily="ui-monospace, monospace"
            >
              {m}
            </text>
          ))}
          {agreement.method_names.map((m, i) => (
            <text
              key={`r-${m}`}
              x={labelW - 6}
              y={labelW + i * cellH + cellH / 2 + 4}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
              opacity={0.7}
              fontFamily="ui-monospace, monospace"
            >
              {m}
            </text>
          ))}
          {mat.map((row, i) =>
            row.map((v, j) => (
              <g key={`${i}-${j}`}>
                <rect
                  x={labelW + j * cell}
                  y={labelW + i * cellH}
                  width={cell - 1}
                  height={cellH - 1}
                  fill={colour(v)}
                />
                <text
                  x={labelW + j * cell + cell / 2}
                  y={labelW + i * cellH + cellH / 2 + 2}
                  fontSize="10.5"
                  textAnchor="middle"
                  fill={v > 0.5 ? "white" : "var(--color-fg)"}
                  fontFamily="ui-monospace, monospace"
                  fontWeight={i === j ? 600 : 400}
                >
                  {v.toFixed(2)}
                </text>
              </g>
            )),
          )}
        </svg>
      </div>
    </div>
  );
}

function NarrativesGrid({ narratives }: { narratives: MethodNarratives }) {
  const entries = Object.entries(narratives.method_narratives);
  return (
    <div>
      <h4
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        Method narratives · what each method captures
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Per-method summary of what the segmentation/topic method captures:
        spectral silhouette (via label-as-cluster), agreement vs label
        (ARI / NMI / V), spatial Moran&apos;s I and max-IoU against
        topic-dominant. &quot;separates / unites / enables&quot; are reserved
        for narrative text when populated by the builder.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([method, e]) => {
          const caps = e.captures || {};
          const fmt = (v: unknown) =>
            typeof v === "number"
              ? Number.isFinite(v)
                ? v.toFixed(3)
                : "—"
              : v == null
                ? "—"
                : String(v);
          return (
            <div
              key={method}
              className="rounded-lg border p-3"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span
                  className="text-[13px] font-semibold font-mono"
                  style={{ color: "var(--color-fg)" }}
                >
                  {method}
                </span>
                {typeof caps["ari_vs_label"] === "number" ? (
                  <span
                    className="text-[10.5px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: "var(--color-accent-soft)",
                      color: "var(--color-accent)",
                    }}
                  >
                    ARI {fmt(caps["ari_vs_label"])}
                  </span>
                ) : null}
              </div>
              <div
                className="space-y-0.5 text-[11.5px] font-mono"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {Object.entries(caps).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-2"
                  >
                    <span className="truncate" title={k}>
                      {k}
                    </span>
                    <span style={{ color: "var(--color-fg)" }}>{fmt(v)}</span>
                  </div>
                ))}
              </div>
              {e.separates || e.unites || e.enables ? (
                <div
                  className="mt-2 space-y-1 text-[11px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {e.separates ? (
                    <div>
                      <span style={{ color: "var(--color-fg-faint)" }}>
                        separates:{" "}
                      </span>
                      {e.separates}
                    </div>
                  ) : null}
                  {e.unites ? (
                    <div>
                      <span style={{ color: "var(--color-fg-faint)" }}>
                        unites:{" "}
                      </span>
                      {e.unites}
                    </div>
                  ) : null}
                  {e.enables ? (
                    <div>
                      <span style={{ color: "var(--color-fg-faint)" }}>
                        enables:{" "}
                      </span>
                      {e.enables}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
