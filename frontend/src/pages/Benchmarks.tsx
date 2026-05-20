import { useQueries, useQuery } from "@tanstack/react-query";
import { Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  api,
  type HidsagMethodStatistics,
  type HidsagPreprocessingSubset,
} from "@/api/client";
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

const HIDSAG_SUBSETS = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"];

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
            <div className="space-y-8">
              <CrossSceneTransferSection />
              <RateDistortionSection />
              <MutualInfoSection />
              <EndmemberBaselineSection />
              <SpatialCoherenceSection />
              <SuperTopicsSection />
            </div>
          )}

          {tab === "hidsag" && (
            <div className="space-y-8">
              <HidsagBenchmarks />
              <HidsagPreprocessing />
              <HidsagCrossPreprocessingStability />
            </div>
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

function SpatialCoherenceSection() {
  const subQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-spatial-continuous", sc],
      queryFn: () => api.topicSpatialContinuous(sc),
      retry: false,
    })),
  });
  const fullQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-spatial-full", sc],
      queryFn: () => api.topicSpatialFull(sc),
      retry: false,
    })),
  });
  const ready = subQs.every((q) => q.data || q.error);
  if (!ready) {
    return (
      <Section title="B-10 spatial coherence — Moran's I + Geary's C" lead="Loading spatial coherence…">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }
  const rows = LABELLED_SCENES.map((sc, i) => ({
    scene: sc,
    sub_I: subQs[i]?.data?.aggregated_morans_I_mean_over_topics ?? null,
    sub_C: subQs[i]?.data?.aggregated_gearys_C_mean_over_topics ?? null,
    full_I: fullQs[i]?.data?.aggregated_morans_I_mean_over_topics ?? null,
    full_C: fullQs[i]?.data?.aggregated_gearys_C_mean_over_topics ?? null,
  }));
  return (
    <Section
      title="B-10 spatial coherence — Moran's I + Geary's C"
      lead="Per-topic θ_k abundance maps Moran's I + Geary's C with 4-neighbour rook contiguity, mean across topics. Two readings: subsampled (220-per-class basis) and full (full-pixel mask LDA refit). KSC's collapse on the subsampled basis is a pipeline artifact — full-pixel refit recovers spatial coherence."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">subsampled mean Moran I</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">subsampled mean Geary C</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full-pixel mean Moran I</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full-pixel mean Geary C</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ksc = r.scene === "kennedy-space-center";
              const subColor = r.sub_I != null && r.sub_I < 0.5
                ? "rgba(214,39,40,1)"
                : "var(--color-accent)";
              return (
                <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                  <td className="py-1.5 pr-3 text-right font-mono" style={{ color: subColor }}>
                    {r.sub_I != null ? r.sub_I.toFixed(3) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {r.sub_C != null ? r.sub_C.toFixed(3) : "—"}
                  </td>
                  <td
                    className="py-1.5 pr-3 text-right font-mono"
                    style={{
                      color: ksc ? "var(--color-accent)" : "var(--color-text)",
                      fontWeight: ksc ? "600" : "400",
                    }}
                  >
                    {r.full_I != null ? r.full_I.toFixed(3) : "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {r.full_C != null ? r.full_C.toFixed(3) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
        Headline: 5/6 scenes show high spatial coherence (mean Moran I ≥ 0.80) on the subsampled basis.
        KSC drops to 0.064 (red) — but the <strong>full-pixel refit</strong> recovers I = 0.837, demonstrating that
        KSC's "collapse" is an artifact of stratified 220-per-class sampling on a sparse-class scene, not a fundamental
        data problem.
      </p>
    </Section>
  );
}

function EndmemberBaselineSection() {
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["endmember-baseline", scene],
    queryFn: () => api.endmemberBaseline(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section title="B-11 endmember baseline — NFINDR / ATGP vs LDA topics" lead="Loading endmember baseline…">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }
  const matrix = data.topic_endmember_match.topic_x_endmember_cosine ?? [];
  const cell = 24;

  return (
    <Section
      title="B-11 endmember baseline — NFINDR / ATGP vs LDA topics"
      lead={`At K=${data.K}, NFINDR + ATGP endmembers extracted from the canonical labelled-pixel subset (${data.n_pixels_used.toLocaleString()} px, ${data.n_bands} bands). Cosine similarity between LDA topics and NFINDR endmembers — at the same K, both methods land on the same spectral primitives (typical cosine 0.92-1.00).`}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Scene:</span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Object.entries(data.reconstruction_rmse_normalised).map(([m, v]) => (
          <div
            key={m}
            className="rounded-md border p-2"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <div className="text-[10px] mb-1 font-mono uppercase tracking-wide" style={{ color: "var(--color-text-muted)" }}>
              {m.replace(/_/g, " ")} RMSE (normalised)
            </div>
            <div className="font-mono text-[13px]" style={{ color: "var(--color-text)" }}>
              {v.toFixed(4)}
            </div>
          </div>
        ))}
      </div>
      {matrix.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="text-[12px] mb-2" style={{ color: "var(--color-text-muted)" }}>
            Topic × NFINDR endmember cosine matrix:
          </p>
          <svg
            viewBox={`0 0 ${matrix[0]!.length * cell + 80} ${matrix.length * cell + 50}`}
            role="img"
            aria-label="topic × endmember cosine matrix"
            style={{ maxWidth: "min(100%, 540px)" }}
          >
            {matrix.map((row, i) =>
              row.map((v, j) => {
                const t = Math.max(0, Math.min(1, v));
                const r = Math.round(50 + (1 - t) * 200);
                const g = Math.round(50 + t * 130);
                const b = Math.round(80 + t * 100);
                return (
                  <g key={`${i}-${j}`}>
                    <title>{`topic ${i + 1} ↔ endmember ${j + 1} = ${v.toFixed(3)}`}</title>
                    <rect
                      x={70 + j * cell}
                      y={20 + i * cell}
                      width={cell - 1}
                      height={cell - 1}
                      fill={`rgb(${r},${g},${b})`}
                    />
                  </g>
                );
              })
            )}
            {matrix.map((_, i) => (
              <text
                key={`row-${i}`}
                x={64}
                y={20 + i * cell + cell / 2 + 3}
                fontSize="9"
                textAnchor="end"
                fill="currentColor"
                opacity="0.7"
                fontFamily="ui-monospace, monospace"
              >
                t{i + 1}
              </text>
            ))}
            {matrix[0]!.map((_, j) => (
              <text
                key={`col-${j}`}
                x={70 + j * cell + cell / 2}
                y={16}
                fontSize="9"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.7"
                fontFamily="ui-monospace, monospace"
              >
                e{j + 1}
              </text>
            ))}
          </svg>
        </div>
      ) : null}
      <p className="mt-3 text-[12.5px]" style={{ color: "var(--color-text-muted)" }}>
        Bright cells = high cosine (topic and endmember spectrally aligned). Diagonal-like pattern = the two methods recover the same spectral primitives. Master-plan position: at the same K, NMF, NFINDR, and LDA all recover comparable spectral structure; what separates them is interpretability and downstream gating utility (B-3, B-7).
      </p>
    </Section>
  );
}

function MutualInfoSection() {
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["mutual-information", scene],
    queryFn: () => api.mutualInformation(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section title="B-4 mutual information — per-feature MI(z; y)" lead="Loading mutual information…">
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }
  // Sort methods by per_feature_mi_sum_nats descending; cap at top 14 to keep readable.
  const methods = Object.entries(data.method_mi)
    .sort((a, b) => (b[1].per_feature_mi_sum_nats - a[1].per_feature_mi_sum_nats))
    .slice(0, 14);

  // Build a heatmap: rows = methods, columns = features (truncated to first 32 if larger)
  const maxCols = 32;
  const labelW = 130;
  const cellW = 16;
  const rowH = 22;
  const headerH = 24;
  const W = labelW + maxCols * cellW + 80;
  const H = headerH + methods.length * rowH + 30;

  // Find global max MI for color scale
  let gMax = 0;
  for (const [, info] of methods) {
    for (const v of info.per_feature_mi.slice(0, maxCols)) {
      if (v > gMax) gMax = v;
    }
  }

  return (
    <Section
      title="B-4 mutual information — per-feature MI(z; y)"
      lead="For each method, MI between every latent feature z_k and the label y. Bright = high MI = informative feature. Per-feature distribution is the right discriminative signal — joint MI clips to label entropy once K is non-degenerate."
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>Scene:</span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>
      <p
        className="text-[12px] mb-2"
        style={{ color: "var(--color-text-muted)" }}
      >
        Label entropy H(Y) = {data.label_entropy_nats.toFixed(3)} nats ({data.label_entropy_bits.toFixed(3)} bits) — the upper bound for joint MI. Top {methods.length} methods sorted by per-feature MI sum.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="MI heatmap" style={{ maxWidth: "min(100%, 760px)" }}>
          {methods.map(([mname, info], i) => {
            const feats = info.per_feature_mi.slice(0, maxCols);
            return (
              <g key={mname}>
                <text
                  x={labelW - 6}
                  y={headerH + i * rowH + rowH / 2 + 3}
                  fontSize="10"
                  textAnchor="end"
                  fill="currentColor"
                  fontFamily="ui-monospace, monospace"
                >
                  {mname.replace("_", " ")}
                </text>
                {feats.map((v, j) => {
                  const t = Math.max(0, Math.min(1, v / gMax));
                  const r = Math.round(50 + (1 - t) * 200);
                  const g = Math.round(50 + t * 130);
                  const b = Math.round(80 + t * 100);
                  return (
                    <g key={j}>
                      <title>{`${mname} · feature ${j} · MI=${v.toFixed(3)}`}</title>
                      <rect
                        x={labelW + j * cellW}
                        y={headerH + i * rowH}
                        width={cellW - 1}
                        height={rowH - 2}
                        fill={`rgb(${r},${g},${b})`}
                      />
                    </g>
                  );
                })}
                <text
                  x={labelW + Math.min(feats.length, maxCols) * cellW + 8}
                  y={headerH + i * rowH + rowH / 2 + 3}
                  fontSize="9.5"
                  fill="currentColor"
                  opacity="0.7"
                  fontFamily="ui-monospace, monospace"
                >
                  Σ={info.per_feature_mi_sum_nats.toFixed(2)}
                </text>
              </g>
            );
          })}
          <text x={labelW + (maxCols * cellW) / 2} y={14} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.7">
            feature index k → (capped at {maxCols} for readability)
          </text>
        </svg>
      </div>
    </Section>
  );
}

function RateDistortionSection() {
  const [scene, setScene] = useState<string>(LABELLED_SCENES[0]!);
  const { data, error } = useQuery({
    queryKey: ["rate-distortion-curve", scene],
    queryFn: () => api.rateDistortionCurve(scene),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section
        title="B-2 rate-distortion curve — reconstruction RMSE vs K"
        lead="Loading rate-distortion curves…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }
  const Ks = data.K_grid;
  const W = 540;
  const H = 240;
  const padding = 40;
  const allRmse: number[] = [];
  for (const m of Object.keys(data.method_curves)) {
    for (const p of data.method_curves[m] ?? []) {
      if (typeof p.rmse_test === "number") allRmse.push(p.rmse_test);
    }
  }
  const yMin = Math.min(...allRmse);
  const yMax = Math.max(...allRmse);
  const xOf = (k: number) =>
    padding +
    ((k - Math.min(...Ks)) / (Math.max(...Ks) - Math.min(...Ks))) *
      (W - 2 * padding);
  const yOf = (v: number) =>
    padding + ((yMax - v) / Math.max(1e-9, yMax - yMin)) * (H - 2 * padding);
  const colors: Record<string, string> = {
    lda: "rgba(31,119,180,1)",
    nmf: "rgba(255,127,14,1)",
    pca: "rgba(44,160,44,1)",
  };
  return (
    <Section
      title="B-2 rate-distortion curve — reconstruction RMSE vs K"
      lead="LDA / NMF / PCA reconstruction RMSE on a 20% held-out test split, across K∈{4, 6, 8, 10, 12, 16}. PCA is the L2-optimal compressor (wins everywhere). NMF a close second. LDA last because it optimises a multinomial likelihood, not L2 RMSE — this is the expected picture and is documented as Axis G."
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[12px]" style={{ color: "var(--color-text-muted)" }}>
          Scene:
        </span>
        {LABELLED_SCENES.map((sc) => (
          <button
            key={sc}
            type="button"
            onClick={() => setScene(sc)}
            className="px-2 py-0.5 rounded text-[11px] font-mono"
            style={{
              backgroundColor: scene === sc ? "var(--color-accent)" : "var(--color-panel)",
              color: scene === sc ? "var(--color-bg)" : "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {sc.split("-")[0]}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label="rate-distortion curve">
        <line x1={padding} y1={H - padding} x2={W - padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        <line x1={padding} y1={padding} x2={padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        {Ks.map((k) => (
          <text
            key={k}
            x={xOf(k)}
            y={H - padding + 15}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            K={k}
          </text>
        ))}
        {[yMin, (yMin + yMax) / 2, yMax].map((y, i) => (
          <text
            key={i}
            x={padding - 6}
            y={yOf(y) + 3}
            fontSize="9"
            textAnchor="end"
            fill="currentColor"
            opacity="0.7"
            fontFamily="ui-monospace, monospace"
          >
            {y.toFixed(3)}
          </text>
        ))}
        {Object.keys(data.method_curves).map((mname) => {
          const path = (data.method_curves[mname] ?? [])
            .filter((p) => typeof p.rmse_test === "number")
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.K)} ${yOf(p.rmse_test as number)}`)
            .join(" ");
          return (
            <g key={mname}>
              <path d={path} fill="none" stroke={colors[mname] ?? "currentColor"} strokeWidth="1.8" />
              {(data.method_curves[mname] ?? [])
                .filter((p) => typeof p.rmse_test === "number")
                .map((p) => (
                  <circle
                    key={p.K}
                    cx={xOf(p.K)}
                    cy={yOf(p.rmse_test as number)}
                    r="3"
                    fill={colors[mname] ?? "currentColor"}
                  />
                ))}
            </g>
          );
        })}
        {/* Legend */}
        <g transform={`translate(${W - padding - 80}, ${padding})`}>
          {Object.keys(colors).map((m, i) => (
            <g key={m} transform={`translate(0, ${i * 14})`}>
              <rect width="14" height="2" y="6" fill={colors[m]!} />
              <text x="20" y="11" fontSize="10" fill="currentColor" fontFamily="ui-monospace, monospace">
                {m.toUpperCase()}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </Section>
  );
}

function CrossSceneTransferSection() {
  const { data, error } = useQuery({
    queryKey: ["cross-scene-transfer"],
    queryFn: () => api.crossSceneTransfer(),
    retry: false,
  });
  if (!data || error) {
    return (
      <Section
        title="B-8 cross-scene transfer — fit on A, infer on B"
        lead="Loading transfer matrix…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }
  const scenes = data.scene_order;
  const m = data.transfer_matrix_macro_f1;
  const cell = 80;
  const headerH = 50;
  const labelW = 165;
  // Find min/max for color scale
  let minV = Infinity;
  let maxV = -Infinity;
  for (const row of m) {
    for (const v of row) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
  }
  return (
    <Section
      title="B-8 cross-scene transfer — fit on A, infer on B"
      lead={`5 AVIRIS-class scenes resampled to a common ${data.common_wavelength_grid.n_bands}-band ${data.common_wavelength_grid.min_nm}-${data.common_wavelength_grid.max_nm} nm grid. Each cell is the macro-F1 of a 5-fold logistic on θ (LDA fit on row scene, inferred on column scene). Diagonal = within-scene baseline. Pavia U excluded (ROSIS).`}
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${labelW + scenes.length * cell + 50} ${headerH + scenes.length * cell + 30}`}
          role="img"
          aria-label="Cross-scene transfer matrix"
          style={{ maxWidth: "min(100%, 760px)" }}
        >
          <text
            x={labelW + (scenes.length * cell) / 2}
            y={20}
            fontSize="12"
            textAnchor="middle"
            fill="currentColor"
            fontWeight="600"
          >
            target scene (column)
          </text>
          {scenes.map((s, j) => (
            <text
              key={`col-${s}`}
              x={labelW + j * cell + cell / 2}
              y={headerH - 6}
              fontSize="10"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {s.split("-")[0]}
            </text>
          ))}
          {m.map((row, i) =>
            row.map((v, j) => {
              const t = Math.max(
                0,
                Math.min(1, (v - minV) / Math.max(1e-9, maxV - minV)),
              );
              const r = Math.round(50 + (1 - t) * 200);
              const g = Math.round(50 + t * 130);
              const b = Math.round(80 + t * 100);
              const isDiag = i === j;
              return (
                <g key={`${i}-${j}`}>
                  <title>{`${scenes[i]} → ${scenes[j]} = ${v.toFixed(3)}`}</title>
                  <rect
                    x={labelW + j * cell}
                    y={headerH + i * cell}
                    width={cell - 2}
                    height={cell - 2}
                    fill={`rgb(${r},${g},${b})`}
                    stroke={isDiag ? "white" : "none"}
                    strokeWidth={isDiag ? "2" : "0"}
                  />
                  <text
                    x={labelW + j * cell + (cell - 2) / 2}
                    y={headerH + i * cell + (cell - 2) / 2 + 4}
                    fontSize="13"
                    textAnchor="middle"
                    fill="white"
                    fontWeight={isDiag ? "700" : "500"}
                    fontFamily="ui-monospace, monospace"
                  >
                    {v.toFixed(3)}
                  </text>
                </g>
              );
            }),
          )}
          {scenes.map((s, i) => (
            <text
              key={`row-${s}`}
              x={labelW - 8}
              y={headerH + i * cell + cell / 2 + 4}
              fontSize="11"
              textAnchor="end"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {s}
            </text>
          ))}
          <text
            x={20}
            y={headerH + (scenes.length * cell) / 2}
            fontSize="12"
            textAnchor="middle"
            fill="currentColor"
            fontWeight="600"
            transform={`rotate(-90, 20, ${headerH + (scenes.length * cell) / 2})`}
          >
            source scene (row)
          </text>
        </svg>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Diagonal cells (white border) are within-scene F1 — they match the
        native-grid B-3 numbers within ±0.025, so the resampling is honest.
        Salinas → Salinas-A = 0.747 is the strongest off-diagonal (same
        campaign, overlapping fields). KSC's collapsed topics neither transfer
        well (KSC → others ≤ 0.405) nor receive well (others → KSC ≤ 0.405).
        Salinas-A is the easiest target (0.65-0.75 from any source — compact 6-class).
      </p>
    </Section>
  );
}




function SuperTopicsSection() {
  const { data, error } = useQuery({
    queryKey: ["super-topics"],
    queryFn: () => api.superTopics(),
    retry: false,
  });
  if (error || !data) {
    return (
      <Section
        title="Cross-scene super-topics (master plan §12)"
        lead="Hierarchical clustering of every topic across all six labelled scenes on the common 400–2500 nm grid (average linkage on cosine). Reveals which topics group across scenes vs. stay scene-local."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          super_topics payload not available yet.
        </p>
      </Section>
    );
  }
  const cut8 =
    data.cuts.find((c) => c.cut_level === 8) ?? data.cuts[data.cuts.length - 1]!;
  const sortedClusters = [...cut8.clusters].sort(
    (a, b) => b.scene_set.length - a.scene_set.length || b.n_members - a.n_members,
  );
  return (
    <Section
      title="Cross-scene super-topics (master plan §12)"
      lead={`Hierarchical clustering of all ${data.n_topics_total} topics across ${data.n_scenes} labelled scenes on the common 400–2500 nm grid (average linkage on cosine). Cut level shown: ${cut8.cut_level} → ${cut8.n_clusters} super-topic clusters. Multi-scene clusters identify topics that recur across data sets — what "unites" the scenes.`}
    >
      <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
        <thead>
          <tr style={{ color: "var(--color-text-muted)" }}>
            <th className="text-left font-mono text-[12px] pb-2">cluster</th>
            <th className="text-left font-mono text-[12px] pb-2">members</th>
            <th className="text-left font-mono text-[12px] pb-2">scenes</th>
            <th className="text-left font-mono text-[12px] pb-2">topic ids</th>
          </tr>
        </thead>
        <tbody>
          {sortedClusters.map((c) => (
            <tr
              key={c.cluster_id}
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <td className="py-1.5 font-mono">#{c.cluster_id}</td>
              <td className="py-1.5">{c.n_members}</td>
              <td
                className="py-1.5 text-[12.5px]"
                style={{
                  color:
                    c.scene_set.length > 1
                      ? "var(--color-accent)"
                      : "var(--color-text-muted)",
                }}
              >
                {c.scene_set.join(", ")}
              </td>
              <td className="py-1.5 font-mono text-[12px]">
                {c.members
                  .map((m) => `${m.scene_id.split("-")[0]}:${m.topic_k}`)
                  .join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

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

function HidsagCrossPreprocessingStability() {
  const subsets = ["GEOMET", "MINERAL1", "MINERAL2", "GEOCHEM", "PORPHYRY"];
  const queries = useQueries({
    queries: subsets.map((code) => ({
      queryKey: ["hidsag-cross-preprocessing-stability", code],
      queryFn: () => api.hidsagCrossPreprocessingStability(code),
      retry: false,
    })),
  });

  const successes = queries
    .map((q, i) => ({ data: q.data, code: subsets[i]! }))
    .filter((x) => x.data !== undefined);

  return (
    <Section
      id="hidsag-cross-preproc-stability"
      title="HIDSAG — estabilidad cross-preprocessing (B-6 follow-up)"
      lead="How stable LDA topics are when the preprocessing recipe changes. Reported as Hungarian-matched top-15 token Jaccard across the 4 policies (raw / heuristic-band-mask / SNV / SavGol+SNV). Low = topics change substantially across recipes; high = topics survive."
    >
      <div className="space-y-4 mt-2">
        {successes.map((s) => (
          <div
            key={s.code}
            className="rounded-md border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <header className="flex items-baseline justify-between mb-2 gap-3">
              <h3
                className="text-base font-semibold"
                style={{ color: "var(--color-fg)" }}
              >
                {s.code}
              </h3>
              <span
                className="text-xs font-mono"
                style={{ color: "var(--color-fg-faint)" }}
              >
                K={s.data!.topic_count} · {s.data!.policies.length} policies ·{" "}
                off-diag mean ={" "}
                <span
                  style={{
                    color:
                      s.data!.off_diagonal_summary.off_diagonal_mean > 0.5
                        ? "var(--color-success)"
                        : s.data!.off_diagonal_summary.off_diagonal_mean > 0.25
                          ? "var(--color-accent)"
                          : "var(--color-warn)",
                    fontWeight: 600,
                  }}
                >
                  {s.data!.off_diagonal_summary.off_diagonal_mean.toFixed(3)}
                </span>
              </span>
            </header>
            <CrossPreprocessingMatrix data={s.data!} />
          </div>
        ))}
      </div>
      <p
        className="mt-3 text-[12px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Metric: top-15 token Jaccard with Hungarian assignment. Each cell of
        the N×N matrices is the average per-topic stability between policies i, j.
      </p>
    </Section>
  );
}

function CrossPreprocessingMatrix({
  data,
}: {
  data: import("@/api/client").HidsagCrossPreprocessingStability;
}) {
  const policies = data.policies;
  const matrix = data.pairwise_matched_jaccard_top15_mean_matrix;
  const n = policies.length;
  const cellW = 64;
  const labelW = 200;
  const headerH = 32;
  const w = labelW + cellW * n + 16;
  const h = headerH + cellW * n + 12;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Cross-preprocessing matrix for ${data.subset_code}`}
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {policies.map((p, j) => (
          <text
            key={`h-${j}`}
            x={labelW + j * cellW + cellW / 2}
            y={headerH - 6}
            textAnchor="end"
            transform={`rotate(-30, ${labelW + j * cellW + cellW / 2}, ${headerH - 6})`}
            fontFamily="ui-monospace, monospace"
            fontSize="10"
            opacity="0.85"
          >
            {p.length > 18 ? `${p.slice(0, 17)}…` : p}
          </text>
        ))}
        {matrix.map((row, i) => (
          <g key={`r-${i}`}>
            <text
              x={labelW - 6}
              y={headerH + i * cellW + cellW / 2 + 3}
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
              fontSize="10.5"
              opacity="0.85"
            >
              {policies[i]!.length > 24 ? `${policies[i]!.slice(0, 23)}…` : policies[i]}
            </text>
            {row.map((v, j) => {
              const x = labelW + j * cellW + 2;
              const y = headerH + i * cellW + 2;
              const cw = cellW - 4;
              const ch = cellW - 4;
              const isDiag = i === j;
              return (
                <g key={`c-${i}-${j}`}>
                  <rect
                    x={x}
                    y={y}
                    width={cw}
                    height={ch}
                    fill="var(--color-accent)"
                    opacity={isDiag ? 0.05 : Math.max(0.06, v)}
                  />
                  {!isDiag && (
                    <text
                      x={x + cw / 2}
                      y={y + ch / 2 + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="500"
                      fill={v > 0.5 ? "#fff" : "currentColor"}
                    >
                      {v.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}

function HidsagPreprocessing() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["hidsag-preprocessing-sensitivity"],
    queryFn: api.hidsagPreprocessingSensitivity,
    retry: false,
  });

  return (
    <Section
      id="hidsag-preprocessing"
      title="HIDSAG — sensibilidad al pre-procesamiento espectral"
      lead="Four preprocessing policies (raw / heuristic-bad-band-mask / SNV / Savitzky-Golay+SNV) over the 5 HIDSAG scenes. Measures how downstream performance (classification + regression) changes when the spectral cleaning recipe varies."
    >
      {isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          Cargando sensibilidad de pre-procesamiento…
        </p>
      )}
      {error && (
        <div
          className="rounded-lg border p-6 mt-2"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            No se pudo cargar /api/hidsag-preprocessing-sensitivity.
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}
      {data && (
        <>
          {data.methods?.policies && data.methods.policies.length > 0 && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2 mb-4">
              {data.methods.policies.map((p: { policy_id: string; policy_name: string; description: string }) => (
                <div
                  key={p.policy_id}
                  className="rounded-md border p-3 text-[12.5px] leading-relaxed"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-panel)",
                    color: "var(--color-fg-subtle)",
                  }}
                >
                  <div
                    className="font-mono mb-1"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {p.policy_id}
                  </div>
                  <div
                    className="font-semibold"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {p.policy_name}
                  </div>
                  <p className="mt-1">{p.description}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-6 mt-2">
            {data.subsets.map((s: import("@/api/client").HidsagPreprocessingSubset) => (
              <PreprocessingSubsetCard key={s.subset_code} subset={s} />
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function PreprocessingSubsetCard({
  subset,
}: {
  subset: HidsagPreprocessingSubset;
}) {
  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {subset.subset_code}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          n_samples={subset.sample_count} · n_meas={subset.measurement_count_total}
        </span>
      </header>
      <div className="grid sm:grid-cols-2 gap-5">
        <PolicyBars
          title="Classification · balanced accuracy"
          rows={subset.classification_policy_ranking.map((r) => ({
            policy_id: r.policy_id,
            best_model: r.best_model,
            value: r.best_balanced_accuracy,
          }))}
          good="green"
        />
        <PolicyBars
          title="Regression · R²"
          rows={subset.regression_policy_ranking.map((r) => ({
            policy_id: r.policy_id,
            best_model: r.best_model,
            value: r.best_r2,
          }))}
          good="amber"
        />
      </div>
    </div>
  );
}

function PolicyBars({
  title,
  rows,
  good,
}: {
  title: string;
  rows: { policy_id: string; best_model: string; value: number }[];
  good: "green" | "amber";
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-6);
  const headColor =
    good === "green" ? "var(--color-success)" : "var(--color-accent)";
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, idx) => {
          const isWinner = idx === 0;
          const pct = (Math.abs(r.value) / maxAbs) * 100;
          const isPositive = r.value >= 0;
          return (
            <div
              key={r.policy_id}
              className="flex items-center gap-2 text-[12.5px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="shrink-0 w-44 font-mono text-[11px] truncate"
                style={{
                  color: isWinner ? headColor : "var(--color-fg-subtle)",
                  fontWeight: isWinner ? 600 : 400,
                }}
                title={r.policy_id}
              >
                {r.policy_id}
              </span>
              <span
                className="flex-1 h-4 rounded-sm relative overflow-hidden"
                style={{ backgroundColor: "var(--color-bg)" }}
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isPositive
                      ? isWinner
                        ? headColor
                        : "var(--color-accent)"
                      : "var(--color-warn)",
                    opacity: isWinner ? 0.95 : 0.65,
                  }}
                />
              </span>
              <span
                className="shrink-0 w-14 text-right font-mono text-[11.5px]"
                style={{ color: "var(--color-fg)" }}
              >
                {r.value.toFixed(3)}
              </span>
              <span
                className="shrink-0 w-32 truncate font-mono text-[11px]"
                style={{ color: "var(--color-fg-faint)" }}
                title={r.best_model}
              >
                {r.best_model}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HidsagBenchmarks() {
  const queries = useQueries({
    queries: HIDSAG_SUBSETS.map((code) => ({
      queryKey: ["hidsag-method", code],
      queryFn: () => api.hidsagMethodStatistics(code),
      retry: false,
    })),
  });

  const loading = queries.some((q) => q.isLoading);
  const successes = queries
    .map((q, i) => ({ data: q.data, code: HIDSAG_SUBSETS[i]! }))
    .filter((x): x is { data: HidsagMethodStatistics; code: string } =>
      x.data !== undefined,
    );

  return (
    <Section
      id="hidsag"
      title="HIDSAG — regression over measurements"
      lead="Five HIDSAG subsets with continuous targets (Cu %, Au g/t, mineralogy, geochemistry). Each compares the routed family against raw_ridge, PLS and topic mixtures. The primary metric is mean R² over the subset's numeric targets."
    >
      {loading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          Cargando rankings HIDSAG…
        </p>
      )}
      <div className="space-y-6 mt-2">
        {successes.map((s) => (
          <HidsagSubsetCard key={s.code} stats={s.data} />
        ))}
      </div>
    </Section>
  );
}

function HidsagSubsetCard({ stats }: { stats: HidsagMethodStatistics }) {
  const block = stats.regression;
  if (!block || !block.method_aggregates) {
    return (
      <div
        className="rounded-md border p-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h3
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          {stats.subset_code}
        </h3>
        <p
          className="text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          No regression block available.
        </p>
      </div>
    );
  }
  const entries = Object.entries(block.method_aggregates)
    .map(([method, agg]) => {
      const dist = agg.r2_distribution ?? agg.macro_f1_distribution;
      return {
        method,
        n_targets: agg.n_targets,
        mean: dist?.mean ?? null,
        ci95_lo: dist?.ci95_lo ?? null,
        ci95_hi: dist?.ci95_hi ?? null,
      };
    })
    .filter((e): e is typeof e & { mean: number } => e.mean !== null)
    .sort((a, b) => b.mean - a.mean);

  if (entries.length === 0) return null;

  const w = 720;
  const labelW = 220;
  const plotW = w - labelW - 40;
  const rowH = 30;
  const h = entries.length * rowH + 60;
  const xLo = Math.min(...entries.map((e) => e.ci95_lo ?? e.mean), 0) - 0.05;
  const xHi = Math.max(...entries.map((e) => e.ci95_hi ?? e.mean), 1) + 0.05;
  const xScale = (v: number) =>
    labelW + ((v - xLo) / (xHi - xLo)) * plotW;
  const ticks = Array.from({ length: 5 }, (_, i) => xLo + ((xHi - xLo) * i) / 4);

  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {stats.subset_code}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          n_samples={stats.sample_count} · n_targets={block.n_targets} ·{" "}
          {block.primary_metric}
        </span>
      </header>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`HIDSAG ${stats.subset_code} forest`}
        style={{ color: "var(--color-fg)" }}
      >
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="11"
          fill="currentColor"
        >
          <line
            x1={labelW}
            y1={h - 30}
            x2={labelW + plotW}
            y2={h - 30}
            stroke="currentColor"
            opacity="0.4"
          />
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={xScale(t)}
                y1={h - 33}
                x2={xScale(t)}
                y2={h - 27}
                stroke="currentColor"
                opacity="0.4"
              />
              <text
                x={xScale(t)}
                y={h - 12}
                textAnchor="middle"
                opacity="0.65"
                fontSize="10"
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          {entries.map((e, i) => {
            const yMid = i * rowH + 18;
            const isRouted = e.method.includes("routed");
            const color = isRouted ? "#22c55e" : "#0ea5e9";
            return (
              <g key={e.method}>
                <text
                  x={labelW - 8}
                  y={yMid + 4}
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                  fontSize="10.5"
                  fontWeight={isRouted ? 700 : 400}
                >
                  {e.method}
                </text>
                {e.ci95_lo !== null && e.ci95_hi !== null && (
                  <line
                    x1={xScale(e.ci95_lo)}
                    y1={yMid}
                    x2={xScale(e.ci95_hi)}
                    y2={yMid}
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                )}
                <circle
                  cx={xScale(e.mean)}
                  cy={yMid}
                  r="4"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
                <text
                  x={
                    xScale(e.ci95_hi !== null ? e.ci95_hi : e.mean) + 6
                  }
                  y={yMid + 4}
                  fontSize="10.5"
                  opacity="0.85"
                >
                  {e.mean.toFixed(3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

