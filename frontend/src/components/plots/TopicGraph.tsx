import { useMemo } from "react";

import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

type Props = {
  coords: [number, number][];
  prevalence: number[];
  distanceCosine: number[][];
  threshold: number;
  selectedTopic: number | null;
  onSelect: (k: number) => void;
};

/**
 * Topic↔topic similarity graph. Nodes live at the JS-MDS 2D positions;
 * an edge is drawn between every pair (i, j) whose cosine similarity
 * (1 − topic_distance_cosine[i][j]) exceeds the threshold. Edge thickness
 * encodes similarity; node area encodes topic prevalence.
 */
export function TopicGraph({
  coords,
  prevalence,
  distanceCosine,
  threshold,
  selectedTopic,
  onSelect,
}: Props) {
  const w = 540;
  const h = 380;
  const pad = 40;

  const bounds = useMemo(() => {
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
    if (xLo === xHi) {
      xLo -= 1;
      xHi += 1;
    }
    if (yLo === yHi) {
      yLo -= 1;
      yHi += 1;
    }
    return { xLo, xHi, yLo, yHi };
  }, [coords]);

  const project = (cx: number, cy: number) => {
    const x =
      pad +
      ((cx - bounds.xLo) / (bounds.xHi - bounds.xLo)) * (w - 2 * pad);
    const y =
      pad +
      ((bounds.yHi - cy) / (bounds.yHi - bounds.yLo)) * (h - 2 * pad);
    return [x, y] as const;
  };

  const edges = useMemo(() => {
    const out: { i: number; j: number; sim: number }[] = [];
    const K = coords.length;
    for (let i = 0; i < K; i++) {
      for (let j = i + 1; j < K; j++) {
        const d = distanceCosine[i]?.[j] ?? 1;
        const sim = Math.max(0, Math.min(1, 1 - d));
        if (sim >= threshold) out.push({ i, j, sim });
      }
    }
    out.sort((a, b) => b.sim - a.sim);
    return out;
  }, [coords.length, distanceCosine, threshold]);

  const maxPrev = useMemo(
    () => Math.max(1e-9, ...prevalence),
    [prevalence],
  );

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Topic-topic similarity graph"
      style={{ color: "var(--color-fg)", display: "block" }}
    >
      {/* Edges first so nodes draw on top */}
      <g>
        {edges.map((e) => {
          const [x1, y1] = project(coords[e.i]![0]!, coords[e.i]![1]!);
          const [x2, y2] = project(coords[e.j]![0]!, coords[e.j]![1]!);
          const isSel =
            selectedTopic !== null &&
            (selectedTopic === e.i || selectedTopic === e.j);
          const stroke = isSel
            ? "var(--color-accent)"
            : "var(--color-fg-faint)";
          const opacity = isSel ? 0.85 : 0.35;
          const strokeW = 0.5 + 4.5 * Math.pow(e.sim, 2);
          return (
            <line
              key={`e-${e.i}-${e.j}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={stroke}
              strokeWidth={strokeW}
              opacity={opacity}
            />
          );
        })}
      </g>

      {/* Nodes */}
      <g>
        {coords.map(([cx, cy], k) => {
          const [px, py] = project(cx, cy);
          const isSel = selectedTopic === k;
          const r = 6 + 18 * Math.sqrt(Math.max(0, prevalence[k]! / maxPrev));
          const fill = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
          return (
            <g
              key={`n-${k}`}
              onClick={() => onSelect(k)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={px}
                cy={py}
                r={r}
                fill={fill}
                opacity={isSel ? 0.9 : 0.65}
                stroke={isSel ? "var(--color-fg)" : "var(--color-border)"}
                strokeWidth={isSel ? 2 : 1}
              />
              <text
                x={px}
                y={py + 4}
                textAnchor="middle"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fontWeight={isSel ? "700" : "500"}
                fill={isSel ? "#fff" : "var(--color-fg)"}
              >
                {k + 1}
              </text>
            </g>
          );
        })}
      </g>

      {/* Edge count caption */}
      <text
        x={w - pad}
        y={h - pad / 2}
        textAnchor="end"
        fontSize="11"
        fill="var(--color-fg-faint)"
      >
        {edges.length} edges at sim ≥ {threshold.toFixed(2)}
      </text>
    </svg>
  );
}
