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
  const height = 38;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <polyline points={points} fill={fill} stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
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
        <span
          key={`${index}-${value}`}
          style={{
            height: `${18 + (value / maxValue) * 48}px`,
            background: color
          }}
        />
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
