import { useMemo } from "react";

import type { LabelCell } from "@/api/client";

type Props = {
  matrix: LabelCell[][];
  selectedTopic: number | null;
  onSelectTopic: (k: number) => void;
};

/**
 * Topic-vs-label heatmap. Rows = topics, columns = labels. Cell color
 * encodes p(label | topic) on a sequential scale; numeric value shown
 * inside the cell when ≥ 0.05. Click a row to select that topic.
 *
 * Each row's color is independent of the others (so the dominant label
 * within each topic is visually obvious even when prevalence varies).
 * The color scale is `var(--color-accent)` with α = p.
 */
export function TopicLabelHeatmap({
  matrix,
  selectedTopic,
  onSelectTopic,
}: Props) {
  const labels = matrix[0] ?? [];
  const labelW = 110; // left gutter for topic labels
  const colW = Math.max(28, Math.floor(640 / Math.max(labels.length, 1)));
  const rowH = 34;
  const headerH = 64;
  const w = labelW + colW * labels.length + 16;
  const h = headerH + rowH * matrix.length + 12;

  const dominantPerRow = useMemo(
    () =>
      matrix.map((row) => {
        let max = -1;
        let idx = 0;
        for (let j = 0; j < row.length; j++) {
          if ((row[j]!.p ?? 0) > max) {
            max = row[j]!.p;
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
      aria-label="Topic versus label heatmap"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {/* Column headers (label names) */}
        {labels.map((lbl, j) => {
          const cx = labelW + j * colW + colW / 2;
          return (
            <g key={`h-${lbl.label_id}`}>
              <rect
                x={labelW + j * colW + 1}
                y={headerH - 8}
                width={colW - 2}
                height={4}
                fill={lbl.color}
                opacity="0.85"
              />
              <text
                x={cx}
                y={headerH - 14}
                textAnchor="end"
                transform={`rotate(-58, ${cx}, ${headerH - 14})`}
                fontSize="10.5"
                opacity="0.85"
              >
                {lbl.name.length > 18 ? `${lbl.name.slice(0, 17)}…` : lbl.name}
              </text>
            </g>
          );
        })}

        {/* Rows */}
        {matrix.map((row, i) => {
          const isSel = selectedTopic === i;
          const dom = dominantPerRow[i]!;
          return (
            <g key={`row-${i}`} onClick={() => onSelectTopic(i)} style={{ cursor: "pointer" }}>
              {/* Row background highlight when selected */}
              {isSel && (
                <rect
                  x={0}
                  y={headerH + i * rowH}
                  width={w}
                  height={rowH}
                  fill="var(--color-accent-soft)"
                  opacity="0.5"
                />
              )}
              {/* Topic label */}
              <text
                x={labelW - 8}
                y={headerH + i * rowH + rowH / 2 + 3}
                textAnchor="end"
                fontSize="11.5"
                fontFamily="ui-monospace, monospace"
                fontWeight={isSel ? "600" : "400"}
                fill={isSel ? "var(--color-accent)" : "currentColor"}
              >
                tópico {i + 1}
              </text>

              {/* Cells */}
              {row.map((cell, j) => {
                const x = labelW + j * colW + 1;
                const y = headerH + i * rowH + 2;
                const cw = colW - 2;
                const ch = rowH - 4;
                const isDom = j === dom.idx && cell.p > 0;
                return (
                  <g key={`c-${i}-${j}`}>
                    <rect
                      x={x}
                      y={y}
                      width={cw}
                      height={ch}
                      fill="var(--color-accent)"
                      opacity={Math.max(0.04, cell.p)}
                      stroke={isDom ? "var(--color-fg)" : "none"}
                      strokeWidth={isDom ? 1.5 : 0}
                    />
                    {cell.p >= 0.05 && (
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 + 4}
                        textAnchor="middle"
                        fontSize="10.5"
                        fontWeight={isDom ? "700" : "500"}
                        fill={cell.p > 0.5 ? "#fff" : "currentColor"}
                      >
                        {Math.round(cell.p * 100)}
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
