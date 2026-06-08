import { useQuery, useQueries } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type {
  HidsagCrossPreprocessingStability as HidsagCrossPreprocessingStabilityPayload,
  HidsagMethodStatistics,
  HidsagPreprocessingSubset,
} from "@/api/client";
import { Section } from "@/components/Section";
import { HIDSAG_SUBSETS } from "./shared";

export function BenchmarksHidsag() {
  return (
    <div className="space-y-8">
      <HidsagBenchmarks />
      <HidsagPreprocessing />
      <HidsagCrossPreprocessingStability />
    </div>
  );
}

function HidsagCrossPreprocessingStability() {
  const { t } = useTranslation(["pages"]);
  const subsets = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"];
  const queries = useQueries({
    queries: subsets.map((code) => ({
      queryKey: ["hidsag-cross-preprocessing-stability", code],
      queryFn: () => api.hidsagCrossPreprocessingStability(code),
      retry: false,
    })),
  });

  const successes = queries
    .map((q, i) => ({ data: q.data, code: subsets[i]! }))
    .filter((x) => x.data !== undefined);

  return (
    <Section
      id="hidsag-cross-preproc-stability"
      title={t("pages:benchmarks.hidsag.cross_preproc.title")}
      lead={t("pages:benchmarks.hidsag.cross_preproc.lead")}
    >
      <div className="space-y-4 mt-2">
        {successes.map((s) => (
          <div
            key={s.code}
            className="rounded-md border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <header className="flex items-baseline justify-between mb-2 gap-3">
              <h3
                className="text-base font-semibold"
                style={{ color: "var(--color-fg)" }}
              >
                {s.code}
              </h3>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-fg-faint)" }}
              >
                K={s.data!.topic_count} ·{" "}
                {t("pages:benchmarks.hidsag.cross_preproc.policies_count", {
                  count: s.data!.policies.length,
                })}{" "}
                · {t("pages:benchmarks.hidsag.cross_preproc.off_diag_mean")} ={" "}
                <span
                  style={{
                    color:
                      s.data!.off_diagonal_summary.off_diagonal_mean > 0.5
                        ? "var(--color-success)"
                        : s.data!.off_diagonal_summary.off_diagonal_mean > 0.25
                          ? "var(--color-accent)"
                          : "var(--color-warn)",
                    fontWeight: 600,
                  }}
                >
                  {s.data!.off_diagonal_summary.off_diagonal_mean.toFixed(3)}
                </span>
              </span>
            </header>
            <CrossPreprocessingMatrix data={s.data!} />
          </div>
        ))}
      </div>
      <p
        className="mt-3 text-[12px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:benchmarks.hidsag.cross_preproc.metric_note")}
      </p>
    </Section>
  );
}

function CrossPreprocessingMatrix({
  data,
}: {
  data: HidsagCrossPreprocessingStabilityPayload;
}) {
  const { t } = useTranslation(["pages"]);
  const policies = data.policies;
  const matrix = data.pairwise_matched_jaccard_top15_mean_matrix;
  const n = policies.length;
  const cellW = 64;
  const labelW = 200;
  const headerH = 32;
  const w = labelW + cellW * n + 16;
  const h = headerH + cellW * n + 12;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t("pages:benchmarks.hidsag.cross_preproc.matrix_aria", {
        code: data.subset_code,
      })}
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {policies.map((p, j) => (
          <text
            key={`h-${j}`}
            x={labelW + j * cellW + cellW / 2}
            y={headerH - 6}
            textAnchor="end"
            transform={`rotate(-30, ${labelW + j * cellW + cellW / 2}, ${headerH - 6})`}
            fontFamily="ui-monospace, monospace"
            fontSize="10"
            opacity="0.85"
          >
            {p.length > 18 ? `${p.slice(0, 17)}…` : p}
          </text>
        ))}
        {matrix.map((row, i) => (
          <g key={`r-${i}`}>
            <text
              x={labelW - 6}
              y={headerH + i * cellW + cellW / 2 + 3}
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
              fontSize="10.5"
              opacity="0.85"
            >
              {policies[i]!.length > 24 ? `${policies[i]!.slice(0, 23)}…` : policies[i]}
            </text>
            {row.map((v, j) => {
              const x = labelW + j * cellW + 2;
              const y = headerH + i * cellW + 2;
              const cw = cellW - 4;
              const ch = cellW - 4;
              const isDiag = i === j;
              return (
                <g key={`c-${i}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cw}
                    height={ch}
                    fill="var(--color-accent)"
                    opacity={isDiag ? 0.05 : Math.max(0.06, v)}
                  />
                  {!isDiag && (
                    <text
                      x={x + cw / 2}
                      y={y + ch / 2 + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="500"
                      fill={v > 0.5 ? "#fff" : "currentColor"}
                    >
                      {v.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}

function HidsagPreprocessing() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["hidsag-preprocessing-sensitivity"],
    queryFn: api.hidsagPreprocessingSensitivity,
    retry: false,
  });

  return (
    <Section
      id="hidsag-preprocessing"
      title={t("pages:benchmarks.hidsag.preprocessing.title")}
      lead={t("pages:benchmarks.hidsag.preprocessing.lead")}
    >
      {isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:benchmarks.hidsag.preprocessing.loading")}
        </p>
      )}
      {error && (
        <div
          className="rounded-lg border p-6 mt-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            {t("pages:benchmarks.hidsag.preprocessing.load_error", {
              endpoint: "/api/hidsag-preprocessing-sensitivity",
            })}
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
          {data.methods?.policies && data.methods.policies.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2 mb-4">
              {data.methods.policies.map((p: { policy_id: string; policy_name: string; description: string }) => (
                <div
                  key={p.policy_id}
                  className="rounded-md border p-3 text-[12.5px] leading-relaxed"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-panel)",
                    color: "var(--color-fg-subtle)",
                  }}
                >
                  <div
                    className="font-mono mb-1"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {p.policy_id}
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {p.policy_name}
                  </div>
                  <p className="mt-1">{p.description}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-6 mt-2">
            {data.subsets.map((s: HidsagPreprocessingSubset) => (
              <PreprocessingSubsetCard key={s.subset_code} subset={s} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function PreprocessingSubsetCard({
  subset,
}: {
  subset: HidsagPreprocessingSubset;
}) {
  const { t } = useTranslation(["pages"]);
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
          {subset.subset_code}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          n_samples={subset.sample_count} · n_meas={subset.measurement_count_total}
        </span>
      </header>
      <div className="grid sm:grid-cols-2 gap-5">
        <PolicyBars
          title={t("pages:benchmarks.hidsag.preprocessing.classification_title")}
          rows={subset.classification_policy_ranking.map((r) => ({
            policy_id: r.policy_id,
            best_model: r.best_model,
            value: r.best_balanced_accuracy,
          }))}
          good="green"
        />
        {(subset.sample_count ?? 0) >= 50 ? (
          <PolicyBars
            title={t("pages:benchmarks.hidsag.preprocessing.regression_title")}
            rows={subset.regression_policy_ranking.map((r) => ({
              policy_id: r.policy_id,
              best_model: r.best_model,
              value: r.best_r2,
            }))}
            good="amber"
          />
        ) : (
          <div>
            <div
              className="text-[11px] uppercase tracking-widest font-semibold mb-2"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t("pages:benchmarks.hidsag.preprocessing.regression_title")}
            </div>
            <p className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:benchmarks.hidsag.preprocessing.regression_not_shown", {
                n: subset.sample_count,
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PolicyBars({
  title,
  rows,
  good,
}: {
  title: string;
  rows: { policy_id: string; best_model: string; value: number }[];
  good: "green" | "amber";
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-6);
  const headColor =
    good === "green" ? "var(--color-success)" : "var(--color-accent)";
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, idx) => {
          const isWinner = idx === 0;
          const pct = (Math.abs(r.value) / maxAbs) * 100;
          const isPositive = r.value >= 0;
          return (
            <div
              key={r.policy_id}
              className="flex items-center gap-2 text-[12.5px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="shrink-0 w-44 font-mono text-[11px] truncate"
                style={{
                  color: isWinner ? headColor : "var(--color-fg-subtle)",
                  fontWeight: isWinner ? 600 : 400,
                }}
                title={r.policy_id}
              >
                {r.policy_id}
              </span>
              <span
                className="flex-1 h-4 rounded-sm relative overflow-hidden"
                style={{ backgroundColor: "var(--color-bg)" }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isPositive
                      ? isWinner
                        ? headColor
                        : "var(--color-accent)"
                      : "var(--color-warn)",
                    opacity: isWinner ? 0.95 : 0.65,
                  }}
                />
              </span>
              <span
                className="shrink-0 w-14 text-right font-mono text-[11.5px]"
                style={{ color: "var(--color-fg)" }}
              >
                {r.value.toFixed(3)}
              </span>
              <span
                className="shrink-0 w-32 truncate font-mono text-[11px]"
                style={{ color: "var(--color-fg-faint)" }}
                title={r.best_model}
              >
                {r.best_model}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HidsagBenchmarks() {
  const { t } = useTranslation(["pages"]);
  const queries = useQueries({
    queries: HIDSAG_SUBSETS.map((code) => ({
      queryKey: ["hidsag-method", code],
      queryFn: () => api.hidsagMethodStatistics(code),
      retry: false,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const successes = queries
    .map((q, i) => ({ data: q.data, code: HIDSAG_SUBSETS[i]! }))
    .filter((x): x is { data: HidsagMethodStatistics; code: string } =>
      x.data !== undefined,
    );

  // Cross-validated regression R² is only estimable when the sample is large
  // enough; at n≈20–28 the test folds explode (PORPHYRY reaches R²≈-4801) and
  // the metric is noise. Show regression only for n ≥ 50 (#782).
  const MIN_N = 50;
  const validReg = successes.filter((s) => (s.data.sample_count ?? 0) >= MIN_N);
  const excludedReg = successes.filter((s) => (s.data.sample_count ?? 0) < MIN_N);

  return (
    <Section
      id="hidsag"
      title={t("pages:benchmarks.hidsag.regression.title")}
      lead={t("pages:benchmarks.hidsag.regression.lead")}
    >
      {loading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:benchmarks.hidsag.regression.loading")}
        </p>
      )}
      <div className="space-y-6 mt-2">
        {validReg.map((s) => (
          <HidsagSubsetCard key={s.code} stats={s.data} />
        ))}
      </div>
      {excludedReg.length > 0 && (
        <p
          className="mt-4 text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          <Trans
            i18nKey="pages:benchmarks.hidsag.regression.excluded_label"
            values={{ minN: MIN_N }}
            components={{ strong: <strong /> }}
          />{" "}
          {excludedReg
            .map((s) => `${s.code} (n=${s.data.sample_count ?? "?"})`)
            .join(", ")}
          {t("pages:benchmarks.hidsag.regression.excluded_note")}
        </p>
      )}
    </Section>
  );
}

// Readable labels + role for each regression method, so the forest plot
// reads as "what is compared" rather than raw identifiers. The proposed
// method (soft theta-gated ensemble) is highlighted; the naive hard route is
// marked as an ablation. Labels are resolved via i18n at render time
// (label_key → t(...)); the role drives the colour/weight encoding.
const METHOD_INFO: Record<string, { label_key: string; role: "proposed" | "ablation" | "baseline" | "feature" }> = {
  topic_routed_linear_regression: { label_key: "soft_theta_gated", role: "proposed" },
  topic_routed_hard_linear_regression: { label_key: "hard_route", role: "ablation" },
  raw_ridge_regression: { label_key: "raw_ridge", role: "baseline" },
  pls_regression: { label_key: "raw_pls", role: "baseline" },
  region_topic_mixture_linear_regression: { label_key: "theta_region", role: "feature" },
  cube_topic_mixture_linear_regression: { label_key: "theta_cube", role: "feature" },
  topic_mixture_linear_regression: { label_key: "theta_pixel", role: "feature" },
};

function methodInfo(method: string): { label_key: string | null; role: "proposed" | "ablation" | "baseline" | "feature" } {
  return METHOD_INFO[method] ?? { label_key: null, role: "baseline" };
}

function HidsagSubsetCard({ stats }: { stats: HidsagMethodStatistics }) {
  const { t } = useTranslation(["pages"]);
  const block = stats.regression;
  if (!block || !block.method_aggregates) {
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
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          {stats.subset_code}
        </h3>
        <p
          className="text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:benchmarks.hidsag.regression.no_block")}
        </p>
      </div>
    );
  }
  const entries = Object.entries(block.method_aggregates)
    .map(([method, agg]) => {
      const dist = agg.r2_distribution ?? agg.macro_f1_distribution;
      return {
        method,
        n_targets: agg.n_targets,
        mean: dist?.mean ?? null,
        ci95_lo: dist?.ci95_lo ?? null,
        ci95_hi: dist?.ci95_hi ?? null,
      };
    })
    .filter((e): e is typeof e & { mean: number } => e.mean !== null)
    .sort((a, b) => b.mean - a.mean);

  if (entries.length === 0) return null;

  const w = 720;
  const labelW = 220;
  const plotW = w - labelW - 40;
  const rowH = 30;
  const h = entries.length * rowH + 60;
  // R² is unbounded below: a single catastrophic small-sample value (e.g.
  // cube_topic on PORPHYRY n=28 reaches R²≈-4801, CI lower ≈-9458) otherwise
  // auto-scales the whole axis and squashes every readable method into a sliver
  // at x≈1. Clamp the visible domain to a floor and mark off-scale methods with
  // their true value, so the chart stays readable and honest.
  const FLOOR = -3;
  const rawLo = Math.min(...entries.map((e) => e.ci95_lo ?? e.mean), 0);
  const clampedLo = Math.max(rawLo, FLOOR);
  const xLo = clampedLo - 0.05;
  const xHi = Math.max(...entries.map((e) => e.ci95_hi ?? e.mean), 1) + 0.05;
  const clampX = (v: number) => Math.min(Math.max(v, xLo), xHi);
  const xScale = (v: number) =>
    labelW + ((clampX(v) - xLo) / (xHi - xLo)) * plotW;
  const anyOffScale = entries.some((e) => (e.mean ?? 0) < clampedLo);
  const ticks = Array.from({ length: 5 }, (_, i) => xLo + ((xHi - xLo) * i) / 4);

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
          {stats.subset_code}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          n_samples={stats.sample_count} · n_targets={block.n_targets} ·{" "}
          {block.primary_metric}
        </span>
      </header>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={t("pages:benchmarks.hidsag.regression.forest_aria", {
          code: stats.subset_code,
        })}
        style={{ color: "var(--color-fg)" }}
      >
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fill="currentColor"
        >
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
                fontSize="10"
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          {entries.map((e, i) => {
            const yMid = i * rowH + 18;
            const info = methodInfo(e.method);
            const color =
              info.role === "proposed"
                ? "#22c55e"
                : info.role === "ablation"
                  ? "var(--color-warn)"
                  : info.role === "baseline"
                    ? "#0ea5e9"
                    : "var(--color-fg-faint)";
            return (
              <g key={e.method}>
                <text
                  x={labelW - 8}
                  y={yMid + 4}
                  textAnchor="end"
                  fontSize="10.5"
                  fontWeight={info.role === "proposed" ? 700 : 400}
                  fill={info.role === "proposed" ? "#22c55e" : "currentColor"}
                >
                  {info.label_key
                    ? t(`pages:benchmarks.hidsag.regression.method_labels.${info.label_key}`)
                    : e.method}
                </text>
                {e.ci95_lo !== null && e.ci95_hi !== null && (
                  <line
                    x1={xScale(e.ci95_lo)}
                    y1={yMid}
                    x2={xScale(e.ci95_hi)}
                    y2={yMid}
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                )}
                <circle
                  cx={xScale(e.mean)}
                  cy={yMid}
                  r="4"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
                <text
                  x={
                    xScale(e.ci95_hi !== null ? e.ci95_hi : e.mean) + 6
                  }
                  y={yMid + 4}
                  fontSize="10.5"
                  opacity="0.85"
                  fill={e.mean < clampedLo ? "var(--color-warn)" : "currentColor"}
                >
                  {e.mean < clampedLo
                    ? `◀ ${e.mean.toFixed(1)} (off-scale)`
                    : e.mean.toFixed(3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <p
        className="mt-1 text-[11.5px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        <Trans
          i18nKey="pages:benchmarks.hidsag.regression.r2_explainer"
          components={{ em: <em /> }}
        />
        {anyOffScale
          ? ` ${t("pages:benchmarks.hidsag.regression.off_scale_note", {
              floor: FLOOR,
            })}`
          : ""}
      </p>
    </div>
  );
}
