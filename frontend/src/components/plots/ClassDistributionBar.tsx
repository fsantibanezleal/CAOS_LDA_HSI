import type { ClassEntry } from "@/api/client";

type Props = {
  classes: ClassEntry[];
};

/**
 * Horizontal stacked-bar showing class distribution by relative
 * frequency. Each segment is colored per the catalog. Includes a tiny
 * legend underneath with raw counts.
 */
export function ClassDistributionBar({ classes }: Props) {
  // Order by relative frequency descending so the visual lead is
  // dominated by the dominant classes.
  const sorted = [...classes].sort((a, b) => b.rel_freq - a.rel_freq);
  const total = sorted.reduce((acc, c) => acc + c.count, 0);
  const w = 720;
  const h = 36;
  let xCursor = 0;
  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Class frequency distribution"
      >
        {sorted.map((c) => {
          const segW = c.rel_freq * w;
          const x = xCursor;
          xCursor += segW;
          return (
            <g key={c.label_id}>
              <rect
                x={x}
                y={4}
                width={Math.max(segW, 0.5)}
                height={h - 12}
                fill={c.color}
              />
              {segW > 36 && (
                <text
                  x={x + segW / 2}
                  y={h - 16}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="10.5"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}
                >
                  {(c.rel_freq * 100).toFixed(0)}%
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p
        className="mt-1 text-[12px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {total.toLocaleString()} píxeles etiquetados · {classes.length} clases
      </p>
    </div>
  );
}
