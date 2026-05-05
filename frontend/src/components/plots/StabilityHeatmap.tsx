type Props = {
  matrix: number[][];
  seeds: number[];
};

/**
 * Symmetric NxN seed-pair Hungarian-matched cosine. Each cell (i, j)
 * is the matched cosine between LDA refits at seed i and seed j.
 * Diagonal is exactly 1 (matched against self); off-diagonal is the
 * actual stability metric.
 */
export function StabilityHeatmap({ matrix, seeds }: Props) {
  const n = matrix.length;
  if (n === 0) return null;
  const w = 460;
  const labelW = 64;
  const cellW = Math.floor((w - labelW - 16) / n);
  const headerH = 32;
  const h = headerH + cellW * n + 12;

  // Color scale: 0..1 with the alpha encoding p; off-diagonal cells
  // mostly land in 0.8..1.0 so the contrast comes from a tighter
  // gradient.
  const cellColor = () => "var(--color-accent)";

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Stability heatmap"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {/* Column header */}
        {seeds.map((s, j) => (
          <text
            key={`ch-${j}`}
            x={labelW + j * cellW + cellW / 2}
            y={headerH - 8}
            textAnchor="middle"
            opacity="0.7"
            fontFamily="ui-monospace, monospace"
            fontSize="10.5"
          >
            s{s}
          </text>
        ))}
        {/* Rows */}
        {matrix.map((row, i) => (
          <g key={`row-${i}`}>
            <text
              x={labelW - 6}
              y={headerH + i * cellW + cellW / 2 + 3}
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
              fontSize="10.5"
              opacity="0.7"
            >
              s{seeds[i]}
            </text>
            {row.map((v, j) => {
              const x = labelW + j * cellW + 1;
              const y = headerH + i * cellW + 1;
              const cw = cellW - 2;
              const isDiag = i === j;
              return (
                <g key={`c-${i}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cw}
                    height={cw}
                    fill={cellColor()}
                    opacity={isDiag ? 0.05 : Math.max(0.06, v)}
                  />
                  {!isDiag && cw > 26 && (
                    <text
                      x={x + cw / 2}
                      y={y + cw / 2 + 4}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="500"
                      fill={v > 0.6 ? "#fff" : "currentColor"}
                    >
                      {v.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
