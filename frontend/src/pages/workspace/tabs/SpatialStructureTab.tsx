/**
 * Spatial-structure tab (extracted from Workspace.tsx in c284 as part
 * of #441 P1 2.1). Combines three stacked cards:
 *
 *   1. SpatialAutocorrelationCard — Moran's I + Geary's C per topic
 *      on the 220-per-class sub-sample (canonical fit).
 *   2. SpatialFullCard — same metrics on the LDA refit over the FULL
 *      labelled pixel set (max_iter=40, batch_size=1024). Used to
 *      check that the canonical sub-sample numbers don't drift.
 *   3. FelzenszwalbCard — graph-based image segmentation produced
 *      from the band-frequency wordification + a 720x240 SVG of
 *      mean spectra per group.
 *
 * The three card components are module-local — only SpatialStructureTab
 * consumes them.
 */
import { useTranslation } from "react-i18next";
import type {
  FelzenszwalbGroupings,
  ScenePerScene,
  TopicSpatialContinuous,
  TopicSpatialFull,
} from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { UnmixingStat } from "../components/StatCard";

export function SpatialStructureTab({
  isLoading,
  error,
  spatial,
  spatialFull,
  groupings,
  eda,
}: {
  isLoading: boolean;
  error: Error | null;
  spatial: TopicSpatialContinuous | null;
  spatialFull: TopicSpatialFull | null;
  groupings: FelzenszwalbGroupings | null;
  eda: ScenePerScene | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:workspace.tabs.SpatialStructureTab.loading")}
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
          {t("pages:workspace.tabs.SpatialStructureTab.error")}
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
      {spatial ? <SpatialAutocorrelationCard spatial={spatial} /> : null}
      {spatialFull ? <SpatialFullCard spatialFull={spatialFull} /> : null}
      {groupings ? (
        <FelzenszwalbCard groupings={groupings} eda={eda} />
      ) : null}
    </div>
  );
}

function SpatialFullCard({
  spatialFull,
}: {
  spatialFull: TopicSpatialFull;
}) {
  const { t } = useTranslation(["pages"]);
  const ts = spatialFull.per_topic_continuous_spatial_full;
  const maxI = Math.max(
    ...ts.map((t) => Math.abs(t.morans_I_continuous_full ?? 0)),
    1,
  );
  const maxC = Math.max(
    ...ts.map((t) => t.gearys_C_continuous_full ?? 0),
    1,
  );
  return (
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
        {t("pages:workspace.tabs.SpatialStructureTab.full_title", {
          pixels: spatialFull.n_labelled_pixels.toLocaleString(),
        })}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.SpatialStructureTab.full_help", {
          moransI: spatialFull.aggregated_morans_I_mean_over_topics.toFixed(3),
        })}
        {spatialFull.aggregated_gearys_C_mean_over_topics != null ? (
          <>
            {" "}
            · {t("pages:workspace.tabs.SpatialStructureTab.full_gearys", {
              gearysC:
                spatialFull.aggregated_gearys_C_mean_over_topics.toFixed(3),
            })}
          </>
        ) : null}
        {spatialFull.boundary_displacement_error != null ? (
          <> · BDE = {spatialFull.boundary_displacement_error.toFixed(3)}.</>
        ) : null}
      </p>
      {spatialFull.lda_refit_note ? (
        <p
          className="text-[11.5px] italic mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {spatialFull.lda_refit_note}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table
          className="w-full text-[12px]"
          style={{ color: "var(--color-fg)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_topic")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_morans_i_full")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_gearys_c_full")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_mean_theta_mask")}
              </th>
              <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.SpatialStructureTab.col_i_bar")}</th>
              <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.SpatialStructureTab.col_c_bar")}</th>
            </tr>
          </thead>
          <tbody>
            {ts.map((t) => {
              const I = t.morans_I_continuous_full ?? 0;
              const C = t.gearys_C_continuous_full ?? 0;
              const m = t.mean_abundance_in_mask ?? 0;
              return (
                <tr
                  key={`full-${t.topic_id}`}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td className="py-1 pr-3 font-mono">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[(t.topic_id - 1) % TOPIC_COLORS.length],
                      }}
                    />
                    t{t.topic_id}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {I.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {C.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {m.toFixed(3)}
                  </td>
                  <td className="py-1 w-[110px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${(Math.abs(I) / maxI) * 100}%`,
                          backgroundColor:
                            I >= 0
                              ? "rgba(40,160,80,0.85)"
                              : "rgba(214,39,40,0.85)",
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-1 w-[110px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${(C / maxC) * 100}%`,
                          backgroundColor: "rgba(170,60,200,0.85)",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpatialAutocorrelationCard({
  spatial,
}: {
  spatial: TopicSpatialContinuous;
}) {
  const { t } = useTranslation(["pages"]);
  const ts = spatial.per_topic_continuous_spatial;
  const maxI = Math.max(
    ...ts.map((t) => Math.abs(t.morans_I_continuous ?? 0)),
    1,
  );
  const maxC = Math.max(...ts.map((t) => t.gearys_C_continuous ?? 0), 1);
  return (
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
        {t("pages:workspace.tabs.SpatialStructureTab.auto_title", {
          h: spatial.spatial_shape[0],
          w: spatial.spatial_shape[1],
        })}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.SpatialStructureTab.auto_help", {
          sampled: spatial.n_sampled_pixels,
          moransI:
            spatial.aggregated_morans_I_mean_over_topics?.toFixed(3) ?? "—",
        })}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full text-[12px]"
          style={{ color: "var(--color-fg)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_topic")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_morans_i")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_gearys_c")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.SpatialStructureTab.col_mean_theta_mask")}
              </th>
              <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.SpatialStructureTab.col_i_bar")}</th>
              <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.SpatialStructureTab.col_c_bar")}</th>
            </tr>
          </thead>
          <tbody>
            {ts.map((t) => {
              const I = t.morans_I_continuous ?? 0;
              const C = t.gearys_C_continuous ?? 0;
              const m = t.mean_abundance_in_mask ?? 0;
              return (
                <tr
                  key={t.topic_id}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td className="py-1 pr-3 font-mono">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[(t.topic_id - 1) % TOPIC_COLORS.length],
                      }}
                    />
                    t{t.topic_id}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {I.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {C.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {m.toFixed(3)}
                  </td>
                  <td className="py-1 w-[110px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${(Math.abs(I) / maxI) * 100}%`,
                          backgroundColor:
                            I >= 0
                              ? "rgba(40,160,80,0.85)"
                              : "rgba(214,39,40,0.85)",
                        }}
                      />
                    </div>
                  </td>
                  <td className="py-1 w-[110px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${(C / maxC) * 100}%`,
                          backgroundColor: "rgba(56,189,248,0.85)",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FelzenszwalbCard({
  groupings,
  eda,
}: {
  groupings: FelzenszwalbGroupings;
  eda: ScenePerScene | null;
}) {
  const { t } = useTranslation(["pages"]);
  const palette = [
    "#0072B2",
    "#D55E00",
    "#009E73",
    "#CC79A7",
    "#F0E442",
    "#56B4E9",
    "#E69F00",
    "#999999",
  ];
  const showGroups = groupings.mean_spectrum_per_group.slice(0, 8);

  const W = 720;
  const H = 240;
  const pad = { l: 44, r: 16, t: 12, b: 32 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const ys = showGroups.flatMap((g) => g.mean);
  const yLo = ys.length ? Math.min(...ys) : 0;
  const yHi = ys.length ? Math.max(...ys) : 1;
  const span = yHi - yLo || 1;
  const yMin = yLo - span * 0.05;
  const yMax = yHi + span * 0.05;

  const wavelengths = eda?.wavelengths_nm ?? [];
  const xMin = wavelengths[0] ?? 0;
  const xMax =
    wavelengths[wavelengths.length - 1] ??
    (showGroups[0]?.mean.length ?? 1);

  const xScale = (x: number) =>
    pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (y: number) =>
    pad.t + innerH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;

  return (
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
        {t("pages:workspace.tabs.SpatialStructureTab.felz_title", {
          segments: groupings.n_groups,
        })}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.SpatialStructureTab.felz_help", {
          groups: groupings.n_groups,
          bwvr: groupings.between_within_variance_ratio.toFixed(3),
          ari: groupings.agreement_vs_label.ari.toFixed(3),
          nmi: groupings.agreement_vs_label.nmi.toFixed(3),
          pixels: groupings.agreement_vs_label.n_labelled_pixels.toLocaleString(),
        })}
      </p>

      <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <UnmixingStat
          label={t("pages:workspace.tabs.SpatialStructureTab.stat_n_groups")}
          value={String(groupings.n_groups)}
        />
        <UnmixingStat
          label={t("pages:workspace.tabs.SpatialStructureTab.stat_size_minmax")}
          value={`${groupings.group_size_distribution.min} / ${groupings.group_size_distribution.p50} / ${groupings.group_size_distribution.max}`}
        />
        <UnmixingStat
          label="BWVR"
          value={groupings.between_within_variance_ratio.toFixed(3)}
        />
        <UnmixingStat
          label={t("pages:workspace.tabs.SpatialStructureTab.stat_ari_vs_label")}
          value={groupings.agreement_vs_label.ari.toFixed(3)}
        />
        <UnmixingStat
          label={t("pages:workspace.tabs.SpatialStructureTab.stat_nmi_vs_label")}
          value={groupings.agreement_vs_label.nmi.toFixed(3)}
        />
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="max-w-full h-auto"
          style={{ maxWidth: 900 }}
          role="img"
          aria-label={t("pages:workspace.tabs.SpatialStructureTab.aria_felz_plot")}
        >
          <line
            x1={pad.l}
            y1={pad.t + innerH}
            x2={pad.l + innerW}
            y2={pad.t + innerH}
            stroke="currentColor"
            opacity={0.3}
          />
          <line
            x1={pad.l}
            y1={pad.t}
            x2={pad.l}
            y2={pad.t + innerH}
            stroke="currentColor"
            opacity={0.3}
          />
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const wv = xMin + f * (xMax - xMin);
            const x = pad.l + f * innerW;
            return (
              <g key={`xt-${f}`}>
                <line
                  x1={x}
                  y1={pad.t + innerH}
                  x2={x}
                  y2={pad.t + innerH + 4}
                  stroke="currentColor"
                  opacity={0.4}
                />
                <text
                  x={x}
                  y={pad.t + innerH + 16}
                  fontSize="10"
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.7}
                  fontFamily="ui-monospace, monospace"
                >
                  {wavelengths.length > 0
                    ? `${Math.round(wv)} nm`
                    : Math.round(wv)}
                </text>
              </g>
            );
          })}
          {showGroups.map((g, idx) => {
            const points = g.mean
              .map((v, i) => {
                const xv = wavelengths[i] ?? i;
                return `${xScale(xv).toFixed(2)},${yScale(v).toFixed(2)}`;
              })
              .join(" ");
            return (
              <polyline
                key={`g-${g.group_id}`}
                points={points}
                fill="none"
                stroke={palette[idx % palette.length]}
                strokeWidth={1.4}
                opacity={0.85}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {showGroups.map((g, idx) => (
          <span
            key={`leg-${g.group_id}`}
            className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono"
            style={{ backgroundColor: "var(--color-accent-soft)" }}
          >
            <span
              className="inline-block rounded-full w-2 h-2"
              style={{ backgroundColor: palette[idx % palette.length] }}
            />
            {t("pages:workspace.tabs.SpatialStructureTab.legend_group", {
              id: g.group_id,
              n: g.size,
            })}
          </span>
        ))}
        {groupings.mean_spectrum_per_group.length > showGroups.length ? (
          <span
            className="text-[10.5px] font-mono"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.SpatialStructureTab.legend_more", {
              count: groupings.mean_spectrum_per_group.length - showGroups.length,
            })}
          </span>
        ) : null}
      </div>
    </div>
  );
}
