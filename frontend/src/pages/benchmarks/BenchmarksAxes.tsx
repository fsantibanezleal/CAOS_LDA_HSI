import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useQuery, useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { LABELLED_SCENES } from "./shared";

export function BenchmarksAxes() {
  return (
    <div className="space-y-8">
      <CrossSceneTransferSection />
      <RateDistortionSection />
      <MutualInfoSection />
      <EndmemberBaselineSection />
      <SpatialCoherenceSection />
      <SuperTopicsSection />
    </div>
  );
}

function SpatialCoherenceSection() {
  const { t } = useTranslation(["pages"]);
  const subQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-spatial-continuous", sc],
      queryFn: () => api.topicSpatialContinuous(sc),
      retry: false,
    })),
  });
  const fullQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-spatial-full", sc],
      queryFn: () => api.topicSpatialFull(sc),
      retry: false,
    })),
  });
  const ready = subQs.every((q) => q.data || q.error);
  if (!ready) {
    return (
      <Section title={t("pages:benchmarks.axes.spatial_title")} lead={t("pages:benchmarks.axes.spatial_loading")}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.axes.loading")}</p>
      </Section>
    );
  }
  const rows = LABELLED_SCENES.map((sc, i) => ({
    scene: sc,
    sub_I: subQs[i]?.data?.aggregated_morans_I_mean_over_topics ?? null,
    sub_C: subQs[i]?.data?.aggregated_gearys_C_mean_over_topics ?? null,
    full_I: fullQs[i]?.data?.aggregated_morans_I_mean_over_topics ?? null,
    full_C: fullQs[i]?.data?.aggregated_gearys_C_mean_over_topics ?? null,
  }));
  return (
    <Section
      title={t("pages:benchmarks.axes.spatial_title")}
      lead={t("pages:benchmarks.axes.spatial_lead")}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.axes.col_scene")}</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.axes.spatial_col_sub_moran")}</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.axes.spatial_col_sub_geary")}</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.axes.spatial_col_full_moran")}</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.axes.spatial_col_full_geary")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ksc = r.scene === "kennedy-space-center";
              const subColor = r.sub_I != null && r.sub_I < 0.5
                ? "rgba(214,39,40,1)"
                : "var(--color-accent)";
              return (
                <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                  <td className="py-1.5 pr-3 text-right font-mono" style={{ color: subColor }}>
                    {r.sub_I != null ? r.sub_I.toFixed(3) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {r.sub_C != null ? r.sub_C.toFixed(3) : "—"}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-right font-mono"
                    style={{
                      color: ksc ? "var(--color-accent)" : "var(--color-text)",
                      fontWeight: ksc ? "600" : "400",
                    }}
                  >
                    {r.full_I != null ? r.full_I.toFixed(3) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {r.full_C != null ? r.full_C.toFixed(3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
        <Trans
          i18nKey="pages:benchmarks.axes.spatial_finding"
          components={{ strong: <strong /> }}
        />
      </p>
    </Section>
  );
}

function EndmemberBaselineSection() {
  const { t } = useTranslation(["pages"]);
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["endmember-baseline", scene],
    queryFn: () => api.endmemberBaseline(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section title={t("pages:benchmarks.axes.endmember_title")} lead={t("pages:benchmarks.axes.endmember_loading")}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.axes.loading")}</p>
      </Section>
    );
  }
  const matrix = data.topic_endmember_match.topic_x_endmember_cosine ?? [];
  const cell = 24;

  return (
    <Section
      title={t("pages:benchmarks.axes.endmember_title")}
      lead={t("pages:benchmarks.axes.endmember_lead", {
        K: data.K,
        nPixels: data.n_pixels_used.toLocaleString(),
        nBands: data.n_bands,
      })}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.axes.scene_label")}</span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Object.entries(data.reconstruction_rmse_normalised).map(([m, v]) => (
          <div
            key={m}
            className="rounded-md border p-2"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <div className="text-[10px] mb-1 font-mono uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              {t("pages:benchmarks.axes.endmember_rmse_label", { method: m.replace(/_/g, " ") })}
            </div>
            <div className="font-mono text-[13px]" style={{ color: "var(--color-text)" }}>
              {v.toFixed(4)}
            </div>
          </div>
        ))}
      </div>
      {matrix.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="text-[12px] mb-2" style={{ color: "var(--color-text-muted)" }}>
            {t("pages:benchmarks.axes.endmember_matrix_label")}
          </p>
          <svg
            viewBox={`0 0 ${matrix[0]!.length * cell + 80} ${matrix.length * cell + 50}`}
            role="img"
            aria-label={t("pages:benchmarks.axes.endmember_matrix_aria")}
            style={{ maxWidth: "min(100%, 540px)" }}
          >
            {matrix.map((row, i) =>
              row.map((v, j) => {
                const t = Math.max(0, Math.min(1, v));
                const r = Math.round(50 + (1 - t) * 200);
                const g = Math.round(50 + t * 130);
                const b = Math.round(80 + t * 100);
                return (
                  <g key={`${i}-${j}`}>
                    <title>{`topic ${i + 1} ↔ endmember ${j + 1} = ${v.toFixed(3)}`}</title>
                    <rect
                      x={70 + j * cell}
                      y={20 + i * cell}
                      width={cell - 1}
                      height={cell - 1}
                      fill={`rgb(${r},${g},${b})`}
                    />
                  </g>
                );
              })
            )}
            {matrix.map((_, i) => (
              <text
                key={`row-${i}`}
                x={64}
                y={20 + i * cell + cell / 2 + 3}
                fontSize="9"
                textAnchor="end"
                fill="currentColor"
                opacity="0.7"
                fontFamily="ui-monospace, monospace"
              >
                t{i + 1}
              </text>
            ))}
            {matrix[0]!.map((_, j) => (
              <text
                key={`col-${j}`}
                x={70 + j * cell + cell / 2}
                y={16}
                fontSize="9"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.7"
                fontFamily="ui-monospace, monospace"
              >
                e{j + 1}
              </text>
            ))}
          </svg>
        </div>
      ) : null}
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
        {t("pages:benchmarks.axes.endmember_finding")}
      </p>
    </Section>
  );
}

function MutualInfoSection() {
  const { t } = useTranslation(["pages"]);
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["mutual-information", scene],
    queryFn: () => api.mutualInformation(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section title={t("pages:benchmarks.axes.mi_title")} lead={t("pages:benchmarks.axes.mi_loading")}>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.axes.loading")}</p>
      </Section>
    );
  }
  // Sort methods by per_feature_mi_sum_nats descending; cap at top 14 to keep readable.
  const methods = Object.entries(data.method_mi)
    .sort((a, b) => (b[1].per_feature_mi_sum_nats - a[1].per_feature_mi_sum_nats))
    .slice(0, 14);

  // Build a heatmap: rows = methods, columns = features (truncated to first 32 if larger)
  const maxCols = 32;
  const labelW = 130;
  const cellW = 16;
  const rowH = 22;
  const headerH = 24;
  const W = labelW + maxCols * cellW + 80;
  const H = headerH + methods.length * rowH + 30;

  // Find global max MI for color scale
  let gMax = 0;
  for (const [, info] of methods) {
    for (const v of info.per_feature_mi.slice(0, maxCols)) {
      if (v > gMax) gMax = v;
    }
  }

  return (
    <Section
      title={t("pages:benchmarks.axes.mi_title")}
      lead={t("pages:benchmarks.axes.mi_lead")}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.axes.scene_label")}</span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>
      <p
        className="text-[12px] mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        {t("pages:benchmarks.axes.mi_entropy_note", {
          nats: data.label_entropy_nats.toFixed(3),
          bits: data.label_entropy_bits.toFixed(3),
          count: methods.length,
        })}
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("pages:benchmarks.axes.mi_heatmap_aria")} style={{ maxWidth: "min(100%, 760px)" }}>
          {methods.map(([mname, info], i) => {
            const feats = info.per_feature_mi.slice(0, maxCols);
            return (
              <g key={mname}>
                <text
                  x={labelW - 6}
                  y={headerH + i * rowH + rowH / 2 + 3}
                  fontSize="10"
                  textAnchor="end"
                  fill="currentColor"
                  fontFamily="ui-monospace, monospace"
                >
                  {mname.replace("_", " ")}
                </text>
                {feats.map((v, j) => {
                  const t = Math.max(0, Math.min(1, v / gMax));
                  const r = Math.round(50 + (1 - t) * 200);
                  const g = Math.round(50 + t * 130);
                  const b = Math.round(80 + t * 100);
                  return (
                    <g key={j}>
                      <title>{`${mname} · feature ${j} · MI=${v.toFixed(3)}`}</title>
                      <rect
                        x={labelW + j * cellW}
                        y={headerH + i * rowH}
                        width={cellW - 1}
                        height={rowH - 2}
                        fill={`rgb(${r},${g},${b})`}
                      />
                    </g>
                  );
                })}
                <text
                  x={labelW + Math.min(feats.length, maxCols) * cellW + 8}
                  y={headerH + i * rowH + rowH / 2 + 3}
                  fontSize="9.5"
                  fill="currentColor"
                  opacity="0.7"
                  fontFamily="ui-monospace, monospace"
                >
                  Σ={info.per_feature_mi_sum_nats.toFixed(2)}
                </text>
              </g>
            );
          })}
          <text x={labelW + (maxCols * cellW) / 2} y={14} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.7">
            {t("pages:benchmarks.axes.mi_feature_axis", { maxCols })}
          </text>
        </svg>
      </div>
    </Section>
  );
}

function RateDistortionSection() {
  const { t } = useTranslation(["pages"]);
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["rate-distortion-curve", scene],
    queryFn: () => api.rateDistortionCurve(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section
        title={t("pages:benchmarks.axes.rate_distortion_title")}
        lead={t("pages:benchmarks.axes.rate_distortion_loading")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("pages:benchmarks.axes.loading")}
        </p>
      </Section>
    );
  }
  const Ks = data.K_grid;
  const W = 540;
  const H = 240;
  const padding = 40;
  const allRmse: number[] = [];
  for (const m of Object.keys(data.method_curves)) {
    for (const p of data.method_curves[m] ?? []) {
      if (typeof p.rmse_test === "number") allRmse.push(p.rmse_test);
    }
  }
  const yMin = Math.min(...allRmse);
  const yMax = Math.max(...allRmse);
  const xOf = (k: number) =>
    padding +
    ((k - Math.min(...Ks)) / (Math.max(...Ks) - Math.min(...Ks))) *
      (W - 2 * padding);
  const yOf = (v: number) =>
    padding + ((yMax - v) / Math.max(1e-9, yMax - yMin)) * (H - 2 * padding);
  const colors: Record<string, string> = {
    lda: "rgba(31,119,180,1)",
    nmf: "rgba(255,127,14,1)",
    pca: "rgba(44,160,44,1)",
  };
  return (
    <Section
      title={t("pages:benchmarks.axes.rate_distortion_title")}
      lead={t("pages:benchmarks.axes.rate_distortion_lead")}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          {t("pages:benchmarks.axes.scene_label")}
        </span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label={t("pages:benchmarks.axes.rate_distortion_aria")}>
        <line x1={padding} y1={H - padding} x2={W - padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        {Ks.map((k) => (
          <text
            key={k}
            x={xOf(k)}
            y={H - padding + 15}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            K={k}
          </text>
        ))}
        {[yMin, (yMin + yMax) / 2, yMax].map((y, i) => (
          <text
            key={i}
            x={padding - 6}
            y={yOf(y) + 3}
            fontSize="9"
            textAnchor="end"
            fill="currentColor"
            opacity="0.7"
            fontFamily="ui-monospace, monospace"
          >
            {y.toFixed(3)}
          </text>
        ))}
        {Object.keys(data.method_curves).map((mname) => {
          const path = (data.method_curves[mname] ?? [])
            .filter((p) => typeof p.rmse_test === "number")
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.K)} ${yOf(p.rmse_test as number)}`)
            .join(" ");
          return (
            <g key={mname}>
              <path d={path} fill="none" stroke={colors[mname] ?? "currentColor"} strokeWidth="1.8" />
              {(data.method_curves[mname] ?? [])
                .filter((p) => typeof p.rmse_test === "number")
                .map((p) => (
                  <circle
                    key={p.K}
                    cx={xOf(p.K)}
                    cy={yOf(p.rmse_test as number)}
                    r="3"
                    fill={colors[mname] ?? "currentColor"}
                  />
                ))}
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${W - padding - 80}, ${padding})`}>
          {Object.keys(colors).map((m, i) => (
            <g key={m} transform={`translate(0, ${i * 14})`}>
              <rect width="14" height="2" y="6" fill={colors[m]!} />
              <text x="20" y="11" fontSize="10" fill="currentColor" fontFamily="ui-monospace, monospace">
                {m.toUpperCase()}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </Section>
  );
}

function CrossSceneTransferSection() {
  const { t } = useTranslation(["pages"]);
  const { data, error } = useQuery({
    queryKey: ["cross-scene-transfer"],
    queryFn: () => api.crossSceneTransfer(),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section
        title={t("pages:benchmarks.axes.cross_scene_title")}
        lead={t("pages:benchmarks.axes.cross_scene_loading")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("pages:benchmarks.axes.loading")}
        </p>
      </Section>
    );
  }
  const scenes = data.scene_order;
  const m = data.transfer_matrix_macro_f1;
  const cell = 80;
  const headerH = 50;
  const labelW = 165;
  // Find min/max for color scale
  let minV = Infinity;
  let maxV = -Infinity;
  for (const row of m) {
    for (const v of row) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  return (
    <Section
      title={t("pages:benchmarks.axes.cross_scene_title")}
      lead={t("pages:benchmarks.axes.cross_scene_lead", {
        nBands: data.common_wavelength_grid.n_bands,
        minNm: data.common_wavelength_grid.min_nm,
        maxNm: data.common_wavelength_grid.max_nm,
      })}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${labelW + scenes.length * cell + 50} ${headerH + scenes.length * cell + 30}`}
          role="img"
          aria-label={t("pages:benchmarks.axes.cross_scene_aria")}
          style={{ maxWidth: "min(100%, 760px)" }}
        >
          <text
            x={labelW + (scenes.length * cell) / 2}
            y={20}
            fontSize="12"
            textAnchor="middle"
            fill="currentColor"
            fontWeight="600"
          >
            {t("pages:benchmarks.axes.cross_scene_axis_target")}
          </text>
          {scenes.map((s, j) => (
            <text
              key={`col-${s}`}
              x={labelW + j * cell + cell / 2}
              y={headerH - 6}
              fontSize="10"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {s.split("-")[0]}
            </text>
          ))}
          {m.map((row, i) =>
            row.map((v, j) => {
              const t = Math.max(
                0,
                Math.min(1, (v - minV) / Math.max(1e-9, maxV - minV)),
              );
              const r = Math.round(50 + (1 - t) * 200);
              const g = Math.round(50 + t * 130);
              const b = Math.round(80 + t * 100);
              const isDiag = i === j;
              return (
                <g key={`${i}-${j}`}>
                  <title>{`${scenes[i]} → ${scenes[j]} = ${v.toFixed(3)}`}</title>
                  <rect
                    x={labelW + j * cell}
                    y={headerH + i * cell}
                    width={cell - 2}
                    height={cell - 2}
                    fill={`rgb(${r},${g},${b})`}
                    stroke={isDiag ? "white" : "none"}
                    strokeWidth={isDiag ? "2" : "0"}
                  />
                  <text
                    x={labelW + j * cell + (cell - 2) / 2}
                    y={headerH + i * cell + (cell - 2) / 2 + 4}
                    fontSize="13"
                    textAnchor="middle"
                    fill="var(--color-on-accent, #ffffff)"
                    fontWeight={isDiag ? "700" : "500"}
                    fontFamily="ui-monospace, monospace"
                  >
                    {v.toFixed(3)}
                  </text>
                </g>
              );
            }),
          )}
          {scenes.map((s, i) => (
            <text
              key={`row-${s}`}
              x={labelW - 8}
              y={headerH + i * cell + cell / 2 + 4}
              fontSize="11"
              textAnchor="end"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {s}
            </text>
          ))}
          <text
            x={20}
            y={headerH + (scenes.length * cell) / 2}
            fontSize="12"
            textAnchor="middle"
            fill="currentColor"
            fontWeight="600"
            transform={`rotate(-90, 20, ${headerH + (scenes.length * cell) / 2})`}
          >
            {t("pages:benchmarks.axes.cross_scene_axis_source")}
          </text>
        </svg>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        {t("pages:benchmarks.axes.cross_scene_finding")}
      </p>
    </Section>
  );
}




function SuperTopicsSection() {
  const { t } = useTranslation(["pages"]);
  const { data, error } = useQuery({
    queryKey: ["super-topics"],
    queryFn: () => api.superTopics(),
    retry: false,
  });
  if (error || !data) {
    return (
      <Section
        title={t("pages:benchmarks.axes.super_topics_title")}
        lead={t("pages:benchmarks.axes.super_topics_lead_loading")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("pages:benchmarks.axes.super_topics_unavailable")}
        </p>
      </Section>
    );
  }
  const cut8 =
    data.cuts.find((c) => c.cut_level === 8) ?? data.cuts[data.cuts.length - 1]!;
  const sortedClusters = [...cut8.clusters].sort(
    (a, b) => b.scene_set.length - a.scene_set.length || b.n_members - a.n_members,
  );
  return (
    <Section
      title={t("pages:benchmarks.axes.super_topics_title")}
      lead={t("pages:benchmarks.axes.super_topics_lead", {
        nTopics: data.n_topics_total,
        nScenes: data.n_scenes,
        cutLevel: cut8.cut_level,
        nClusters: cut8.n_clusters,
      })}
    >
      <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
        <thead>
          <tr style={{ color: "var(--color-text-muted)" }}>
            <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.axes.super_topics_col_cluster")}</th>
            <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.axes.super_topics_col_members")}</th>
            <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.axes.super_topics_col_scenes")}</th>
            <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.axes.super_topics_col_topic_ids")}</th>
          </tr>
        </thead>
        <tbody>
          {sortedClusters.map((c) => (
            <tr
              key={c.cluster_id}
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <td className="py-1.5 font-mono">#{c.cluster_id}</td>
              <td className="py-1.5">{c.n_members}</td>
              <td
                className="py-1.5 text-[12.5px]"
                style={{
                  color:
                    c.scene_set.length > 1
                      ? "var(--color-accent)"
                      : "var(--color-text-muted)",
                }}
              >
                {c.scene_set.join(", ")}
              </td>
              <td className="py-1.5 font-mono text-[12px]">
                {c.members
                  .map((m) => `${m.scene_id.split("-")[0]}:${m.topic_k}`)
                  .join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
