import { useMemo, useState } from "react";

import type { ClassEntry, ClassMeanSpectrum } from "@/api/client";

type Props = {
  wavelengths: number[];
  classMeans: Record<string, ClassMeanSpectrum>;
  classDistribution: ClassEntry[];
  height?: number;
};

/**
 * Per-class median spectrum with p25-p75 envelope, drawn as inline SVG.
 * Click on a legend entry to isolate that class; click again to show all.
 *
 * Bands are taken from `wavelengths`; per-class entries are looked up in
 * `classMeans` keyed by label_id (string). Y-axis is auto-scaled across
 * the visible classes' p5..p95 envelopes so a single high-reflectance
 * class doesn't squash the rest.
 */
export function SpectralByClass({
  wavelengths,
  classMeans,
  classDistribution,
  height = 320,
}: Props) {
  const [isolated, setIsolated] = useState<number | null>(null);

  const visible = useMemo(
    () => classDistribution.filter((c) => isolated === null || c.label_id === isolated),
    [classDistribution, isolated],
  );

  const { yMin, yMax, xMin, xMax } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of visible) {
      const spec = classMeans[String(c.label_id)];
      if (!spec) continue;
      for (const v of spec.p5) if (v < lo) lo = v;
      for (const v of spec.p95) if (v > hi) hi = v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo) * 0.05 || 1;
    return {
      yMin: lo - pad,
      yMax: hi + pad,
      xMin: wavelengths[0] ?? 0,
      xMax: wavelengths[wavelengths.length - 1] ?? 1,
    };
  }, [visible, classMeans, wavelengths]);

  const w = 720;
  const h = height;
  const padL = 50;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const x = (nm: number) => padL + ((nm - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * plotH;

  const xTicks = useMemo(() => {
    const n = 5;
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      out.push(xMin + ((xMax - xMin) * i) / n);
    }
    return out;
  }, [xMin, xMax]);

  const yTicks = useMemo(() => {
    const n = 4;
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      out.push(yMin + ((yMax - yMin) * i) / n);
    }
    return out;
  }, [yMin, yMax]);

  const buildPath = (xs: number[], ys: number[]) =>
    xs.map((nm, i) => `${i === 0 ? "M" : "L"} ${x(nm).toFixed(2)} ${y(ys[i]!).toFixed(2)}`).join(" ");

  const buildEnvelope = (
    xs: number[],
    upper: number[],
    lower: number[],
  ) => {
    const top = xs.map((nm, i) => `${i === 0 ? "M" : "L"} ${x(nm).toFixed(2)} ${y(upper[i]!).toFixed(2)}`).join(" ");
    const bot = xs
      .slice()
      .reverse()
      .map((nm, idx) => {
        const i = xs.length - 1 - idx;
        return `L ${x(nm).toFixed(2)} ${y(lower[i]!).toFixed(2)}`;
      })
      .join(" ");
    return `${top} ${bot} Z`;
  };

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Per-class spectral envelopes"
        style={{ color: "var(--color-fg)" }}
      >
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fill="currentColor"
        >
          {/* Y axis grid */}
          {yTicks.map((v) => (
            <g key={v}>
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
                {v.toFixed(0)}
              </text>
            </g>
          ))}
          {/* X axis ticks */}
          {xTicks.map((nm) => (
            <g key={nm}>
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
          ))}
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
            reflectancia
          </text>

          {/* Per-class envelopes (drawn first so lines sit on top) */}
          {visible.map((c) => {
            const spec = classMeans[String(c.label_id)];
            if (!spec) return null;
            return (
              <path
                key={`env-${c.label_id}`}
                d={buildEnvelope(wavelengths, spec.p75, spec.p25)}
                fill={c.color}
                stroke="none"
                opacity={isolated === null ? 0.12 : 0.22}
              />
            );
          })}

          {/* Per-class median lines */}
          {visible.map((c) => {
            const spec = classMeans[String(c.label_id)];
            if (!spec) return null;
            const isIso = isolated === c.label_id;
            return (
              <path
                key={`line-${c.label_id}`}
                d={buildPath(wavelengths, spec.p50)}
                fill="none"
                stroke={c.color}
                strokeWidth={isIso ? 2.4 : 1.5}
                opacity={isolated === null || isIso ? 0.95 : 0.4}
              />
            );
          })}
        </g>
      </svg>

      <div
        className="mt-3 flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filtro de clases"
      >
        <button
          type="button"
          onClick={() => setIsolated(null)}
          className="rounded-md border px-2.5 py-1 text-[12px]"
          style={{
            borderColor:
              isolated === null
                ? "var(--color-accent)"
                : "var(--color-border)",
            backgroundColor:
              isolated === null
                ? "var(--color-accent-soft)"
                : "var(--color-panel)",
            color:
              isolated === null
                ? "var(--color-accent)"
                : "var(--color-fg-subtle)",
          }}
        >
          Todas
        </button>
        {classDistribution.map((c) => {
          const isIso = isolated === c.label_id;
          return (
            <button
              key={c.label_id}
              type="button"
              onClick={() =>
                setIsolated((prev) => (prev === c.label_id ? null : c.label_id))
              }
              className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
              style={{
                borderColor: isIso
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                backgroundColor: isIso
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
                color: isIso ? "var(--color-fg)" : "var(--color-fg-subtle)",
              }}
            >
              <span
                aria-hidden
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: c.color }}
              />
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
