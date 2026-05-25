import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ScenePeek } from "./types";

export function HeroSpectralViz({ scenes }: { scenes: (ScenePeek | null)[] | null }) {
  const { t } = useTranslation(["pages"]);
  const ip = scenes?.[0];
  const wl = ip?.wavelengths_nm ?? [];
  const classDist = ip?.class_distribution ?? [];
  const meanSpectra = ip?.class_mean_spectra ?? {};

  const W = 760;
  const H = 280;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 38;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const series = useMemo(() => {
    if (!wl.length || !Object.keys(meanSpectra).length) return [];
    const entries = Object.entries(meanSpectra).filter(([, v]) => v?.mean?.length === wl.length);
    if (!entries.length) return [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const [, v] of entries) {
      for (const x of v.mean) {
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      }
    }
    const wlLo = wl[0] ?? 400;
    const wlHi = wl[wl.length - 1] ?? 2500;
    return entries.slice(0, 16).map(([key, v]) => {
      const cls = classDist.find((c) => String(c.label_id) === key);
      const pts = v.mean.map((y, i) => {
        const wlValue = wl[i] ?? wlLo;
        const x = padL + ((wlValue - wlLo) / (wlHi - wlLo)) * innerW;
        const yy = padT + innerH - ((y - lo) / (hi - lo)) * innerH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
      });
      return {
        key,
        path: pts.join(" "),
        color: cls?.color ?? "#6b7280",
        name: cls?.name ?? `Class ${key}`,
      };
    });
  }, [wl, meanSpectra, classDist, padL, padT, innerW, innerH]);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* LEFT: curves */}
        <div className="p-6 lg:border-r" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="text-[11px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              {t("pages:overview.hero.spectral_signature")}
            </span>
            <span className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
              {wl.length
                ? t("pages:overview.hero.indian_pines_caption", { bands: wl.length })
                : t("pages:overview.hero.indian_pines_caption_loading")}
            </span>
          </div>
          <h2
            className="text-xl md:text-2xl font-semibold tracking-tight mb-4"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:overview.hero.title")}
          </h2>

          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-labelledby="hero-spectra-title hero-spectra-desc"
          >
            <title id="hero-spectra-title">
              Class mean spectra of Indian Pines, {series.length} classes overlaid
            </title>
            <desc id="hero-spectra-desc">
              {series.length === 0
                ? "Reflectance loading — wavelength axis 400 to 2500 nm."
                : `Reflectance curves of the ${series.length} Indian Pines land-cover ` +
                  `classes plotted against wavelength 400 to 2500 nm. Top three by ` +
                  `prevalence: ${series.slice(0, 3).map((s) => s.name).join(", ")}.`}
            </desc>
            {/* axis grid */}
            {[0.0, 0.25, 0.5, 0.75, 1.0].map((g) => (
              <line
                key={g}
                x1={padL}
                y1={padT + g * innerH}
                x2={padL + innerW}
                y2={padT + g * innerH}
                stroke="currentColor"
                strokeOpacity={g === 0 || g === 1 ? 0.25 : 0.08}
                strokeWidth="0.6"
              />
            ))}
            {[0.0, 0.25, 0.5, 0.75, 1.0].map((g) => {
              const wlLo = wl[0] ?? 400;
              const wlHi = wl[wl.length - 1] ?? 2500;
              const wlValue = wlLo + g * (wlHi - wlLo);
              return (
                <text
                  key={g}
                  x={padL + g * innerW}
                  y={H - 16}
                  fontSize="10"
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.55}
                  fontFamily="ui-monospace, monospace"
                >
                  {wlValue.toFixed(0)} nm
                </text>
              );
            })}
            <text
              x={padL + innerW / 2}
              y={H - 4}
              fontSize="10.5"
              textAnchor="middle"
              fill="currentColor"
              opacity={0.7}
            >
              wavelength
            </text>

            {/* 16 class spectra with staggered draw-in animation */}
            {series.map((s, i) => (
              <g key={s.key}>
                <path
                  d={s.path}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.4"
                  strokeOpacity="0.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    strokeDasharray: 2400,
                    strokeDashoffset: 2400,
                    animation: `caos-draw 1.4s ease-out forwards`,
                    animationDelay: `${i * 80}ms`,
                  }}
                />
              </g>
            ))}
          </svg>

          <p
            className="mt-2 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {t("pages:overview.hero.caption")}
          </p>
        </div>

        {/* RIGHT: hypercube SVG */}
        <div className="p-6">
          <div className="flex items-baseline gap-3 mb-2">
            <span
              className="text-[11px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              {t("pages:overview.hero.datacube_anatomy")}
            </span>
          </div>
          <HypercubeMini />
          <p
            className="mt-3 text-[12.5px] leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {t("pages:overview.hero.datacube_caption")}
          </p>
        </div>
      </div>
      <style>{`@keyframes caos-draw { to { stroke-dashoffset: 0; } }`}</style>
    </div>
  );
}

function HypercubeMini() {
  return (
    <svg viewBox="0 0 320 240" role="img" aria-label="Hyperspectral cube" className="w-full h-auto">
      <defs>
        <linearGradient id="caos-cube-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(56, 189, 248, 0.55)" />
          <stop offset="100%" stopColor="rgba(31, 119, 180, 0.18)" />
        </linearGradient>
        <linearGradient id="caos-cube-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(170, 60, 200, 0.5)" />
          <stop offset="100%" stopColor="rgba(170, 60, 200, 0.12)" />
        </linearGradient>
        <linearGradient id="caos-cube-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(40, 160, 80, 0.45)" />
          <stop offset="100%" stopColor="rgba(40, 160, 80, 0.12)" />
        </linearGradient>
      </defs>

      {/* axes labels */}
      <text x="20" y="32" fontSize="10.5" fill="currentColor" opacity="0.65">B = bands</text>
      <text x="155" y="232" fontSize="10.5" fill="currentColor" opacity="0.65" textAnchor="middle">W = width (px)</text>
      <text x="285" y="100" fontSize="10.5" fill="currentColor" opacity="0.65" transform="rotate(90 285 100)">H = height</text>

      {/* cube — 3D-ish */}
      {/* top face */}
      <polygon points="60,40 240,40 268,68 88,68" fill="url(#caos-cube-top)" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1"/>
      {/* front face */}
      <rect x="60" y="68" width="180" height="130" fill="url(#caos-cube-front)" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1"/>
      {/* right face */}
      <polygon points="240,68 268,68 268,198 240,198" fill="url(#caos-cube-side)" stroke="currentColor" strokeOpacity="0.45" strokeWidth="1"/>

      {/* band lines (animated) */}
      {Array.from({ length: 8 }, (_, i) => {
        const yy = 78 + i * 14;
        const yyTop = 40 + (88 - 60) * (i / 7);
        return (
          <g key={i}>
            <line x1="60" y1={yy} x2="240" y2={yy} stroke="rgba(56,189,248,0.7)" strokeWidth="0.7" strokeDasharray="3 4" opacity="0.85"
              style={{ animation: `caos-band-fade 5s ease-in-out infinite`, animationDelay: `${i * 0.25}s` }}/>
            <line x1="240" y1={yy} x2="268" y2={yyTop} stroke="rgba(56,189,248,0.4)" strokeWidth="0.6" strokeDasharray="2 3"/>
          </g>
        );
      })}

      {/* a "pixel" highlighted */}
      <rect x="120" y="120" width="14" height="14" fill="rgba(214, 39, 40, 0.85)" stroke="white" strokeOpacity="0.7" strokeWidth="1.2"/>
      <line x1="134" y1="127" x2="190" y2="127" stroke="rgba(214, 39, 40, 0.85)" strokeWidth="1.4" markerEnd="url(#caos-arr)"/>
      <text x="200" y="124" fontSize="11" fill="rgba(214, 39, 40, 1)" fontWeight="600">x[i,j] ∈ ℝᴮ</text>
      <text x="200" y="140" fontSize="9.5" fill="currentColor" opacity="0.6">one pixel = one document</text>

      <defs>
        <marker id="caos-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 Z" fill="rgba(214, 39, 40, 0.85)"/>
        </marker>
      </defs>

      <style>{`
        @keyframes caos-band-fade {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 1; }
        }
      `}</style>
    </svg>
  );
}

/* =========================================================================
   2. Headline numbers
   =======================================================================*/

