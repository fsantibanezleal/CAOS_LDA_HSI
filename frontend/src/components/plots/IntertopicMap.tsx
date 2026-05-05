import { useMemo } from "react";

type Props = {
  coords: [number, number][];
  prevalence: number[];
  selectedTopic: number | null;
  onSelect: (k: number) => void;
};

const TOPIC_PALETTE = [
  "#0ea5e9",
  "#f97316",
  "#22c55e",
  "#a855f7",
  "#eab308",
  "#ef4444",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#06b6d4",
  "#f59e0b",
  "#8b5cf6",
];

/**
 * LDAvis-faithful intertopic distance map. JS-MDS 2D projection of the
 * Jensen-Shannon distance matrix between topics; bubble area is
 * proportional to topic prevalence (mean theta over corpus).
 */
export function IntertopicMap({
  coords,
  prevalence,
  selectedTopic,
  onSelect,
}: Props) {
  const w = 480;
  const h = 360;
  const pad = 36;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let xLo = Infinity;
    let xHi = -Infinity;
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const [cx, cy] of coords) {
      if (cx < xLo) xLo = cx;
      if (cx > xHi) xHi = cx;
      if (cy < yLo) yLo = cy;
      if (cy > yHi) yHi = cy;
    }
    const xPad = ((xHi - xLo) || 1) * 0.18;
    const yPad = ((yHi - yLo) || 1) * 0.18;
    return {
      xMin: xLo - xPad,
      xMax: xHi + xPad,
      yMin: yLo - yPad,
      yMax: yHi + yPad,
    };
  }, [coords]);

  const x = (cx: number) =>
    pad + ((cx - xMin) / (xMax - xMin || 1)) * (w - 2 * pad);
  const y = (cy: number) =>
    pad + (1 - (cy - yMin) / (yMax - yMin || 1)) * (h - 2 * pad);

  const maxPrev = Math.max(...prevalence, 1e-9);
  const radius = (p: number) =>
    8 + Math.sqrt(p / maxPrev) * 36;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Intertopic distance map"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {/* Crosshairs */}
        <line
          x1={pad}
          x2={w - pad}
          y1={h / 2}
          y2={h / 2}
          stroke="currentColor"
          opacity="0.18"
          strokeDasharray="4 4"
        />
        <line
          x1={w / 2}
          x2={w / 2}
          y1={pad}
          y2={h - pad}
          stroke="currentColor"
          opacity="0.18"
          strokeDasharray="4 4"
        />

        {coords.map(([cx, cy], k) => {
          const isSel = selectedTopic === k;
          const r = radius(prevalence[k] ?? 0);
          const color = TOPIC_PALETTE[k % TOPIC_PALETTE.length] ?? "#0ea5e9";
          return (
            <g
              key={k}
              transform={`translate(${x(cx)}, ${y(cy)})`}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(k)}
            >
              <circle
                r={r}
                fill={color}
                opacity={isSel ? 0.55 : 0.32}
                stroke={color}
                strokeWidth={isSel ? 2.5 : 1.3}
              />
              <text
                textAnchor="middle"
                dy={4}
                fill="currentColor"
                fontWeight="600"
                fontSize="11.5"
              >
                {k + 1}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export const TOPIC_COLORS = TOPIC_PALETTE;
