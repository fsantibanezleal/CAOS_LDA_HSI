import { useMemo, useState } from "react";

/**
 * Self-contained SVG visualisation primitives. Theme-aware via
 * currentColor and CSS variables. No external chart deps.
 */

const PALETTE = [
  "#5b8def",
  "#f0b86d",
  "#6dd4a0",
  "#ef6f6c",
  "#9b88ff",
  "#5fd0d6",
  "#ffb1c4",
  "#a3c47a",
  "#e09f55",
  "#7d8ce3",
  "#c878d4",
  "#5fb389"
];

export function colorAt(index: number): string {
  return PALETTE[index % PALETTE.length];
}

interface LineSeries {
  id: string;
  label: string;
  values: number[];
  color?: string;
}

interface LineChartProps {
  xValues?: number[];
  series: LineSeries[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  highlightId?: string | null;
  onHighlight?: (id: string | null) => void;
}

export function LineChart({
  xValues,
  series,
  xLabel,
  yLabel,
  height = 220,
  highlightId,
  onHighlight
}: LineChartProps) {
  const width = 720;
  const padding = { top: 14, right: 16, bottom: 32, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const xLen = Math.max(...series.map((s) => s.values.length));
  const xs = xValues ?? Array.from({ length: xLen }, (_, i) => i);
  const xMin = xs[0] ?? 0;
  const xMax = xs[xs.length - 1] ?? 1;

  const scaleX = (i: number) => {
    if (xMax === xMin) return padding.left;
    const x = xs[i] ?? i;
    return padding.left + ((x - xMin) / (xMax - xMin)) * innerW;
  };
  const scaleY = (v: number) => {
    if (yMax === yMin) return padding.top + innerH / 2;
    return padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  };

  const yTicks = 4;
  const xTicks = 5;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="viz-svg"
      role="img"
      aria-label="line chart"
    >
      {/* Grid */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const v = yMin + ((yMax - yMin) * i) / yTicks;
        const y = scaleY(v);
        return (
          <g key={`y-${i}`}>
            <line
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              className="viz-grid"
            />
            <text x={padding.left - 6} y={y + 3} className="viz-axis-label" textAnchor="end">
              {formatNumber(v)}
            </text>
          </g>
        );
      })}
      {Array.from({ length: xTicks + 1 }, (_, i) => {
        const t = xMin + ((xMax - xMin) * i) / xTicks;
        const x = scaleX(Math.round(((xs.length - 1) * i) / xTicks));
        return (
          <g key={`x-${i}`}>
            <text
              x={x}
              y={height - padding.bottom + 14}
              className="viz-axis-label"
              textAnchor="middle"
            >
              {formatNumber(t, 0)}
            </text>
          </g>
        );
      })}

      {/* Axis labels */}
      {xLabel && (
        <text
          x={padding.left + innerW / 2}
          y={height - 4}
          className="viz-axis-title"
          textAnchor="middle"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={12}
          y={padding.top + innerH / 2}
          className="viz-axis-title"
          textAnchor="middle"
          transform={`rotate(-90 12 ${padding.top + innerH / 2})`}
        >
          {yLabel}
        </text>
      )}

      {/* Lines */}
      {series.map((s, idx) => {
        const color = s.color ?? colorAt(idx);
        const isHighlighted = highlightId === null || highlightId === undefined || highlightId === s.id;
        const opacity = isHighlighted ? 1 : 0.18;
        const strokeWidth = highlightId === s.id ? 2.4 : 1.4;
        const path = s.values
          .map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(1)} ${scaleY(v).toFixed(1)}`)
          .join(" ");
        return (
          <path
            key={s.id}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            opacity={opacity}
            onMouseEnter={() => onHighlight?.(s.id)}
            onMouseLeave={() => onHighlight?.(null)}
            style={{ cursor: onHighlight ? "pointer" : "default" }}
          />
        );
      })}
    </svg>
  );
}

interface BarItem {
  id: string;
  label: string;
  value: number;
  detail?: string;
  color?: string;
}

interface HorizontalBarsProps {
  items: BarItem[];
  formatter?: (v: number) => string;
  maxRows?: number;
  emphasizeIndex?: number | null;
}

export function HorizontalBars({
  items,
  formatter,
  maxRows,
  emphasizeIndex
}: HorizontalBarsProps) {
  const visible = maxRows ? items.slice(0, maxRows) : items;
  const max = Math.max(...visible.map((i) => i.value), 0.0001);
  const fmt = formatter ?? ((v: number) => v.toFixed(3));

  return (
    <div className="viz-bars">
      {visible.map((item, idx) => (
        <div
          key={item.id}
          className={
            emphasizeIndex === idx
              ? "viz-bar-row viz-bar-row-emphasis"
              : "viz-bar-row"
          }
        >
          <span className="viz-bar-label" title={item.label}>
            {item.label}
          </span>
          <div className="viz-bar-track">
            <span
              className="viz-bar-fill"
              style={{
                width: `${Math.max((item.value / max) * 100, 2)}%`,
                background: item.color ?? "var(--accent)"
              }}
            />
          </div>
          <span className="viz-bar-value">{fmt(item.value)}</span>
          {item.detail && <span className="viz-bar-detail">{item.detail}</span>}
        </div>
      ))}
    </div>
  );
}

interface HeatmapProps {
  matrix: number[][];
  rowLabels: string[];
  colLabels: string[];
  vmin?: number;
  vmax?: number;
  rowTitle?: string;
  colTitle?: string;
  formatter?: (v: number) => string;
}

export function Heatmap({
  matrix,
  rowLabels,
  colLabels,
  vmin,
  vmax,
  rowTitle,
  colTitle,
  formatter
}: HeatmapProps) {
  const flat = matrix.flat();
  const min = vmin ?? Math.min(...flat);
  const max = vmax ?? Math.max(...flat);
  const fmt = formatter ?? ((v: number) => v.toFixed(2));
  const colorFor = (v: number) => {
    if (max === min) return "rgba(91,141,239,0.3)";
    const t = (v - min) / (max - min);
    // Linear ramp: low = surface, high = accent
    const alpha = 0.12 + t * 0.78;
    return `rgba(91, 141, 239, ${alpha.toFixed(3)})`;
  };

  return (
    <div className="viz-heatmap-wrap">
      <table className="viz-heatmap" role="img" aria-label="heatmap">
        <thead>
          <tr>
            <th aria-hidden="true">{rowTitle ?? ""}</th>
            {colLabels.map((c, ci) => (
              <th key={ci} className="viz-heatmap-col">
                <span title={c}>{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, ri) => (
            <tr key={ri}>
              <th className="viz-heatmap-row" title={rowLabels[ri]}>
                {rowLabels[ri]}
              </th>
              {row.map((v, ci) => (
                <td
                  key={ci}
                  className="viz-heatmap-cell"
                  style={{ background: colorFor(v) }}
                  title={`${rowLabels[ri]} × ${colLabels[ci]} = ${fmt(v)}`}
                >
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {colTitle && <p className="viz-heatmap-col-title">{colTitle}</p>}
    </div>
  );
}

interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  cluster?: number;
  size?: number;
}

interface ScatterPlotProps {
  points: ScatterPoint[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
}

export function ScatterPlot({ points, xLabel, yLabel, height = 320 }: ScatterPlotProps) {
  const [hover, setHover] = useState<string | null>(null);
  const width = 560;
  const padding = { top: 12, right: 16, bottom: 32, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const sizes = points.map((p) => p.size ?? 1);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const sMin = Math.min(...sizes);
  const sMax = Math.max(...sizes, sMin + 1);

  const scaleX = (v: number) =>
    xMax === xMin
      ? padding.left + innerW / 2
      : padding.left + ((v - xMin) / (xMax - xMin)) * innerW;
  const scaleY = (v: number) =>
    yMax === yMin
      ? padding.top + innerH / 2
      : padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const scaleR = (s: number) => 4 + ((s - sMin) / (sMax - sMin)) * 10;

  const hovered = points.find((p) => p.id === hover);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="viz-svg" role="img" aria-label="scatter plot">
      {/* Cross at origin if axes contain 0 */}
      {xMin <= 0 && xMax >= 0 && (
        <line
          x1={scaleX(0)}
          x2={scaleX(0)}
          y1={padding.top}
          y2={height - padding.bottom}
          className="viz-grid"
        />
      )}
      {yMin <= 0 && yMax >= 0 && (
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={scaleY(0)}
          y2={scaleY(0)}
          className="viz-grid"
        />
      )}

      {/* Points */}
      {points.map((p) => {
        const cx = scaleX(p.x);
        const cy = scaleY(p.y);
        const r = scaleR(p.size ?? 1);
        const fill = colorAt(p.cluster ?? 0);
        const isHover = hover === p.id;
        return (
          <circle
            key={p.id}
            cx={cx}
            cy={cy}
            r={r}
            fill={fill}
            opacity={hover === null ? 0.85 : isHover ? 1 : 0.35}
            stroke={isHover ? "#ffffff" : "transparent"}
            strokeWidth={1.2}
            style={{ cursor: "pointer" }}
            onMouseEnter={() => setHover(p.id)}
            onMouseLeave={() => setHover(null)}
          >
            <title>{`${p.label} · cluster ${p.cluster ?? "—"} · (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`}</title>
          </circle>
        );
      })}

      {hovered && (
        <g pointerEvents="none">
          <rect
            x={Math.min(scaleX(hovered.x) + 10, width - 200)}
            y={Math.max(scaleY(hovered.y) - 32, padding.top)}
            width={190}
            height={28}
            rx={4}
            className="viz-tooltip-bg"
          />
          <text
            x={Math.min(scaleX(hovered.x) + 18, width - 192)}
            y={Math.max(scaleY(hovered.y) - 14, padding.top + 18)}
            className="viz-tooltip"
          >
            {hovered.label}
          </text>
        </g>
      )}

      {/* Axis labels */}
      {xLabel && (
        <text
          x={padding.left + innerW / 2}
          y={height - 6}
          className="viz-axis-title"
          textAnchor="middle"
        >
          {xLabel}
        </text>
      )}
      {yLabel && (
        <text
          x={12}
          y={padding.top + innerH / 2}
          className="viz-axis-title"
          textAnchor="middle"
          transform={`rotate(-90 12 ${padding.top + innerH / 2})`}
        >
          {yLabel}
        </text>
      )}
    </svg>
  );
}

interface ScenePreviewProps {
  src: string;
  alt: string;
  caption?: string;
}

export function ScenePreview({ src, alt, caption }: ScenePreviewProps) {
  return (
    <figure className="viz-preview">
      <img src={src} alt={alt} loading="lazy" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

interface PreviewSwitcherProps {
  layers: Array<{ id: string; label: string; src: string; alt: string }>;
  initial?: string;
}

export function PreviewSwitcher({ layers, initial }: PreviewSwitcherProps) {
  const [active, setActive] = useState(initial ?? layers[0]?.id ?? "");
  const current = layers.find((l) => l.id === active) ?? layers[0];
  if (!current) return null;
  return (
    <div className="viz-preview-switch">
      <div className="viz-preview-switch-row" role="tablist">
        {layers.map((l) => (
          <button
            key={l.id}
            type="button"
            className={
              l.id === active ? "viz-switch-pill is-active" : "viz-switch-pill"
            }
            onClick={() => setActive(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <ScenePreview src={current.src} alt={current.alt} caption={current.label} />
    </div>
  );
}

interface LegendItem {
  label: string;
  color: string;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="viz-legend">
      {items.map((it, idx) => (
        <li key={`${it.label}-${idx}`}>
          <span className="viz-legend-swatch" style={{ background: it.color }} />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

interface ProgressGaugeProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
}

export function ProgressGauge({ value, min = 0, max = 1, label }: ProgressGaugeProps) {
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const ring = useMemo(() => {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    return { radius, circumference, strokeDashoffset: circumference * (1 - pct) };
  }, [pct]);

  return (
    <div className="viz-gauge">
      <svg viewBox="0 0 100 100" width="96" height="96">
        <circle
          cx="50"
          cy="50"
          r={ring.radius}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r={ring.radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeDasharray={ring.circumference}
          strokeDashoffset={ring.strokeDashoffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: "stroke-dashoffset 220ms ease" }}
        />
        <text
          x="50"
          y="56"
          textAnchor="middle"
          className="viz-gauge-value"
        >
          {value.toFixed(2)}
        </text>
      </svg>
      {label && <span className="viz-gauge-label">{label}</span>}
    </div>
  );
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(digits === 0 ? 0 : 1);
  return value.toFixed(digits);
}
