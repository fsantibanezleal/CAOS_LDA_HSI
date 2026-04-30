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
