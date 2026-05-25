import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Source-anchor convention (added per #544 audit, 2026-05-23):
//   `href`     deep-links to the Benchmarks tab that visualises the finding.
//   `kind`     "benchmark" → has a tab anchor, click reveals the supporting plot.
//              "operational" → engineering / runtime claim with no benchmark
//              tab. Marked exploratory on-card.
// Card copy (badge/title/body) lives in i18n under
// `pages:overview.findings.cards.<key>` so both locales stay in sync.
type FindingMeta = {
  key: string;
  accent: string;
  href: string;
  kind: "benchmark" | "operational";
};

const FINDINGS: FindingMeta[] = [
  { key: "b3", accent: "rgba(40, 160, 80, 1)", href: "/benchmarks#gating", kind: "benchmark" },
  { key: "b3_followup", accent: "rgba(214, 39, 40, 1)", href: "/benchmarks#gating", kind: "benchmark" },
  { key: "topic_family", accent: "rgba(31, 119, 180, 1)", href: "/benchmarks#gating", kind: "benchmark" },
  { key: "decoder_design", accent: "rgba(170, 60, 200, 1)", href: "/benchmarks#deep", kind: "benchmark" },
  { key: "gpu_stack", accent: "rgba(214, 140, 40, 1)", href: "/methodology/pipeline", kind: "operational" },
  { key: "stability", accent: "rgba(140, 86, 75, 1)", href: "/benchmarks#axes", kind: "benchmark" },
  { key: "posterior_collapse", accent: "rgba(120, 50, 50, 1)", href: "/benchmarks#deep", kind: "benchmark" },
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
  const k = (suffix: string) => `pages:overview.findings.cards.${cur.key}.${suffix}`;

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
            style={{ backgroundColor: cur.accent, color: "var(--color-on-accent, white)" }}
          >
            {t(k("badge"))}
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
          {t(k("title"))}
        </h2>
        <p
          className="text-[14px] leading-relaxed max-w-4xl pl-3"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t(k("body"))}
        </p>
        <div className="mt-4 pl-3">
          <Link
            to={cur.href}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium underline-offset-4 hover:underline"
            style={{ color: cur.accent }}
          >
            {t(
              cur.kind === "operational"
                ? "pages:overview.findings.see_pipeline"
                : "pages:overview.findings.see_benchmark",
            )}
          </Link>
        </div>
        <div className="mt-4 flex gap-1.5 pl-3">
          {FINDINGS.map((f, i) => (
            <button
              key={f.key}
              onClick={() => setIdx(i)}
              aria-label={t("pages:overview.findings.show_finding_aria", { n: i + 1 })}
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

