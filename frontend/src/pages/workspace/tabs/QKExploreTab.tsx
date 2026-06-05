/**
 * K-sweep model-selection tab (cycle 107) — Step 8 / Manipulate.
 *
 * Reads /api/lda-sweep/<scene> precomputed sweeps over K ∈ {4,6,8,10,12,16}
 * × 5 seeds and renders three SVG curves (perplexity test mean ± std,
 * topic diversity, matched cosine) plus the per-K detail table. The
 * canonical-K=12 is marked ★; the builder-recommended K (composite
 * score) is marked ●. Live refit is NOT supported (would take minutes
 * of server compute per (Q, K) combo).
 */

import { useTranslation } from "react-i18next";

import { TabError, TabLoading } from "../components/TabStates";

export function QKExploreTab({
  isLoading,
  error,
  sweep,
}: {
  isLoading: boolean;
  error: Error | null;
  sweep: import("@/api/client").LdaSweep | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <TabLoading message={t("pages:workspace.tabs.QKExploreTab.loading")} />
    );
  if (error)
    return (
      <TabError
        message={t("pages:workspace.tabs.QKExploreTab.error")}
        detail={error.message}
      />
    );
  if (!sweep || sweep.grid.length === 0) return null;

  const Ks = sweep.grid.map((g) => g.K);
  const perpMean = sweep.grid.map((g) => g.perplexity_test_mean);
  const perpStd = sweep.grid.map((g) => g.perplexity_test_std);
  const div = sweep.grid.map((g) => g.topic_diversity_mean);
  const cos = sweep.grid.map((g) => g.matched_cosine_mean ?? 0);
  const canonicalK = 12;
  const recommendedK = sweep.recommended_K ?? null;

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.QKExploreTab.title")}
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.QKExploreTab.lead", {
            kGrid: `{${sweep.K_grid.join(", ")}}`,
            wordification: sweep.wordification,
            Q: sweep.quantization_scale,
            nSeeds: sweep.seeds.length,
            trainPct: Math.round(sweep.train_fraction * 100),
            samplesPerClass: sweep.samples_per_class.toLocaleString(),
            canonicalK,
          })}
        </p>
        {recommendedK !== null && (
          <div
            className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 mb-3 text-[12.5px]"
            style={{
              borderColor: "var(--color-accent)",
              backgroundColor: "var(--color-accent-soft)",
              color: "var(--color-accent)",
            }}
          >
            <span className="font-semibold">
              {t("pages:workspace.tabs.QKExploreTab.builder_recommendation")}
            </span>
            <span className="font-mono">K={recommendedK}</span>
            {sweep.recommendation_method && (
              <span
                className="font-mono text-[11px]"
                style={{ color: "var(--color-fg-faint)" }}
                title={t("pages:workspace.tabs.QKExploreTab.composite_score_title")}
              >
                ({sweep.recommendation_method})
              </span>
            )}
            {recommendedK !== canonicalK && (
              <span
                className="text-[11px] italic"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {t("pages:workspace.tabs.QKExploreTab.differs_from_canonical", {
                  canonicalK,
                })}
              </span>
            )}
          </div>
        )}
        {recommendedK !== null && recommendedK !== canonicalK && (
          <p
            className="text-[11.5px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.QKExploreTab.canonical_note", {
              canonicalK,
            })}
          </p>
        )}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SweepCurveCard
            title={t("pages:workspace.tabs.QKExploreTab.curve_perplexity_title")}
            subtitle={t("pages:workspace.tabs.QKExploreTab.curve_perplexity_subtitle")}
            xs={Ks}
            ys={perpMean}
            stds={perpStd}
            highlightX={canonicalK}
          />
          <SweepCurveCard
            title={t("pages:workspace.tabs.QKExploreTab.curve_diversity_title")}
            subtitle={t("pages:workspace.tabs.QKExploreTab.curve_diversity_subtitle")}
            xs={Ks}
            ys={div}
            highlightX={canonicalK}
          />
          <SweepCurveCard
            title={t("pages:workspace.tabs.QKExploreTab.curve_cosine_title")}
            subtitle={t("pages:workspace.tabs.QKExploreTab.curve_cosine_subtitle")}
            xs={Ks}
            ys={cos}
            highlightX={canonicalK}
          />
        </div>
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
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.QKExploreTab.detail_title")}
        </h4>
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">K</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.QKExploreTab.col_perplexity_mean")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.QKExploreTab.col_perplexity_std")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.QKExploreTab.col_topic_diversity")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.QKExploreTab.col_matched_cosine_mean")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1">
                {t("pages:workspace.tabs.QKExploreTab.col_matched_cosine_min")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sweep.grid.map((g) => {
              const isCanon = g.K === canonicalK;
              const isRec = recommendedK !== null && g.K === recommendedK;
              return (
                <tr
                  key={g.K}
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    backgroundColor:
                      isCanon || isRec
                        ? "var(--color-accent-soft)"
                        : "transparent",
                  }}
                >
                  <td className="py-1 pr-3 font-mono">
                    K={g.K}
                    {isCanon ? " ★" : ""}
                    {isRec && !isCanon ? " ●" : ""}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {g.perplexity_test_mean.toFixed(3)}
                  </td>
                  <td
                    className="py-1 pr-3 text-right font-mono"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    ±{g.perplexity_test_std.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {g.topic_diversity_mean.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {g.matched_cosine_mean != null
                      ? g.matched_cosine_mean.toFixed(3)
                      : "—"}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {g.matched_cosine_min != null
                      ? g.matched_cosine_min.toFixed(3)
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p
          className="text-[11.5px] mt-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.QKExploreTab.footer_canonical_legend")}{" "}
          {recommendedK !== null && recommendedK !== canonicalK
            ? t("pages:workspace.tabs.QKExploreTab.footer_recommended_legend") +
              " "
            : ""}
          {t("pages:workspace.tabs.QKExploreTab.footer_q_sensitivity_pre")}{" "}
          <span className="font-mono">robust</span>{" "}
          {t("pages:workspace.tabs.QKExploreTab.footer_q_sensitivity_post")}
        </p>
      </div>
    </div>
  );
}

function SweepCurveCard({
  title,
  subtitle,
  xs,
  ys,
  stds,
  highlightX,
}: {
  title: string;
  subtitle: string;
  xs: number[];
  ys: number[];
  stds?: number[];
  highlightX?: number;
}) {
  const W = 240;
  const H = 130;
  const PAD = 28;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yLo = Math.min(...ys.map((y, i) => y - (stds?.[i] ?? 0)));
  const yHi = Math.max(...ys.map((y, i) => y + (stds?.[i] ?? 0)));
  const pad = (yHi - yLo) * 0.1 || 0.05;
  const yMin = yLo - pad;
  const yMax = yHi + pad;
  const px = (x: number) =>
    PAD + ((x - xMin) / (xMax - xMin)) * (W - 2 * PAD);
  const py = (y: number) =>
    H - PAD - ((y - yMin) / (yMax - yMin)) * (H - 2 * PAD);
  const linePts = xs.map((x, i) => `${px(x).toFixed(1)},${py(ys[i]!).toFixed(1)}`).join(" ");
  const bandPts = stds
    ? xs
        .map(
          (x, i) => `${px(x).toFixed(1)},${py(ys[i]! - stds[i]!).toFixed(1)}`,
        )
        .concat(
          [...xs]
            .reverse()
            .map(
              (x, i) =>
                `${px(x).toFixed(1)},${py(ys[xs.length - 1 - i]! + stds[xs.length - 1 - i]!).toFixed(1)}`,
            ),
        )
        .join(" ")
    : null;
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[12.5px] font-semibold mb-0.5"
        style={{ color: "var(--color-fg)" }}
      >
        {title}
      </div>
      <div
        className="text-[11px] mb-2 leading-snug"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {subtitle}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={title}
        style={{ color: "var(--color-fg)", display: "block" }}
      >
        <line
          x1={PAD}
          y1={H - PAD}
          x2={W - PAD}
          y2={H - PAD}
          stroke="var(--color-border)"
        />
        <line
          x1={PAD}
          y1={PAD}
          x2={PAD}
          y2={H - PAD}
          stroke="var(--color-border)"
        />
        {bandPts && (
          <polygon
            points={bandPts}
            fill="var(--color-accent)"
            opacity="0.18"
          />
        )}
        <polyline
          points={linePts}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.5"
        />
        {xs.map((x, i) => (
          <circle
            key={i}
            cx={px(x)}
            cy={py(ys[i]!)}
            r={x === highlightX ? 4 : 2.5}
            fill="var(--color-accent)"
            stroke={
              x === highlightX ? "var(--color-fg)" : "var(--color-accent)"
            }
            strokeWidth={x === highlightX ? 1.5 : 0}
          />
        ))}
        {xs.map((x, i) => (
          <text
            key={`xl-${i}`}
            x={px(x)}
            y={H - PAD + 12}
            textAnchor="middle"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
            fill="var(--color-fg-faint)"
          >
            {x}
          </text>
        ))}
        <text
          x={PAD - 4}
          y={py(yMax)}
          textAnchor="end"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
          fill="var(--color-fg-faint)"
        >
          {yMax.toFixed(2)}
        </text>
        <text
          x={PAD - 4}
          y={py(yMin)}
          textAnchor="end"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
          fill="var(--color-fg-faint)"
        >
          {yMin.toFixed(2)}
        </text>
        <text
          x={W / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize="10"
          fill="var(--color-fg-faint)"
        >
          K
        </text>
      </svg>
    </div>
  );
}
