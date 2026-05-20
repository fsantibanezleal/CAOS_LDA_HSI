import { useQueries, useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

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
            No se pudo cargar /api/method-statistics.
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

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
            <div className="space-y-8">
              <LlmTeaLeavesSection />
            </div>
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

const LABELLED_SCENES = [
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
];


function LlmTeaLeavesSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.map((sceneId) => ({
      queryKey: ["llm-tea-leaves", sceneId],
      queryFn: () => api.llmTeaLeaves(sceneId),
      retry: false,
    })),
  });
  const ready = queries
    .map((q, i) => ({ sceneId: LABELLED_SCENES[i]!, data: q.data }))
    .filter((row) => row.data);

  if (ready.length === 0) {
    return (
      <Section
        title="B-12 — LLM tea-leaves (Stammbach et al. TACL 2024)"
        lead="Word-intrusion + coherent-label probes via Anthropic Claude. Builder is gated by ANTHROPIC_API_KEY; outputs land in data/derived/llm_tea_leaves once the env var is set and the builder is run."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No scenes evaluated yet. Set <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
          and run <code className="font-mono">build-b12-llm-tea-leaves</code> to populate.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="B-12 — LLM tea-leaves (Stammbach et al. TACL 2024)"
      lead="Per-scene word-intrusion accuracy + per-topic LLM labels. Higher intrusion accuracy means the LLM correctly identifies the foreign word slipped into each topic's top-10 — a coherence signal that correlates with NPMI in prior work."
    >
      <div className="space-y-6">
        <table
          className="w-full text-sm"
          style={{ color: "var(--color-text)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2">scene</th>
              <th className="text-left font-mono text-[12px] pb-2">topics</th>
              <th className="text-left font-mono text-[12px] pb-2">
                intrusion accuracy
              </th>
              <th className="text-left font-mono text-[12px] pb-2">model</th>
            </tr>
          </thead>
          <tbody>
            {ready.map(({ sceneId, data }) => (
              <tr
                key={sceneId}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1.5 font-mono">{sceneId}</td>
                <td className="py-1.5">{data!.topic_count}</td>
                <td className="py-1.5">
                  <span style={{ color: "var(--color-accent)" }}>
                    {(data!.intrusion_accuracy * 100).toFixed(1)}%
                  </span>{" "}
                  ({data!.n_correct_intrusion}/{data!.n_attempted})
                </td>
                <td className="py-1.5 font-mono text-[12px]">{data!.model}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {ready.map(({ sceneId, data }) => (
          <details
            key={sceneId}
            className="rounded-md border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
            }}
          >
            <summary className="cursor-pointer font-mono text-[13px]">
              {sceneId} — per-topic LLM labels
            </summary>
            <ul className="mt-2 space-y-1 text-sm">
              {data!.per_topic.map((tt) => (
                <li key={tt.topic_id} className="font-mono text-[12.5px]">
                  <span style={{ color: "var(--color-text-muted)" }}>
                    topic {tt.topic_id}
                  </span>{" "}
                  {tt.skipped ? (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      — skipped ({tt.reason})
                    </span>
                  ) : (
                    <>
                      <span
                        style={{
                          color: tt.intrusion_correct
                            ? "var(--color-accent)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        [{tt.intrusion_correct ? "✓" : "✗"}]
                      </span>{" "}
                      {tt.llm_label || "(no label)"}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Section>
  );
}


