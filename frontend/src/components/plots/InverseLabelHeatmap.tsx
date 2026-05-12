import { useMemo } from "react";

type Props = {
  matrix: number[][];
  labels: { label_id: number; name: string; color: string }[];
  topicCount: number;
  selectedTopic: number | null;
  onSelectTopic: (k: number) => void;
};

/**
 * Inverse heatmap. Rows = labels, columns = topics. Cell color encodes
 * P(topic | label) on a sequential scale; numeric value shown inside
 * the cell when ≥ 0.05. Click a column to select that topic.
 */
export function InverseLabelHeatmap({
  matrix,
  labels,
  topicCount,
  selectedTopic,
  onSelectTopic,
}: Props) {
  const labelW = 140;
  const colW = Math.max(28, Math.floor(640 / Math.max(topicCount, 1)));
  const rowH = 28;
  const headerH = 36;
  const w = labelW + colW * topicCount + 16;
  const h = headerH + rowH * labels.length + 12;

  const dominantPerRow = useMemo(
    () =>
      matrix.map((row) => {
        let max = -1;
        let idx = 0;
        for (let j = 0; j < row.length; j++) {
          if ((row[j] ?? 0) > max) {
            max = row[j]!;
            idx = j;
          }
        }
        return { idx, max };
      }),
    [matrix],
  );

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Label versus topic inverse heatmap"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {/* Column headers (topic ids) */}
        {Array.from({ length: topicCount }, (_, k) => {
          const cx = labelW + k * colW + colW / 2;
          const isSel = selectedTopic === k;
          return (
            <g key={`h-${k}`} onClick={() => onSelectTopic(k)} style={{ cursor: "pointer" }}>
              <text
                x={cx}
                y={headerH - 10}
                textAnchor="middle"
                fontSize="11"
                fontFamily="ui-monospace, monospace"
                fontWeight={isSel ? "700" : "500"}
                fill={isSel ? "var(--color-accent)" : "currentColor"}
              >
                t{k + 1}
              </text>
            </g>
          );
        })}

        {/* Rows */}
        {matrix.map((row, i) => {
          const lbl = labels[i];
          if (!lbl) return null;
          const dom = dominantPerRow[i]!;
          return (
            <g key={`row-${i}`}>
              {/* Color tag + label name */}
              <rect
                x={4}
                y={headerH + i * rowH + 7}
                width={6}
                height={rowH - 14}
                fill={lbl.color}
                opacity="0.85"
                rx="1"
              />
              <text
                x={labelW - 8}
                y={headerH + i * rowH + rowH / 2 + 3}
                textAnchor="end"
                fontSize="11"
                opacity="0.9"
              >
                {lbl.name.length > 22 ? `${lbl.name.slice(0, 21)}…` : lbl.name}
              </text>

              {/* Cells */}
              {row.map((p, j) => {
                const x = labelW + j * colW + 1;
                const y = headerH + i * rowH + 2;
                const cw = colW - 2;
                const ch = rowH - 4;
                const isDom = j === dom.idx && p > 0;
                const isSelCol = selectedTopic === j;
                return (
                  <g
                    key={`c-${i}-${j}`}
                    onClick={() => onSelectTopic(j)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={cw}
                      height={ch}
                      fill="var(--color-accent)"
                      opacity={Math.max(0.04, p)}
                      stroke={
                        isDom
                          ? "var(--color-fg)"
                          : isSelCol
                            ? "var(--color-accent)"
                            : "none"
                      }
                      strokeWidth={isDom || isSelCol ? 1.5 : 0}
                    />
                    {p >= 0.05 && (
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 + 4}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight={isDom ? "700" : "500"}
                        fill={p > 0.5 ? "#fff" : "currentColor"}
                      >
                        {Math.round(p * 100)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
