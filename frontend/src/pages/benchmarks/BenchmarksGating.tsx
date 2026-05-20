import { useQuery, useQueries } from "@tanstack/react-query";
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
