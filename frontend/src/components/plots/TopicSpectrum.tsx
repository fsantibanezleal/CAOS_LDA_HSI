import { useMemo } from "react";

import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

type Props = {
  wavelengths: number[];
  bandProfiles: number[][];
  selectedTopic: number | null;
};

/**
 * One curve per topic, rendered with the same palette as the intertopic
 * map. When a topic is selected, that curve is highlighted and the
 * others fade. Y-axis auto-scaled to the visible curves.
 */
export function TopicSpectrum({
  wavelengths,
  bandProfiles,
  selectedTopic,
}: Props) {
  const w = 720;
  const h = 260;
  const padL = 50;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xLo = wavelengths[0] ?? 0;
    const xHi = wavelengths[wavelengths.length - 1] ?? 1;
    let yLo = Infinity;
    let yHi = -Infinity;
    const visible =
      selectedTopic === null ? bandProfiles : [bandProfiles[selectedTopic]!];
    for (const profile of visible) {
      if (!profile) continue;
      for (const v of profile) {
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = 0;
      yHi = 1;
    }
    const pad = (yHi - yLo) * 0.06 || 0.001;
    return { xMin: xLo, xMax: xHi, yMin: yLo - pad, yMax: yHi + pad };
  }, [wavelengths, bandProfiles, selectedTopic]);

  const x = (nm: number) => padL + ((nm - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const buildPath = (xs: number[], ys: number[]) =>
    xs
      .map(
        (nm, i) => `${i === 0 ? "M" : "L"} ${x(nm).toFixed(2)} ${y(ys[i]!).toFixed(2)}`,
      )
      .join(" ");

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Per-topic spectral profiles"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {/* Y axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = yMin + (yMax - yMin) * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeWidth="0.6"
                opacity="0.18"
              />
              <text
                x={padL - 6}
                y={y(v) + 3}
                textAnchor="end"
                opacity="0.7"
                fontSize="10"
              >
                {v.toFixed(3)}
              </text>
            </g>
          );
        })}
        {/* X axis ticks */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const nm = xMin + (xMax - xMin) * t;
          return (
            <g key={t}>
              <line
                x1={x(nm)}
                x2={x(nm)}
                y1={padT + plotH}
                y2={padT + plotH + 4}
                stroke="currentColor"
                opacity="0.5"
              />
              <text
                x={x(nm)}
                y={padT + plotH + 18}
                textAnchor="middle"
                opacity="0.7"
                fontSize="10"
              >
                {Math.round(nm)}
              </text>
            </g>
          );
        })}
        <text
          x={padL + plotW / 2}
          y={h - 4}
          textAnchor="middle"
          opacity="0.55"
          fontSize="10.5"
        >
          longitud de onda (nm)
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${padT + plotH / 2})`}
          opacity="0.55"
          fontSize="10.5"
        >
          φ_k(banda)
        </text>

        {bandProfiles.map((profile, k) => {
          const isSel = selectedTopic === k;
          const dim = selectedTopic !== null && !isSel;
          const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
          return (
            <path
              key={k}
              d={buildPath(wavelengths, profile)}
              fill="none"
              stroke={color}
              strokeWidth={isSel ? 2.4 : 1.4}
              opacity={dim ? 0.18 : 0.85}
            />
          );
        })}
      </g>
    </svg>
  );
}
