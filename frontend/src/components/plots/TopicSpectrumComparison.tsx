import { useMemo, useState } from "react";

import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

type Props = {
  wavelengths: number[];
  bandProfiles: number[][];
  topicPrevalence: number[];
  topicDistanceCosine?: number[][] | null;
  initialSelection?: number[];
};

type Feature = { nm: number; name: string; colour: string };

const FEATURES: Feature[] = [
  { nm: 480, name: "Fe-oxide", colour: "#aa6633" },
  { nm: 530, name: "chlorophyll", colour: "#2ca02c" },
  { nm: 680, name: "chlorophyll-red", colour: "#2ca02c" },
  { nm: 720, name: "veg red-edge", colour: "#2ca02c" },
  { nm: 970, name: "leaf-water", colour: "#3aa1c7" },
  { nm: 1200, name: "leaf-water 2", colour: "#3aa1c7" },
  { nm: 1400, name: "atm. water", colour: "#888888" },
  { nm: 1900, name: "atm. water 2", colour: "#888888" },
  { nm: 2100, name: "cellulose", colour: "#8a4f2a" },
  { nm: 2200, name: "Al-OH / kaolinite", colour: "#7765c0" },
  { nm: 2340, name: "calcite / Mg-OH", colour: "#cc8833" },
];

const WATER_BANDS: [number, number][] = [
  [1350, 1430],
  [1800, 1950],
  [2480, 2500],
];

/**
 * Multi-topic spectral comparison. The user selects up to 4 topics
 * via checkboxes and the selected phi_k(λ) curves are overlaid on a
 * single SVG axis with annotated absorption / reflectance features.
 * A pairwise cosine-distance mini-table is rendered alongside.
 */
export function TopicSpectrumComparison({
  wavelengths,
  bandProfiles,
  topicPrevalence,
  topicDistanceCosine,
  initialSelection,
}: Props) {
  const K = bandProfiles.length;
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(initialSelection ?? [0, 1].filter((k) => k < K)),
  );
  const [showFeatures, setShowFeatures] = useState(true);

  const toggle = (k: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        next.delete(k);
      } else {
        if (next.size >= 4) return next;
        next.add(k);
      }
      return next;
    });
  };

  const w = 760;
  const h = 320;
  const padL = 54;
  const padR = 16;
  const padT = 28;
  const padB = 40;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    const xLo = wavelengths[0] ?? 0;
    const xHi = wavelengths[wavelengths.length - 1] ?? 1;
    let yLo = Infinity;
    let yHi = -Infinity;
    const visible = Array.from(selected)
      .map((k) => bandProfiles[k])
      .filter((p): p is number[] => Array.isArray(p));
    const pool = visible.length > 0 ? visible : bandProfiles;
    for (const profile of pool) {
      for (const v of profile) {
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = 0;
      yHi = 1;
    }
    const pad = (yHi - yLo) * 0.08 || 0.001;
    return { xMin: xLo, xMax: xHi, yMin: yLo - pad, yMax: yHi + pad };
  }, [wavelengths, bandProfiles, selected]);

  const x = (nm: number) =>
    padL + ((nm - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) =>
    padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const buildPath = (xs: number[], ys: number[]) =>
    xs
      .map(
        (nm, i) =>
          `${i === 0 ? "M" : "L"} ${x(nm).toFixed(2)} ${y(ys[i]!).toFixed(2)}`,
      )
      .join(" ");

  const selectedList = Array.from(selected).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] opacity-75">
          Compare up to 4 topics. The overlay shows their basis spectra
          φ_k(λ) on a shared axis; absorption / reflectance features
          marked as dotted verticals.
        </div>
        <label className="text-[12px] inline-flex items-center gap-1.5 select-none">
          <input
            type="checkbox"
            checked={showFeatures}
            onChange={(e) => setShowFeatures(e.target.checked)}
          />
          show physical features
        </label>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Per-topic spectrum comparison"
        style={{ color: "var(--color-fg)" }}
      >
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="10"
          fill="currentColor"
        >
          {/* Water-band shading */}
          {WATER_BANDS.map(([lo, hi], i) =>
            xMin <= hi && xMax >= lo ? (
              <rect
                key={`wb-${i}`}
                x={x(Math.max(xMin, lo))}
                y={padT}
                width={Math.max(0, x(Math.min(xMax, hi)) - x(Math.max(xMin, lo)))}
                height={plotH}
                fill="currentColor"
                opacity="0.06"
              />
            ) : null,
          )}

          {/* Feature verticals */}
          {showFeatures &&
            FEATURES.map((f) =>
              f.nm >= xMin && f.nm <= xMax ? (
                <g key={`feat-${f.nm}`}>
                  <line
                    x1={x(f.nm)}
                    x2={x(f.nm)}
                    y1={padT}
                    y2={padT + plotH}
                    stroke={f.colour}
                    strokeDasharray="2 3"
                    strokeWidth="0.7"
                    opacity="0.6"
                  />
                  <text
                    x={x(f.nm)}
                    y={padT - 4}
                    fontSize="9"
                    fill={f.colour}
                    textAnchor="middle"
                    opacity="0.85"
                  >
                    {f.name}
                  </text>
                </g>
              ) : null,
            )}

          {/* Y ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const v = yMin + (yMax - yMin) * t;
            return (
              <g key={`yt-${t}`}>
                <line
                  x1={padL}
                  x2={padL + plotW}
                  y1={y(v)}
                  y2={y(v)}
                  stroke="currentColor"
                  strokeWidth="0.5"
                  opacity="0.16"
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

          {/* X ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const nm = xMin + (xMax - xMin) * t;
            return (
              <g key={`xt-${t}`}>
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
            y={h - 6}
            textAnchor="middle"
            opacity="0.55"
            fontSize="10.5"
          >
            wavelength (nm)
          </text>
          <text
            x={14}
            y={padT + plotH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 14, ${padT + plotH / 2})`}
            opacity="0.55"
            fontSize="10.5"
          >
            φ_k(λ)
          </text>

          {/* Topic curves */}
          {selectedList.map((k) => {
            const profile = bandProfiles[k];
            if (!profile) return null;
            const colour =
              TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <path
                key={`curve-${k}`}
                d={buildPath(wavelengths, profile)}
                fill="none"
                stroke={colour}
                strokeWidth="2.2"
                opacity="0.92"
              />
            );
          })}
        </g>
      </svg>

      {/* Topic chip selector */}
      <div className="flex flex-wrap gap-1.5">
        {bandProfiles.map((_, k) => {
          const isSel = selected.has(k);
          const colour =
            TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggle(k)}
              disabled={!isSel && selected.size >= 4}
              className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                borderColor: isSel
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                backgroundColor: isSel
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
                color: isSel ? "var(--color-fg)" : "var(--color-fg-subtle)",
              }}
              aria-pressed={isSel}
            >
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: colour }}
              />
              topic {k}
              <span
                className="text-[10.5px] ml-1 opacity-70"
                style={{ color: "var(--color-fg-faint)" }}
              >
                ({(topicPrevalence[k] ?? 0).toFixed(2)})
              </span>
            </button>
          );
        })}
      </div>

      {/* Pairwise cosine distance mini-table */}
      {topicDistanceCosine && selectedList.length >= 2 && (
        <div
          className="rounded-md border p-3"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <div className="text-[11.5px] mb-2 opacity-75">
            Pairwise cosine distance between selected topic spectra
            (higher = more visually distinct)
          </div>
          <table className="text-[11px]">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left">A \ B</th>
                {selectedList.map((k) => (
                  <th key={k} className="px-2 py-1 text-center">
                    t{k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {selectedList.map((a) => (
                <tr key={a}>
                  <td className="px-2 py-1 font-medium">t{a}</td>
                  {selectedList.map((b) => {
                    if (a === b) {
                      return (
                        <td
                          key={b}
                          className="px-2 py-1 text-center opacity-50"
                        >
                          —
                        </td>
                      );
                    }
                    const v = topicDistanceCosine?.[a]?.[b];
                    return (
                      <td
                        key={b}
                        className="px-2 py-1 text-center font-mono"
                      >
                        {typeof v === "number" ? v.toFixed(3) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
