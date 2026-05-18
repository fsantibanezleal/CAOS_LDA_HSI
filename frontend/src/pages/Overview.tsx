import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { PageShell } from "@/components/PageShell";

const LABELLED_SCENES = [
  { id: "indian-pines-corrected", label: "Indian Pines", sensor: "AVIRIS" },
  { id: "salinas-corrected", label: "Salinas", sensor: "AVIRIS" },
  { id: "salinas-a-corrected", label: "Salinas-A", sensor: "AVIRIS" },
  { id: "pavia-university", label: "Pavia U", sensor: "ROSIS" },
  { id: "kennedy-space-center", label: "Kennedy SC", sensor: "AVIRIS" },
  { id: "botswana", label: "Botswana", sensor: "Hyperion" },
];

const HEADLINE_DEFS = [
  { keyLabel: "datasets_label", keySub: "datasets_sub", value: "21", href: "/databases" },
  { keyLabel: "recipes_label", keySub: "recipes_sub", value: "12", href: "/methodology/representations" },
  { keyLabel: "builders_label", keySub: "builders_sub", value: "67", href: "/methodology/pipeline" },
  { keyLabel: "artifacts_label", keySub: "artifacts_sub", value: "1706", href: "/workspace" },
  { keyLabel: "endpoints_label", keySub: "endpoints_sub", value: "86", href: "/benchmarks" },
  { keyLabel: "variants_label", keySub: "variants_sub", value: "11", href: "/methodology/representations" },
] as const;

const FINDINGS = [
  {
    badge: "B-3",
    title: "θ as a gate beats raw on labelled scenes",
    body: "topic_routed_soft matches or beats raw_logistic on all 6 labelled scenes; theta_logistic (θ as a flat feature) loses by 30–50 pp everywhere. The framing 'θ is a gate, not a feature' is empirically validated.",
    accent: "rgba(40, 160, 80, 1)",
  },
  {
    badge: "B-3 follow-up",
    title: "No deep encoder can replace θ as the gate",
    body: "Cycle 54 hierarchical Bayesian: raw > θ > {pca_8, cae_1d_8, beta_vae_8} at P(μ_a > μ_b) ≥ 0.999. Softmaxed deep latents satisfy the simplex constraint geometrically but not structurally — the gating mechanism does not transfer.",
    accent: "rgba(214, 39, 40, 1)",
  },
  {
    badge: "Topic family",
    title: "LDA wins ARI · ProdLDA wins coherence · ETM is the safe middle",
    body: "Cycles 61–63 head-to-head on 220-per-class stratified samples: LDA wins KMeans-vs-label ARI on 4/6 scenes; ProdLDA wins c_v topic coherence 6/6; ETM beats ProdLDA on ARI 6/6 (multi-seed N=5).",
    accent: "rgba(31, 119, 180, 1)",
  },
  {
    badge: "Decoder design",
    title: "Decoder reconstruction target is itself a hyperparameter",
    body: "CAE-3D anchor-only vs full-patch (cycles 52, 55) gives net mean ΔARI ≈ +0.003 (K=8) and +0.011 (K=4) — neutral on average, scene-dependent direction. Pavia U inverts with capacity.",
    accent: "rgba(170, 60, 200, 1)",
  },
  {
    badge: "GPU stack",
    title: "50–120× speedup on the deep / neural family",
    body: "RTX 4070 Laptop CUDA 12.6: cae_3d_full K=32 single scene goes from ~60 min CPU to ~30 s GPU. Full K-curve {4, 8, 16, 32} × 6 scenes from 9–12 h CPU to ~10 min GPU. Determinism drift ±0.010 ARI is below per-seed σ ≈ 0.05.",
    accent: "rgba(214, 140, 40, 1)",
  },
  {
    badge: "Stability",
    title: "9-method × 6-scene seed stability ladder",
    body: "PCA = ICA (1.000 deterministic) > LDA > NMF > CAE-2D > CAE-1D > CAE-3D > dense-AE > β-VAE. KSC β-VAE off-diag ≈ 0.18 — KL stochasticity overwhelms the inter-seed signal.",
    accent: "rgba(140, 86, 75, 1)",
  },
  {
    badge: "Posterior collapse",
    title: "β-VAE Salinas at β ≥ 8 — textbook failure mode",
    body: "Salinas β-VAE at β=8 and β=16 collapses to ARI = 0.000: the encoder converges to q(z|x) ≈ p(z) regardless of input; the latent is uninformative. Salinas-A's compact 6-class structure resists the same regulariser. Visible black cells in the Benchmarks β-sweep heatmap.",
    accent: "rgba(120, 50, 50, 1)",
  },
];

type ScenePeek = {
  scene_id: string;
  n_pixels: number;
  n_labelled_pixels: number;
  n_classes: number;
  wavelengths_nm: number[];
  class_distribution: { label_id: number; name: string; count: number; rel_freq: number; color: string }[];
  class_mean_spectra: Record<string, { mean: number[]; p5: number[]; p95: number[] }>;
};

export default function Overview() {
  const { t } = useTranslation(["pages"]);

  const heroScenes = useQuery({
    queryKey: ["overview-scene-peek"],
    queryFn: async () => {
      const data = await Promise.all(
        LABELLED_SCENES.map((s) =>
          api.edaPerScene(s.id).catch(() => null),
        ),
      );
      return data as (ScenePeek | null)[];
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  return (
    <PageShell title={t("pages:overview.title")} lead={t("pages:overview.lead")}>
      <LandingCTA />
      <HeroSpectralViz scenes={heroScenes.data ?? null} />
      <HeadlineNumbers />
      <FindingsCarousel />
      <HypercubeAnatomy />
      <ScenesShowcase scenes={heroScenes.data ?? null} />
      <PillarsTriptych />
      <MethodCoverage />
      <ReadingPath />
    </PageShell>
  );
}

/* =========================================================================
   0. Landing CTA — one sentence + 2 primary actions
   =======================================================================*/

function LandingCTA() {
  const { t } = useTranslation(["pages"]);
  return (
    <div
      className="rounded-xl border px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <p
        className="text-base lg:text-lg leading-snug max-w-3xl"
        style={{ color: "var(--color-fg)" }}
      >
        {t("pages:overview.landing_cta.lead", {
          defaultValue:
            "Probabilistic topic models on hyperspectral imagery — a multi-axis evaluation framework that asks whether LDA basis spectra add interpretable value over deep encoders for HSI scene classification.",
        })}
      </p>
      <div className="flex gap-2 flex-wrap" role="group" aria-label="primary actions">
        <Link
          to="/workspace"
          className="rounded-md px-4 py-2 text-sm font-semibold transition-opacity"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-on-accent, white)",
          }}
        >
          {t("pages:overview.landing_cta.open_workspace", {
            defaultValue: "Open the Workspace →",
          })}
        </Link>
        <Link
          to="/methodology"
          className="rounded-md px-4 py-2 text-sm font-semibold border transition-opacity"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          {t("pages:overview.landing_cta.read_methodology", {
            defaultValue: "Read the methodology",
          })}
        </Link>
      </div>
    </div>
  );
}

/* =========================================================================
   1. Hero — spectral curves animation + cube
   =======================================================================*/

function HeroSpectralViz({ scenes }: { scenes: (ScenePeek | null)[] | null }) {
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
      <text x="20" y="32" fontSize="10.5" fill="currentColor" opacity="0.65">B = bandas</text>
      <text x="155" y="232" fontSize="10.5" fill="currentColor" opacity="0.65" textAnchor="middle">W = ancho (px)</text>
      <text x="285" y="100" fontSize="10.5" fill="currentColor" opacity="0.65" transform="rotate(90 285 100)">H = alto</text>

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

function HeadlineNumbers() {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {HEADLINE_DEFS.map((h) => (
          <Link
            key={h.keyLabel}
            to={h.href}
            className="rounded-lg border p-4 transition-all hover:scale-[1.02] hover:shadow-lg"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              className="text-[10.5px] uppercase tracking-widest font-medium"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t(`pages:overview.headlines.${h.keyLabel}`)}
            </div>
            <div
              className="mt-1 text-3xl font-semibold tracking-tight"
              style={{ color: "var(--color-accent)" }}
            >
              {h.value}
            </div>
            <div className="text-[11px]" style={{ color: "var(--color-fg-subtle)" }}>
              {t(`pages:overview.headlines.${h.keySub}`)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* =========================================================================
   3. Findings carousel — auto-rotating
   =======================================================================*/

function FindingsCarousel() {
  const { t } = useTranslation(["pages"]);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % FINDINGS.length), 7000);
    return () => clearInterval(timer);
  }, [paused]);
  const cur = FINDINGS[idx]!;

  return (
    <section className="mt-10">
      <div
        className="rounded-xl border p-6 md:p-7 relative overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        aria-roledescription="carousel"
        aria-label={t("pages:overview.findings.section_badge", { idx: idx + 1, total: FINDINGS.length })}
      >
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: cur.accent, transition: "background-color 0.6s ease" }}
        />
        <div className="flex flex-wrap items-center gap-3 mb-3 pl-3">
          <span
            className="rounded-md px-2 py-0.5 text-[10.5px] font-semibold tracking-widest uppercase"
            style={{ backgroundColor: cur.accent, color: "white" }}
          >
            {cur.badge}
          </span>
          <span
            className="text-[11px] uppercase tracking-widest"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:overview.findings.section_badge", { idx: idx + 1, total: FINDINGS.length })}
          </span>
        </div>
        <h2
          className="text-lg md:text-xl font-semibold tracking-tight mb-2 pl-3"
          style={{ color: "var(--color-fg)" }}
        >
          {cur.title}
        </h2>
        <p
          className="text-[14px] leading-relaxed max-w-4xl pl-3"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {cur.body}
        </p>
        <div className="mt-4 flex gap-1.5 pl-3">
          {FINDINGS.map((f, i) => (
            <button
              key={f.title}
              onClick={() => setIdx(i)}
              aria-label={`Show finding ${i + 1}`}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === idx ? 32 : 10,
                backgroundColor: i === idx ? f.accent : "var(--color-border)",
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   4. Hypercube anatomy — pixel → spectrum → tokens → topics flow
   =======================================================================*/

function HypercubeAnatomy() {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span
          className="text-[11px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-accent)" }}
        >
          {t("pages:overview.pipeline_anatomy.tag")}
        </span>
        <h2
          className="text-xl md:text-2xl font-semibold tracking-tight mt-1"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:overview.pipeline_anatomy.title")}
        </h2>
        <p
          className="mt-2 max-w-3xl text-[13.5px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t("pages:overview.pipeline_anatomy.lead")}
        </p>
      </div>

      <div
        className="rounded-xl border overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <svg viewBox="0 0 1080 320" className="w-full h-auto" role="img" aria-label="Pipeline anatomy">
          <defs>
            <marker id="ovw-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 Z" fill="currentColor"/>
            </marker>
            <linearGradient id="ovw-step1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(56,189,248,0.5)"/>
              <stop offset="100%" stopColor="rgba(31,119,180,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step2" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(170,60,200,0.5)"/>
              <stop offset="100%" stopColor="rgba(170,60,200,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step3" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(40,160,80,0.5)"/>
              <stop offset="100%" stopColor="rgba(40,160,80,0.18)"/>
            </linearGradient>
            <linearGradient id="ovw-step4" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgba(214,140,40,0.5)"/>
              <stop offset="100%" stopColor="rgba(214,140,40,0.18)"/>
            </linearGradient>
          </defs>

          {/* Step 1: Cube + pixel */}
          <g transform="translate(40, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage1_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage1_sub")}</text>
            {/* mini cube */}
            <polygon points="20,40 130,40 152,58 42,58" fill="url(#ovw-step1)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            <rect x="20" y="58" width="110" height="120" fill="url(#ovw-step1)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            <polygon points="130,58 152,58 152,178 130,178" fill="rgba(56,189,248,0.25)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
            {/* pixel highlight */}
            <rect x="68" y="98" width="10" height="10" fill="rgba(214,39,40,0.9)"/>
            <text x="80" y="107" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage1_pixel")}</text>
            <text x="20" y="200" fontSize="10" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage1_note")}</text>
          </g>

          <line x1="210" y1="135" x2="290" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 2: Discretization (12 V-recipes) */}
          <g transform="translate(300, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage2_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage2_sub")}</text>
            <rect x="0" y="32" width="220" height="148" fill="url(#ovw-step2)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* tokens list */}
            {Array.from({length: 6}, (_, i) => (
              <g key={i}>
                <rect x={12 + (i % 3) * 70} y={48 + Math.floor(i/3) * 32} width="60" height="22" rx="3" fill="rgba(170,60,200,0.25)" stroke="rgba(170,60,200,0.5)" strokeWidth="0.7"/>
                <text x={42 + (i % 3) * 70} y={63 + Math.floor(i/3) * 32} fontSize="9.5" textAnchor="middle" fill="currentColor" opacity="0.85" fontFamily="ui-monospace, monospace">
                  {["0822nm", "1102nm", "1442nm", "1922nm", "2204nm", "2356nm"][i]}
                </text>
              </g>
            ))}
            <text x="12" y="138" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage2_note1")}</text>
            <text x="12" y="154" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage2_note2")}</text>
            <text x="12" y="170" fontSize="9.5" fill="currentColor" opacity="0.55" fontStyle="italic">{t("pages:overview.pipeline_anatomy.stage2_note3")}</text>
          </g>

          <line x1="540" y1="135" x2="620" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 3: Topic model */}
          <g transform="translate(630, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage3_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage3_sub")}</text>
            <rect x="0" y="32" width="180" height="148" fill="url(#ovw-step3)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* phi rows */}
            {Array.from({length: 4}, (_, k) => (
              <g key={k}>
                <text x="10" y={56 + k * 22} fontSize="9.5" fill="currentColor" opacity="0.7" fontFamily="ui-monospace, monospace">φ_{k}</text>
                {Array.from({length: 12}, (_, b) => (
                  <rect key={b} x={32 + b * 12} y={48 + k * 22} width="10" height="10"
                        fill={`rgba(40,160,80,${0.12 + 0.7 * Math.abs(Math.sin(k * 1.7 + b * 0.4))})`}/>
                ))}
              </g>
            ))}
            <text x="10" y="160" fontSize="9.5" fill="currentColor" opacity="0.7">{t("pages:overview.pipeline_anatomy.stage3_note1")}</text>
            <text x="10" y="174" fontSize="9.5" fill="currentColor" opacity="0.55" fontStyle="italic">{t("pages:overview.pipeline_anatomy.stage3_note2")}</text>
          </g>

          <line x1="820" y1="135" x2="900" y2="135" stroke="currentColor" strokeWidth="1.4" markerEnd="url(#ovw-arr)" opacity="0.55"/>

          {/* Step 4: theta inspection */}
          <g transform="translate(910, 50)">
            <text x="0" y="-12" fontSize="11.5" fill="currentColor" fontWeight="600" opacity="0.88">{t("pages:overview.pipeline_anatomy.stage4_title")}</text>
            <text x="0" y="2" fontSize="10" fill="currentColor" opacity="0.55">{t("pages:overview.pipeline_anatomy.stage4_sub")}</text>
            <rect x="0" y="32" width="130" height="148" fill="url(#ovw-step4)" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8" rx="6"/>
            {/* simplex */}
            <polygon points="65,55 25,165 105,165" fill="rgba(214,140,40,0.25)" stroke="rgba(214,140,40,0.7)" strokeWidth="1.2"/>
            <text x="65" y="49" fontSize="10" textAnchor="middle" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic1")}</text>
            <text x="20" y="174" fontSize="10" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic2")}</text>
            <text x="105" y="174" fontSize="10" textAnchor="end" fill="currentColor" opacity="0.75" fontFamily="ui-monospace, monospace">{t("pages:overview.pipeline_anatomy.stage4_topic3")}</text>
            {/* points = pixels on simplex */}
            {[
              [65, 90], [50, 110], [80, 105], [70, 130], [55, 145], [90, 140], [60, 160], [85, 155], [75, 100],
            ].map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="rgba(214,140,40,0.95)"/>
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}

/* =========================================================================
   5. Scenes showcase — class distribution color bars
   =======================================================================*/

function ScenesShowcase({ scenes }: { scenes: (ScenePeek | null)[] | null }) {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <span
            className="text-[11px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {t("pages:overview.scenes.tag")}
          </span>
          <h2
            className="text-xl md:text-2xl font-semibold tracking-tight mt-1"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:overview.scenes.title")}
          </h2>
          <p
            className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {t("pages:overview.scenes.lead")}
          </p>
        </div>
        <Link
          to="/databases"
          className="text-[12.5px] underline-offset-4"
          style={{ color: "var(--color-accent)" }}
        >
          {t("pages:overview.scenes.open_catalogue")}
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LABELLED_SCENES.map((meta, i) => {
          const peek = scenes?.[i];
          return <SceneCard key={meta.id} meta={meta} peek={peek} />;
        })}
      </div>
    </section>
  );
}

function SceneCard({
  meta,
  peek,
}: {
  meta: { id: string; label: string; sensor: string };
  peek: ScenePeek | null | undefined;
}) {
  const { t } = useTranslation(["pages"]);
  const dist = peek?.class_distribution ?? [];
  return (
    <Link
      to={`/workspace?scene=${encodeURIComponent(meta.id)}`}
      className="rounded-lg border p-4 transition-all hover:shadow-lg hover:scale-[1.01] block"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          {meta.label}
        </h3>
        <span
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {meta.sensor}
        </span>
      </div>
      <div
        className="text-[11.5px] mb-2"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {peek
          ? `${peek.n_classes} ${t("pages:overview.scenes.n_classes_short")} · ${peek.n_labelled_pixels.toLocaleString("en-US")} ${t("pages:overview.scenes.n_pixels_short")} · ${peek.wavelengths_nm.length} ${t("pages:overview.scenes.n_bands_short")}`
          : t("pages:overview.scenes.loading_stat")}
      </div>
      {dist.length ? (
        <div className="w-full h-7 flex rounded overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          {dist.map((c) => (
            <div
              key={c.label_id}
              title={`${c.name} · ${c.count.toLocaleString("en-US")} px (${(c.rel_freq * 100).toFixed(1)}%)`}
              style={{
                width: `${c.rel_freq * 100}%`,
                backgroundColor: c.color,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="w-full h-7 rounded"
          style={{ backgroundColor: "var(--color-border)", opacity: 0.4 }}
        />
      )}
      {dist.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {dist.slice(0, 4).map((c) => (
            <span key={c.label_id} className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }}/>
              {c.name}
            </span>
          ))}
          {dist.length > 4 ? (
            <span className="text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>{t("pages:overview.scenes.more_classes", { count: dist.length - 4 })}</span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

/* =========================================================================
   6. Pillars triptych — rich SVG icons
   =======================================================================*/

function PillarsTriptych() {
  const { t } = useTranslation(["pages"]);
  const pillars = [
    {
      title: t("pages:overview.pillars.documents_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 1 }),
      body: t("pages:overview.pillars.documents_body"),
      icon: "doc",
    },
    {
      title: t("pages:overview.pillars.discretisation_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 2 }),
      body: t("pages:overview.pillars.discretisation_body"),
      icon: "tok",
    },
    {
      title: t("pages:overview.pillars.model_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 3 }),
      body: t("pages:overview.pillars.model_body"),
      icon: "mod",
    },
  ];
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.pillars.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.pillars.title")}
        </h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {pillars.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border p-5 relative overflow-hidden hover:shadow-lg transition-shadow"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div className="mb-3">
              <PillarIcon kind={p.icon as "doc" | "tok" | "mod"} />
            </div>
            <span className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
              {p.tag}
            </span>
            <h3 className="text-base font-semibold mt-1 mb-2" style={{ color: "var(--color-fg)" }}>
              {p.title}
            </h3>
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PillarIcon({ kind }: { kind: "doc" | "tok" | "mod" }) {
  if (kind === "doc") {
    return (
      <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
        {/* grid of pixels with one highlighted */}
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * 12 + 2}
              y={r * 11 + 2}
              width="10"
              height="9"
              fill={r === 2 && c === 4 ? "rgba(214,39,40,0.9)" : `rgba(56,189,248,${0.2 + 0.5 * ((r + c) % 3) / 2})`}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
          )),
        )}
      </svg>
    );
  }
  if (kind === "tok") {
    return (
      <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
        {/* spectrum line and quantisation bars */}
        <path d="M 0,40 C 12,10 24,55 36,30 S 60,5 72,38 S 96,12 100,28" fill="none" stroke="rgba(170,60,200,1)" strokeWidth="1.5"/>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 10 + 1} y="42" width="8" height={8 + (i % 4) * 4} fill="rgba(170,60,200,0.55)" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.4"/>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
      {/* topic-word phi heatmap */}
      {Array.from({ length: 5 }, (_, k) =>
        Array.from({ length: 12 }, (_, b) => (
          <rect
            key={`${k}-${b}`}
            x={b * 8 + 2}
            y={k * 11 + 2}
            width="7"
            height="9"
            fill={`rgba(40,160,80,${0.15 + 0.7 * Math.abs(Math.sin(k * 1.4 + b * 0.6))})`}
          />
        )),
      )}
    </svg>
  );
}

/* =========================================================================
   7. Method coverage panel
   =======================================================================*/

function MethodCoverage() {
  const { t } = useTranslation(["pages"]);
  const groups = [
    {
      title: t("pages:overview.coverage.lda_family"),
      color: "rgba(56,189,248,1)",
      items: ["LDA (canonical)", "gensim_vb", "gensim_multicore", "sklearn_online", "sklearn_sparse", "tomotopy_lda", "tomotopy_hdp", "tomotopy_ctm", "dmr_lda_hidsag"],
    },
    {
      title: t("pages:overview.coverage.neural_topic"),
      color: "rgba(170,60,200,1)",
      items: ["ProdLDA (Pyro)", "ETM (low-rank ρα^T)"],
    },
    {
      title: t("pages:overview.coverage.deep_repr"),
      color: "rgba(40,160,80,1)",
      items: ["CAE-1D (K∈{4,6,8,10,12,16,32})", "CAE-2D (K∈{4,8,16,32})", "CAE-3D anchor (K∈{4,8,16,32})", "CAE-3D full-patch (K∈{4,8})", "β-VAE (β∈{1,2,4,8,16})"],
    },
    {
      title: t("pages:overview.coverage.k_baselines"),
      color: "rgba(214,140,40,1)",
      items: ["PCA-K", "NMF-K", "ICA-K", "dense-AE"],
    },
    {
      title: t("pages:overview.coverage.axes"),
      color: "rgba(214,39,40,1)",
      items: ["B-1 linear probe", "B-2 rate-distortion", "B-3 topic-routed + deep gate", "B-4 mutual information", "B-5 embedded baseline", "B-6 seed stability (N=7/15/30)", "B-7 USGS alignment", "B-8 cross-scene transfer", "B-9 anomaly", "B-10 spatial coherence", "B-11 endmember", "B-12 LLM tea-leaves"],
    },
  ];
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.coverage.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.coverage.title")}
        </h2>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
        {groups.map((g) => (
          <div
            key={g.title}
            className="rounded-lg border p-3 relative"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              aria-hidden="true"
              className="absolute top-0 left-0 right-0 h-1 rounded-t-lg"
              style={{ backgroundColor: g.color }}
            />
            <div className="text-[11px] uppercase tracking-widest font-semibold mt-1.5 mb-2" style={{ color: g.color }}>
              {g.title}
            </div>
            <ul className="space-y-1">
              {g.items.map((item) => (
                <li key={item} className="text-[12px] leading-relaxed flex items-start gap-1.5" style={{ color: "var(--color-fg-subtle)" }}>
                  <span aria-hidden className="inline-block w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: g.color }}/>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================================
   8. Reading path
   =======================================================================*/

function ReadingPath() {
  const { t } = useTranslation(["pages"]);
  const steps = [
    { tag: t("pages:overview.reading_path.step1_tag"), title: t("pages:overview.reading_path.step1_title"), body: t("pages:overview.reading_path.step1_body"), href: "/methodology/theory" },
    { tag: t("pages:overview.reading_path.step2_tag"), title: t("pages:overview.reading_path.step2_title"), body: t("pages:overview.reading_path.step2_body"), href: "/methodology/representations" },
    { tag: t("pages:overview.reading_path.step3_tag"), title: t("pages:overview.reading_path.step3_title"), body: t("pages:overview.reading_path.step3_body"), href: "/methodology/pipeline" },
    { tag: t("pages:overview.reading_path.step4_tag"), title: t("pages:overview.reading_path.step4_title"), body: t("pages:overview.reading_path.step4_body"), href: "/methodology/application" },
    { tag: t("pages:overview.reading_path.step5_tag"), title: t("pages:overview.reading_path.step5_title"), body: t("pages:overview.reading_path.step5_body"), href: "/databases" },
    { tag: t("pages:overview.reading_path.step6_tag"), title: t("pages:overview.reading_path.step6_title"), body: t("pages:overview.reading_path.step6_body"), href: "/workspace" },
    { tag: t("pages:overview.reading_path.step7_tag"), title: t("pages:overview.reading_path.step7_title"), body: t("pages:overview.reading_path.step7_body"), href: "/benchmarks" },
  ];
  return (
    <section className="mt-12 mb-8">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.reading_path.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.reading_path.title")}
        </h2>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link
              to={s.href}
              className="block h-full rounded-lg border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
                  {s.tag}
                </span>
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                >
                  {i + 1}
                </span>
              </div>
              <h3 className="text-[14.5px] font-semibold mt-2" style={{ color: "var(--color-fg)" }}>
                {s.title}
              </h3>
              <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--color-fg-subtle)" }}>
                {s.body}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
