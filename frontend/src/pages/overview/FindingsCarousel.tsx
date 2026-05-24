import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Source-anchor convention (added per #544 audit, 2026-05-23):
//   `href`     deep-links to the Benchmarks tab that visualises the finding.
//   `kind`     "benchmark" → has a tab anchor, click reveals the supporting plot.
//              "operational" → engineering / runtime claim with no benchmark
//              tab. Marked exploratory on-card.
const FINDINGS = [
  {
    badge: "B-3",
    title: "θ as a gate beats raw on labelled scenes",
    body: "topic_routed_soft matches or beats raw_logistic on all 6 labelled scenes; theta_logistic (θ as a flat feature) loses by 30–50 pp everywhere. The framing 'θ is a gate, not a feature' is empirically validated.",
    accent: "rgba(40, 160, 80, 1)",
    href: "/benchmarks#gating",
    kind: "benchmark" as const,
  },
  {
    badge: "B-3 follow-up",
    title: "No deep encoder can replace θ as the gate",
    body: "Hierarchical Bayesian: raw > θ > {pca_8, cae_1d_8, beta_vae_8} at P(μ_a > μ_b) ≥ 0.999. Softmaxed deep latents satisfy the simplex constraint geometrically but not structurally — the gating mechanism does not transfer.",
    accent: "rgba(214, 39, 40, 1)",
    href: "/benchmarks#gating",
    kind: "benchmark" as const,
  },
  {
    badge: "Topic family",
    title: "LDA wins ARI · ProdLDA wins coherence · ETM is the safe middle",
    body: "Head-to-head on 220-per-class stratified samples: LDA wins KMeans-vs-label ARI on 4/6 scenes; ProdLDA wins c_v topic coherence 6/6; ETM beats ProdLDA on ARI 6/6 (multi-seed N=5).",
    accent: "rgba(31, 119, 180, 1)",
    href: "/benchmarks#gating",
    kind: "benchmark" as const,
  },
  {
    badge: "Decoder design",
    title: "Decoder reconstruction target is itself a hyperparameter",
    body: "CAE-3D anchor-only vs full-patch gives net mean ΔARI ≈ +0.003 (K=8) and +0.011 (K=4) — neutral on average, scene-dependent direction. Pavia U inverts with capacity.",
    accent: "rgba(170, 60, 200, 1)",
    href: "/benchmarks#deep",
    kind: "benchmark" as const,
  },
  {
    badge: "GPU stack · operational",
    title: "50–120× speedup on the deep / neural family",
    body: "RTX 4070 Laptop CUDA 12.6: cae_3d_full K=32 single scene goes from ~60 min CPU to ~30 s GPU. Full K-curve {4, 8, 16, 32} × 6 scenes from 9–12 h CPU to ~10 min GPU. Determinism drift ±0.010 ARI is below per-seed σ ≈ 0.05. Engineering claim — runtime / determinism only, not a methodological result.",
    accent: "rgba(214, 140, 40, 1)",
    href: "/methodology/pipeline",
    kind: "operational" as const,
  },
  {
    badge: "Stability",
    title: "9-method × 6-scene seed stability ladder",
    body: "PCA = ICA (1.000 deterministic) > LDA > NMF > CAE-2D > CAE-1D > CAE-3D > dense-AE > β-VAE. KSC β-VAE off-diag ≈ 0.18 — KL stochasticity overwhelms the inter-seed signal.",
    accent: "rgba(140, 86, 75, 1)",
    href: "/benchmarks#axes",
    kind: "benchmark" as const,
  },
  {
    badge: "Posterior collapse",
    title: "β-VAE Salinas at β ≥ 8 — textbook failure mode",
    body: "Salinas β-VAE at β=8 and β=16 collapses to ARI = 0.000: the encoder converges to q(z|x) ≈ p(z) regardless of input; the latent is uninformative. Salinas-A's compact 6-class structure resists the same regulariser.",
    accent: "rgba(120, 50, 50, 1)",
    href: "/benchmarks#deep",
    kind: "benchmark" as const,
  },
];

export function FindingsCarousel() {
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
        <div className="mt-4 pl-3">
          <Link
            to={cur.href}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline"
            style={{ color: cur.accent }}
          >
            {cur.kind === "operational"
              ? "See the pipeline page →"
              : "See the supporting Benchmarks panel →"}
          </Link>
        </div>
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

