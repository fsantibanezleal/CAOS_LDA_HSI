import { useEffect, useMemo, useState } from "react";

import {
  api,
  type LocalCoreBenchmarksPayload,
  type SubsetCard
} from "../../lib/api";
import {
  asNumber,
  asRecord,
  asRecordArray,
  asString,
  filterBenchmarks
} from "./benchmarkUtils";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

const FAMILIES_WITH_INFERENCE = new Set([
  "labeled-spectral-image",
  "regions-with-measurements",
  "individual-spectra"
]);

const MODEL_LABELS: Record<string, { en: string; es: string }> = {
  raw_logistic_regression: { en: "Raw spectra · Logistic", es: "Espectros crudos · Logistic" },
  pca_logistic_regression: { en: "PCA features · Logistic", es: "Features PCA · Logistic" },
  topic_logistic_regression: {
    en: "Topic mixture · Logistic",
    es: "Mixtura de topicos · Logistic"
  },
  cube_topic_logistic_regression: {
    en: "Cube topic mixture · Logistic",
    es: "Mixtura de topicos por cubo · Logistic"
  },
  region_topic_logistic_regression: {
    en: "Region topic mixture · Logistic",
    es: "Mixtura de topicos por region · Logistic"
  }
};

function fmt(value: number | null, digits = 3): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

function modelLabel(id: string, isEn: boolean): string {
  const m = MODEL_LABELS[id];
  if (!m) return id;
  return isEn ? m.en : m.es;
}

export function InferenceStep({ card, language }: Props) {
  const isEn = language === "en";
  const [benchmarks, setBenchmarks] = useState<LocalCoreBenchmarksPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void api
      .getLocalCoreBenchmarks()
      .then(setBenchmarks)
      .catch(() => setBenchmarks(null))
      .finally(() => setLoading(false));
  }, []);

  const datasetIds = useMemo(
    () => card.evidence.map((e) => e.dataset_id),
    [card.evidence]
  );

  const filtered = useMemo(
    () => filterBenchmarks(benchmarks, datasetIds),
    [benchmarks, datasetIds]
  );

  const allowed = FAMILIES_WITH_INFERENCE.has(card.family_id);

  if (!allowed) {
    return (
      <div className="workspace-step-body">
        <div className="workspace-step-intro">
          <h4>
            {isEn
              ? "Inference unavailable for this family"
              : "Inferencia no disponible para esta familia"}
          </h4>
          <p>
            {isEn
              ? "Family C subsets ship without labels or measured response variables, so the supervised pipeline is hidden by design. Use the Topics and Comparison steps to reason about regimes; align against external libraries through the artifacts in the Validation step."
              : "Los subsets de Familia C no incluyen etiquetas ni variables medidas, por eso la inferencia supervisada se oculta a proposito. Usa los pasos Topicos y Comparacion para razonar sobre regimenes; alinea contra librerias externas a traves de los artefactos del paso Validacion."}
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="workspace-step-body">
        <p className="benchmarks-loading">{isEn ? "Loading benchmarks…" : "Cargando benchmarks…"}</p>
      </div>
    );
  }

  const hasLabeled = filtered.labeled.length > 0;
  const hasMeasured = filtered.measured.length > 0;

  if (!hasLabeled && !hasMeasured) {
    return (
      <div className="workspace-step-body">
        <p className="workspace-selection-empty">
          {isEn
            ? "No supervised runs registered for this subset's dataset list yet. Run scripts/local.* run-core to regenerate the local-core benchmarks payload."
            : "Aun no hay corridas supervisadas para los datasets de este subset. Ejecuta scripts/local.* run-core para regenerar el payload local-core."}
        </p>
      </div>
    );
  }

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>
          {isEn ? "Supervised inference comparison" : "Comparacion de inferencia supervisada"}
        </h4>
        <p>
          {isEn
            ? "Same target, same split protocol, four feature spaces: raw spectra, PCA features, topic-mixture features, and (Family D) region-aware topic features. Lower MAE / higher accuracy is better; the best model per task is highlighted."
            : "Mismo target, mismo protocolo de split, cuatro espacios de features: espectros crudos, PCA, mixtura de topicos y (Familia D) features de topicos por region. MAE menor / accuracy mayor es mejor; el mejor modelo por tarea queda resaltado."}
        </p>
      </div>

      {hasLabeled && (
        <LabeledSceneTables runs={filtered.labeled} isEn={isEn} />
      )}

      {hasMeasured && (
        <MeasuredTargetTables runs={filtered.measured} isEn={isEn} />
      )}
    </div>
  );
}

function LabeledSceneTables({
  runs,
  isEn
}: {
  runs: Record<string, unknown>[];
  isEn: boolean;
}) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">
        {isEn ? "Labelled-scene classification" : "Clasificacion en escenas etiquetadas"}
      </h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? "Multi-class classification per scene. Same train/test split applied to raw / PCA / topic-mixture features."
          : "Clasificacion multi-clase por escena. Mismo split train/test aplicado a features crudos / PCA / mixtura de topicos."}
      </p>
      {runs.map((r, idx) => {
        const cls = asRecord(r["classification"]) ?? {};
        const ids = ["raw_logistic_regression", "pca_logistic_regression", "topic_logistic_regression"];
        const datasetId = asString(r["dataset_id"]);
        const datasetName = asString(r["dataset_name"], datasetId);
        // Determine best macro_f1 to highlight
        const f1s = ids.map((id) => asNumber(asRecord(cls[id])?.["macro_f1"]));
        const bestIdx = f1s.reduce<number | null>(
          (best, val, i) => (val !== null && (best === null || val > (f1s[best] ?? -Infinity)) ? i : best),
          null
        );
        return (
          <div
            key={`${datasetId}-${idx}`}
            style={{ marginTop: idx === 0 ? 0 : 14, overflowX: "auto" }}
          >
            <div className="workspace-comparison-subhead">
              <strong>{datasetName}</strong>
              <span className="workspace-mono">{datasetId}</span>
              <span className="workspace-evidence-modality">
                {isEn ? "Train" : "Train"} {asNumber(r["train_size"]) ?? "—"} ·{" "}
                {isEn ? "Test" : "Test"} {asNumber(r["test_size"]) ?? "—"} ·{" "}
                {isEn ? "Classes" : "Clases"} {asNumber(r["class_count"]) ?? "—"}
              </span>
            </div>
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>{isEn ? "Model" : "Modelo"}</th>
                  <th>Accuracy</th>
                  <th>Macro F1</th>
                </tr>
              </thead>
              <tbody>
                {ids.map((id, i) => {
                  const m = asRecord(cls[id]);
                  const isBest = bestIdx === i;
                  return (
                    <tr
                      key={id}
                      className={isBest ? "workspace-table-row-best" : undefined}
                    >
                      <td>{modelLabel(id, isEn)}</td>
                      <td>{fmt(asNumber(m?.["accuracy"]))}</td>
                      <td>{fmt(asNumber(m?.["macro_f1"]))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function MeasuredTargetTables({
  runs,
  isEn
}: {
  runs: Record<string, unknown>[];
  isEn: boolean;
}) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">
        {isEn
          ? "Measured target tasks (Family D / HIDSAG)"
          : "Tareas con target medido (Familia D / HIDSAG)"}
      </h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? "Each task is one binarised mineralogical / geochemical variable. Group-aware split (process tag) when available. Best-performing model per task is highlighted."
          : "Cada tarea es una variable mineralogica / geoquimica binarizada. Split por grupo (process tag) cuando esta disponible. El mejor modelo por tarea queda resaltado."}
      </p>
      {runs.map((r, idx) => {
        const tasks = asRecordArray(r["classification_tasks"]);
        if (tasks.length === 0) return null;
        const datasetId = asString(r["dataset_id"]);
        const datasetName = asString(r["dataset_name"], datasetId);
        return (
          <div
            key={`${datasetId}-${idx}`}
            style={{ marginTop: idx === 0 ? 0 : 18 }}
          >
            <div className="workspace-comparison-subhead">
              <strong>{datasetName}</strong>
              <span className="workspace-mono">{datasetId}</span>
              <span className="workspace-evidence-modality">
                {isEn ? "Cube docs" : "Documentos de cubo"} {asNumber(r["cube_document_count"]) ?? "—"} ·{" "}
                {isEn ? "Region docs" : "Documentos de region"} {asNumber(r["region_document_count"]) ?? "—"}
              </span>
            </div>
            <ul className="workspace-task-list">
              {tasks.map((task, ti) => (
                <MeasuredTaskCard key={`${datasetId}-task-${ti}`} task={task} isEn={isEn} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function MeasuredTaskCard({
  task,
  isEn
}: {
  task: Record<string, unknown>;
  isEn: boolean;
}) {
  const metrics = asRecord(task["metrics"]) ?? {};
  const split = asRecord(task["split_protocol"]);
  const bestModel = asRecord(task["best_model"]);
  const bestModelId = asString(bestModel?.["model_id"]);
  const ids = Object.keys(metrics);
  return (
    <li className="workspace-task-card">
      <header className="workspace-task-head">
        <div>
          <strong>{asString(task["target"], asString(task["task_id"]))}</strong>
          <span className="workspace-mono">{asString(task["task_id"])}</span>
        </div>
        <span className="workspace-evidence-modality">
          {asString(task["label_definition"])}
        </span>
      </header>
      <div className="workspace-task-meta">
        <span>
          {isEn ? "Split" : "Split"}: {asString(split?.["type"], "—")} ·{" "}
          {asNumber(split?.["fold_count"]) ?? "—"}{" "}
          {isEn ? "folds" : "folds"} ·{" "}
          {isEn ? "groups" : "grupos"} {asString(split?.["group_name"], "—")}
        </span>
        <span>
          {isEn ? "Class balance" : "Balance de clases"}:{" "}
          {labelDistribution(asRecord(task["label_distribution"]))}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th>{isEn ? "Model" : "Modelo"}</th>
              <th>Accuracy</th>
              <th>Balanced acc.</th>
              <th>Macro F1</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const m = asRecord(metrics[id]);
              const isBest = id === bestModelId;
              return (
                <tr
                  key={id}
                  className={isBest ? "workspace-table-row-best" : undefined}
                >
                  <td>{modelLabel(id, isEn)}</td>
                  <td>{fmt(asNumber(m?.["accuracy"]))}</td>
                  <td>{fmt(asNumber(m?.["balanced_accuracy"]))}</td>
                  <td>{fmt(asNumber(m?.["macro_f1"]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </li>
  );
}

function labelDistribution(d: Record<string, unknown> | null): string {
  if (!d) return "—";
  return Object.entries(d)
    .map(([k, v]) => `${k}=${typeof v === "number" ? v : asString(v)}`)
    .join(" / ");
}
