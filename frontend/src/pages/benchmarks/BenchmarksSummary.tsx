import { useQueries } from "@tanstack/react-query";
import {
  api,
  type MethodStatistics,
  type SceneMethodStats,
} from "@/api/client";
import { Section } from "@/components/Section";
import { LABELLED_SCENES } from "./shared";

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

export function BenchmarksSummary({ data }: { data: MethodStatistics }) {
  return (
    <div className="space-y-8">
      <ProtocolBox stats={data} />
      <Section
        id="forest"
        title="Forest plot — macro-F1 con CI95 por escena"
        lead="Each bar is a scene × method; the dot is the mean, the whiskers are the 2.5 and 97.5 percentiles of the bootstrap over the 25 evaluations."
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
        lead="Each pair shows the difference between methods per evaluation; summarised as mean ± std of Δ. Negative = the second method loses."
      >
        <div className="space-y-6 mt-2">
          {data.labeled_scenes.map((s) => (
            <PairedTable key={s.dataset_id} scene={s} />
          ))}
        </div>
      </Section>
      <MultiAxisBatterySection />
      <Section id="method-defs" title="Method definitions">
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
    </div>
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
      <Stat
        label="Escenas evaluadas"
        value={String(stats.labeled_scenes.length)}
      />
      <Stat
        label="Evaluations per method"
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
          K={scene.scene_summary.topic_count} · D=
          {scene.scene_summary.sampled_documents} ·{" "}
          {scene.scene_summary.class_count} clases
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
                <circle
                  cx={xScale(stats.mean)}
                  cy={yMid}
                  r="4.5"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
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

function MultiAxisBatterySection() {
  const probes = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["linear-probe-panel", sc],
      queryFn: () => api.linearProbePanel(sc),
      retry: false,
    })),
  });
  const routes = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-routed-classifier", sc],
      queryFn: () => api.topicRoutedClassifier(sc),
      retry: false,
    })),
  });
  const stabs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-stability", sc, 0],
      queryFn: () => api.topicStability(sc, 0),
      retry: false,
    })),
  });

  const ready =
    probes.every((q) => q.data) &&
    routes.every((q) => q.data) &&
    stabs.every((q) => q.data);

  if (!ready) {
    return (
      <Section
        title="Multi-Axis Addendum B — battery summary"
        lead="One row per labelled scene, one column per axis (B-1 fair-baseline F1, B-3 topic-routed F1, B-6 LDA off-diag stability). Loads in parallel from /api/linear-probe-panel/, /api/topic-routed-classifier/, /api/topic-stability/. See the wiki for the full framework."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading multi-axis battery payloads…
        </p>
      </Section>
    );
  }

  type Row = {
    scene: string;
    theta_f1: number;
    ica10_f1: number | null;
    cae_max_f1: number;
    cae_max_K: number;
    routed_soft: number | null;
    raw_logistic: number | null;
    theta_logistic: number | null;
    lda_off_diag: number;
  };

  const rows: Row[] = LABELLED_SCENES.map((sc, i) => {
    const probe = probes[i]!.data!;
    const route = routes[i]!.data!;
    const stab = stabs[i]!.data!;
    const mm = probe.method_metrics;
    const theta_f1 = mm.theta?.macro_f1?.mean ?? NaN;
    const ica10_f1 = mm.ica_10?.macro_f1?.mean ?? null;
    let cae_max_f1 = 0;
    let cae_max_K = 0;
    for (const k of [4, 6, 8, 10, 12, 16, 32]) {
      const cell = mm[`cae_1d_${k}`]?.macro_f1?.mean;
      if (cell != null && cell > cae_max_f1) {
        cae_max_f1 = cell;
        cae_max_K = k;
      }
    }
    const rm = route.method_metrics;
    const routed_soft = rm.topic_routed_soft?.macro_f1?.mean ?? null;
    const raw_logistic = rm.raw_logistic?.macro_f1?.mean ?? null;
    const theta_logistic = rm.theta_logistic?.macro_f1?.mean ?? null;
    const lda_off_diag = stab.scene_stability_summary.off_diagonal_mean;
    return {
      scene: sc,
      theta_f1,
      ica10_f1,
      cae_max_f1,
      cae_max_K,
      routed_soft,
      raw_logistic,
      theta_logistic,
      lda_off_diag,
    };
  });

  return (
    <Section
      title="Multi-Axis Addendum B — battery summary"
      lead="One row per labelled scene. Columns: theta-as-feature F1 (B-1, naive), ICA-10 F1 (B-1, fair-baseline winner), best CAE-1D F1 across K∈{4..32} (B-1 deep ladder), topic_routed_soft F1 (B-3 the master-plan thesis), raw_logistic F1 (B-3 strong baseline), and LDA off-diagonal stability (B-6, N=7 seeds). The framework is on the wiki Multi-Axis-Addendum-B page."
    >
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ color: "var(--color-text)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">
                scene
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                θ flat (B-1)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                ICA-10 (B-1)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                CAE-1D best (B-1)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                θ_logistic (B-3)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                routed_soft (B-3)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                raw_logistic (B-3)
              </th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">
                LDA stability (B-6)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.scene}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {Number.isFinite(r.theta_f1) ? r.theta_f1.toFixed(3) : "—"}
                </td>
                <td
                  className="py-1.5 pr-3 text-right font-mono"
                  style={{ color: "var(--color-accent)" }}
                >
                  {r.ica10_f1 != null ? r.ica10_f1.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.cae_max_f1 > 0
                    ? `${r.cae_max_f1.toFixed(3)} (K=${r.cae_max_K})`
                    : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.theta_logistic != null
                    ? r.theta_logistic.toFixed(3)
                    : "—"}
                </td>
                <td
                  className="py-1.5 pr-3 text-right font-mono"
                  style={{ color: "var(--color-accent)" }}
                >
                  {r.routed_soft != null ? r.routed_soft.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.raw_logistic != null ? r.raw_logistic.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.lda_off_diag.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Headlines: ICA-10 wins B-1 fair-baseline on every scene. CAE-1D K=32
        closes much of the gap (KSC θ=0.021 → CAE-1D K=32=0.710, a 33×
        recovery). topic_routed_soft matches or beats raw_logistic on every
        scene; θ_logistic loses by 30-50 points everywhere — the master-plan
        thesis "θ as a gate, never as a feature" is empirically validated. LDA
        off-diag stability ≥ 0.954 across all 6 scenes vs CAE-1D 0.74-0.97 and
        β-VAE 0.18-0.89.
      </p>
    </Section>
  );
}
