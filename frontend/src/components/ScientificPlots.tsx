import { useMemo, useState } from "react";

export interface PlotSeries {
  id: string;
  label: string;
  values: number[];
  color: string;
}

export interface HeatmapColumn {
  id: string;
  label: string;
}

export interface HeatmapRow {
  id: string;
  label: string;
  values: number[];
}

export interface RankedBarDatum {
  id: string;
  label: string;
  value: number;
  detail?: string;
  color?: string;
}

export interface ScatterPoint {
  id: string;
  label: string;
  group: string;
  x: number;
  y: number;
  size: number;
  cluster: number;
}

const scatterPalette = ["#0f766e", "#b45309", "#be123c", "#1d4ed8", "#7c2d12", "#4d7c0f", "#6d28d9", "#475569"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatTick(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 100) {
    return Math.round(value).toString();
  }
  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }
  return value.toFixed(2);
}

function interpolateColor(value: number, min: number, max: number): string {
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : 1;
  const ratio = clamp((value - safeMin) / ((safeMax - safeMin) || 1), 0, 1);
  const hue = 210 - ratio * 150;
  const saturation = 72;
  const lightness = 18 + ratio * 46;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

export function InteractiveLinePlot({
  xValues,
  series,
  xLabel,
  yLabel,
  height = 300,
  selectedSeriesId = null,
  onSeriesSelect
}: {
  xValues: number[];
  series: PlotSeries[];
  xLabel: string;
  yLabel: string;
  height?: number;
  selectedSeriesId?: string | null;
  onSeriesSelect?: (id: string) => void;
}) {
  const usableSeries = useMemo(() => series.filter((entry) => entry.values.length > 1), [series]);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (usableSeries.length === 0) {
    return null;
  }

  const chartWidth = 940;
  const top = 24;
  const right = 22;
  const bottom = 48;
  const left = 58;
  const plotWidth = chartWidth - left - right;
  const plotHeight = height - top - bottom;
  const axisValues = xValues.length > 1 ? xValues : usableSeries[0].values.map((_, index) => index + 1);
  const xMin = Math.min(...axisValues);
  const xMax = Math.max(...axisValues);
  const allValues = usableSeries.flatMap((entry) => entry.values);
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPad = Math.max((yMax - yMin) * 0.08, 0.02);
  const yLow = yMin - yPad;
  const yHigh = yMax + yPad;
  const xRange = xMax - xMin || 1;
  const yRange = yHigh - yLow || 1;
  const xScale = (value: number) => left + ((value - xMin) / xRange) * plotWidth;
  const yScale = (value: number) => top + (1 - (value - yLow) / yRange) * plotHeight;
  const xTicks = [xMin, xMin + xRange * 0.25, xMin + xRange * 0.5, xMin + xRange * 0.75, xMax];
  const yTicks = [yLow, yLow + yRange * 0.25, yLow + yRange * 0.5, yLow + yRange * 0.75, yHigh];

  const nearestIndex = (target: number) => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    axisValues.forEach((entry, index) => {
      const distance = Math.abs(entry - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  const hoverValue = hoverIndex === null ? null : axisValues[Math.min(hoverIndex, axisValues.length - 1)];

  return (
    <div className="plot-shell">
      <svg
        className="plot-svg"
        viewBox={`0 0 ${chartWidth} ${height}`}
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const ratio = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
          const value = xMin + ratio * xRange;
          setHoverIndex(nearestIndex(value));
        }}
      >
        <rect className="plot-frame" x="0.5" y="0.5" width={chartWidth - 1} height={height - 1} rx="3" />
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`y-${tick}`}>
              <line className="plot-grid" x1={left} x2={chartWidth - right} y1={y} y2={y} />
              <text className="plot-axis-label" x={left - 10} y={y + 4} textAnchor="end">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        {xTicks.map((tick) => {
          const x = xScale(tick);
          return (
            <g key={`x-${tick}`}>
              <line className="plot-grid vertical" x1={x} x2={x} y1={top} y2={height - bottom} />
              <text className="plot-axis-label" x={x} y={height - 16} textAnchor="middle">
                {formatTick(tick)}
              </text>
            </g>
          );
        })}
        <line className="plot-axis" x1={left} x2={chartWidth - right} y1={height - bottom} y2={height - bottom} />
        <line className="plot-axis" x1={left} x2={left} y1={top} y2={height - bottom} />
        <text className="plot-axis-title" x={left + plotWidth / 2} y={height - 4} textAnchor="middle">
          {xLabel}
        </text>
        <text className="plot-axis-title" transform={`translate(14 ${top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">
          {yLabel}
        </text>
        {usableSeries.map((entry) => {
          const path = entry.values
            .map((value, index) => {
              const x = xScale(axisValues[Math.min(index, axisValues.length - 1)]);
              const y = yScale(value);
              return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
            })
            .join(" ");
          const emphasized = selectedSeriesId === null || selectedSeriesId === entry.id;
          return (
            <path
              key={entry.id}
              className={emphasized ? "plot-line is-emphasized" : "plot-line"}
              d={path}
              stroke={entry.color}
              strokeWidth={emphasized ? 2.6 : 1.35}
              opacity={emphasized ? 1 : 0.34}
            />
          );
        })}
        {hoverIndex !== null ? (
          <line
            className="plot-crosshair"
            x1={xScale(axisValues[Math.min(hoverIndex, axisValues.length - 1)])}
            x2={xScale(axisValues[Math.min(hoverIndex, axisValues.length - 1)])}
            y1={top}
            y2={height - bottom}
          />
        ) : null}
        {hoverIndex !== null
          ? usableSeries.map((entry) => {
              const x = xScale(axisValues[Math.min(hoverIndex, axisValues.length - 1)]);
              const y = yScale(entry.values[Math.min(hoverIndex, entry.values.length - 1)]);
              const emphasized = selectedSeriesId === null || selectedSeriesId === entry.id;
              return (
                <circle
                  key={`${entry.id}-hover`}
                  cx={x}
                  cy={y}
                  r={emphasized ? 4.5 : 3.2}
                  fill={entry.color}
                  opacity={emphasized ? 1 : 0.55}
                />
              );
            })
          : null}
      </svg>

      <div className="plot-legend">
        {usableSeries.map((entry) => {
          const active = selectedSeriesId === null || selectedSeriesId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              className={active ? "plot-legend-item is-active" : "plot-legend-item"}
              onClick={() => onSeriesSelect?.(entry.id)}
            >
              <i style={{ background: entry.color }} />
              <span>{entry.label}</span>
            </button>
          );
        })}
      </div>

      <div className="plot-readout">
        <div>
          <strong>{hoverValue === null ? "cursor" : xLabel}</strong>
          <span>{hoverValue === null ? "move over chart" : formatTick(hoverValue)}</span>
        </div>
        {usableSeries.map((entry) => {
          const value = hoverIndex === null ? entry.values[entry.values.length - 1] : entry.values[Math.min(hoverIndex, entry.values.length - 1)];
          const active = selectedSeriesId === null || selectedSeriesId === entry.id;
          return (
            <div key={entry.id} className={active ? "is-active" : ""}>
              <strong>{entry.label}</strong>
              <span>{formatTick(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InteractiveHeatmap({
  columns,
  rows,
  selectedRowId = null,
  onRowSelect,
  formatter = (value: number) => value.toFixed(3)
}: {
  columns: HeatmapColumn[];
  rows: HeatmapRow[];
  selectedRowId?: string | null;
  onRowSelect?: (id: string) => void;
  formatter?: (value: number) => string;
}) {
  const [hoverCell, setHoverCell] = useState<{ rowId: string; columnId: string; value: number } | null>(null);
  const cellValues = rows.flatMap((row) => row.values);
  const minValue = Math.min(...cellValues, 0);
  const maxValue = Math.max(...cellValues, 1);
  const cellWidth = 58;
  const cellHeight = 36;
  const labelWidth = 190;
  const width = labelWidth + columns.length * cellWidth;
  const height = 28 + rows.length * cellHeight;

  return (
    <div className="heatmap-shell">
      <svg className="plot-svg" viewBox={`0 0 ${width} ${height}`}>
        <rect className="plot-frame" x="0.5" y="0.5" width={width - 1} height={height - 1} rx="3" />
        {columns.map((column, columnIndex) => (
          <text
            key={column.id}
            className="plot-axis-label"
            x={labelWidth + columnIndex * cellWidth + cellWidth / 2}
            y={18}
            textAnchor="middle"
          >
            {column.label}
          </text>
        ))}
        {rows.map((row, rowIndex) => {
          const y = 28 + rowIndex * cellHeight;
          const active = selectedRowId === null || selectedRowId === row.id;
          return (
            <g key={row.id}>
              <text className={active ? "heatmap-row-label is-active" : "heatmap-row-label"} x={12} y={y + 22}>
                {row.label}
              </text>
              {row.values.map((value, columnIndex) => {
                const x = labelWidth + columnIndex * cellWidth;
                const fill = interpolateColor(value, minValue, maxValue);
                return (
                  <g key={`${row.id}-${columns[columnIndex]?.id ?? columnIndex}`}>
                    <rect
                      className={active ? "heatmap-cell is-active" : "heatmap-cell"}
                      x={x + 2}
                      y={y + 2}
                      width={cellWidth - 4}
                      height={cellHeight - 4}
                      rx="3"
                      fill={fill}
                      opacity={active ? 1 : 0.56}
                      onMouseEnter={() =>
                        setHoverCell({
                          rowId: row.label,
                          columnId: columns[columnIndex]?.label ?? String(columnIndex),
                          value
                        })
                      }
                      onMouseLeave={() => setHoverCell(null)}
                      onClick={() => onRowSelect?.(row.id)}
                    />
                    <text className="heatmap-cell-label" x={x + cellWidth / 2} y={y + 22} textAnchor="middle">
                      {formatter(value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="plot-readout heatmap-readout">
        <div>
          <strong>row</strong>
          <span>{hoverCell?.rowId ?? "hover a cell"}</span>
        </div>
        <div>
          <strong>column</strong>
          <span>{hoverCell?.columnId ?? "..."}</span>
        </div>
        <div>
          <strong>value</strong>
          <span>{hoverCell ? formatter(hoverCell.value) : "..."}</span>
        </div>
      </div>
    </div>
  );
}

export function RankedBars({
  items,
  selectedId = null,
  onSelect,
  formatter = (value: number) => value.toFixed(3)
}: {
  items: RankedBarDatum[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  formatter?: (value: number) => string;
}) {
  const safeItems = items.filter((entry) => Number.isFinite(entry.value));
  const maxValue = Math.max(...safeItems.map((entry) => entry.value), 1);
  const [hoverId, setHoverId] = useState<string | null>(null);

  return (
    <div className="ranked-bars">
      {safeItems.map((entry) => {
        const active = selectedId === null ? hoverId === entry.id || hoverId === null : selectedId === entry.id;
        return (
          <button
            key={entry.id}
            type="button"
            className={active ? "ranked-bar is-active" : "ranked-bar"}
            onClick={() => onSelect?.(entry.id)}
            onMouseEnter={() => setHoverId(entry.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            <span className="ranked-bar-label">
              <strong>{entry.label}</strong>
              {entry.detail ? <small>{entry.detail}</small> : null}
            </span>
            <span className="ranked-bar-track">
              <i
                style={{
                  width: `${(entry.value / maxValue) * 100}%`,
                  background: entry.color ?? "linear-gradient(90deg, #0f766e, #16a34a)"
                }}
              />
            </span>
            <b>{formatter(entry.value)}</b>
          </button>
        );
      })}
    </div>
  );
}

export function ComparisonBars({
  items,
  selectedId = null,
  onSelect,
  formatter = (value: number) => value.toFixed(3)
}: {
  items: RankedBarDatum[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  formatter?: (value: number) => string;
}) {
  const safeItems = items.filter((entry) => Number.isFinite(entry.value));
  const minValue = Math.min(...safeItems.map((entry) => entry.value), 0);
  const maxValue = Math.max(...safeItems.map((entry) => entry.value), 0);
  const range = maxValue - minValue || 1;
  const zero = ((0 - minValue) / range) * 100;

  return (
    <div className="comparison-bars">
      {safeItems.map((entry) => {
        const active = selectedId === null || selectedId === entry.id;
        const start = ((Math.min(entry.value, 0) - minValue) / range) * 100;
        const end = ((Math.max(entry.value, 0) - minValue) / range) * 100;
        const width = Math.max(end - start, 1.2);
        return (
          <button
            key={entry.id}
            type="button"
            className={active ? "comparison-row is-active" : "comparison-row"}
            onClick={() => onSelect?.(entry.id)}
          >
            <span className="comparison-label">
              <strong>{entry.label}</strong>
              {entry.detail ? <small>{entry.detail}</small> : null}
            </span>
            <span className="comparison-track">
              <i className="comparison-zero" style={{ left: `${zero}%` }} />
              <i
                className="comparison-fill"
                style={{
                  left: `${start}%`,
                  width: `${width}%`,
                  background: entry.color ?? (entry.value >= 0 ? "linear-gradient(90deg, #0f766e, #22c55e)" : "linear-gradient(90deg, #be123c, #fb7185)")
                }}
              />
            </span>
            <b>{formatter(entry.value)}</b>
          </button>
        );
      })}
    </div>
  );
}

export function InteractiveScatter({
  points,
  selectedId = null,
  onSelect
}: {
  points: ScatterPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  if (points.length === 0) {
    return null;
  }

  const width = 900;
  const height = 340;
  const pad = 34;
  const xs = points.map((entry) => entry.x);
  const ys = points.map((entry) => entry.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const xScale = (value: number) => pad + ((value - minX) / rangeX) * (width - pad * 2);
  const yScale = (value: number) => height - pad - ((value - minY) / rangeY) * (height - pad * 2);
  const grid = [0.25, 0.5, 0.75];
  const activePoint = points.find((entry) => entry.id === (hoverId ?? selectedId ?? "")) ?? points[0];

  return (
    <div className="plot-shell">
      <svg className="plot-svg" viewBox={`0 0 ${width} ${height}`}>
        <rect className="plot-frame" x="0.5" y="0.5" width={width - 1} height={height - 1} rx="3" />
        {grid.map((ratio) => (
          <line
            key={`gx-${ratio}`}
            className="plot-grid vertical"
            x1={pad + ratio * (width - pad * 2)}
            x2={pad + ratio * (width - pad * 2)}
            y1={pad}
            y2={height - pad}
          />
        ))}
        {grid.map((ratio) => (
          <line
            key={`gy-${ratio}`}
            className="plot-grid"
            x1={pad}
            x2={width - pad}
            y1={pad + ratio * (height - pad * 2)}
            y2={pad + ratio * (height - pad * 2)}
          />
        ))}
        <line className="plot-axis" x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
        <line className="plot-axis" x1={pad} x2={pad} y1={pad} y2={height - pad} />
        {points.map((entry) => {
          const active = entry.id === (hoverId ?? selectedId);
          const radius = 4 + entry.size * 8;
          return (
            <circle
              key={entry.id}
              className={active ? "scatter-point is-active" : "scatter-point"}
              cx={xScale(entry.x)}
              cy={yScale(entry.y)}
              r={active ? radius + 2 : radius}
              fill={scatterPalette[entry.cluster % scatterPalette.length]}
              opacity={active ? 0.95 : 0.76}
              onMouseEnter={() => setHoverId(entry.id)}
              onMouseLeave={() => setHoverId(null)}
              onClick={() => onSelect?.(entry.id)}
            />
          );
        })}
      </svg>

      <div className="plot-readout">
        <div>
          <strong>point</strong>
          <span>{activePoint.label}</span>
        </div>
        <div>
          <strong>group</strong>
          <span>{activePoint.group}</span>
        </div>
        <div>
          <strong>x / y</strong>
          <span>
            {formatTick(activePoint.x)} / {formatTick(activePoint.y)}
          </span>
        </div>
        <div>
          <strong>cluster</strong>
          <span>{activePoint.cluster + 1}</span>
        </div>
      </div>
    </div>
  );
}
