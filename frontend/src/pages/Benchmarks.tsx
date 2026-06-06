import { useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { PageShell } from "@/components/PageShell";

const BenchmarksSummary = lazy(() =>
  import("./benchmarks/BenchmarksSummary").then((m) => ({
    default: m.BenchmarksSummary,
  })),
);
const BenchmarksGating = lazy(() =>
  import("./benchmarks/BenchmarksGating").then((m) => ({
    default: m.BenchmarksGating,
  })),
);
const BenchmarksDeep = lazy(() =>
  import("./benchmarks/BenchmarksDeep").then((m) => ({
    default: m.BenchmarksDeep,
  })),
);
const BenchmarksAxes = lazy(() =>
  import("./benchmarks/BenchmarksAxes").then((m) => ({
    default: m.BenchmarksAxes,
  })),
);
const BenchmarksHidsag = lazy(() =>
  import("./benchmarks/BenchmarksHidsag").then((m) => ({
    default: m.BenchmarksHidsag,
  })),
);
const BenchmarksLlm = lazy(() =>
  import("./benchmarks/BenchmarksLlm").then((m) => ({
    default: m.BenchmarksLlm,
  })),
);

type BenchmarksTab =
  | "summary"
  | "gating"
  | "deep"
  | "axes"
  | "hidsag"
  | "llm";

const BENCHMARKS_TABS: { id: BenchmarksTab; labelKey: string; tagKey: string; color: string }[] = [
  { id: "summary", labelKey: "summary", tagKey: "summary_tag", color: "rgba(56, 189, 248, 1)" },
  { id: "gating", labelKey: "gating", tagKey: "gating_tag", color: "rgba(40, 160, 80, 1)" },
  { id: "deep", labelKey: "deep", tagKey: "deep_tag", color: "rgba(170, 60, 200, 1)" },
  { id: "axes", labelKey: "axes", tagKey: "axes_tag", color: "rgba(214, 140, 40, 1)" },
  { id: "hidsag", labelKey: "hidsag", tagKey: "hidsag_tag", color: "rgba(214, 39, 40, 1)" },
  { id: "llm", labelKey: "llm", tagKey: "llm_tag", color: "rgba(140, 86, 75, 1)" },
];

function readHashTab(): BenchmarksTab | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "") as BenchmarksTab;
  if (BENCHMARKS_TABS.some((t) => t.id === h)) return h;
  return null;
}

export default function Benchmarks() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["method-statistics"],
    queryFn: api.methodStatistics,
  });

  const [tab, setTab] = useState<BenchmarksTab>(() => readHashTab() ?? "summary");
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.replace(/^#/, "") !== tab) {
      window.location.hash = tab;
    }
  }, [tab]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHash = () => {
      const h = readHashTab();
      if (h) setTab(h);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <PageShell
      title={t("pages:benchmarks.title")}
      lead={t("pages:benchmarks.lead")}
    >
      {isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>Loading statistics…</p>
      )}

      {error && (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            Could not load /api/method-statistics.
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      <details
        className="mb-5 rounded-lg border"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
        open
      >
        <summary
          className="cursor-pointer px-4 py-3 text-sm font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          How to read these benchmarks — what is compared, and why each metric
        </summary>
        <div
          className="px-4 pb-4 text-[12.5px] space-y-2"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <p>
            This is an <strong>evaluation study</strong>, not a leaderboard. The
            question is <em>which spectral representation builds the most useful
            LDA topics for hyperspectral imagery</em> — and whether the topic
            mixture θ adds value <strong>as a gate, not as a flat feature</strong>.
          </p>
          <p>
            <strong>What is compared:</strong> raw-spectrum baselines (logistic /
            Ridge / PLS on the full spectrum) · topic features (θ fed directly to
            a classifier/regressor — the naive "θ as a feature") · the proposed{" "}
            <strong>soft θ-gated ensemble</strong> (one specialist per topic,
            combined weighted by θ — "θ as a gate").
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>macro-F1</strong> (classification): balanced accuracy across
              all land-cover classes (0–1, higher is better).
            </li>
            <li>
              <strong>c_v coherence</strong> (F-2): how well a topic's top words
              co-occur — topic quality (0–1, higher is better).
            </li>
            <li>
              <strong>NMI</strong> (F-7): agreement between the unsupervised topics
              and the true labels (0–1) — does the representation recover class
              structure without supervision?
            </li>
            <li>
              <strong>R²</strong> (HIDSAG regression): fraction of target variance
              explained; <strong>R² &lt; 0 means worse than just predicting the
              mean</strong>. A hard cross-domain stress test, not the headline.
            </li>
          </ul>
          <p>
            <strong>Key finding:</strong> θ as a flat feature loses badly to raw
            spectra (it was never meant to be a feature); the{" "}
            <strong>soft θ-gated ensemble beats the raw baselines</strong> on
            classification (6/6 scenes) and on the valid regression subset
            (GEOMET) — which is the point.
          </p>
        </div>
      </details>

      <BenchmarksTabBar tab={tab} onPick={setTab} />

      {data && (
        <>
          {tab === "summary" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading summary…</p>}>
              <BenchmarksSummary data={data} />
            </Suspense>
          )}

          {tab === "gating" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading gating…</p>}>
              <BenchmarksGating />
            </Suspense>
          )}

          {tab === "deep" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading deep…</p>}>
              <BenchmarksDeep />
            </Suspense>
          )}

          {tab === "axes" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading axes…</p>}>
              <BenchmarksAxes />
            </Suspense>
          )}

          {tab === "hidsag" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading hidsag…</p>}>
              <BenchmarksHidsag />
            </Suspense>
          )}

          {tab === "llm" && (
            <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading llm…</p>}>
              <BenchmarksLlm />
            </Suspense>
          )}
        </>
      )}
    </PageShell>
  );
}

function BenchmarksTabBar({
  tab,
  onPick,
}: {
  tab: BenchmarksTab;
  onPick: (t: BenchmarksTab) => void;
}) {
  const { t } = useTranslation(["pages"]);
  return (
    <nav
      role="tablist"
      aria-label="Benchmarks sections"
      className="flex flex-wrap gap-2 my-6 pb-3 border-b sticky top-14 z-30"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "color-mix(in oklab, var(--color-bg) 90%, transparent)",
        backdropFilter: "blur(8px)",
      }}
    >
      {BENCHMARKS_TABS.map((tt) => {
        const isActive = tab === tt.id;
        return (
          <button
            key={tt.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onPick(tt.id)}
            className="rounded-lg border px-4 py-2.5 text-sm text-left transition-all hover:-translate-y-0.5"
            style={{
              borderColor: isActive ? tt.color : "var(--color-border)",
              backgroundColor: isActive ? "var(--color-accent-soft)" : "var(--color-panel)",
              boxShadow: isActive ? "var(--color-shadow)" : "none",
              minWidth: 180,
            }}
          >
            <div
              className="text-[10.5px] uppercase tracking-widest font-semibold"
              style={{ color: tt.color }}
            >
              {t(`pages:benchmarks.tabs.${tt.labelKey}`)}
            </div>
            <div
              className="text-[11px] mt-0.5"
              style={{ color: isActive ? "var(--color-fg)" : "var(--color-fg-faint)" }}
            >
              {t(`pages:benchmarks.tabs.${tt.tagKey}`)}
            </div>
          </button>
        );
      })}
    </nav>
  );
}


