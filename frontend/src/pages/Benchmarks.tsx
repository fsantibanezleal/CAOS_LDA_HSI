import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  type MethodStatistics,
  type SceneMethodStats,
} from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

const METHOD_LABEL: Record<string, string> = {
  raw_logistic_regression: "raw_logistic",
  pca_logistic_regression: "pca_logistic",
  topic_logistic_regression: "theta_logistic",
};

const METHOD_COLOR: Record<string, string> = {
  raw_logistic_regression: "#0ea5e9",
  pca_logistic_regression: "#f97316",
  topic_logistic_regression: "#22c55e",
};

export default function Benchmarks() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["method-statistics"],
    queryFn: api.methodStatistics,
  });

  return (
    <PageShell
      title={t("pages:benchmarks.title")}
      lead="Comparación cabeza a cabeza entre raw_logistic, pca_logistic y theta_logistic sobre las cuatro escenas labelled del corpus core. K-fold estratificado × multi-seed = 25 evaluaciones por método. Los intervalos son CI95 bootstrap sobre la macro-F1."
    >
      {isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>Cargando estadísticas…</p>
      )}

      {error && (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            No se pudo cargar /api/method-statistics.
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {data && (
        <>
          <ProtocolBox stats={data} />
          <Section
            id="forest"
            title="Forest plot — macro-F1 con CI95 por escena"
            lead="Cada barra es una escena × método; el punto es la media, las whiskers son los percentiles 2.5 y 97.5 del bootstrap sobre las 25 evaluaciones."
          >
            <div className="space-y-8 mt-2">
              {data.labeled_scenes.map((s) => (
                <SceneForest key={s.dataset_id} scene={s} />
              ))}
            </div>
          </Section>

          <Section
            id="paired"
            title="Comparaciones pareadas (Δ macro-F1)"
            lead="Cada par muestra la diferencia entre métodos por evaluación; resumido como mean ± std del Δ. Negativo = el segundo método pierde."
          >
            <div className="space-y-6 mt-2">
              {data.labeled_scenes.map((s) => (
                <PairedTable key={s.dataset_id} scene={s} />
              ))}
            </div>
          </Section>

          <Section id="method-defs" title="Definiciones de los métodos">
            <dl
              className="text-[14px] leading-relaxed space-y-3 mt-2"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {Object.entries(data.method_definitions).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-md border p-3"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-panel)",
                  }}
                >
                  <dt
                    className="font-mono text-[12.5px] mb-1"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {k}
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </>
      )}
    </PageShell>
  );
}

function ProtocolBox({ stats }: { stats: MethodStatistics }) {
  return (
    <div
      className="rounded-lg border p-5 grid sm:grid-cols-3 gap-4 mt-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <Stat label="Escenas evaluadas" value={String(stats.labeled_scenes.length)} />
      <Stat
        label="Evaluaciones por método"
        value={
          stats.labeled_scenes.length > 0
            ? String(
                Object.values(stats.labeled_scenes[0]!.methods)[0]
                  ?.n_evaluations ?? 0,
              )
            : "—"
        }
      />
      <Stat
        label="α significancia"
        value={stats.alpha_significance.toFixed(2)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SceneForest({ scene }: { scene: SceneMethodStats }) {
  const methodNames = Object.keys(scene.methods);
  // global F1 axis: 0..1
  const axisMin = 0;
  const axisMax = 1;
  const w = 720;
  const labelW = 130;
  const plotW = w - labelW - 40;
  const rowH = 30;
  const h = methodNames.length * rowH + 60;

  const xScale = (v: number) =>
    labelW + ((v - axisMin) / (axisMax - axisMin)) * plotW;

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {scene.dataset_name}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          K={scene.scene_summary.topic_count} · D={scene.scene_summary.sampled_documents} · {scene.scene_summary.class_count} clases
        </span>
      </header>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Forest plot for ${scene.dataset_name}`}
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
            strokeWidth="1"
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
                strokeWidth="1"
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
            macro-F1
          </text>
          {/* Per-method rows */}
          {methodNames.map((m, i) => {
            const stats = scene.methods[m]!.macro_f1;
            const yMid = i * rowH + 18;
            const color = METHOD_COLOR[m] ?? "var(--color-accent)";
            return (
              <g key={m}>
                <text
                  x={labelW - 8}
                  y={yMid + 4}
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                  fontSize="11.5"
                >
                  {METHOD_LABEL[m] ?? m}
                </text>
                {/* CI95 bar */}
                <line
                  x1={xScale(stats.ci95_lo)}
                  y1={yMid}
                  x2={xScale(stats.ci95_hi)}
                  y2={yMid}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                <line
                  x1={xScale(stats.ci95_lo)}
                  y1={yMid - 5}
                  x2={xScale(stats.ci95_lo)}
                  y2={yMid + 5}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                <line
                  x1={xScale(stats.ci95_hi)}
                  y1={yMid - 5}
                  x2={xScale(stats.ci95_hi)}
                  y2={yMid + 5}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                {/* point */}
                <circle
                  cx={xScale(stats.mean)}
                  cy={yMid}
                  r="4.5"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
                {/* numeric label */}
                <text
                  x={xScale(stats.ci95_hi) + 6}
                  y={yMid + 4}
                  fontSize="11"
                  opacity="0.85"
                >
                  {stats.mean.toFixed(3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function PairedTable({ scene }: { scene: SceneMethodStats }) {
  // paired_comparisons is list[list[PairedComparison]] — one outer list per
  // metric (accuracy / balanced_accuracy / macro_f1). We surface only the
  // macro_f1 group (index 2). Defensive against schema variations.
  const groups = scene.paired_comparisons;
  const macroGroup = Array.isArray(groups[2])
    ? groups[2]
    : Array.isArray(groups[0])
      ? groups[0]
      : [];

  if (!macroGroup.length) return null;

  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h3
        className="text-base font-semibold mb-3"
        style={{ color: "var(--color-fg)" }}
      >
        {scene.dataset_name}
      </h3>
      <table
        className="w-full text-[14px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-fg)",
            }}
          >
            <th className="text-left py-2 pr-4 font-semibold">A</th>
            <th className="text-left py-2 pr-4 font-semibold">B</th>
            <th className="text-right py-2 pr-4 font-semibold">Δ mean</th>
            <th className="text-right py-2 pr-4 font-semibold">Δ std</th>
            <th className="text-right py-2 font-semibold">[Δ min, Δ max]</th>
          </tr>
        </thead>
        <tbody>
          {macroGroup.map((p, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <td className="py-2 pr-4 font-mono text-[12.5px]">
                {METHOD_LABEL[p.a] ?? p.a}
              </td>
              <td className="py-2 pr-4 font-mono text-[12.5px]">
                {METHOD_LABEL[p.b] ?? p.b}
              </td>
              <td
                className="py-2 pr-4 text-right font-mono"
                style={{
                  color:
                    p.delta_mean >= 0
                      ? "var(--color-success)"
                      : "var(--color-warn)",
                }}
              >
                {p.delta_mean >= 0 ? "+" : ""}
                {p.delta_mean.toFixed(3)}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {p.delta_std.toFixed(3)}
              </td>
              <td
                className="py-2 text-right font-mono text-[12.5px]"
                style={{ color: "var(--color-fg-faint)" }}
              >
                [{p.delta_min.toFixed(3)}, {p.delta_max.toFixed(3)}]
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
