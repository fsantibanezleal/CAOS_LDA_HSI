import { useEffect, useMemo, useState } from "react";

import {
  api,
  type LocalCoreBenchmarksPayload,
  type MethodMetricsBlock,
  type MethodStatisticsPayload,
  type MethodStatisticsScene,
  type PairedComparison,
  type SubsetCard
} from "../../../lib/api";
import { datasetMatches } from "../workspaceUtils";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

const METHOD_ORDER = [
  "raw_logistic_regression",
  "pca_logistic_regression",
  "topic_logistic_regression"
];

const METHOD_COLORS: Record<string, string> = {
  raw_logistic_regression: "#5b8def",
  pca_logistic_regression: "#9b88ff",
  topic_logistic_regression: "#6dd4a0"
};

const METHOD_LABEL: Record<string, { en: string; es: string }> = {
  raw_logistic_regression: { en: "Raw spectra · Logistic", es: "Espectros crudos · Logistic" },
  pca_logistic_regression: { en: "PCA · Logistic", es: "PCA · Logistic" },
  topic_logistic_regression: { en: "Topic mixture · Logistic", es: "Mixtura de tópicos · Logistic" }
};

const METRIC_ORDER: Array<"accuracy" | "balanced_accuracy" | "macro_f1"> = [
  "macro_f1",
  "accuracy",
  "balanced_accuracy"
];

const FAMILIES_WITH_INFERENCE = new Set([
  "labeled-spectral-image",
  "regions-with-measurements",
  "individual-spectra"
]);

export function InferenceStep({ card, language }: Props) {
  const isEn = language === "en";
  const [stats, setStats] = useState<MethodStatisticsPayload | null>(null);
  const [statsMissing, setStatsMissing] = useState(false);
  const [bench, setBench] = useState<LocalCoreBenchmarksPayload | null>(null);
  const [metric, setMetric] = useState<"accuracy" | "balanced_accuracy" | "macro_f1">(
    "macro_f1"
  );

  useEffect(() => {
    void api
      .getMethodStatistics()
      .then((p) => {
        setStats(p);
        setStatsMissing(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "";
        setStats(null);
        setStatsMissing(msg.includes("404"));
      });
    void api.getLocalCoreBenchmarks().then(setBench).catch(() => setBench(null));
  }, []);

  const datasetIds = useMemo(() => card.evidence.map((e) => e.dataset_id), [card.evidence]);
  const allowed = FAMILIES_WITH_INFERENCE.has(card.family_id);

  const matchingScenes = useMemo<MethodStatisticsScene[]>(() => {
    if (!stats) return [];
    return stats.labeled_scenes.filter(
      (s) => datasetIds.includes(s.dataset_id) || datasetIds.some((d) => datasetMatches(d, s.dataset_id))
    );
  }, [stats, datasetIds]);

  if (!allowed) {
    return (
      <div className="ws-empty">
        {isEn
          ? "Family C subsets ship without labels or measured response variables, so the supervised pipeline is hidden by design."
          : "Los subsets de Familia C no incluyen etiquetas ni variables medidas, así que la inferencia supervisada está oculta a propósito."}
      </div>
    );
  }

  if (statsMissing) {
    return (
      <div className="ws-comparison-grid">
        <section className="ws-panel">
          <header className="ws-panel-header">
            <h4>
              {isEn
                ? "Statistical depth not generated yet"
                : "Profundidad estadística pendiente"}
            </h4>
            <p>
              {isEn
                ? "The interactive Workspace expects a k-fold × multi-seed paired-comparison payload. Run scripts/local.* build-method-stats locally to generate it (heavy: ~10 minutes on a modern laptop)."
                : "Falta el payload de k-fold × multi-seed. Ejecuta scripts/local.* build-method-stats (~10 min)."}
            </p>
          </header>
          <pre className="ws-cmd">scripts/local.ps1 build-method-stats</pre>
          {bench && <FallbackPointEstimates card={card} bench={bench} isEn={isEn} />}
        </section>
      </div>
    );
  }

  if (!stats || matchingScenes.length === 0) {
    return (
      <div className="ws-empty">
        {isEn
          ? "Loading statistical depth…"
          : "Cargando profundidad estadística…"}
      </div>
    );
  }

  return (
    <div className="ws-inference-grid">
      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Method comparison with statistical depth" : "Comparación de métodos con profundidad estadística"}</h4>
          <p>
            {isEn
              ? "k-fold × multi-seed evaluations. Each bar is mean ± std with a 95% bootstrap CI; deltas are paired with Wilcoxon p-value and Cohen's d."
              : "Evaluaciones k-fold × multi-seed. Cada barra es media ± std con IC 95% bootstrap; las diferencias son pareadas con p-Wilcoxon y d de Cohen."}
          </p>
        </header>
        <div className="ws-mini-controls">
          <span className="ws-mini-label">{isEn ? "Metric" : "Métrica"}:</span>
          {METRIC_ORDER.map((m) => (
            <button
              key={m}
              type="button"
              className={metric === m ? "ws-mini-button is-active" : "ws-mini-button"}
              onClick={() => setMetric(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="ws-stats-stack">
          {matchingScenes.map((sceneStats) => (
            <SceneStatistics
              key={sceneStats.dataset_id}
              sceneStats={sceneStats}
              metric={metric}
              isEn={isEn}
            />
          ))}
        </div>
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Cross-dataset ranking" : "Ranking transversal"}</h4>
          <p>
            {isEn
              ? "Average rank across labelled scenes for the chosen metric (1 = best). Friedman test on the dataset × method matrix."
              : "Rango promedio entre escenas etiquetadas (1 = mejor). Test de Friedman sobre la matriz dataset × método."}
          </p>
        </header>
        {stats.cross_dataset ? (
          <CrossDatasetPanel cross={stats.cross_dataset} isEn={isEn} />
        ) : (
          <p className="ws-panel-hint">
            {isEn ? "No cross-dataset ranking computed." : "Ranking transversal no calculado."}
          </p>
        )}
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Method definitions" : "Definiciones de métodos"}</h4>
        </header>
        <ul className="ws-method-defs">
          {Object.entries(stats.method_definitions).map(([k, v]) => (
            <li key={k}>
              <strong style={{ color: METHOD_COLORS[k] }}>
                {METHOD_LABEL[k]?.[isEn ? "en" : "es"] ?? k}
              </strong>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SceneStatistics({
  sceneStats,
  metric,
  isEn
}: {
  sceneStats: MethodStatisticsScene;
  metric: "accuracy" | "balanced_accuracy" | "macro_f1";
  isEn: boolean;
}) {
  const methodSummaries = METHOD_ORDER.map((id) => {
    const block: MethodMetricsBlock | undefined = sceneStats.methods[id];
    return { id, block };
  }).filter(
    (entry): entry is { id: string; block: MethodMetricsBlock } => entry.block !== undefined
  );
  const max = Math.max(
    ...methodSummaries.map((m) => (m.block?.[metric].mean ?? 0) + (m.block?.[metric].std ?? 0)),
    1
  );

  const split = sceneStats.split_protocol;

  const ranking = sceneStats.ranking?.average_rank as Record<string, number> | undefined;

  return (
    <article className="ws-stats-card">
      <header className="ws-stats-card-head">
        <strong>{sceneStats.dataset_name ?? sceneStats.dataset_id}</strong>
        <span className="ws-mono">{sceneStats.dataset_id}</span>
        <span className="ws-stats-card-meta">
          {(split as Record<string, unknown>)?.["type"] as string ?? "—"} ·{" "}
          {(split as Record<string, unknown>)?.["n_folds"] as number ?? "—"}{" "}
          {isEn ? "folds" : "folds"} ·{" "}
          {Array.isArray((split as Record<string, unknown>)?.["lda_seeds"])
            ? ((split as Record<string, unknown>)["lda_seeds"] as number[]).length
            : "?"}{" "}
          seeds ·{" "}
          {((split as Record<string, unknown>)?.["evaluations"] as number) ?? "—"} evaluations
        </span>
      </header>
      <ul className="ws-stats-bars">
        {methodSummaries.map(({ id, block }) => {
          const summary = block[metric];
          const color = METHOD_COLORS[id] ?? "#5b8def";
          const x0 = summary.ci95_lo ?? summary.mean - summary.std;
          const x1 = summary.ci95_hi ?? summary.mean + summary.std;
          const rank = ranking?.[id];
          return (
            <li key={id}>
              <span className="ws-stats-method" style={{ color }}>
                {METHOD_LABEL[id]?.[isEn ? "en" : "es"] ?? id}
              </span>
              <div className="ws-stats-bar-track">
                <span
                  className="ws-stats-bar-ci"
                  style={{
                    left: `${(x0 / max) * 100}%`,
                    width: `${Math.max(0.5, ((x1 - x0) / max) * 100)}%`,
                    background: color
                  }}
                />
                <span
                  className="ws-stats-bar-mean"
                  style={{ left: `${(summary.mean / max) * 100}%`, background: color }}
                />
              </div>
              <span className="ws-stats-mean">
                {summary.mean.toFixed(3)} ± {summary.std.toFixed(3)}
              </span>
              <span className="ws-stats-ci">
                [{x0.toFixed(3)}, {x1.toFixed(3)}]
              </span>
              <span className="ws-stats-rank">rank {rank?.toFixed(2) ?? "—"}</span>
            </li>
          );
        })}
      </ul>

      <PairedComparisonsPanel comparisons={sceneStats.paired_comparisons[metric] ?? []} isEn={isEn} />
    </article>
  );
}

function PairedComparisonsPanel({
  comparisons,
  isEn
}: {
  comparisons: PairedComparison[];
  isEn: boolean;
}) {
  if (comparisons.length === 0) return null;
  return (
    <div className="ws-paired">
      <h5>{isEn ? "Paired comparisons" : "Comparaciones pareadas"}</h5>
      <table className="ws-table ws-table-paired">
        <thead>
          <tr>
            <th>A → B</th>
            <th>Δ mean</th>
            <th>Δ std</th>
            <th>Wilcoxon p</th>
            <th>Cohen d</th>
            <th>{isEn ? "Win rate" : "Win rate"}</th>
            <th>{isEn ? "Verdict" : "Veredicto"}</th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((c, idx) => (
            <tr
              key={idx}
              className={c.significance === "significant" ? "ws-paired-sig" : "ws-paired-ns"}
            >
              <td className="ws-mono">
                {shortMethod(c.a)} → {shortMethod(c.b)}
              </td>
              <td className={c.delta_mean >= 0 ? "ws-pos" : "ws-neg"}>
                {c.delta_mean >= 0 ? "+" : ""}
                {c.delta_mean.toFixed(3)}
              </td>
              <td>{c.delta_std.toFixed(3)}</td>
              <td>{c.wilcoxon_p === null ? "—" : c.wilcoxon_p.toFixed(3)}</td>
              <td>{c.cohens_d === null ? "—" : c.cohens_d.toFixed(2)}</td>
              <td>{c.win_rate === null ? "—" : `${(c.win_rate * 100).toFixed(0)}%`}</td>
              <td>
                <span className={`ws-sig-badge ws-sig-${c.significance}`}>
                  {c.significance === "significant" ? "★ p<0.05" : "n.s."}
                </span>{" "}
                {c.direction}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function shortMethod(id: string): string {
  if (id.startsWith("raw")) return "raw";
  if (id.startsWith("pca")) return "pca";
  if (id.startsWith("topic")) return "topic";
  return id;
}

function CrossDatasetPanel({
  cross,
  isEn
}: {
  cross: Record<string, unknown>;
  isEn: boolean;
}) {
  const avg = cross["average_rank"] as Record<string, number> | undefined;
  const friedman = cross["friedman"] as Record<string, number> | undefined;
  const datasets = cross["datasets"] as string[] | undefined;
  if (!avg) return null;
  return (
    <div className="ws-cross">
      <table className="ws-table">
        <thead>
          <tr>
            <th>{isEn ? "Method" : "Método"}</th>
            <th>{isEn ? "Avg rank (1 = best)" : "Rango promedio (1 = mejor)"}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(avg)
            .sort((a, b) => a[1] - b[1])
            .map(([id, rank]) => (
              <tr key={id}>
                <td>
                  <strong style={{ color: METHOD_COLORS[id] }}>
                    {METHOD_LABEL[id]?.[isEn ? "en" : "es"] ?? id}
                  </strong>
                </td>
                <td>{rank.toFixed(2)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="ws-mono">
        Friedman χ² = {friedman?.["statistic"]?.toFixed?.(2) ?? "—"} · p = {friedman?.["p_value"]?.toFixed?.(3) ?? "—"} ·{" "}
        {datasets?.length ?? 0} {isEn ? "datasets" : "datasets"}
      </p>
    </div>
  );
}

function FallbackPointEstimates({
  card,
  bench,
  isEn
}: {
  card: SubsetCard;
  bench: LocalCoreBenchmarksPayload;
  isEn: boolean;
}) {
  const datasetIds = card.evidence.map((e) => e.dataset_id);
  const runs = bench.labeled_scene_runs.filter((r) => {
    const id = (r as Record<string, unknown>)["dataset_id"] as string;
    return datasetIds.includes(id) || datasetIds.some((d) => datasetMatches(d, id));
  });
  if (runs.length === 0) return null;
  return (
    <details className="ws-fallback">
      <summary>{isEn ? "Point estimates from previous run" : "Estimaciones puntuales de corrida previa"}</summary>
      <table className="ws-table">
        <thead>
          <tr>
            <th>{isEn ? "Dataset" : "Dataset"}</th>
            <th>raw acc</th>
            <th>raw F1</th>
            <th>pca acc</th>
            <th>pca F1</th>
            <th>topic acc</th>
            <th>topic F1</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((rRaw, idx) => {
            const r = rRaw as Record<string, unknown>;
            const cls = (r["classification"] as Record<string, unknown>) ?? {};
            const raw = cls["raw_logistic_regression"] as Record<string, number> | undefined;
            const pca = cls["pca_logistic_regression"] as Record<string, number> | undefined;
            const topic = cls["topic_logistic_regression"] as Record<string, number> | undefined;
            return (
              <tr key={idx}>
                <td>{r["dataset_name"] as string}</td>
                <td>{raw?.accuracy?.toFixed(3) ?? "—"}</td>
                <td>{raw?.macro_f1?.toFixed(3) ?? "—"}</td>
                <td>{pca?.accuracy?.toFixed(3) ?? "—"}</td>
                <td>{pca?.macro_f1?.toFixed(3) ?? "—"}</td>
                <td>{topic?.accuracy?.toFixed(3) ?? "—"}</td>
                <td>{topic?.macro_f1?.toFixed(3) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
