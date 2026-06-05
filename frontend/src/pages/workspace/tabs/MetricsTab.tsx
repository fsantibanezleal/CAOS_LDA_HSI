import { useTranslation } from "react-i18next";

import type {
  MutualInformation,
  RateDistortionCurve,
} from "@/api/client";

const METHOD_COLORS: Record<string, string> = {
  lda: "#22c55e",
  nmf: "#0ea5e9",
  pca: "#f97316",
  theta: "#22c55e",
  dense_ae_8: "#a855f7",
  ica_10: "#ec4899",
  nmf_8: "#0ea5e9",
  nmf_20: "#06b6d4",
  pca_3: "#fbbf24",
  pca_10: "#f97316",
  pca_30: "#f59e0b",
};

export function MetricsTab({
  rateDist,
  rateDistError,
  rateDistLoading,
  mi,
  miError,
  miLoading,
}: {
  rateDist: RateDistortionCurve | null;
  rateDistError: Error | null;
  rateDistLoading: boolean;
  mi: MutualInformation | null;
  miError: Error | null;
  miLoading: boolean;
}) {
  const { t } = useTranslation(["pages"]);
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
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:workspace.tabs.MetricsTab.rate_dist_title")}
          </h4>
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.MetricsTab.rate_dist_lead", {
              kGrid: "{4, 6, 8, 10, 12, 16}",
            })}
          </p>
        </header>
        {rateDistLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.MetricsTab.rate_dist_loading")}
          </p>
        )}
        {rateDistError && (
          <p style={{ color: "var(--color-warn)" }}>
            {t("pages:workspace.tabs.MetricsTab.rate_dist_error")}
          </p>
        )}
        {rateDist && <RateDistortionCurveSvg data={rateDist} />}
      </div>

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
            {t("pages:workspace.tabs.MetricsTab.mi_title")}
          </h4>
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.MetricsTab.mi_lead")}{" "}
            <em>
              {t("pages:workspace.tabs.MetricsTab.mi_estimator_pre")}{" "}
              <code>mutual_info_classif</code>
              {t("pages:workspace.tabs.MetricsTab.mi_estimator_post")}
            </em>
          </p>
        </header>
        {miLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.MetricsTab.mi_loading")}
          </p>
        )}
        {miError && (
          <p style={{ color: "var(--color-warn)" }}>
            {t("pages:workspace.tabs.MetricsTab.mi_error")}
          </p>
        )}
        {mi && <MutualInfoTable data={mi} />}
      </div>
    </div>
  );
}

function RateDistortionCurveSvg({ data }: { data: RateDistortionCurve }) {
  const { t } = useTranslation(["pages"]);
  const w = 720;
  const h = 320;
  const padL = 60;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  let yLo = Infinity;
  let yHi = -Infinity;
  for (const m of Object.values(data.method_curves)) {
    for (const p of m) {
      if (p.rmse_test < yLo) yLo = p.rmse_test;
      if (p.rmse_test > yHi) yHi = p.rmse_test;
    }
  }
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
    yLo = 0;
    yHi = 1;
  }
  const pad = (yHi - yLo) * 0.08 || 0.001;
  yLo -= pad;
  yHi += pad;

  const xMin = data.K_grid[0] ?? 4;
  const xMax = data.K_grid[data.K_grid.length - 1] ?? 16;
  const x = (k: number) => padL + ((k - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) =>
    padT + (1 - (v - yLo) / (yHi - yLo || 1)) * plotH;

  const methods = Object.keys(data.method_curves);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t("pages:workspace.tabs.MetricsTab.rate_dist_aria")}
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = yLo + (yHi - yLo) * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeWidth="0.6"
                opacity="0.18"
              />
              <text
                x={padL - 6}
                y={y(v) + 3}
                textAnchor="end"
                opacity="0.7"
                fontSize="10"
              >
                {v.toFixed(3)}
              </text>
            </g>
          );
        })}
        {data.K_grid.map((k) => (
          <g key={k}>
            <line
              x1={x(k)}
              x2={x(k)}
              y1={padT + plotH}
              y2={padT + plotH + 4}
              stroke="currentColor"
              opacity="0.5"
            />
            <text
              x={x(k)}
              y={padT + plotH + 18}
              textAnchor="middle"
              opacity="0.7"
              fontSize="10"
            >
              {k}
            </text>
          </g>
        ))}
        <text
          x={padL + plotW / 2}
          y={h - 4}
          textAnchor="middle"
          opacity="0.55"
          fontSize="10"
        >
          {t("pages:workspace.tabs.MetricsTab.rate_dist_axis_x")}
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${padT + plotH / 2})`}
          opacity="0.55"
          fontSize="10"
        >
          {t("pages:workspace.tabs.MetricsTab.rate_dist_axis_y")}
        </text>

        {methods.map((m) => {
          const color = METHOD_COLORS[m] ?? "var(--color-accent)";
          const pts = data.method_curves[m]!;
          const path = pts
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"} ${x(p.K).toFixed(2)} ${y(p.rmse_test).toFixed(2)}`,
            )
            .join(" ");
          return (
            <g key={m}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                opacity="0.9"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={x(p.K)}
                  cy={y(p.rmse_test)}
                  r="3.5"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
              ))}
            </g>
          );
        })}

        {methods.map((m, i) => (
          <g
            key={`leg-${m}`}
            transform={`translate(${padL + 16 + i * 80}, ${padT + 12})`}
          >
            <rect
              width={16}
              height={3}
              y={6}
              fill={METHOD_COLORS[m] ?? "var(--color-accent)"}
            />
            <text
              x={22}
              y={11}
              fontSize="11.5"
              fontFamily="ui-monospace, monospace"
            >
              {m}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function MutualInfoTable({ data }: { data: MutualInformation }) {
  const { t } = useTranslation(["pages"]);
  const ranking = data.ranking_by_joint_mi;
  return (
    <div>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.MetricsTab.mi_entropy_line", {
          nats: data.label_entropy_nats.toFixed(3),
          bits: data.label_entropy_bits.toFixed(3),
          nDocuments: data.n_documents.toLocaleString(),
        })}
      </p>
      <table
        className="w-full text-[13.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-fg)",
            }}
          >
            <th className="text-left py-2 pr-4 font-semibold">
              {t("pages:workspace.tabs.MetricsTab.col_method")}
            </th>
            <th className="text-right py-2 pr-4 font-semibold">
              {t("pages:workspace.tabs.MetricsTab.col_latent_dim")}
            </th>
            <th className="text-right py-2 pr-4 font-semibold">
              {t("pages:workspace.tabs.MetricsTab.col_joint_mi")}
            </th>
            <th className="text-right py-2 font-semibold">
              {t("pages:workspace.tabs.MetricsTab.col_pct_recovered")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => {
            const color = METHOD_COLORS[r.method] ?? "var(--color-accent)";
            return (
              <tr
                key={r.method}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <td className="py-2 pr-4 font-mono text-[12.5px] flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {r.method}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {r.latent_dim}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {r.joint_mi_clipped.toFixed(3)}
                </td>
                <td
                  className="py-2 text-right font-mono"
                  style={{ color: "var(--color-fg)" }}
                >
                  {(r.fraction_of_label_entropy_recovered * 100).toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
