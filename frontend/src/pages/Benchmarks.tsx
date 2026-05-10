import { useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  api,
  type HidsagMethodStatistics,
  type HidsagPreprocessingSubset,
  type MethodStatistics,
  type SceneMethodStats,
} from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

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

const METHOD_LABEL: Record<string, string> = {
  raw_logistic_regression: "raw_logistic",
  pca_logistic_regression: "pca_logistic",
  topic_logistic_regression: "theta_logistic",
};

const METHOD_COLOR: Record<string, string> = {
  raw_logistic_regression: "#0ea5e9",
  pca_logistic_regression: "#f97316",
  topic_logistic_regression: "#22c55e",
};

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
        <p style={{ color: "var(--color-fg-faint)" }}>Cargando estadísticas…</p>
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
            <div className="space-y-8">
              <ProtocolBox stats={data} />
              <Section
                id="forest"
                title="Forest plot — macro-F1 con CI95 por escena"
                lead="Cada barra es una escena × método; el punto es la media, las whiskers son los percentiles 2.5 y 97.5 del bootstrap sobre las 25 evaluaciones."
              >
                <div className="space-y-8 mt-2">
                  {data.labeled_scenes.map((s) => (
                    <SceneForest key={s.dataset_id} scene={s} />
                  ))}
                </div>
              </Section>
              <Section
                id="paired"
                title="Comparaciones pareadas (Δ macro-F1)"
                lead="Cada par muestra la diferencia entre métodos por evaluación; resumido como mean ± std del Δ. Negativo = el segundo método pierde."
              >
                <div className="space-y-6 mt-2">
                  {data.labeled_scenes.map((s) => (
                    <PairedTable key={s.dataset_id} scene={s} />
                  ))}
                </div>
              </Section>
              <MultiAxisBatterySection />
              <Section id="method-defs" title="Definiciones de los métodos">
                <dl
                  className="text-[14px] leading-relaxed space-y-3 mt-2"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  {Object.entries(data.method_definitions).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-md border p-3"
                      style={{
                        borderColor: "var(--color-border)",
                        backgroundColor: "var(--color-panel)",
                      }}
                    >
                      <dt
                        className="font-mono text-[12.5px] mb-1"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {k}
                      </dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
              </Section>
            </div>
          )}

          {tab === "gating" && (
            <div className="space-y-8">
              <DeepGateSection />
              <NeuralTopicComparisonSection />
              <BayesianHdiSection />
            </div>
          )}

          {tab === "deep" && (
            <div className="space-y-8">
              <DeepKCurveSection />
              <Cae3dAnchorVsFullSection />
              <BetaVaeCollapseSection />
              <AnomalyComparisonSection />
            </div>
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

function AnomalyComparisonSection() {
  const ldaQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-anomaly", sc],
      queryFn: () => api.topicAnomaly(sc),
      retry: false,
    })),
  });
  const deepQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["deep-anomaly", sc],
      queryFn: () => api.deepAnomaly(sc),
      retry: false,
    })),
  });
  const ready =
    ldaQs.every((q) => q.data || q.error) &&
    deepQs.every((q) => q.data || q.error);

  if (!ready) {
    return (
      <Section
        title="B-9 anomaly indicators — LDA vs deep ρ comparison"
        lead="Loading anomaly correlations…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }

  const rows = LABELLED_SCENES.map((sc, i) => {
    const lda = ldaQs[i]!.data;
    const deep = deepQs[i]!.data;
    return {
      scene: sc,
      lda_nll: lda?.anomaly_to_misclassification_correlation?.spearman_rho_nll ?? null,
      lda_softmax: lda?.anomaly_to_misclassification_correlation?.spearman_rho_softmax ?? null,
      cae: deep?.cae_1d_8?.spearman_rho_vs_misclass ?? null,
      bv_rmse: deep?.beta_vae_8?.spearman_rho_rmse_vs_misclass ?? null,
      bv_kl: deep?.beta_vae_8?.spearman_rho_kl_vs_misclass ?? null,
    };
  });

  const renderCell = (v: number | null) => {
    if (v == null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
    const positive = v > 0;
    return (
      <span style={{ color: positive ? "var(--color-accent)" : "rgba(214,39,40,1)" }}>
        {(v >= 0 ? "+" : "") + v.toFixed(3)}
      </span>
    );
  };

  return (
    <Section
      title="B-9 anomaly indicators — LDA vs deep ρ comparison"
      lead="Spearman ρ between per-document anomaly score and theta-logistic misclassification. Positive ρ (green) = the indicator flags hard examples (works as anomaly); negative (red) = the indicator anti-correlates (deep encoders concentrate capacity on rare informative spectra). LDA's recon NLL works as anomaly; deep methods invert the heuristic."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">LDA recon NLL ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">LDA softmax ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">CAE-1D recon RMSE ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">β-VAE recon RMSE ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">β-VAE KL ρ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.lda_nll)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.lda_softmax)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.cae)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.bv_rmse)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.bv_kl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Headline: LDA recon NLL is positive ρ on every scene (Pavia U +0.306,
        Salinas-A +0.298, KSC +0.226, IP +0.214) — it works as an anomaly indicator.
        Deep methods produce mostly negative ρ — the "high recon = unfamiliar" heuristic
        does NOT transfer to deep nonlinear encoders. Deep encoders concentrate capacity
        on rare informative spectra, which the latent then discriminates well.
      </p>
    </Section>
  );
}

const CAE_1D_KS = [4, 6, 8, 10, 12, 16, 32];

function DeepKCurveSection() {
  // For each scene × K, fetch the CAE-1D representation and read ARI
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      CAE_1D_KS.map((k) => ({
        queryKey: ["repr", `cae_1d_${k}`, sc],
        queryFn: () => api.representation(`cae_1d_${k}`, sc),
        retry: false,
      })),
    ),
  });

  const ready = queries.every((q) => q.data !== undefined || q.error);

  if (!ready) {
    return (
      <Section
        title="CAE-1D capacity-driven scaling — ARI vs K"
        lead="Per-scene CAE-1D K-curve (K∈{4,6,8,10,12,16,32}). Each line is one labelled scene; each point is the K-means(latent) ARI vs ground-truth label."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading deep K-curve payloads (42 cells)…
        </p>
      </Section>
    );
  }

  const sceneCurves: { scene: string; points: { K: number; ari: number }[] }[] =
    LABELLED_SCENES.map((sc, si) => {
      const points = CAE_1D_KS.map((k, ki) => {
        const idx = si * CAE_1D_KS.length + ki;
        const data = queries[idx]?.data;
        return {
          K: k,
          ari: data?.downstream_kmeans_vs_label?.ari ?? NaN,
        };
      }).filter((p) => Number.isFinite(p.ari));
      return { scene: sc, points };
    });

  const W = 540;
  const H = 240;
  const xMin = 4;
  const xMax = 32;
  const xOf = (k: number) =>
    ((Math.log2(k) - Math.log2(xMin)) / (Math.log2(xMax) - Math.log2(xMin))) *
    W;
  const yOf = (a: number) => H - a * H;
  const colors = [
    "rgba(31,119,180,1)",
    "rgba(255,127,14,1)",
    "rgba(44,160,44,1)",
    "rgba(214,39,40,1)",
    "rgba(148,103,189,1)",
    "rgba(140,86,75,1)",
  ];

  return (
    <Section
      title="CAE-1D capacity-driven scaling — ARI vs K"
      lead="K-means(latent) ARI vs ground-truth label, per scene. Almost-monotonic on every scene (Salinas 0.547 → 0.561, KSC 0.250 → 0.314 from K=4 to K=32). x-axis is log K."
    >
      <svg viewBox={`0 0 ${W + 60} ${H + 40}`} role="img" aria-label="CAE-1D K curve">
        <line x1={40} y1={H} x2={40 + W} y2={H} stroke="currentColor" strokeWidth="1" />
        <line x1={40} y1={0} x2={40} y2={H} stroke="currentColor" strokeWidth="1" />
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((y) => (
          <g key={y}>
            <line
              x1={40}
              y1={yOf(y)}
              x2={40 + W}
              y2={yOf(y)}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
            <text
              x={36}
              y={yOf(y) + 3}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
              opacity="0.7"
            >
              {y.toFixed(1)}
            </text>
          </g>
        ))}
        {CAE_1D_KS.map((k) => (
          <text
            key={k}
            x={40 + xOf(k)}
            y={H + 15}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            K={k}
          </text>
        ))}
        {sceneCurves.map((c, i) => {
          const path = c.points
            .map(
              (p, j) =>
                `${j === 0 ? "M" : "L"} ${40 + xOf(p.K)} ${yOf(p.ari)}`,
            )
            .join(" ");
          return (
            <g key={c.scene}>
              <path
                d={path}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="1.5"
              />
              {c.points.map((p) => (
                <circle
                  key={p.K}
                  cx={40 + xOf(p.K)}
                  cy={yOf(p.ari)}
                  r="3"
                  fill={colors[i % colors.length]}
                />
              ))}
              <text
                x={40 + xOf(c.points[c.points.length - 1]!.K) + 5}
                y={yOf(c.points[c.points.length - 1]!.ari) + 4}
                fontSize="9.5"
                fill={colors[i % colors.length]}
                fontFamily="ui-monospace, monospace"
              >
                {c.scene.split("-")[0]}
              </text>
            </g>
          );
        })}
        <text x={40 + W / 2} y={H + 32} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.7">
          latent dimension K (log scale)
        </text>
        <text
          x={10}
          y={H / 2}
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.7"
          transform={`rotate(-90, 10, ${H / 2})`}
        >
          K-means(latent) ARI vs label
        </text>
      </svg>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Capacity-driven scaling: every scene improves with K; no overfitting at K=32. KSC's
        canonical fit (LDA θ-logistic F1=0.021 on B-3) recovers to F1=0.710 at CAE-1D K=32 on
        the linear-probe panel, a 33× gain attributable to deep encoder capacity.
      </p>
    </Section>
  );
}

function Cae3dAnchorVsFullSection() {
  const KS = [4, 8] as const;
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      KS.flatMap((k) => [
        { queryKey: ["repr", `cae_3d_${k}`, sc], queryFn: () => api.representation(`cae_3d_${k}`, sc), retry: false },
        { queryKey: ["repr", `cae_3d_full_${k}`, sc], queryFn: () => api.representation(`cae_3d_full_${k}`, sc), retry: false },
      ]),
    ),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="CAE-3D — anchor decoder vs full-patch decoder (K-curve {4, 8})"
        lead="Loading anchor + full-patch payloads at K∈{4, 8} across 6 labelled scenes…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }
  type Cell = { full: number; anchor: number; delta: number };
  const grid: { scene: string; cells: Record<number, Cell> }[] = LABELLED_SCENES.map((sc, si) => {
    const cells: Record<number, Cell> = {};
    KS.forEach((k, ki) => {
      const idx = (si * KS.length + ki) * 2;
      const anchor = queries[idx]?.data?.downstream_kmeans_vs_label?.ari ?? NaN;
      const full = queries[idx + 1]?.data?.downstream_kmeans_vs_label?.ari ?? NaN;
      cells[k] = { full, anchor, delta: full - anchor };
    });
    return { scene: sc, cells };
  });
  const meanDelta: Record<number, number> = {};
  KS.forEach((k) => {
    const deltas = grid.map((g) => g.cells[k]!.delta).filter(Number.isFinite);
    meanDelta[k] = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  });
  return (
    <Section
      title="CAE-3D — anchor decoder vs full-patch decoder (K-curve {4, 8})"
      lead="Two decoders share the same 3-D conv encoder. Anchor reconstructs only the centre-pixel spectrum (Linear K→B); full-patch reconstructs the entire P×P patch (Linear K→B·P·P). Cycle 52 ran K=8; cycle 55 added K=4. The decoder target is itself a hyperparameter — direction is broadly stable across capacity, with one inversion (Pavia U)."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full K=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">anchor K=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">ΔK=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full K=8</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">anchor K=8</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">ΔK=8</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((g) => (
              <tr key={g.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{g.scene}</td>
                {KS.flatMap((k) => {
                  const c = g.cells[k]!;
                  const dColor =
                    c.delta > 0 ? "var(--color-accent)" : c.delta < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)";
                  return [
                    <td key={`f${k}`} className="py-1.5 pr-3 text-right font-mono">
                      {Number.isFinite(c.full) ? c.full.toFixed(3) : "—"}
                    </td>,
                    <td key={`a${k}`} className="py-1.5 pr-3 text-right font-mono">
                      {Number.isFinite(c.anchor) ? c.anchor.toFixed(3) : "—"}
                    </td>,
                    <td key={`d${k}`} className="py-1.5 pr-3 text-right font-mono" style={{ color: dColor, fontWeight: 600 }}>
                      {Number.isFinite(c.delta) ? (c.delta >= 0 ? "+" : "") + c.delta.toFixed(3) : "—"}
                    </td>,
                  ];
                })}
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td className="py-1.5 pr-3 font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>net mean ΔARI</td>
              <td className="py-1.5 pr-3" />
              <td className="py-1.5 pr-3" />
              <td
                className="py-1.5 pr-3 text-right font-mono text-[11px]"
                style={{
                  color: meanDelta[4]! > 0 ? "var(--color-accent)" : meanDelta[4]! < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)",
                  fontWeight: 600,
                }}
              >
                {(meanDelta[4]! >= 0 ? "+" : "") + meanDelta[4]!.toFixed(3)}
              </td>
              <td className="py-1.5 pr-3" />
              <td className="py-1.5 pr-3" />
              <td
                className="py-1.5 pr-3 text-right font-mono text-[11px]"
                style={{
                  color: meanDelta[8]! > 0 ? "var(--color-accent)" : meanDelta[8]! < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)",
                  fontWeight: 600,
                }}
              >
                {(meanDelta[8]! >= 0 ? "+" : "") + meanDelta[8]!.toFixed(3)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Honest read: net mean ΔARI is essentially neutral at both K (+0.011 K=4, +0.003 K=8). Direction matches across K on
        5/6 scenes — IP and Botswana persistently benefit; Salinas family persistently harmed (magnitude grows with K). Pavia U
        is the single capacity-dependent inversion: full-patch helps at K=4 (+0.026), hurts at K=8 (-0.023). The decoder target
        is itself a hyperparameter worth surfacing per scene, not a default to flip globally.
      </p>
    </Section>
  );
}

const BETA_VAE_BS = [
  { suffix: "beta_vae_b1_8", label: "β=1" },
  { suffix: "beta_vae_b2_8", label: "β=2" },
  { suffix: "beta_vae_8", label: "β=4" },
  { suffix: "beta_vae_b8_8", label: "β=8" },
  { suffix: "beta_vae_b16_8", label: "β=16" },
];

function BetaVaeCollapseSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      BETA_VAE_BS.map((b) => ({
        queryKey: ["repr", b.suffix, sc],
        queryFn: () => api.representation(b.suffix, sc),
        retry: false,
      })),
    ),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="β-VAE β-sweep — disentanglement vs posterior collapse"
        lead="Loading β-sweep payloads…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }

  const grid: { scene: string; row: { label: string; ari: number }[] }[] =
    LABELLED_SCENES.map((sc, si) => ({
      scene: sc,
      row: BETA_VAE_BS.map((b, bi) => {
        const idx = si * BETA_VAE_BS.length + bi;
        const data = queries[idx]?.data;
        return {
          label: b.label,
          ari: data?.downstream_kmeans_vs_label?.ari ?? NaN,
        };
      }),
    }));

  const cell = 56;
  const headerH = 28;
  const rowH = 28;

  return (
    <Section
      title="β-VAE β-sweep — disentanglement vs posterior collapse"
      lead="K-means(latent) ARI per scene at K=8 across β∈{1, 2, 4, 8, 16}. Bright = high ARI; black cells = posterior collapse (β-VAE encoder converges to q(z|x)≈p(z), latent is uninformative)."
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${BETA_VAE_BS.length * cell + 200} ${LABELLED_SCENES.length * rowH + headerH + 30}`}
          role="img"
          aria-label="β-VAE β-sweep ARI grid"
          style={{ maxWidth: "640px" }}
        >
          {BETA_VAE_BS.map((b, j) => (
            <text
              key={b.label}
              x={195 + j * cell + cell / 2}
              y={20}
              fontSize="11"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {b.label}
            </text>
          ))}
          {grid.map((g, i) => (
            <g key={g.scene}>
              <text
                x={188}
                y={headerH + i * rowH + rowH / 2 + 4}
                fontSize="11"
                textAnchor="end"
                fill="currentColor"
                fontFamily="ui-monospace, monospace"
              >
                {g.scene}
              </text>
              {g.row.map((c, j) => {
                const ari = Number.isFinite(c.ari) ? c.ari : 0;
                const collapsed = ari < 0.05;
                const t = Math.max(0, Math.min(1, ari));
                const r = collapsed ? 30 : Math.round(50 + (1 - t) * 200);
                const gC = collapsed ? 30 : Math.round(50 + t * 130);
                const bC = collapsed ? 30 : Math.round(80 + t * 100);
                return (
                  <g key={c.label}>
                    <title>{`${g.scene} · ${c.label} · ARI=${ari.toFixed(3)}`}</title>
                    <rect
                      x={195 + j * cell}
                      y={headerH + i * rowH}
                      width={cell - 2}
                      height={rowH - 2}
                      fill={`rgb(${r},${gC},${bC})`}
                    />
                    <text
                      x={195 + j * cell + (cell - 2) / 2}
                      y={headerH + i * rowH + rowH / 2 + 3}
                      fontSize="10"
                      textAnchor="middle"
                      fill={t > 0.4 || collapsed ? "white" : "currentColor"}
                      fontFamily="ui-monospace, monospace"
                    >
                      {Number.isFinite(c.ari) ? c.ari.toFixed(2) : "—"}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Salinas posterior collapse at β≥8 (ARI=0.000 — KL term overwhelms the reconstruction
        signal; encoder maps every input to N(0, I)). Salinas-A resists collapse and even gains
        with β (compact 6-class signal dominates the regulariser). Pavia U degrades monotonically
        with β. The β=4 default sits at the inflection point.
      </p>
    </Section>
  );
}

function DeepGateSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-routed-deep-gate", sc],
      queryFn: () => api.topicRoutedDeepGate(sc),
      retry: false,
    })),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="B-3 follow-up — any encoder as gate? raw vs θ-routed vs deep gates"
        lead="Loading deep-gate payloads from /api/topic-routed-deep-gate/{scene}…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }

  const METHODS = [
    { key: "raw_logistic", label: "raw" },
    { key: "theta_routed", label: "θ_routed" },
    { key: "pca_8_routed", label: "PCA-8" },
    { key: "cae_1d_8_routed", label: "CAE-1D-8" },
    { key: "beta_vae_8_routed", label: "β-VAE-8" },
  ];

  type Cell = { mean: number; std: number };
  type Row = { scene: string; cells: Record<string, Cell | null>; winner: string };

  const rows: Row[] = LABELLED_SCENES.map((sc, i) => {
    const data = queries[i]?.data;
    const cells: Record<string, Cell | null> = {};
    let winner = "";
    let bestMean = -Infinity;
    for (const m of METHODS) {
      const block = data?.method_metrics?.[m.key];
      const f1 = block?.macro_f1;
      if (f1 && Number.isFinite(f1.mean)) {
        cells[m.key] = { mean: f1.mean, std: f1.std };
        if (f1.mean > bestMean) {
          bestMean = f1.mean;
          winner = m.key;
        }
      } else {
        cells[m.key] = null;
      }
    }
    return { scene: sc, cells, winner };
  });

  const wins: Record<string, number> = {};
  for (const m of METHODS) wins[m.key] = 0;
  for (const r of rows) if (r.winner) wins[r.winner] = (wins[r.winner] ?? 0) + 1;

  return (
    <Section
      title="B-3 follow-up — any encoder as gate? raw vs θ-routed vs deep gates"
      lead="Five candidate gates compete on per-fold macro F1 across labelled scenes: raw_logistic (no gating), θ_routed (LDA topic mixture, natural Dirichlet simplex), and three deep gates (PCA-8, CAE-1D-8, β-VAE-8) projected onto the simplex via softmax. Tests whether any deep encoder recovers θ's gating advantage. Source: /api/topic-routed-deep-gate/{scene}."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              {METHODS.map((m) => (
                <th key={m.key} className="text-right font-mono text-[12px] pb-2 pr-3">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                {METHODS.map((m) => {
                  const c = r.cells[m.key];
                  const isWinner = r.winner === m.key;
                  return (
                    <td
                      key={m.key}
                      className="py-1.5 pr-3 text-right font-mono"
                      style={{
                        color: isWinner ? "var(--color-accent)" : "var(--color-text)",
                        fontWeight: isWinner ? 600 : 400,
                      }}
                    >
                      {c ? c.mean.toFixed(3) : "—"}
                      {c ? (
                        <span
                          className="ml-1 text-[10px]"
                          style={{ color: "var(--color-text-muted)", fontWeight: 400 }}
                        >
                          ±{c.std.toFixed(3)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td
                className="py-1.5 pr-3 font-mono text-[11px]"
                style={{ color: "var(--color-text-muted)" }}
              >
                wins (best per scene)
              </td>
              {METHODS.map((m) => (
                <td
                  key={m.key}
                  className="py-1.5 pr-3 text-right font-mono text-[11px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {wins[m.key]}/{LABELLED_SCENES.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Honest finding: deep gates with naive softmax-to-simplex projection do <em>not</em>{" "}
        outperform raw_logistic or θ_routed. raw_logistic wins on most scenes; θ_routed
        ties or wins where Dirichlet-simplex structure aligns with class topology
        (e.g. Salinas). The advantage of θ comes from the natural simplex constraint
        of Dirichlet-distributed topic mixtures, not merely from compressing to K
        dimensions — softmaxed deep latents fail to recover the gating mechanism.
      </p>
    </Section>
  );
}

function NeuralTopicComparisonSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["neural-topic-comparison", sc],
      queryFn: () => api.neuralTopicComparison(sc),
      retry: false,
    })),
  });
  const seedQueries = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["neural-topic-seed-stability", sc],
      queryFn: () => api.neuralTopicSeedStability(sc),
      retry: false,
    })),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="Neural topic models — head-to-head LDA vs ProdLDA vs ETM"
        lead="Loading per-scene neural-topic comparison from /api/neural-topic-comparison/{scene}…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }

  type Cell = {
    ari: number;
    cv: number | null;
    ari_std: number | null;
    cv_std: number | null;
  };
  type Row = {
    scene: string;
    n_classes: number;
    cells: Record<string, Cell | null>;
    ariWinner: string;
    cvWinner: string;
  };
  const METHODS = ["lda", "prodlda", "etm"] as const;
  const rows: Row[] = LABELLED_SCENES.map((sc, i) => {
    const data = queries[i]?.data;
    const seedData = seedQueries[i]?.data;
    const cells: Record<string, Cell | null> = {};
    let ariWinner = "";
    let cvWinner = "";
    let bestAri = -Infinity;
    let bestCv = -Infinity;
    for (const m of METHODS) {
      const block = data?.methods?.[m];
      if (!block || !block.downstream_kmeans_vs_label) {
        cells[m] = null;
        continue;
      }
      // Prefer seed-stability mean + std when available (cycle 63);
      // fall back to single-seed value (cycle 61/62) for LDA which
      // does not have a multi-seed neural sweep.
      const seedBlock = seedData?.methods?.[m];
      const ari = seedBlock?.ari_mean ?? block.downstream_kmeans_vs_label.ari;
      const cv = seedBlock?.c_v_mean ?? block.coherence?.c_v ?? null;
      cells[m] = {
        ari,
        cv,
        ari_std: seedBlock?.ari_std ?? null,
        cv_std: seedBlock?.c_v_std ?? null,
      };
      if (ari > bestAri) {
        bestAri = ari;
        ariWinner = m;
      }
      if (cv != null && cv > bestCv) {
        bestCv = cv;
        cvWinner = m;
      }
    }
    return { scene: sc, n_classes: data?.n_classes ?? 0, cells, ariWinner, cvWinner };
  });
  const ariWins: Record<string, number> = { lda: 0, prodlda: 0, etm: 0 };
  const cvWins: Record<string, number> = { lda: 0, prodlda: 0, etm: 0 };
  for (const r of rows) {
    if (r.ariWinner) ariWins[r.ariWinner] = (ariWins[r.ariWinner] ?? 0) + 1;
    if (r.cvWinner) cvWins[r.cvWinner] = (cvWins[r.cvWinner] ?? 0) + 1;
  }

  return (
    <Section
      title="Neural topic models — head-to-head LDA vs ProdLDA vs ETM (cycles 61–63)"
      lead="Three neural-style topic models compared on the canonical 220-per-class stratified sample. Two metrics: (1) K-means(theta) ARI vs ground-truth label — clustering quality. (2) c_v topic coherence (Röder 2015 sliding-window, top-15 words) — semantic quality. ProdLDA + ETM cells show mean ± std across N=5 seeds (cycle 63 multi-seed sweep). LDA cell uses the canonical fit (single seed; per-seed LDA stability is in the separate Workspace stability tab). The two metrics tell different stories — coherence ≠ class discriminability on band-frequency vocabularies."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">cls</th>
              <th
                className="text-right font-mono text-[12px] pb-2 pr-3"
                colSpan={3}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                ARI vs label
              </th>
              <th
                className="text-right font-mono text-[12px] pb-2 pr-3"
                colSpan={3}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                c_v coherence (top-15)
              </th>
            </tr>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th />
              <th />
              <th className="text-right font-mono text-[11px] pb-2 pr-3">LDA</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">ProdLDA</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">ETM</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">LDA</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">ProdLDA</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">ETM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                  {r.n_classes}
                </td>
                {METHODS.map((m) => {
                  const c = r.cells[m];
                  const isWinner = r.ariWinner === m;
                  return (
                    <td
                      key={`a${m}`}
                      className="py-1.5 pr-3 text-right font-mono"
                      style={{
                        color: isWinner ? "var(--color-accent)" : "var(--color-text)",
                        fontWeight: isWinner ? 600 : 400,
                      }}
                    >
                      {c ? (c.ari >= 0 ? "+" : "") + c.ari.toFixed(3) : "—"}
                      {c?.ari_std != null ? (
                        <span
                          className="ml-1 text-[10px]"
                          style={{ color: "var(--color-text-muted)", fontWeight: 400 }}
                        >
                          ±{c.ari_std.toFixed(3)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
                {METHODS.map((m) => {
                  const c = r.cells[m];
                  const isWinner = r.cvWinner === m;
                  return (
                    <td
                      key={`c${m}`}
                      className="py-1.5 pr-3 text-right font-mono"
                      style={{
                        color: isWinner ? "var(--color-accent)" : "var(--color-text)",
                        fontWeight: isWinner ? 600 : 400,
                      }}
                    >
                      {c?.cv != null ? (c.cv >= 0 ? "+" : "") + c.cv.toFixed(3) : "—"}
                      {c?.cv_std != null ? (
                        <span
                          className="ml-1 text-[10px]"
                          style={{ color: "var(--color-text-muted)", fontWeight: 400 }}
                        >
                          ±{c.cv_std.toFixed(3)}
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td className="py-1.5 pr-3 font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }} colSpan={2}>
                wins (best per scene)
              </td>
              {METHODS.map((m) => (
                <td
                  key={`aw${m}`}
                  className="py-1.5 pr-3 text-right font-mono text-[11px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {ariWins[m]}/{LABELLED_SCENES.length}
                </td>
              ))}
              {METHODS.map((m) => (
                <td
                  key={`cw${m}`}
                  className="py-1.5 pr-3 text-right font-mono text-[11px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {cvWins[m]}/{LABELLED_SCENES.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        <strong>Coherence vs discriminability are NOT the same metric on band-frequency
        tokens.</strong> ProdLDA wins c_v on every scene (highest semantic coherence among the
        three) but loses ARI on 4/6 scenes — its topics are internally tight but do not align
        with class structure. LDA wins ARI on 4/6 scenes (most class-discriminative theta on
        average) yet loses c_v on every scene. ETM lands between on both axes — slight
        improvement over ProdLDA on ARI (5/6 wins), slight regression on c_v.
        <br /><br />
        <strong>Operational rule</strong>: pick the topic family by the downstream task, not by
        coherence alone. For class clustering use LDA (or neural fallback when LDA collapses,
        e.g. KSC). For interpretability / topic-vocabulary cards (Workspace Topics tab) use
        ProdLDA's higher coherence. ETM is the safe middle if both matter.
      </p>
    </Section>
  );
}

function BayesianHdiSection() {
  const cls = useQuery({
    queryKey: ["bayesian-classification-labelled"],
    queryFn: () => api.bayesianClassificationLabelled(),
    retry: false,
  });
  const clsDeep = useQuery({
    queryKey: ["bayesian-classification-labelled-deep"],
    queryFn: () => api.bayesianClassificationLabelledDeep(),
    retry: false,
  });
  const reg = useQuery({
    queryKey: ["bayesian-regression"],
    queryFn: () => api.bayesianRegression(),
    retry: false,
  });

  if (!cls.data && !reg.data && !clsDeep.data) {
    return (
      <Section
        title="Bayesian method comparison — hierarchical NUTS posteriors"
        lead="Loading PyMC posteriors at 4 chains × 1000 tune + 1000 draws…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }

  const renderForest = (
    title: string,
    payload: import("@/api/client").BayesianComparison | undefined,
    note: string,
  ) => {
    if (!payload) return null;
    const ms = payload.method_posteriors;
    const lo = Math.min(...ms.map((m) => m.hdi94_lo));
    const hi = Math.max(...ms.map((m) => m.hdi94_hi));
    const range = hi - lo;
    const W = 540;
    const xOf = (v: number) => ((v - lo) / range) * W;
    const zeroX = xOf(0);
    const ranked = [...ms].sort(
      (a, b) => b.posterior_mean - a.posterior_mean,
    );

    return (
      <div
        className="rounded-md border p-4 mb-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <h4
          className="text-[14px] font-semibold mb-1"
          style={{ color: "var(--color-text)" }}
        >
          {title}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-text-muted)" }}
        >
          {note}
        </p>
        <svg
          viewBox={`0 0 ${W + 200} ${ms.length * 32 + 30}`}
          role="img"
          aria-label={title}
        >
          {ranked.map((m, i) => {
            const y = i * 32 + 18;
            return (
              <g key={m.method}>
                <text
                  x={188}
                  y={y + 4}
                  fontSize="11"
                  textAnchor="end"
                  fill="currentColor"
                  fontFamily="ui-monospace, monospace"
                >
                  {m.method}
                </text>
                <line
                  x1={195 + xOf(m.hdi94_lo)}
                  y1={y}
                  x2={195 + xOf(m.hdi94_hi)}
                  y2={y}
                  stroke="rgba(31,119,180,0.6)"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <circle
                  cx={195 + xOf(m.posterior_mean)}
                  cy={y}
                  r="4"
                  fill="rgba(214,39,40,1)"
                />
                <text
                  x={195 + xOf(m.hdi94_hi) + 8}
                  y={y + 4}
                  fontSize="10"
                  fill="currentColor"
                  opacity="0.7"
                  fontFamily="ui-monospace, monospace"
                >
                  μ={m.posterior_mean.toFixed(3)} HDI[{m.hdi94_lo.toFixed(2)},{m.hdi94_hi.toFixed(2)}]
                </text>
              </g>
            );
          })}
          <line
            x1={195 + zeroX}
            y1={0}
            x2={195 + zeroX}
            y2={ms.length * 32}
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <text
            x={195 + zeroX}
            y={ms.length * 32 + 14}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.6"
          >
            μ = 0
          </text>
        </svg>
        <p
          className="mt-2 text-[11.5px]"
          style={{ color: "var(--color-text-muted)" }}
        >
          {payload.n_observations} observations · {payload.method_posteriors.length} methods · {payload.model_summary}
        </p>
      </div>
    );
  };

  return (
    <Section
      title="Bayesian method comparison — hierarchical NUTS posteriors"
      lead="PyMC hierarchical normal model: y ~ N(μ_method + α_scene + γ_fold, σ). Posterior means shown as red dots, HDI94 intervals as blue bars. Methods are ordered by posterior mean. Vertical dashed line at μ=0 is the model-mean reference."
    >
      {renderForest(
        "Classification (labelled scenes, 150 obs)",
        cls.data,
        "raw / pca / topic_routed_* HDIs strictly positive; theta_logistic HDI includes 0 — naive theta-flat is statistically indistinguishable from the model mean.",
      )}
      {renderForest(
        "Classification with deep gates (labelled scenes, 150 obs)",
        clsDeep.data,
        "B-3 follow-up: gates are raw_logistic vs. θ_routed vs. PCA-8 / CAE-1D-8 / β-VAE-8 routed (deep latents softmaxed to a simplex). raw_logistic dominates θ_routed and all deep gates with P≥0.999; θ_routed dominates every deep gate with P≥0.999. Decisive Bayesian evidence that softmaxed deep latents do NOT recover θ's gating advantage — θ's edge comes from the natural Dirichlet simplex.",
      )}
      {renderForest(
        "Regression (HIDSAG, 168 obs)",
        reg.data,
        "Region-aware and topic-routed methods carry positive μ; raw_ridge worst point estimate. HDIs wide because HIDSAG targets are heterogeneous; per-target Friedman tests are tighter (GEOCHEM Friedman p=0.007).",
      )}
    </Section>
  );
}

function MultiAxisBatterySection() {
  const probes = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["linear-probe-panel", sc],
      queryFn: () => api.linearProbePanel(sc),
      retry: false,
    })),
  });
  const routes = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-routed-classifier", sc],
      queryFn: () => api.topicRoutedClassifier(sc),
      retry: false,
    })),
  });
  const stabs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-stability", sc, 0],
      queryFn: () => api.topicStability(sc, 0),
      retry: false,
    })),
  });

  const ready = probes.every((q) => q.data) && routes.every((q) => q.data) && stabs.every((q) => q.data);

  if (!ready) {
    return (
      <Section
        title="Multi-Axis Addendum B — battery summary"
        lead="One row per labelled scene, one column per axis (B-1 fair-baseline F1, B-3 topic-routed F1, B-6 LDA off-diag stability). Loads in parallel from /api/linear-probe-panel/, /api/topic-routed-classifier/, /api/topic-stability/. See the wiki for the full framework."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading multi-axis battery payloads…
        </p>
      </Section>
    );
  }

  type Row = {
    scene: string;
    theta_f1: number;
    ica10_f1: number | null;
    cae_max_f1: number;
    cae_max_K: number;
    routed_soft: number | null;
    raw_logistic: number | null;
    theta_logistic: number | null;
    lda_off_diag: number;
  };

  const rows: Row[] = LABELLED_SCENES.map((sc, i) => {
    const probe = probes[i]!.data!;
    const route = routes[i]!.data!;
    const stab = stabs[i]!.data!;
    const mm = probe.method_metrics;
    const theta_f1 = mm.theta?.macro_f1?.mean ?? NaN;
    const ica10_f1 = mm.ica_10?.macro_f1?.mean ?? null;
    let cae_max_f1 = 0;
    let cae_max_K = 0;
    for (const k of [4, 6, 8, 10, 12, 16, 32]) {
      const cell = mm[`cae_1d_${k}`]?.macro_f1?.mean;
      if (cell != null && cell > cae_max_f1) {
        cae_max_f1 = cell;
        cae_max_K = k;
      }
    }
    const rm = route.method_metrics;
    const routed_soft = rm.topic_routed_soft?.macro_f1?.mean ?? null;
    const raw_logistic = rm.raw_logistic?.macro_f1?.mean ?? null;
    const theta_logistic = rm.theta_logistic?.macro_f1?.mean ?? null;
    const lda_off_diag = stab.scene_stability_summary.off_diagonal_mean;
    return {
      scene: sc,
      theta_f1,
      ica10_f1,
      cae_max_f1,
      cae_max_K,
      routed_soft,
      raw_logistic,
      theta_logistic,
      lda_off_diag,
    };
  });

  return (
    <Section
      title="Multi-Axis Addendum B — battery summary"
      lead="One row per labelled scene. Columns: theta-as-feature F1 (B-1, naive), ICA-10 F1 (B-1, fair-baseline winner), best CAE-1D F1 across K∈{4..32} (B-1 deep ladder), topic_routed_soft F1 (B-3 the master-plan thesis), raw_logistic F1 (B-3 strong baseline), and LDA off-diagonal stability (B-6, N=7 seeds). The framework is on the wiki Multi-Axis-Addendum-B page."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">θ flat (B-1)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">ICA-10 (B-1)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">CAE-1D best (B-1)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">θ_logistic (B-3)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">routed_soft (B-3)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">raw_logistic (B-3)</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">LDA stability (B-6)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.scene}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {Number.isFinite(r.theta_f1) ? r.theta_f1.toFixed(3) : "—"}
                </td>
                <td
                  className="py-1.5 pr-3 text-right font-mono"
                  style={{ color: "var(--color-accent)" }}
                >
                  {r.ica10_f1 != null ? r.ica10_f1.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.cae_max_f1 > 0
                    ? `${r.cae_max_f1.toFixed(3)} (K=${r.cae_max_K})`
                    : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.theta_logistic != null ? r.theta_logistic.toFixed(3) : "—"}
                </td>
                <td
                  className="py-1.5 pr-3 text-right font-mono"
                  style={{ color: "var(--color-accent)" }}
                >
                  {r.routed_soft != null ? r.routed_soft.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.raw_logistic != null ? r.raw_logistic.toFixed(3) : "—"}
                </td>
                <td className="py-1.5 pr-3 text-right font-mono">
                  {r.lda_off_diag.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Headlines: ICA-10 wins B-1 fair-baseline on every scene. CAE-1D K=32 closes
        much of the gap (KSC θ=0.021 → CAE-1D K=32=0.710, a 33× recovery).
        topic_routed_soft matches or beats raw_logistic on every scene; θ_logistic
        loses by 30-50 points everywhere — the master-plan thesis "θ as a gate, never
        as a feature" is empirically validated. LDA off-diag stability ≥ 0.954 across
        all 6 scenes vs CAE-1D 0.74-0.97 and β-VAE 0.18-0.89.
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
      lead="Cuán estables son los tópicos del LDA cuando cambia la receta de pre-procesamiento. Reportado como Hungarian-matched top-15 token Jaccard entre las 4 políticas (raw / heuristic-band-mask / SNV / SavGol+SNV). Bajo = los tópicos cambian sustancialmente entre recetas; alto = los tópicos sobreviven."
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
                K={s.data!.topic_count} · {s.data!.policies.length} políticas ·{" "}
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
        Métrica: top-15 token Jaccard con asignación Hungarian. Cada celda de
        las matrices N×N es la stability media por tópico entre políticas i, j.
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
      lead="Cuatro políticas de pre-procesamiento (raw / heuristic-bad-band-mask / SNV / Savitzky-Golay+SNV) sobre las 5 escenas HIDSAG. Mide cuánto cambia el desempeño downstream (clasificación + regresión) cuando varía la receta de limpieza espectral."
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
              {data.methods.policies.map((p) => (
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
            {data.subsets.map((s) => (
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
          title="Clasificación · balanced accuracy"
          rows={subset.classification_policy_ranking.map((r) => ({
            policy_id: r.policy_id,
            best_model: r.best_model,
            value: r.best_balanced_accuracy,
          }))}
          good="green"
        />
        <PolicyBars
          title="Regresión · R²"
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
      title="HIDSAG — regresión sobre mediciones"
      lead="Cinco subsets HIDSAG con targets continuos (Cu %, Au g/t, mineralogía, geoquímica). Por cada uno se compara la familia routed contra raw_ridge, PLS y mezclas tópicas. La métrica primaria es R² medio sobre los targets numéricos del subset."
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
          Sin bloque de regresión disponible.
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

function ProtocolBox({ stats }: { stats: MethodStatistics }) {
  return (
    <div
      className="rounded-lg border p-5 grid sm:grid-cols-3 gap-4 mt-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <Stat label="Escenas evaluadas" value={String(stats.labeled_scenes.length)} />
      <Stat
        label="Evaluaciones por método"
        value={
          stats.labeled_scenes.length > 0
            ? String(
                Object.values(stats.labeled_scenes[0]!.methods)[0]
                  ?.n_evaluations ?? 0,
              )
            : "—"
        }
      />
      <Stat
        label="α significancia"
        value={stats.alpha_significance.toFixed(2)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SceneForest({ scene }: { scene: SceneMethodStats }) {
  const methodNames = Object.keys(scene.methods);
  // global F1 axis: 0..1
  const axisMin = 0;
  const axisMax = 1;
  const w = 720;
  const labelW = 130;
  const plotW = w - labelW - 40;
  const rowH = 30;
  const h = methodNames.length * rowH + 60;

  const xScale = (v: number) =>
    labelW + ((v - axisMin) / (axisMax - axisMin)) * plotW;

  const ticks = [0, 0.25, 0.5, 0.75, 1.0];

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
          {scene.dataset_name}
        </h3>
        <span
          className="text-xs font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          K={scene.scene_summary.topic_count} · D={scene.scene_summary.sampled_documents} · {scene.scene_summary.class_count} clases
        </span>
      </header>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Forest plot for ${scene.dataset_name}`}
        style={{ color: "var(--color-fg)" }}
      >
        <g
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fontSize="12"
          fill="currentColor"
        >
          {/* Axis */}
          <line
            x1={labelW}
            y1={h - 30}
            x2={labelW + plotW}
            y2={h - 30}
            stroke="currentColor"
            strokeWidth="1"
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
                strokeWidth="1"
                opacity="0.4"
              />
              <text
                x={xScale(t)}
                y={h - 12}
                textAnchor="middle"
                opacity="0.65"
                fontSize="10.5"
              >
                {t.toFixed(2)}
              </text>
            </g>
          ))}
          <text
            x={labelW + plotW / 2}
            y={h - 1}
            textAnchor="middle"
            opacity="0.55"
            fontSize="10"
          >
            macro-F1
          </text>
          {/* Per-method rows */}
          {methodNames.map((m, i) => {
            const stats = scene.methods[m]!.macro_f1;
            const yMid = i * rowH + 18;
            const color = METHOD_COLOR[m] ?? "var(--color-accent)";
            return (
              <g key={m}>
                <text
                  x={labelW - 8}
                  y={yMid + 4}
                  textAnchor="end"
                  fontFamily="ui-monospace, monospace"
                  fontSize="11.5"
                >
                  {METHOD_LABEL[m] ?? m}
                </text>
                {/* CI95 bar */}
                <line
                  x1={xScale(stats.ci95_lo)}
                  y1={yMid}
                  x2={xScale(stats.ci95_hi)}
                  y2={yMid}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                <line
                  x1={xScale(stats.ci95_lo)}
                  y1={yMid - 5}
                  x2={xScale(stats.ci95_lo)}
                  y2={yMid + 5}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                <line
                  x1={xScale(stats.ci95_hi)}
                  y1={yMid - 5}
                  x2={xScale(stats.ci95_hi)}
                  y2={yMid + 5}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.85"
                />
                {/* point */}
                <circle
                  cx={xScale(stats.mean)}
                  cy={yMid}
                  r="4.5"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
                {/* numeric label */}
                <text
                  x={xScale(stats.ci95_hi) + 6}
                  y={yMid + 4}
                  fontSize="11"
                  opacity="0.85"
                >
                  {stats.mean.toFixed(3)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function PairedTable({ scene }: { scene: SceneMethodStats }) {
  // paired_comparisons is list[list[PairedComparison]] — one outer list per
  // metric (accuracy / balanced_accuracy / macro_f1). We surface only the
  // macro_f1 group (index 2). Defensive against schema variations.
  const groups = scene.paired_comparisons;
  const macroGroup = Array.isArray(groups[2])
    ? groups[2]
    : Array.isArray(groups[0])
      ? groups[0]
      : [];

  if (!macroGroup.length) return null;

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
        className="text-base font-semibold mb-3"
        style={{ color: "var(--color-fg)" }}
      >
        {scene.dataset_name}
      </h3>
      <table
        className="w-full text-[14px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-fg)",
            }}
          >
            <th className="text-left py-2 pr-4 font-semibold">A</th>
            <th className="text-left py-2 pr-4 font-semibold">B</th>
            <th className="text-right py-2 pr-4 font-semibold">Δ mean</th>
            <th className="text-right py-2 pr-4 font-semibold">Δ std</th>
            <th className="text-right py-2 font-semibold">[Δ min, Δ max]</th>
          </tr>
        </thead>
        <tbody>
          {macroGroup.map((p, i) => (
            <tr
              key={i}
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <td className="py-2 pr-4 font-mono text-[12.5px]">
                {METHOD_LABEL[p.a] ?? p.a}
              </td>
              <td className="py-2 pr-4 font-mono text-[12.5px]">
                {METHOD_LABEL[p.b] ?? p.b}
              </td>
              <td
                className="py-2 pr-4 text-right font-mono"
                style={{
                  color:
                    p.delta_mean >= 0
                      ? "var(--color-success)"
                      : "var(--color-warn)",
                }}
              >
                {p.delta_mean >= 0 ? "+" : ""}
                {p.delta_mean.toFixed(3)}
              </td>
              <td className="py-2 pr-4 text-right font-mono">
                {p.delta_std.toFixed(3)}
              </td>
              <td
                className="py-2 text-right font-mono text-[12.5px]"
                style={{ color: "var(--color-fg-faint)" }}
              >
                [{p.delta_min.toFixed(3)}, {p.delta_max.toFixed(3)}]
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
