/**
 * Interactive SVG plot primitives. No external chart library —
 * pure React + SVG so the bundle stays small and we own every
 * rendering decision (hover tooltip, click selection, brushing).
 *
 * Conventions:
 *   - All components accept width / height props and render inside
 *     a fixed viewbox.
 *   - Scales are computed inline (linear) — no d3.
 *   - Colour palette: a 16-entry categorical scale for topics /
 *     methods plus a sequential viridis-like for heatmaps.
 *   - Tooltip is a div absolutely-positioned over the plot wrapper.
 */
import { useMemo, useRef, useState } from "react";

// ----- shared palettes -----

export const CAT_PALETTE = [
  "#4f8fff", "#ff7e6e", "#5fce9b", "#dcb56b", "#ad7eff",
  "#6cc8d9", "#e85eaa", "#a4d76a", "#f0a060", "#7faaff",
  "#d96868", "#3eaa83", "#c8a042", "#9b6fd9", "#4eaab8",
];

export function topicColor(k: number): string {
  return CAT_PALETTE[k % CAT_PALETTE.length] ?? CAT_PALETTE[0]!;
}

// Sequential colour for heatmap [0, 1] → viridis-ish in dark theme
export function heatColor(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  // Custom dark-friendly ramp: blue → cyan → yellow → orange → red
  const stops = [
    [0.00, [16, 38, 76]],
    [0.25, [44, 110, 158]],
    [0.50, [102, 188, 168]],
    [0.75, [232, 200, 88]],
    [1.00, [240, 96, 64]],
  ] as const;
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]!;
    const [t1, c1] = stops[i + 1]!;
    if (v >= t0 && v <= t1) {
      const u = (v - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
      return `rgb(${r},${g},${b})`;
    }
  }
  return "#888";
}

interface Margin {
  t: number;
  r: number;
  b: number;
  l: number;
}

const M: Margin = { t: 12, r: 12, b: 28, l: 36 };

function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (x: number) => r0 + (x - d0) * k;
}

interface Tip {
  x: number;
  y: number;
  text: string;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="tt" style={{ left: tip.x + 10, top: tip.y + 8 }}>
      {tip.text}
    </div>
  );
}

/* ============================================================
 * 1. Scatter — interactive point cloud
 *    Used for: intertopic 2D MDS, theta PCA scatter, document embedding
 * ============================================================ */
export interface ScatterPoint {
  x: number;
  y: number;
  /** Categorical group id (drives colour) */
  g?: number;
  /** Optional label rendered next to the point */
  label?: string;
  /** Tooltip body */
  tip?: string;
  /** Radius in px (default 6) */
  r?: number;
}

export function Scatter({
  width = 520,
  height = 420,
  points,
  selected,
  onSelect,
  xLabel,
  yLabel,
  title,
  showLabels = false,
}: {
  width?: number;
  height?: number;
  points: ScatterPoint[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  xLabel?: string;
  yLabel?: string;
  title?: string;
  showLabels?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const { sx, sy } = useMemo(() => {
    if (points.length === 0) return { sx: () => 0, sy: () => 0 };
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.08 || 1;
    const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 1;
    const sx = linearScale([Math.min(...xs) - xPad, Math.max(...xs) + xPad], [M.l, width - M.r]);
    const sy = linearScale([Math.min(...ys) - yPad, Math.max(...ys) + yPad], [height - M.b, M.t]);
    return { sx, sy };
  }, [points, width, height]);

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* axes */}
        <g className="axis">
          <line x1={M.l} y1={height - M.b} x2={width - M.r} y2={height - M.b} />
          <line x1={M.l} y1={M.t} x2={M.l} y2={height - M.b} />
        </g>
        {/* points */}
        {points.map((p, i) => {
          const cx = sx(p.x);
          const cy = sy(p.y);
          const c = topicColor(p.g ?? 0);
          const isSel = selected === i;
          return (
            <g key={i}>
              <circle
                cx={cx}
                cy={cy}
                r={p.r ?? (isSel ? 9 : 6)}
                fill={c}
                fillOpacity={isSel ? 0.9 : 0.65}
                stroke={isSel ? "#fff" : "rgba(255,255,255,0.25)"}
                strokeWidth={isSel ? 1.5 : 0.8}
                style={{ cursor: onSelect ? "pointer" : "default" }}
                onMouseEnter={(e) => {
                  if (!wrapRef.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: p.tip ?? p.label ?? `(${p.x.toFixed(2)}, ${p.y.toFixed(2)})` });
                }}
                onMouseMove={(e) => {
                  if (!wrapRef.current || !tip) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: tip.text });
                }}
                onMouseLeave={() => setTip(null)}
                onClick={() => onSelect?.(i)}
              />
              {showLabels && p.label && (
                <text x={cx + 8} y={cy + 4} fill="var(--text-secondary)" fontSize={10}>
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        {xLabel && (
          <text x={width / 2} y={height - 4} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={height / 2} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11} transform={`rotate(-90, 10, ${height / 2})`}>
            {yLabel}
          </text>
        )}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================
 * 2. Heatmap — N×M matrix with hover + click cell
 *    Used for: cross-scene transfer 5×5, topic distance matrices,
 *              cross-method ARI/NMI, USGS chapter histogram
 * ============================================================ */
export function Heatmap({
  width = 520,
  height = 420,
  matrix,
  rowLabels,
  colLabels,
  title,
  cellRange,
  onCellClick,
  formatVal,
}: {
  width?: number;
  height?: number;
  matrix: number[][];
  rowLabels?: string[];
  colLabels?: string[];
  title?: string;
  cellRange?: [number, number];
  onCellClick?: (r: number, c: number, v: number) => void;
  formatVal?: (v: number) => string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const nR = matrix.length;
  const nC = matrix[0]?.length ?? 0;
  if (nR === 0 || nC === 0) return null;
  const left = M.l + 60;
  const top = M.t + 24;
  const right = width - M.r;
  const bottom = height - M.b - 24;
  const cw = (right - left) / nC;
  const ch = (bottom - top) / nR;
  const flat = matrix.flat().filter((v) => Number.isFinite(v));
  const [vmin, vmax] = cellRange ?? [Math.min(...flat), Math.max(...flat)];
  const norm = (v: number) => (vmax === vmin ? 0.5 : (v - vmin) / (vmax - vmin));
  const fmt = formatVal ?? ((v) => v.toFixed(3));

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        {matrix.map((row, r) =>
          row.map((v, c) => {
            const x = left + c * cw;
            const y = top + r * ch;
            const isFin = Number.isFinite(v);
            return (
              <g key={`${r}-${c}`}>
                <rect
                  x={x}
                  y={y}
                  width={cw - 1}
                  height={ch - 1}
                  fill={isFin ? heatColor(norm(v)) : "var(--bg-soft)"}
                  style={{ cursor: onCellClick ? "pointer" : "default" }}
                  onMouseEnter={(e) => {
                    if (!wrapRef.current) return;
                    const rect = wrapRef.current.getBoundingClientRect();
                    const rl = rowLabels?.[r] ?? `r${r}`;
                    const cl = colLabels?.[c] ?? `c${c}`;
                    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${rl} → ${cl}: ${isFin ? fmt(v) : "n/a"}` });
                  }}
                  onMouseMove={(e) => {
                    if (!wrapRef.current || !tip) return;
                    const rect = wrapRef.current.getBoundingClientRect();
                    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: tip.text });
                  }}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => onCellClick?.(r, c, v)}
                />
                {cw >= 36 && ch >= 22 && isFin && (
                  <text
                    x={x + cw / 2}
                    y={y + ch / 2 + 4}
                    textAnchor="middle"
                    fill={norm(v) > 0.55 ? "#0a0d12" : "#e6edf3"}
                    fontSize={Math.min(11, cw / 4.5)}
                  >
                    {fmt(v)}
                  </text>
                )}
              </g>
            );
          })
        )}
        {rowLabels?.map((rl, r) => (
          <text key={`rl-${r}`} x={left - 6} y={top + r * ch + ch / 2 + 4} textAnchor="end" fill="var(--text-tertiary)" fontSize={11}>
            {rl}
          </text>
        ))}
        {colLabels?.map((cl, c) => (
          <text
            key={`cl-${c}`}
            x={left + c * cw + cw / 2}
            y={top - 6}
            textAnchor="end"
            fill="var(--text-tertiary)"
            fontSize={11}
            transform={`rotate(-30, ${left + c * cw + cw / 2}, ${top - 6})`}
          >
            {cl}
          </text>
        ))}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================
 * 3. Line plot — multi-series curves
 *    Used for: rate-distortion K → RMSE (one line per method),
 *              lda_sweep K → perplexity / NPMI / stability
 * ============================================================ */
export function MultiLine({
  width = 520,
  height = 360,
  series,
  xLabel,
  yLabel,
  title,
}: {
  width?: number;
  height?: number;
  series: { name: string; color?: string; points: { x: number; y: number }[] }[];
  xLabel?: string;
  yLabel?: string;
  title?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const allPts = series.flatMap((s) => s.points);
  if (allPts.length === 0) return null;
  const xs = allPts.map((p) => p.x);
  const ys = allPts.map((p) => p.y);
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.04 || 1;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.08 || 0.05;
  const sx = linearScale([Math.min(...xs) - xPad, Math.max(...xs) + xPad], [M.l + 8, width - M.r]);
  const sy = linearScale([Math.min(...ys) - yPad, Math.max(...ys) + yPad], [height - M.b, M.t]);

  // Y-axis ticks (5)
  const yTicks = 5;
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const ticks = Array.from({ length: yTicks }, (_, i) => ymin + (i / (yTicks - 1)) * (ymax - ymin));

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        {/* y grid */}
        <g className="grid">
          {ticks.map((t, i) => (
            <line key={i} x1={M.l + 8} y1={sy(t)} x2={width - M.r} y2={sy(t)} />
          ))}
        </g>
        {/* y axis ticks */}
        <g className="axis">
          {ticks.map((t, i) => (
            <text key={i} x={M.l + 4} y={sy(t) + 3} textAnchor="end" fontSize={10}>
              {Math.abs(t) >= 100 ? t.toFixed(0) : t.toFixed(2)}
            </text>
          ))}
        </g>
        {/* lines */}
        {series.map((s, i) => {
          const c = s.color ?? CAT_PALETTE[i % CAT_PALETTE.length];
          const path = s.points.map((p, j) => `${j === 0 ? "M" : "L"} ${sx(p.x)} ${sy(p.y)}`).join(" ");
          return (
            <g key={s.name}>
              <path d={path} stroke={c} strokeWidth={2} fill="none" />
              {s.points.map((p, j) => (
                <circle
                  key={j}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={4}
                  fill={c}
                  stroke="var(--bg-card)"
                  strokeWidth={1}
                  onMouseEnter={(e) => {
                    if (!wrapRef.current) return;
                    const rect = wrapRef.current.getBoundingClientRect();
                    setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${s.name}: ${p.x} → ${p.y.toFixed(4)}` });
                  }}
                  onMouseLeave={() => setTip(null)}
                />
              ))}
            </g>
          );
        })}
        {/* x ticks */}
        <g className="axis">
          {[...new Set(allPts.map((p) => p.x))].slice(0, 12).map((xv, i) => (
            <text key={i} x={sx(xv)} y={height - M.b + 14} textAnchor="middle" fontSize={10}>
              {xv}
            </text>
          ))}
        </g>
        {xLabel && (
          <text x={width / 2} y={height - 4} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11}>
            {xLabel}
          </text>
        )}
        {yLabel && (
          <text x={10} y={height / 2} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11} transform={`rotate(-90, 10, ${height / 2})`}>
            {yLabel}
          </text>
        )}
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.name}>
            <i style={{ background: s.color ?? CAT_PALETTE[i % CAT_PALETTE.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================
 * 4. Bar with CI95 — methods × macro F1 with whiskers
 *    Used for: linear probe panel, topic-routed classifier,
 *              embedded baseline
 * ============================================================ */
export function BarWithCI({
  width = 520,
  height = 360,
  bars,
  title,
  xLabel,
  yLabel,
  highlight,
}: {
  width?: number;
  height?: number;
  bars: { name: string; mean: number; lo?: number; hi?: number; color?: string }[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  highlight?: string;
}) {
  if (bars.length === 0) return null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const left = M.l + 60;
  const right = width - M.r;
  const top = M.t;
  const bottom = height - M.b - 30;
  const w = (right - left) / bars.length;
  const lows = bars.map((b) => b.lo ?? b.mean);
  const highs = bars.map((b) => b.hi ?? b.mean);
  const ymin = Math.min(0, Math.min(...lows));
  const ymax = Math.max(...highs) * 1.05;
  const sy = linearScale([ymin, ymax], [bottom, top]);

  const yTicks = Array.from({ length: 5 }, (_, i) => ymin + (i / 4) * (ymax - ymin));

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        <g className="grid">
          {yTicks.map((t, i) => (
            <line key={i} x1={left} y1={sy(t)} x2={right} y2={sy(t)} />
          ))}
        </g>
        <g className="axis">
          {yTicks.map((t, i) => (
            <text key={i} x={left - 6} y={sy(t) + 3} textAnchor="end" fontSize={10}>
              {t.toFixed(2)}
            </text>
          ))}
        </g>
        {bars.map((b, i) => {
          const x = left + i * w + 6;
          const bw = w - 12;
          const c = b.color ?? (b.name === highlight ? "#f0a060" : CAT_PALETTE[i % CAT_PALETTE.length]);
          return (
            <g key={b.name}>
              <rect
                x={x}
                y={sy(Math.max(0, b.mean))}
                width={bw}
                height={Math.max(0, sy(0) - sy(Math.max(0, b.mean)))}
                fill={c}
                fillOpacity={b.name === highlight ? 1 : 0.85}
                stroke="rgba(255,255,255,0.15)"
                onMouseEnter={(e) => {
                  if (!wrapRef.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${b.name}: ${b.mean.toFixed(3)} [${(b.lo ?? b.mean).toFixed(3)}, ${(b.hi ?? b.mean).toFixed(3)}]` });
                }}
                onMouseLeave={() => setTip(null)}
              />
              {b.lo != null && b.hi != null && (
                <g stroke={c} strokeWidth={1.5}>
                  <line x1={x + bw / 2} y1={sy(b.lo)} x2={x + bw / 2} y2={sy(b.hi)} />
                  <line x1={x + bw / 2 - 4} y1={sy(b.lo)} x2={x + bw / 2 + 4} y2={sy(b.lo)} />
                  <line x1={x + bw / 2 - 4} y1={sy(b.hi)} x2={x + bw / 2 + 4} y2={sy(b.hi)} />
                </g>
              )}
              <text
                x={x + bw / 2}
                y={bottom + 14}
                textAnchor="end"
                fill="var(--text-secondary)"
                fontSize={10}
                transform={`rotate(-30, ${x + bw / 2}, ${bottom + 14})`}
              >
                {b.name.length > 18 ? b.name.slice(0, 17) + "…" : b.name}
              </text>
            </g>
          );
        })}
        {xLabel && <text x={width / 2} y={height - 4} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11}>{xLabel}</text>}
        {yLabel && <text x={10} y={height / 2} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11} transform={`rotate(-90, 10, ${height / 2})`}>{yLabel}</text>}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================
 * 5. Forest plot — posterior mean + HDI94 per method
 *    Used for: Bayesian classification posterior on labelled scenes
 * ============================================================ */
export function ForestPlot({
  width = 520,
  height = 320,
  rows,
  title,
  xLabel,
}: {
  width?: number;
  height?: number;
  rows: { name: string; mean: number; lo: number; hi: number; color?: string }[];
  title?: string;
  xLabel?: string;
}) {
  if (rows.length === 0) return null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const left = M.l + 130;
  const right = width - M.r;
  const top = M.t + 8;
  const bottom = height - M.b;
  const rh = (bottom - top) / rows.length;
  const xs = rows.flatMap((r) => [r.lo, r.hi]);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const sx = linearScale([xmin - 0.04, xmax + 0.04], [left, right]);
  const ticks = Array.from({ length: 5 }, (_, i) => xmin + (i / 4) * (xmax - xmin));

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        <g className="grid">
          {ticks.map((t, i) => (
            <line key={i} x1={sx(t)} y1={top} x2={sx(t)} y2={bottom} />
          ))}
        </g>
        <g className="axis">
          {ticks.map((t, i) => (
            <text key={i} x={sx(t)} y={bottom + 14} textAnchor="middle" fontSize={10}>
              {t.toFixed(2)}
            </text>
          ))}
        </g>
        {rows.map((r, i) => {
          const y = top + i * rh + rh / 2;
          const c = r.color ?? CAT_PALETTE[i % CAT_PALETTE.length];
          return (
            <g key={r.name}>
              <text x={left - 8} y={y + 4} textAnchor="end" fill="var(--text-secondary)" fontSize={11}>
                {r.name}
              </text>
              <line x1={sx(r.lo)} y1={y} x2={sx(r.hi)} y2={y} stroke={c} strokeWidth={2} />
              <line x1={sx(r.lo)} y1={y - 5} x2={sx(r.lo)} y2={y + 5} stroke={c} strokeWidth={1.5} />
              <line x1={sx(r.hi)} y1={y - 5} x2={sx(r.hi)} y2={y + 5} stroke={c} strokeWidth={1.5} />
              <circle cx={sx(r.mean)} cy={y} r={6} fill={c}
                onMouseEnter={(e) => {
                  if (!wrapRef.current) return;
                  const rect = wrapRef.current.getBoundingClientRect();
                  setTip({ x: e.clientX - rect.left, y: e.clientY - rect.top, text: `${r.name}: μ=${r.mean.toFixed(3)} HDI94=[${r.lo.toFixed(3)}, ${r.hi.toFixed(3)}]` });
                }}
                onMouseLeave={() => setTip(null)} />
            </g>
          );
        })}
        {xLabel && <text x={(left + right) / 2} y={height - 4} textAnchor="middle" fill="var(--text-tertiary)" fontSize={11}>{xLabel}</text>}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/* ============================================================
 * 6. Spectral plot — line + percentile band
 *    Used for: per-class mean spectra with p25/p75 envelope,
 *              per-topic band profile
 * ============================================================ */
export function SpectralPlot({
  width = 540,
  height = 320,
  wavelengths,
  series,
  title,
  yLabel,
}: {
  width?: number;
  height?: number;
  wavelengths: number[];
  series: { name: string; color?: string; mean: number[]; band?: { lo: number[]; hi: number[] } }[];
  title?: string;
  yLabel?: string;
}) {
  if (wavelengths.length === 0 || series.length === 0) return null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const allValues = series.flatMap((s) => [...s.mean, ...(s.band?.lo ?? []), ...(s.band?.hi ?? [])]);
  const ymin = Math.min(...allValues);
  const ymax = Math.max(...allValues);
  const sx = linearScale([wavelengths[0]!, wavelengths[wavelengths.length - 1]!], [M.l + 8, width - M.r]);
  const sy = linearScale([ymin, ymax * 1.05], [height - M.b, M.t]);
  const yTicks = Array.from({ length: 5 }, (_, i) => ymin + (i / 4) * (ymax - ymin));

  return (
    <div ref={wrapRef} className="plot">
      {title && <h4>{title}</h4>}
      <svg width={width} height={height} style={{ display: "block" }}>
        <g className="grid">
          {yTicks.map((t, i) => (
            <line key={i} x1={M.l + 8} y1={sy(t)} x2={width - M.r} y2={sy(t)} />
          ))}
        </g>
        <g className="axis">
          {yTicks.map((t, i) => (
            <text key={i} x={M.l + 4} y={sy(t) + 3} textAnchor="end" fontSize={10}>
              {Math.abs(t) >= 1000 ? t.toFixed(0) : t.toFixed(3)}
            </text>
          ))}
          {[wavelengths[0]!, wavelengths[Math.floor(wavelengths.length / 4)]!, wavelengths[Math.floor(wavelengths.length / 2)]!, wavelengths[Math.floor((3 * wavelengths.length) / 4)]!, wavelengths[wavelengths.length - 1]!].map((w, i) => (
            <text key={`x-${i}`} x={sx(w)} y={height - M.b + 14} textAnchor="middle" fontSize={10}>
              {w?.toFixed(0)} nm
            </text>
          ))}
        </g>
        {series.map((s, idx) => {
          const c = s.color ?? CAT_PALETTE[idx % CAT_PALETTE.length];
          const meanPath = s.mean.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(wavelengths[i]!)} ${sy(v)}`).join(" ");
          let bandPath = "";
          if (s.band) {
            const top = s.band.hi.map((v, i) => `${i === 0 ? "M" : "L"} ${sx(wavelengths[i]!)} ${sy(v)}`).join(" ");
            const bot = s.band.lo.map((v, i) => `L ${sx(wavelengths[s.band!.lo.length - 1 - i]!)} ${sy(s.band!.lo[s.band!.lo.length - 1 - i]!)}`).join(" ");
            bandPath = `${top} ${bot} Z`;
          }
          return (
            <g key={s.name}>
              {bandPath && <path d={bandPath} fill={c} fillOpacity={0.18} />}
              <path d={meanPath} stroke={c} strokeWidth={1.6} fill="none" />
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s, i) => (
          <span key={s.name}>
            <i style={{ background: s.color ?? CAT_PALETTE[i % CAT_PALETTE.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      {yLabel && <p className="sub" style={{ marginTop: 8 }}>{yLabel}</p>}
    </div>
  );
}

/* ============================================================
 * 7. Raster map — H × W uint8 sentinel-aware spatial heatmap
 *    Used for: dominant_topic_map binary stream
 * ============================================================ */
export function RasterMap({
  width = 480,
  height = 480,
  data,
  shape,
  sentinel,
  K,
  title,
  onPixel,
}: {
  width?: number;
  height?: number;
  data: Uint8Array;
  shape: [number, number];
  sentinel: number;
  K: number;
  title?: string;
  onPixel?: (r: number, c: number, v: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [H, W] = shape;
  // Build canvas image data
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useMemo(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const v = data[i] ?? sentinel;
      let r = 20, g = 25, b = 35;
      if (v !== sentinel) {
        const colorStr = topicColor(v);
        const m = colorStr.match(/#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
        if (m) {
          r = parseInt(m[1]!, 16);
          g = parseInt(m[2]!, 16);
          b = parseInt(m[3]!, 16);
        }
      }
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = v === sentinel ? 0 : 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [data, W, H, sentinel]);

  const aspect = W / H;
  const targetW = aspect >= 1 ? width : Math.round(height * aspect);
  const targetH = aspect >= 1 ? Math.round(width / aspect) : height;

  return (
    <div ref={wrapRef} className="plot" style={{ position: "relative" }}>
      {title && <h4>{title}</h4>}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <canvas
          ref={canvasRef}
          style={{
            width: targetW,
            height: targetH,
            imageRendering: "pixelated",
            background: "var(--bg-soft)",
            border: "1px solid var(--border-soft)",
            borderRadius: "var(--radius-sm)",
            cursor: onPixel ? "crosshair" : "default",
          }}
          onClick={(e) => {
            if (!onPixel || !canvasRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            const cx = Math.floor(((e.clientX - rect.left) / rect.width) * W);
            const cy = Math.floor(((e.clientY - rect.top) / rect.height) * H);
            onPixel(cy, cx, data[cy * W + cx] ?? sentinel);
          }}
        />
        <div className="legend" style={{ flexDirection: "column", gap: 4, fontSize: 11 }}>
          <span style={{ color: "var(--text-tertiary)" }}>topic</span>
          {Array.from({ length: K }, (_, k) => (
            <span key={k}>
              <i style={{ background: topicColor(k) }} />
              {k + 1}
            </span>
          ))}
          <span><i style={{ background: "var(--bg-soft)", border: "1px solid var(--border-mid)" }} />unlabelled</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * 8. Stacked bar — one row, segments adding up to 1.0
 *    Used for: USGS chapter histogram per-topic, class distribution per-topic
 * ============================================================ */
export function StackedBar({
  width = 520,
  height = 28,
  segments,
  title,
}: {
  width?: number;
  height?: number;
  segments: { label: string; value: number; color?: string }[];
  title?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;
  let acc = 0;
  return (
    <div className="plot" style={{ padding: "10px 14px" }}>
      {title && <h4 style={{ marginBottom: 8 }}>{title}</h4>}
      <svg width={width} height={height + 28}>
        {segments.map((s, i) => {
          const w = (s.value / total) * width;
          const x = acc;
          acc += w;
          return (
            <g key={s.label}>
              <rect x={x} y={4} width={w} height={height} fill={s.color ?? CAT_PALETTE[i % CAT_PALETTE.length]} />
              {w > 36 && (
                <text x={x + w / 2} y={4 + height / 2 + 4} textAnchor="middle" fill="#0a0d12" fontSize={11} fontWeight={600}>
                  {s.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {segments.map((s, i) => (
          <span key={s.label}>
            <i style={{ background: s.color ?? CAT_PALETTE[i % CAT_PALETTE.length] }} />
            {s.label} ({((s.value / total) * 100).toFixed(0)}%)
          </span>
        ))}
      </div>
    </div>
  );
}
