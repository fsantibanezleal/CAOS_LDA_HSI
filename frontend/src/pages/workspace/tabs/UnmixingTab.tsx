import { useMemo } from "react";
import type { EndmemberBaseline, ScenePerScene } from "@/api/client";
import { TabEmpty } from "../components/TabStates";
import { UnmixingStat } from "../components/StatCard";

function asNum(x: number | Record<string, number> | undefined): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const vals = Object.values(x).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function UnmixingTab({
  isLoading,
  error,
  data,
  eda,
}: {
  isLoading: boolean;
  error: Error | null;
  data: EndmemberBaseline | null;
  eda: ScenePerScene | null;
}) {
  if (isLoading) {
    return <p style={{ color: "var(--color-fg-faint)" }}>Loading unmixing baseline…</p>;
  }
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>Could not load endmember baseline.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  if (!data) return <TabEmpty />;

  const rmseRaw = asNum(data.reconstruction_rmse_full_set);
  const rmseNorm = asNum(data.reconstruction_rmse_normalised);
  const wavelengths = eda?.wavelengths_nm ?? [];

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(170,60,200,1) 100%)" }}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-3 mt-1 mb-2">
          <div>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
              Linear unmixing baseline · K={data.K}
            </h3>
            <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {data.endmember_extractors.join(" + ")} · {data.unmixing_method}
            </p>
          </div>
          <div className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
            {data.framework_axis ?? "Axis B-11"}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <UnmixingStat label="endmembers (K)" value={String(data.K)} />
          <UnmixingStat label="pixels used" value={data.n_pixels_used.toLocaleString()} />
          <UnmixingStat label="bands" value={String(data.n_bands)} />
          <UnmixingStat label="rmse · normalised" value={rmseNorm != null ? rmseNorm.toFixed(4) : "—"} />
        </div>
        {rmseRaw != null ? (
          <p className="mt-2 text-[11.5px] font-mono" style={{ color: "var(--color-fg-faint)" }}>
            raw reconstruction RMSE = {rmseRaw.toFixed(3)} · normalised by full-set L2 = {rmseNorm?.toFixed(4) ?? "—"}
          </p>
        ) : null}
      </div>

      <UnmixingSpectraCard
        title="NFINDR endmember spectra"
        subtitle="K vertices of the data simplex (Winter 1999). Each curve is one pure-pixel candidate."
        spectra={data.nfindr_endmembers ?? []}
        wavelengths={wavelengths}
        accent="rgba(56,189,248,1)"
      />

      {data.atgp_endmembers && data.atgp_endmembers.length > 0 ? (
        <UnmixingSpectraCard
          title="ATGP endmember spectra"
          subtitle="Automatic Target Generation Process (Ren & Chang 2003). Alternative extractor — pixel-wise orthogonal subspace projection."
          spectra={data.atgp_endmembers}
          wavelengths={wavelengths}
          accent="rgba(170,60,200,1)"
        />
      ) : null}

      {data.topic_endmember_match.topic_x_endmember_cosine ? (
        <UnmixingTopicHeatmap
          matrix={data.topic_endmember_match.topic_x_endmember_cosine}
          bestByTopic={data.topic_endmember_match.best_endmember_per_topic ?? []}
        />
      ) : null}

      {data.topic_endmember_match.best_endmember_per_topic && data.topic_endmember_match.best_endmember_per_topic.length > 0 ? (
        <UnmixingBestMatchTable rows={data.topic_endmember_match.best_endmember_per_topic} />
      ) : null}
    </div>
  );
}


function UnmixingSpectraCard({
  title,
  subtitle,
  spectra,
  wavelengths,
  accent,
}: {
  title: string;
  subtitle: string;
  spectra: number[][];
  wavelengths: number[];
  accent: string;
}) {
  const W = 720;
  const H = 280;
  const pad = { l: 44, r: 16, t: 12, b: 32 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const row of spectra) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = 0;
      yHi = 1;
    }
    const span = yHi - yLo || 1;
    const xWv = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [0, 1];
    return {
      xMin: xWv[0] ?? 0,
      xMax: xWv[xWv.length - 1] ?? 1,
      yMin: yLo - span * 0.05,
      yMax: yHi + span * 0.05,
    };
  }, [spectra, wavelengths]);

  const xAxis = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [];

  const xScale = (x: number) => pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (y: number) => pad.t + innerH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;

  const palette = [
    "#0072B2", "#D55E00", "#009E73", "#CC79A7", "#F0E442",
    "#56B4E9", "#E69F00", "#999999", "#332288", "#117733",
    "#88CCEE", "#882255", "#44AA99", "#DDCC77", "#AA4499",
    "#661100",
  ];

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {title}
        </h4>
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: accent }}>
          K = {spectra.length}
        </span>
      </div>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>{subtitle}</p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 900 }}>
          {/* axes */}
          <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          {/* x ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const wv = xMin + f * (xMax - xMin);
            const x = pad.l + f * innerW;
            return (
              <g key={`xt-${f}`}>
                <line x1={x} y1={pad.t + innerH} x2={x} y2={pad.t + innerH + 4} stroke="currentColor" opacity={0.4} />
                <text x={x} y={pad.t + innerH + 16} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {wavelengths.length > 0 ? `${Math.round(wv)} nm` : Math.round(wv)}
                </text>
              </g>
            );
          })}
          {/* y ticks */}
          {[0, 0.5, 1].map((f) => {
            const v = yMin + f * (yMax - yMin);
            const y = pad.t + innerH - f * innerH;
            return (
              <g key={`yt-${f}`}>
                <line x1={pad.l - 4} y1={y} x2={pad.l} y2={y} stroke="currentColor" opacity={0.4} />
                <text x={pad.l - 6} y={y + 3} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)}
                </text>
              </g>
            );
          })}
          {/* curves */}
          {spectra.map((row, k) => {
            const points = row
              .map((v, i) => {
                if (!Number.isFinite(v)) return null;
                const xv = xAxis[i] ?? i;
                return `${xScale(xv).toFixed(2)},${yScale(v).toFixed(2)}`;
              })
              .filter((p): p is string => p !== null)
              .join(" ");
            return (
              <polyline
                key={`em-${k}`}
                points={points}
                fill="none"
                stroke={palette[k % palette.length]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={0.85}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {spectra.map((_, k) => (
          <span
            key={`leg-${k}`}
            className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono"
            style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-fg)" }}
          >
            <span className="inline-block rounded-full w-2 h-2" style={{ backgroundColor: palette[k % palette.length] }} />
            em{k}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnmixingTopicHeatmap({
  matrix,
  bestByTopic,
}: {
  matrix: number[][];
  bestByTopic: { topic_id: number; endmember_id: number; cosine: number }[];
}) {
  const N = matrix.length;
  const labelW = 36;
  const cell = 28;
  const W = labelW + N * cell + 8;
  const H = labelW + N * cell + 8;
  const colour = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2));
    const b = Math.round(255 * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Topic × endmember cosine similarity
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        Rows = LDA topic profiles φ<sub>k</sub>; columns = NFINDR endmember spectra. Cell ≈ cosine. Best matches are starred.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 720 }}>
          {Array.from({ length: N }).map((_, j) => (
            <text key={`c-${j}`} x={labelW + j * cell + cell / 2} y={labelW - 6} fontSize="9.5" textAnchor="middle" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              em{j}
            </text>
          ))}
          {Array.from({ length: N }).map((_, i) => (
            <text key={`r-${i}`} x={labelW - 4} y={labelW + i * cell + cell / 2 + 4} fontSize="9.5" textAnchor="end" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              t{i}
            </text>
          ))}
          {matrix.map((row, i) =>
            row.map((v, j) => {
              const isBest = bestByTopic.some((r) => r.topic_id === i && r.endmember_id === j);
              return (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cell} y={labelW + i * cell} width={cell - 1} height={cell - 1} fill={colour(v)} />
                  <text x={labelW + j * cell + cell / 2} y={labelW + i * cell + cell / 2 + 3} fontSize="9" textAnchor="middle" fill={v > 0.5 ? "white" : "currentColor"} opacity={v > 0.5 ? 1 : 0.7}>
                    {v.toFixed(2)}
                  </text>
                  {isBest ? (
                    <text x={labelW + j * cell + cell - 4} y={labelW + i * cell + 9} fontSize="9.5" textAnchor="end" fill={v > 0.5 ? "white" : "var(--color-accent)"}>★</text>
                  ) : null}
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

function UnmixingBestMatchTable({ rows }: { rows: { topic_id: number; endmember_id: number; cosine: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.cosine - a.cosine);
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Best endmember per topic (sorted by cosine)
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        For each LDA topic, the closest NFINDR endmember by cosine of its band-profile φ<sub>k</sub>. High cosine ⇒ topic captures a pure-pixel signature.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">topic</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">endmember</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">cosine</th>
              <th className="text-left font-mono text-[11px] pb-1">bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const norm = Math.max(0, Math.min(1, r.cosine));
              return (
                <tr key={`bm-${r.topic_id}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1 pr-3 font-mono">t{r.topic_id}</td>
                  <td className="py-1 pr-3 font-mono">em{r.endmember_id}</td>
                  <td className="py-1 pr-3 text-right font-mono">{r.cosine.toFixed(3)}</td>
                  <td className="py-1 w-[200px]">
                    <div className="w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${norm * 100}%`, backgroundColor: "var(--color-accent)" }} />
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
