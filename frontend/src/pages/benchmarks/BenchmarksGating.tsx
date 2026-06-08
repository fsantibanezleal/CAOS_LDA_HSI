import { useQuery, useQueries } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { BayesianComparison } from "@/api/client";
import { Section } from "@/components/Section";
import { LABELLED_SCENES } from "./shared";

export function BenchmarksGating() {
  return (
    <div className="space-y-8">
      <DeepGateSection />
      <NeuralTopicComparisonSection />
      <BayesianHdiSection />
    </div>
  );
}

function DeepGateSection() {
  const { t } = useTranslation(["pages"]);
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
        title={t("pages:benchmarks.gating.deepGate.title")}
        lead={t("pages:benchmarks.gating.deepGate.loadingLead")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.gating.common.loading")}</p>
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
      title={t("pages:benchmarks.gating.deepGate.title")}
      lead={t("pages:benchmarks.gating.deepGate.lead")}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.gating.common.scene")}</th>
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
                {t("pages:benchmarks.gating.common.winsBestPerScene")}
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
        {t("pages:benchmarks.gating.deepGate.finding.part1")} <em>{t("pages:benchmarks.gating.deepGate.finding.not")}</em>{" "}
        {t("pages:benchmarks.gating.deepGate.finding.part2")}
      </p>
    </Section>
  );
}

function NeuralTopicComparisonSection() {
  const { t } = useTranslation(["pages"]);
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
        title={t("pages:benchmarks.gating.neuralTopic.title")}
        lead={t("pages:benchmarks.gating.neuralTopic.loadingLead")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{t("pages:benchmarks.gating.common.loading")}</p>
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
      title={t("pages:benchmarks.gating.neuralTopic.title")}
      lead={t("pages:benchmarks.gating.neuralTopic.lead")}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.gating.common.scene")}</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">{t("pages:benchmarks.gating.neuralTopic.header.cls")}</th>
              <th
                className="text-right font-mono text-[12px] pb-2 pr-3"
                colSpan={3}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                {t("pages:benchmarks.gating.neuralTopic.header.ariVsLabel")}
              </th>
              <th
                className="text-right font-mono text-[12px] pb-2 pr-3"
                colSpan={3}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                {t("pages:benchmarks.gating.neuralTopic.header.cvCoherence")}
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
                {t("pages:benchmarks.gating.common.winsBestPerScene")}
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
        <strong>{t("pages:benchmarks.gating.neuralTopic.finding.headline")}</strong>{" "}
        {t("pages:benchmarks.gating.neuralTopic.finding.body1")}
        <br /><br />
        <strong>{t("pages:benchmarks.gating.neuralTopic.finding.ruleLabel")}</strong>{t("pages:benchmarks.gating.neuralTopic.finding.body2")}
      </p>
    </Section>
  );
}

function BayesianHdiSection() {
  const { t } = useTranslation(["pages"]);
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
        title={t("pages:benchmarks.gating.bayesian.title")}
        lead={t("pages:benchmarks.gating.bayesian.loadingLead")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          {t("pages:benchmarks.gating.common.loading")}
        </p>
      </Section>
    );
  }

  const renderForest = (
    title: string,
    payload: BayesianComparison | undefined,
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
          {t("pages:benchmarks.gating.bayesian.forestFooter", { obs: payload.n_observations, methods: payload.method_posteriors.length, summary: payload.model_summary })}
        </p>
      </div>
    );
  };

  return (
    <Section
      title={t("pages:benchmarks.gating.bayesian.title")}
      lead={t("pages:benchmarks.gating.bayesian.lead")}
    >
      {renderForest(
        t("pages:benchmarks.gating.bayesian.forest.classification.title"),
        cls.data,
        t("pages:benchmarks.gating.bayesian.forest.classification.note"),
      )}
      {renderForest(
        t("pages:benchmarks.gating.bayesian.forest.classificationDeep.title"),
        clsDeep.data,
        t("pages:benchmarks.gating.bayesian.forest.classificationDeep.note"),
      )}
      {renderForest(
        t("pages:benchmarks.gating.bayesian.forest.regression.title"),
        reg.data,
        t("pages:benchmarks.gating.bayesian.forest.regression.note"),
      )}
    </Section>
  );
}
