interface LineChartProps {
  values: number[];
  stroke?: string;
  fill?: string;
}

export function LineChart({ values, stroke = "currentColor", fill = "none" }: LineChartProps) {
  if (values.length === 0) {
    return null;
  }

  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;
  const width = 100;
  const height = 48;
  const plotTop = 4;
  const plotBottom = 42;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = plotBottom - ((value - minValue) / range) * (plotBottom - plotTop);
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `0,${plotBottom} ${points} ${width},${plotBottom}`;
  const gridY = [0.25, 0.5, 0.75].map((ratio) => plotTop + ratio * (plotBottom - plotTop));
  const gridX = [0.25, 0.5, 0.75].map((ratio) => ratio * width);
  const pointList = points.split(" ");
  const firstPointY = Number(pointList[0]?.split(",")[1] ?? plotBottom);
  const lastPointY = Number(pointList[pointList.length - 1]?.split(",")[1] ?? plotBottom);

  return (
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <rect className="chart-frame" x="0.3" y="0.3" width="99.4" height="45.8" rx="2" />
      {gridY.map((y) => (
        <line key={`y-${y}`} className="chart-grid" x1="0" x2={width} y1={y} y2={y} />
      ))}
      {gridX.map((x) => (
        <line key={`x-${x}`} className="chart-grid vertical" x1={x} x2={x} y1={plotTop} y2={plotBottom} />
      ))}
      <polygon points={areaPoints} fill={fill === "none" ? stroke : fill} opacity="0.12" />
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="0" cy={firstPointY} r="1.2" fill={stroke} opacity="0.7" />
      <circle cx={width} cy={lastPointY} r="1.2" fill={stroke} />
    </svg>
  );
}

interface BarStripProps {
  values: number[];
  color?: string;
}

export function BarStrip({ values, color = "var(--accent-strong)" }: BarStripProps) {
  const maxValue = Math.max(...values, 1);
  return (
    <div className="bar-strip">
      {values.map((value, index) => (
        <span key={`${index}-${value}`} title={`band ${index + 1}: ${value}`}>
          <i
            style={{
              height: `${12 + (value / maxValue) * 78}px`,
              background: color
            }}
          />
        </span>
      ))}
    </div>
  );
}

interface MixtureBarsProps {
  values: number[];
  colors: string[];
}

export function MixtureBars({ values, colors }: MixtureBarsProps) {
  return (
    <div className="mixture-bars" aria-hidden="true">
      {values.map((value, index) => (
        <span
          key={`${index}-${value}`}
          style={{
            width: `${Math.max(value, 0.02) * 100}%`,
            background: colors[index] ?? "var(--accent)"
          }}
        />
      ))}
    </div>
  );
}

export interface ClusterScatterPoint {
  id: string;
  label: string;
  group: string;
  cluster: number;
  x: number;
  y: number;
  size: number;
  item_count: number;
}

interface ClusterScatterProps {
  points: ClusterScatterPoint[];
  selectedPointId?: string | null;
}

const clusterColors = [
  "var(--accent-blue)",
  "var(--accent-cyan)",
  "var(--accent-purple)",
  "var(--cluster-amber)",
  "var(--cluster-rose)",
  "var(--cluster-slate)"
];

export function ClusterScatter({ points, selectedPointId = null }: ClusterScatterProps) {
  if (points.length === 0) {
    return null;
  }

  const width = 100;
  const height = 64;
  const pad = 7;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;

  const scaleX = (value: number) => pad + ((value - minX) / rangeX) * (width - pad * 2);
  const scaleY = (value: number) => height - pad - ((value - minY) / rangeY) * (height - pad * 2);
  const grid = [0.25, 0.5, 0.75];

  return (
    <svg className="cluster-scatter" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cluster projection">
      <rect className="chart-frame" x="0.4" y="0.4" width="99.2" height="63.2" rx="2" />
      {grid.map((ratio) => (
        <line key={`x-${ratio}`} className="chart-grid vertical" x1={pad + ratio * (width - pad * 2)} x2={pad + ratio * (width - pad * 2)} y1={pad} y2={height - pad} />
      ))}
      {grid.map((ratio) => (
        <line key={`y-${ratio}`} className="chart-grid" x1={pad} x2={width - pad} y1={pad + ratio * (height - pad * 2)} y2={pad + ratio * (height - pad * 2)} />
      ))}
      <line className="scatter-axis" x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} />
      <line className="scatter-axis" x1={pad} x2={pad} y1={pad} y2={height - pad} />
      {points.map((point) => {
        const isSelected = point.id === selectedPointId;
        const radius = 1.7 + point.size * 2.3;
        return (
          <circle
            key={point.id}
            className={isSelected ? "scatter-point is-selected" : "scatter-point"}
            cx={scaleX(point.x)}
            cy={scaleY(point.y)}
            r={isSelected ? radius + 1.2 : radius}
            fill={clusterColors[point.cluster % clusterColors.length]}
          >
            <title>{`${point.label} / ${point.group} / cluster ${point.cluster + 1} / n=${point.item_count}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
