/**
 * Robustness tab (extracted from Workspace.tsx in c272 as part of
 * #441 P1 2.1). Combines two complementary panels:
 *
 *   1. QuantizationSensitivityCard — table of probe configs vs the
 *      canonical fit with matched-cosine + ARI per probe.
 *   2. CrossSceneTransferCard — 5×5 SVG heatmap of macro F1 when
 *      topics trained on scene i are evaluated downstream on scene j.
 *
 * Both helpers are module-local — only RobustnessTab consumes them.
 */
import { useTranslation } from "react-i18next";
import type {
  CrossSceneTransfer,
  QuantizationSensitivity,
} from "@/api/client";

export function RobustnessTab({
  sceneId,
  isLoading,
  error,
  quant,
  transfer,
}: {
  sceneId: string;
  isLoading: boolean;
  error: Error | null;
  quant: QuantizationSensitivity | null;
  transfer: CrossSceneTransfer | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:workspace.tabs.RobustnessTab.loading")}
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
          {t("pages:workspace.tabs.RobustnessTab.error")}
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
      {quant ? <QuantizationSensitivityCard quant={quant} /> : null}
      {transfer ? (
        <CrossSceneTransferCard transfer={transfer} currentScene={sceneId} />
      ) : null}
    </div>
  );
}

function QuantizationSensitivityCard({
  quant,
}: {
  quant: QuantizationSensitivity;
}) {
  const { t } = useTranslation(["pages"]);
  const okProbes = quant.probes.filter((p) => p.status === "ok");
  const maxCos = Math.max(
    ...okProbes.map((p) => p.matched_cosine_mean ?? 0),
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
        {t("pages:workspace.tabs.RobustnessTab.quant_title")} · {quant.canonical_recipe}/
        {quant.canonical_scheme} Q={quant.canonical_Q}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.RobustnessTab.quant_help_pre")}{" "}
        <code>matched_cosine_mean</code>{" "}
        {t("pages:workspace.tabs.RobustnessTab.quant_help_post")}
      </p>
      <div className="overflow-x-auto">
        <table
          className="w-full text-[12px]"
          style={{ color: "var(--color-fg)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.RobustnessTab.col_probe_config")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.RobustnessTab.col_cosine_mean")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.RobustnessTab.col_cosine_min")}
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                {t("pages:workspace.tabs.RobustnessTab.col_ari_vs_canonical")}
              </th>
              <th className="text-left font-mono text-[11px] pb-1">
                {t("pages:workspace.tabs.RobustnessTab.col_match_strength")}
              </th>
            </tr>
          </thead>
          <tbody>
            {quant.probes.map((p) => {
              const cosMean = p.matched_cosine_mean ?? 0;
              const cosMin = p.matched_cosine_min ?? 0;
              const ari = p.ari_dominant_vs_canonical ?? 0;
              const w = (cosMean / maxCos) * 100;
              const isOk = p.status === "ok";
              return (
                <tr
                  key={p.config}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td className="py-1 pr-3 font-mono text-[11.5px]">
                    {p.config}
                    {!isOk ? (
                      <span
                        className="ml-1 text-[10.5px]"
                        style={{ color: "var(--color-warn)" }}
                      >
                        ({p.status})
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {cosMean.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {cosMin.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {ari.toFixed(3)}
                  </td>
                  <td className="py-1 w-[180px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${w}%`,
                          backgroundColor:
                            cosMean >= 0.95
                              ? "rgba(40,160,80,0.9)"
                              : cosMean >= 0.85
                                ? "rgba(214,140,40,0.9)"
                                : "rgba(214,39,40,0.9)",
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

function CrossSceneTransferCard({
  transfer,
  currentScene,
}: {
  transfer: CrossSceneTransfer;
  currentScene: string;
}) {
  const { t } = useTranslation(["pages"]);
  const N = transfer.scene_order.length;
  const labelW = 130;
  const cell = 80;
  const cellH = 44;
  const W = labelW + N * cell + 8;
  const H = labelW + N * cellH + 8;
  const curIdx = transfer.scene_order.indexOf(currentScene);
  const colour = (v: number) => {
    const tv = Math.max(0, Math.min(1, v));
    const r = Math.round(255 * (1 - tv));
    const g = Math.round(180 * tv + 60 * (1 - tv));
    const b = Math.round(60 * tv + 60 * (1 - tv));
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
      <h4
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        {t("pages:workspace.tabs.RobustnessTab.transfer_title")}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace.tabs.RobustnessTab.transfer_help", {
          minNm: transfer.common_wavelength_grid.min_nm,
          maxNm: transfer.common_wavelength_grid.max_nm,
          nBands: transfer.common_wavelength_grid.n_bands,
          wordification: transfer.wordification,
          q: transfer.quantization_scale,
          samplesPerClass: transfer.samples_per_class,
        })}
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="max-w-full h-auto"
          style={{ maxWidth: 1080 }}
          role="img"
          aria-label={t("pages:workspace.tabs.RobustnessTab.aria_transfer_matrix")}
        >
          {transfer.scene_order.map((sc, j) => (
            <text
              key={`c-${sc}`}
              x={labelW + j * cell + cell / 2}
              y={labelW - 4}
              fontSize="10"
              textAnchor="end"
              transform={`rotate(-30 ${labelW + j * cell + cell / 2} ${labelW - 4})`}
              fill={j === curIdx ? "var(--color-accent)" : "currentColor"}
              opacity={j === curIdx ? 1 : 0.65}
              fontFamily="ui-monospace, monospace"
              fontWeight={j === curIdx ? 600 : 400}
            >
              → {sc}
            </text>
          ))}
          {transfer.scene_order.map((sc, i) => (
            <text
              key={`r-${sc}`}
              x={labelW - 6}
              y={labelW + i * cellH + cellH / 2 + 4}
              fontSize="10"
              textAnchor="end"
              fill={i === curIdx ? "var(--color-accent)" : "currentColor"}
              opacity={i === curIdx ? 1 : 0.65}
              fontFamily="ui-monospace, monospace"
              fontWeight={i === curIdx ? 600 : 400}
            >
              {sc} →
            </text>
          ))}
          {transfer.transfer_matrix_macro_f1.map((row, i) =>
            row.map((v, j) => {
              const isDiag = i === j;
              const isCurRow = i === curIdx;
              const isCurCol = j === curIdx;
              const stroke =
                isCurRow || isCurCol ? "rgba(56,189,248,1)" : "none";
              return (
                <g key={`${i}-${j}`}>
                  <rect
                    x={labelW + j * cell}
                    y={labelW + i * cellH}
                    width={cell - 1}
                    height={cellH - 1}
                    fill={colour(v)}
                    stroke={stroke}
                    strokeWidth={
                      isCurRow && isCurCol
                        ? 2.5
                        : isCurRow || isCurCol
                          ? 1.5
                          : 0
                    }
                  />
                  <text
                    x={labelW + j * cell + cell / 2}
                    y={labelW + i * cellH + cellH / 2 + 2}
                    fontSize="11"
                    textAnchor="middle"
                    fill={v > 0.45 ? "white" : "var(--color-fg)"}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={isDiag ? 600 : 400}
                  >
                    {v.toFixed(3)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
      {curIdx >= 0 ? (
        <p
          className="mt-3 text-[11.5px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.RobustnessTab.highlight_pre")}{" "}
          <strong style={{ color: "var(--color-accent)" }}>
            {currentScene}
          </strong>{" "}
          {t("pages:workspace.tabs.RobustnessTab.highlight_post", {
            row: curIdx,
            col: curIdx,
            f1:
              transfer.transfer_matrix_macro_f1[curIdx]?.[curIdx]?.toFixed(3) ??
              "—",
          })}
        </p>
      ) : null}
    </div>
  );
}
