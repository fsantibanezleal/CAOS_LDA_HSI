import type { TopicRoutedClassifier } from "@/api/client";
import { TabEmpty } from "../components/TabStates";

const ROUTED_LABEL: Record<string, string> = {
  raw_logistic: "raw_logistic",
  theta_logistic: "theta_logistic",
  pca_12_logistic: "pca_K_logistic",
  pca_K_logistic: "pca_K_logistic",
  topic_routed_soft: "topic_routed_soft",
  topic_routed_hard: "topic_routed_hard",
};

const ROUTED_DESC: Record<string, string> = {
  raw_logistic: "Logistic regression over the raw spectrum (B bands).",
  theta_logistic: "Logistic regression over theta (K dimensions — control).",
  pca_12_logistic: "Logistic regression over PCA-K (K-dim control).",
  pca_K_logistic: "Logistic regression over PCA-K (K-dim control).",
  topic_routed_soft:
    "Per-topic specialist over the raw spectrum, mixed by theta (mixture).",
  topic_routed_hard:
    "Per-topic specialist over the raw spectrum, hard assignment to the dominant topic.",
};

const ROUTED_COLOR: Record<string, string> = {
  raw_logistic: "#0ea5e9",
  theta_logistic: "#94a3b8",
  pca_12_logistic: "#f97316",
  pca_K_logistic: "#f97316",
  topic_routed_soft: "#22c55e",
  topic_routed_hard: "#a855f7",
};

export function RoutedTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicRoutedClassifier | null;
}) {
  if (isLoading)
    return <p style={{ color: "var(--color-fg-faint)" }}>Loading ranking…</p>;
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
          Could not load topic_routed_classifier.
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

  const ranking = data.ranking_by_macro_f1_mean;
  // global x-axis range: pad around min/max CI95
  const allCi: number[] = [];
  for (const r of ranking) {
    allCi.push(r.macro_f1_ci95[0], r.macro_f1_ci95[1]);
  }
  const xMin = Math.max(0, Math.min(...allCi) - 0.05);
  const xMax = Math.min(1, Math.max(...allCi) + 0.05);
  const w = 720;
  const labelW = 170;
  const plotW = w - labelW - 40;
  const rowH = 38;
  const h = ranking.length * rowH + 60;
  const xScale = (v: number) =>
    labelW + ((v - xMin) / (xMax - xMin)) * plotW;
  const ticks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

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
        <header className="mb-4">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Ranking macro-F1 (5-fold StratifiedKFold) — this scene
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            K={data.K} topics · {data.n_classes} clases ·{" "}
            {data.n_documents.toLocaleString()} documents. Five methods
            compared; routed_soft is the one the methodology supports
            (especialista por topic sobre el espectro crudo, mezclado por
            theta).
          </p>
        </header>
        <svg
          width="100%"
          viewBox={`0 0 ${w} ${h}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Routed classifier ranking forest"
          style={{ color: "var(--color-fg)" }}
        >
          <g
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="12"
            fill="currentColor"
          >
            {/* Axis */}
            <line
              x1={labelW}
              y1={h - 30}
              x2={labelW + plotW}
              y2={h - 30}
              stroke="currentColor"
              opacity="0.4"
            />
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={xScale(t)}
                  y1={h - 33}
                  x2={xScale(t)}
                  y2={h - 27}
                  stroke="currentColor"
                  opacity="0.4"
                />
                <text
                  x={xScale(t)}
                  y={h - 12}
                  textAnchor="middle"
                  opacity="0.65"
                  fontSize="10.5"
                >
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            <text
              x={labelW + plotW / 2}
              y={h - 1}
              textAnchor="middle"
              opacity="0.55"
              fontSize="10"
            >
              macro-F1 (mean ± CI95)
            </text>
            {/* Rows */}
            {ranking.map((r, i) => {
              const yMid = i * rowH + 20;
              const color = ROUTED_COLOR[r.method] ?? "var(--color-accent)";
              const lbl = ROUTED_LABEL[r.method] ?? r.method;
              const lo = r.macro_f1_ci95[0];
              const hi = r.macro_f1_ci95[1];
              return (
                <g key={r.method}>
                  <text
                    x={labelW - 8}
                    y={yMid + 4}
                    textAnchor="end"
                    fontFamily="ui-monospace, monospace"
                    fontSize="11.5"
                  >
                    {lbl}
                  </text>
                  <line
                    x1={xScale(lo)}
                    y1={yMid}
                    x2={xScale(hi)}
                    y2={yMid}
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                  <line
                    x1={xScale(lo)}
                    y1={yMid - 5}
                    x2={xScale(lo)}
                    y2={yMid + 5}
                    stroke={color}
                    strokeWidth="2"
                  />
                  <line
                    x1={xScale(hi)}
                    y1={yMid - 5}
                    x2={xScale(hi)}
                    y2={yMid + 5}
                    stroke={color}
                    strokeWidth="2"
                  />
                  <circle
                    cx={xScale(r.macro_f1_mean)}
                    cy={yMid}
                    r="4.5"
                    fill={color}
                    stroke="var(--color-bg)"
                    strokeWidth="1"
                  />
                  <text
                    x={xScale(hi) + 6}
                    y={yMid + 4}
                    fontSize="11"
                    opacity="0.85"
                  >
                    {r.macro_f1_mean.toFixed(3)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-3"
          style={{ color: "var(--color-fg)" }}
        >
          Method definitions
        </h4>
        <dl className="space-y-2 text-[13px]">
          {ranking.map((r) => (
            <div
              key={r.method}
              className="flex gap-3 items-start"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0 mt-1"
                style={{ backgroundColor: ROUTED_COLOR[r.method] ?? "#0ea5e9" }}
                aria-hidden
              />
              <div className="flex-1">
                <dt
                  className="font-mono text-[12.5px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {ROUTED_LABEL[r.method] ?? r.method}
                </dt>
                <dd
                  className="text-[13px]"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  {ROUTED_DESC[r.method] ?? "—"}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
