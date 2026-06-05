import { useQueries, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { TopicStability } from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { StabilityHeatmap } from "@/components/plots/StabilityHeatmap";
import { TabEmpty, TabError, TabLoading } from "../components/TabStates";

function KSensitivityPanel({ sceneId }: { sceneId: string }) {
  const { t } = useTranslation(["pages"]);
  const offsets = [-2, -1, 0, 1, 2];
  const queries = useQueries({
    queries: offsets.map((o) => ({
      queryKey: ["topic-stability", sceneId, o],
      queryFn: () => api.topicStability(sceneId, o),
      retry: false,
    })),
  });
  const ready = queries.every((q) => q.data || q.error);
  if (!ready) {
    return (
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          {t("pages:workspace.tabs.StabilityTab.ksens_loading")}
        </p>
      </div>
    );
  }
  const values = offsets.map((o, i) => ({
    offset: o,
    K: queries[i]?.data?.K ?? null,
    mean: queries[i]?.data?.scene_stability_summary?.off_diagonal_mean ?? NaN,
    min: queries[i]?.data?.scene_stability_summary?.off_diagonal_min ?? NaN,
    std: queries[i]?.data?.scene_stability_summary?.off_diagonal_std ?? NaN,
  }));

  // Build a small bar chart with K-2..K+2 on x and stability mean on y
  const W = 480;
  const H = 180;
  const padding = 36;
  const bw = (W - 2 * padding) / values.length - 8;
  const allMeans = values.map((v) => v.mean).filter(Number.isFinite);
  const yMin = Math.min(...allMeans, 0.94) - 0.005;
  const yMax = 1.0;

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {t("pages:workspace.tabs.StabilityTab.ksens_title")}
        </h4>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.StabilityTab.ksens_help", {
            seeds: queries[0]?.data?.seeds?.length ?? "N",
          })}
        </p>
      </header>
      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label={t("pages:workspace.tabs.StabilityTab.aria_ksens_bars")}>
        <line x1={padding} y1={H - padding} x2={W - padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        <line x1={padding} y1={padding * 0.5} x2={padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        {[yMin, (yMin + yMax) / 2, yMax].map((y, i) => (
          <g key={i}>
            <line
              x1={padding}
              y1={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5)}
              x2={W - padding}
              y2={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5)}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
            <text
              x={padding - 6}
              y={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5) + 3}
              fontSize="9"
              textAnchor="end"
              fill="currentColor"
              opacity="0.7"
              fontFamily="ui-monospace, monospace"
            >
              {y.toFixed(3)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = padding + 4 + i * ((W - 2 * padding) / values.length);
          const yTop = padding * 0.5 + ((yMax - v.mean) / (yMax - yMin)) * (H - padding * 1.5);
          const yBot = H - padding;
          return (
            <g key={v.offset}>
              <title>{`K=${v.K} (offset ${v.offset >= 0 ? "+" : ""}${v.offset}) · mean=${v.mean.toFixed(4)} std=${v.std.toFixed(4)}`}</title>
              <rect
                x={x}
                y={yTop}
                width={bw}
                height={yBot - yTop}
                fill={v.offset === 0 ? "rgba(31,119,180,0.85)" : "rgba(31,119,180,0.45)"}
              />
              <text
                x={x + bw / 2}
                y={H - padding + 14}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.7"
              >
                K{v.offset >= 0 ? "+" : ""}{v.offset}
              </text>
              <text
                x={x + bw / 2}
                y={yTop - 4}
                fontSize="9"
                textAnchor="middle"
                fill="currentColor"
                fontFamily="ui-monospace, monospace"
              >
                {v.mean.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type LadderMethod =
  | { kind: "lda"; label: "LDA"; key: "lda" }
  | { kind: "deep"; label: string; key: "cae_1d_8" | "beta_vae_8" | "cae_2d_8" | "cae_3d_8" }
  | { kind: "classical"; label: string; key: "pca_8" | "nmf_8" | "ica_8" | "dense_ae_8" };

const LADDER_METHODS: LadderMethod[] = [
  { kind: "classical", label: "PCA",      key: "pca_8" },
  { kind: "classical", label: "ICA",      key: "ica_8" },
  { kind: "lda",       label: "LDA",      key: "lda" },
  { kind: "classical", label: "NMF",      key: "nmf_8" },
  { kind: "deep",      label: "CAE-2D",   key: "cae_2d_8" },
  { kind: "deep",      label: "CAE-1D",   key: "cae_1d_8" },
  { kind: "deep",      label: "CAE-3D",   key: "cae_3d_8" },
  { kind: "classical", label: "dense-AE", key: "dense_ae_8" },
  { kind: "deep",      label: "β-VAE",    key: "beta_vae_8" },
];

function ladderColor(method: LadderMethod): string {
  if (method.kind === "lda") return "rgba(31,119,180,1)";
  if (method.kind === "classical")
    return method.key === "pca_8" || method.key === "ica_8"
      ? "rgba(40,160,80,0.85)"
      : "rgba(255,127,14,0.65)";
  return "rgba(214,39,40,0.65)";
}

function StabilityLadderPanel({
  sceneId,
  nSeeds,
  onSelectMethod,
  selectedKey,
}: {
  sceneId: string;
  nSeeds: 7 | 15;
  onSelectMethod: (m: LadderMethod) => void;
  selectedKey: string;
}) {
  const { t } = useTranslation(["pages"]);
  const lda = useQuery({
    queryKey: ["topic-stability", sceneId, 0],
    queryFn: () => api.topicStability(sceneId, 0),
  });
  const deepQs = useQueries({
    queries: LADDER_METHODS.filter((m) => m.kind === "deep").map((m) => ({
      queryKey: ["deep-seed-stability", sceneId, m.key, nSeeds],
      queryFn: () =>
        api.deepSeedStability(sceneId, m.key as "cae_1d_8", nSeeds),
      retry: false,
    })),
  });
  const classQs = useQueries({
    queries: LADDER_METHODS.filter((m) => m.kind === "classical").map((m) => ({
      queryKey: ["classical-seed-stability", sceneId, m.key, nSeeds],
      queryFn: () =>
        api.classicalSeedStability(sceneId, m.key as "pca_8", nSeeds),
      retry: false,
    })),
  });

  const ldaMean = lda.data?.scene_stability_summary?.off_diagonal_mean;
  const ldaStd = lda.data?.scene_stability_summary?.off_diagonal_std;

  const methodValue = (m: LadderMethod): { mean: number; std: number } | null => {
    if (m.kind === "lda")
      return ldaMean != null && ldaStd != null
        ? { mean: ldaMean, std: ldaStd }
        : null;
    if (m.kind === "deep") {
      const idx = LADDER_METHODS.filter((x) => x.kind === "deep").findIndex(
        (x) => x.key === m.key,
      );
      const d = deepQs[idx]?.data;
      if (!d) return null;
      return {
        mean: d.off_diagonal_summary.ari_mean,
        std: d.off_diagonal_summary.ari_std,
      };
    }
    const idx = LADDER_METHODS.filter((x) => x.kind === "classical").findIndex(
      (x) => x.key === m.key,
    );
    const d = classQs[idx]?.data;
    if (!d) return null;
    return {
      mean: d.off_diagonal_summary.ari_mean,
      std: d.off_diagonal_summary.ari_std,
    };
  };

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {t("pages:workspace.tabs.StabilityTab.ladder_title", { seeds: nSeeds })}
        </h4>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.StabilityTab.ladder_help", { seeds: nSeeds })}
        </p>
      </header>

      <div className="space-y-1">
        {LADDER_METHODS.map((m) => {
          const v = methodValue(m);
          const sel = selectedKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelectMethod(m)}
              className="flex items-center gap-3 text-[13px] w-full text-left rounded px-2 py-1 transition-colors"
              style={{
                backgroundColor: sel ? "var(--color-bg)" : "transparent",
                color: "var(--color-fg-subtle)",
                outline: sel ? "1px solid var(--color-accent)" : "none",
              }}
            >
              <span className="shrink-0 w-24 font-mono" style={{ color: "var(--color-fg)" }}>
                {m.label}
              </span>
              <span
                className="flex-1 h-4 rounded-sm relative overflow-hidden"
                style={{ backgroundColor: "var(--color-bg)" }}
              >
                {v ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${v.mean * 100}%`,
                      backgroundColor: ladderColor(m),
                    }}
                  />
                ) : null}
              </span>
              <span className="shrink-0 w-16 text-right font-mono text-[11.5px]" style={{ color: "var(--color-fg)" }}>
                {v ? v.mean.toFixed(3) : "—"}
              </span>
              <span className="shrink-0 w-14 text-right font-mono text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
                {v ? `±${v.std.toFixed(3)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:workspace.tabs.StabilityTab.ladder_legend")}
      </p>
    </div>
  );
}

function StabilityMatrixView({
  matrix,
  seeds,
  title,
  subtitle,
}: {
  matrix: number[][];
  seeds: number[] | string[];
  title: string;
  subtitle?: string;
}) {
  const n = matrix.length;
  const cell = 28;
  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {title}
        </h4>
        {subtitle ? (
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {subtitle}
          </p>
        ) : null}
      </header>
      <svg
        viewBox={`0 0 ${n * cell + 60} ${n * cell + 30}`}
        role="img"
        aria-label={title}
        style={{ maxWidth: "min(100%, 520px)" }}
      >
        {matrix.map((row, i) =>
          row.map((v, j) => {
            const x = j * cell + 50;
            const y = i * cell + 8;
            const intensity = Math.max(0, Math.min(1, v));
            const r = Math.round(50 + (1 - intensity) * 200);
            const g = Math.round(50 + intensity * 130);
            const b = Math.round(80 + intensity * 100);
            return (
              <g key={`${i}-${j}`}>
                <title>{`(seed ${i}, seed ${j}) = ${v.toFixed(4)}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={cell - 1}
                  height={cell - 1}
                  fill={`rgb(${r},${g},${b})`}
                />
                {n <= 10 ? (
                  <text
                    x={x + (cell - 1) / 2}
                    y={y + (cell - 1) / 2 + 3}
                    fontSize="9"
                    textAnchor="middle"
                    fill={intensity > 0.4 ? "white" : "currentColor"}
                  >
                    {v.toFixed(2)}
                  </text>
                ) : null}
              </g>
            );
          }),
        )}
        {seeds.map((s, i) => (
          <text
            key={`row-${i}`}
            x={45}
            y={i * cell + 8 + (cell - 1) / 2 + 4}
            fontSize="10"
            textAnchor="end"
            fill="currentColor"
            opacity="0.7"
          >
            {String(s)}
          </text>
        ))}
        {seeds.map((s, j) => (
          <text
            key={`col-${j}`}
            x={j * cell + 50 + (cell - 1) / 2}
            y={n * cell + 22}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            {String(s)}
          </text>
        ))}
      </svg>
    </div>
  );
}

export function StabilityTab({
  isLoading,
  error,
  data,
  sceneId,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicStability | null;
  sceneId: string;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <TabLoading message={t("pages:workspace.tabs.StabilityTab.loading")} />
    );
  if (error)
    return (
      <TabError
        message={t("pages:workspace.tabs.StabilityTab.error")}
        detail={error.message}
      />
    );
  if (!data) return <TabEmpty />;

  const sceneSum = data.scene_stability_summary;
  const perTopic = data.per_topic_stability_summary;

  return (
    <StabilityTabBody
      data={data}
      sceneSum={sceneSum}
      perTopic={perTopic}
      sceneId={sceneId}
    />
  );
}

function StabilityTabBody({
  data,
  sceneSum,
  perTopic,
  sceneId,
}: {
  data: TopicStability;
  sceneSum: TopicStability["scene_stability_summary"];
  perTopic: TopicStability["per_topic_stability_summary"];
  sceneId: string;
}) {
  const { t } = useTranslation(["pages"]);
  const [selected, setSelected] = useState<LadderMethod>(LADDER_METHODS[2]!);
  const [nSeeds, setNSeeds] = useState<7 | 15>(7);

  const deepData = useQuery({
    queryKey: ["deep-seed-stability", sceneId, selected.key, nSeeds],
    queryFn: () =>
      api.deepSeedStability(sceneId, selected.key as "cae_1d_8", nSeeds),
    enabled: selected.kind === "deep",
    retry: false,
  });
  const classData = useQuery({
    queryKey: ["classical-seed-stability", sceneId, selected.key, nSeeds],
    queryFn: () =>
      api.classicalSeedStability(sceneId, selected.key as "pca_8", nSeeds),
    enabled: selected.kind === "classical",
    retry: false,
  });

  const matrixView = (() => {
    if (selected.kind === "lda") {
      return (
        <StabilityMatrixView
          title={t("pages:workspace.tabs.StabilityTab.matrix_lda_title", {
            seeds: data.seeds.length,
          })}
          subtitle={t("pages:workspace.tabs.StabilityTab.matrix_lda_subtitle")}
          matrix={data.seed_pair_matched_cosine_mean}
          seeds={data.seeds}
        />
      );
    }
    const live =
      selected.kind === "deep" ? deepData.data : classData.data;
    if (!live) {
      return (
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          {t("pages:workspace.tabs.StabilityTab.matrix_loading", {
            label: selected.label,
            seeds: nSeeds,
          })}
        </p>
      );
    }
    return (
      <StabilityMatrixView
        title={t("pages:workspace.tabs.StabilityTab.matrix_method_title", {
          label: selected.label,
          seeds: live.n_seeds,
        })}
        subtitle={t("pages:workspace.tabs.StabilityTab.matrix_method_subtitle")}
        matrix={live.seed_pair_ari}
        seeds={Array.from({ length: live.n_seeds }, (_, i) => i)}
      />
    );
  })();

  return (
    <div className="space-y-6">
      <StabilityLadderPanel
        sceneId={sceneId}
        nSeeds={nSeeds}
        onSelectMethod={(m) => setSelected(m)}
        selectedKey={selected.key}
      />

      <div className="flex items-center gap-3 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
        <span>{t("pages:workspace.tabs.StabilityTab.seed_budget")}</span>
        {[7, 15].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNSeeds(n as 7 | 15)}
            className="px-3 py-1 rounded font-mono text-[12px]"
            style={{
              backgroundColor: nSeeds === n ? "var(--color-accent)" : "var(--color-panel)",
              color: nSeeds === n ? "var(--color-bg)" : "var(--color-fg)",
              border: "1px solid var(--color-border)",
            }}
          >
            N={n}
          </button>
        ))}
        <span style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.StabilityTab.seed_budget_note", {
            seeds: data.seeds.length,
          })}
        </span>
      </div>

      {matrixView}

      <KSensitivityPanel sceneId={sceneId} />

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:workspace.tabs.StabilityTab.lda_detail_title", {
              seeds: data.seeds.length,
            })}
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.StabilityTab.lda_detail_help", {
              k: data.K,
            })}
          </p>
        </header>

        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <SceneStabilityStat
            label={t("pages:workspace.tabs.StabilityTab.stat_offdiag_mean")}
            value={sceneSum.off_diagonal_mean.toFixed(4)}
          />
          <SceneStabilityStat
            label={t("pages:workspace.tabs.StabilityTab.stat_offdiag_min")}
            value={sceneSum.off_diagonal_min.toFixed(4)}
          />
          <SceneStabilityStat
            label={t("pages:workspace.tabs.StabilityTab.stat_offdiag_std")}
            value={sceneSum.off_diagonal_std.toFixed(4)}
          />
        </div>

        <StabilityHeatmap
          matrix={data.seed_pair_matched_cosine_mean}
          seeds={data.seeds}
        />
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
          {t("pages:workspace.tabs.StabilityTab.per_topic_title")}
        </h4>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.StabilityTab.per_topic_help")}
        </p>
        <div className="space-y-1.5">
          {perTopic.map((pt) => {
            const color =
              TOPIC_COLORS[(pt.topic_id - 1) % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <div
                key={pt.topic_id}
                className="flex items-center gap-3 text-[13px]"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <span
                  className="shrink-0 w-20 font-mono"
                  style={{ color: "var(--color-fg)" }}
                >
                  {t("pages:workspace.tabs.StabilityTab.topic_n", {
                    n: pt.topic_id,
                  })}
                </span>
                <span
                  className="flex-1 h-4 rounded-sm relative overflow-hidden"
                  style={{ backgroundColor: "var(--color-bg)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${pt.median_matched_cosine_vs_seed0 * 100}%`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  />
                  <span
                    className="absolute inset-y-0 left-0 border-r-2"
                    style={{
                      width: `${pt.min_matched_cosine_vs_seed0 * 100}%`,
                      borderColor: "var(--color-fg)",
                      opacity: 0.55,
                    }}
                  />
                </span>
                <span
                  className="shrink-0 w-16 text-right font-mono text-[11.5px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {pt.median_matched_cosine_vs_seed0.toFixed(3)}
                </span>
                <span
                  className="shrink-0 w-12 text-right font-mono text-[11px]"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ±{pt.std_matched_cosine_vs_seed0.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
        <p
          className="mt-4 text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.StabilityTab.per_topic_caption")}
        </p>
      </div>
    </div>
  );
}

function SceneStabilityStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-semibold tracking-tight font-mono"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
