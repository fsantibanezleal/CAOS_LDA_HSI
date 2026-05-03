import { useEffect, useMemo, useState } from "react";

import {
  api,
  type ExplorationSceneView,
  type LocalCoreBenchmarksPayload,
  type SegmentationBaselinesPayload,
  type SubsetCard
} from "../../../lib/api";
import { useStore } from "../../../store/useStore";
import { datasetMatches } from "../workspaceUtils";

interface Props {
  card: SubsetCard;
  scene: ExplorationSceneView | null;
  language: "en" | "es";
}

type Method = "kmeans" | "gmm" | "hierarchical";
type Feature = "raw" | "topic";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asString(v: unknown, fb = ""): string {
  return typeof v === "string" ? v : fb;
}
function pick<T>(arr: unknown, ids: string[]): T[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => {
      const r = asRecord(x);
      const id = asString(r?.["dataset_id"]);
      return ids.includes(id) || ids.some((d) => datasetMatches(d, id));
    })
    .map((x) => x as T);
}

export function ComparisonStep({ card, scene, language }: Props) {
  const isEn = language === "en";
  const [benchmarks, setBenchmarks] = useState<LocalCoreBenchmarksPayload | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationBaselinesPayload | null>(null);
  const [feature, setFeature] = useState<Feature>("raw");
  const [method, setMethod] = useState<Method>("kmeans");
  const setRecipe = useStore((s) => s.setRecipe);

  useEffect(() => {
    void api.getLocalCoreBenchmarks().then(setBenchmarks).catch(() => setBenchmarks(null));
    void api.getSegmentationBaselines().then(setSegmentation).catch(() => setSegmentation(null));
  }, []);

  const datasetIds = useMemo(() => card.evidence.map((e) => e.dataset_id), [card.evidence]);

  const labeledRuns = useMemo<Record<string, unknown>[]>(() => {
    if (!benchmarks) return [];
    return pick<Record<string, unknown>>(benchmarks.labeled_scene_runs, datasetIds);
  }, [benchmarks, datasetIds]);

  const slicScenes = useMemo<Record<string, unknown>[]>(() => {
    if (!segmentation) return [];
    const list = (segmentation as unknown as { scenes?: unknown }).scenes;
    if (!Array.isArray(list)) return [];
    return list
      .map((s) => asRecord(s))
      .filter((r): r is Record<string, unknown> => r !== null)
      .filter((r) => {
        const id = asString(r["dataset_id"]);
        return datasetIds.includes(id) || datasetIds.some((d) => datasetMatches(d, id));
      });
  }, [segmentation, datasetIds]);

  const previewRow = useMemo(() => {
    const rgb = scene?.rgb_preview_path ?? null;
    const labels = scene?.label_preview_path ?? null;
    const slicPreview = slicScenes.length > 0 ? asString(slicScenes[0]["preview_path"]) : null;
    return {
      rgb,
      labels,
      slic: slicPreview && slicPreview.length > 0 ? slicPreview : null
    };
  }, [scene, slicScenes]);

  if (!benchmarks) {
    return <div className="ws-empty">{isEn ? "Loading benchmarks…" : "Cargando benchmarks…"}</div>;
  }

  return (
    <div className="ws-comparison-grid">
      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Spatial comparison strip" : "Tira de comparación espacial"}</h4>
          <p>
            {isEn
              ? "RGB false-colour, ground-truth labels, and the SLIC superpixel baseline aligned spatially. Use the layer toggles below to compare side-by-side."
              : "Color falso, etiquetas y baseline SLIC alineados espacialmente."}
          </p>
        </header>
        <div className="ws-strip">
          {previewRow.rgb && (
            <figure>
              <img src={previewRow.rgb} alt="RGB" loading="lazy" />
              <figcaption>RGB</figcaption>
            </figure>
          )}
          {previewRow.labels && (
            <figure>
              <img src={previewRow.labels} alt={isEn ? "Labels" : "Etiquetas"} loading="lazy" />
              <figcaption>{isEn ? "Labels" : "Etiquetas"}</figcaption>
            </figure>
          )}
          {previewRow.slic && (
            <figure>
              <img src={previewRow.slic} alt="SLIC" loading="lazy" />
              <figcaption>SLIC</figcaption>
            </figure>
          )}
        </div>
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Clustering comparison · raw vs topic" : "Comparación de clustering · raw vs tópicos"}</h4>
          <p>
            {isEn
              ? "Adjusted Rand Index and Normalised Mutual Information for unsupervised clusterings on raw spectra and on topic-mixture features. Higher is better; the topic feature space wins when bars on the right exceed bars on the left."
              : "ARI y NMI para clusterings no supervisados sobre espectros crudos y sobre mixturas de tópicos."}
          </p>
        </header>
        <div className="ws-mini-controls">
          <label className="ws-mini-label">{isEn ? "Method" : "Método"}:</label>
          {(["kmeans", "gmm", "hierarchical"] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              className={method === m ? "ws-mini-button is-active" : "ws-mini-button"}
              onClick={() => setMethod(m)}
            >
              {m}
            </button>
          ))}
          <span className="ws-mini-spacer" />
          <label className="ws-mini-label">{isEn ? "Feature space" : "Feature space"}:</label>
          {(["raw", "topic"] as Feature[]).map((f) => (
            <button
              key={f}
              type="button"
              className={feature === f ? "ws-mini-button is-active" : "ws-mini-button"}
              onClick={() => setFeature(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <ClusteringTable runs={labeledRuns} method={method} isEn={isEn} />
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "SLIC superpixels" : "Superpíxeles SLIC"}</h4>
          <p>
            {isEn
              ? "Spatial baseline. Weighted purity = label-coverage-weighted purity of segments where labels exist."
              : "Baseline espacial. Pureza ponderada por cobertura de etiquetas."}
          </p>
        </header>
        <SlicTable scenes={slicScenes} onClick={() => setRecipe("patch-band-frequency")} isEn={isEn} />
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Topic perplexity" : "Perplexity de tópicos"}</h4>
          <p>
            {isEn
              ? "Train and test perplexity per dataset. Lower is better."
              : "Perplexity en train y test por dataset. Menor es mejor."}
          </p>
        </header>
        <PerplexityTable runs={labeledRuns} isEn={isEn} />
      </section>
    </div>
  );
}

function ClusteringTable({
  runs,
  method,
  isEn
}: {
  runs: Record<string, unknown>[];
  method: Method;
  isEn: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ws-table">
        <thead>
          <tr>
            <th>{isEn ? "Dataset" : "Dataset"}</th>
            <th>K</th>
            <th>raw ARI</th>
            <th>raw NMI</th>
            <th>topic ARI</th>
            <th>topic NMI</th>
            <th>{isEn ? "Δ NMI" : "Δ NMI"}</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 && (
            <tr>
              <td colSpan={7} className="ws-empty">
                {isEn
                  ? "No labelled runs registered for this subset's dataset list."
                  : "Sin corridas etiquetadas para este subset."}
              </td>
            </tr>
          )}
          {runs.map((r, idx) => {
            const cls = asRecord(r["clustering"]);
            const tm = asRecord(r["topic_model"]);
            const rawKey = `raw_${method}`;
            const topicKey = `topic_${method}`;
            const rawAri = asNumber(asRecord(cls?.[rawKey])?.["ari"]);
            const rawNmi = asNumber(asRecord(cls?.[rawKey])?.["nmi"]);
            const topicAri = asNumber(asRecord(cls?.[topicKey])?.["ari"]);
            const topicNmi = asNumber(asRecord(cls?.[topicKey])?.["nmi"]);
            const deltaNmi = topicNmi !== null && rawNmi !== null ? topicNmi - rawNmi : null;
            return (
              <tr key={idx}>
                <td>
                  <strong>{asString(r["dataset_name"], asString(r["dataset_id"]))}</strong>
                  <div className="ws-mono">{asString(r["dataset_id"])}</div>
                </td>
                <td>{asNumber(tm?.["topic_count"]) ?? "—"}</td>
                <td>{fmt(rawAri)}</td>
                <td>{fmt(rawNmi)}</td>
                <td>{fmt(topicAri)}</td>
                <td>{fmt(topicNmi)}</td>
                <td className={deltaNmi === null ? "" : deltaNmi > 0 ? "ws-pos" : deltaNmi < 0 ? "ws-neg" : ""}>
                  {deltaNmi === null ? "—" : (deltaNmi > 0 ? "+" : "") + deltaNmi.toFixed(3)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlicTable({
  scenes,
  onClick,
  isEn
}: {
  scenes: Record<string, unknown>[];
  onClick: () => void;
  isEn: boolean;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ws-table">
        <thead>
          <tr>
            <th>{isEn ? "Scene" : "Escena"}</th>
            <th>method</th>
            <th>{isEn ? "Segments" : "Segmentos"}</th>
            <th>{isEn ? "Coverage" : "Cobertura"}</th>
            <th>{isEn ? "Weighted purity" : "Pureza pond."}</th>
            <th>↪</th>
          </tr>
        </thead>
        <tbody>
          {scenes.length === 0 && (
            <tr>
              <td colSpan={6} className="ws-empty">
                {isEn ? "No SLIC outputs for this subset." : "Sin salidas SLIC para este subset."}
              </td>
            </tr>
          )}
          {scenes.map((s, idx) => {
            const lm = asRecord(s["label_metrics"]);
            return (
              <tr key={idx}>
                <td>
                  <strong>{asString(s["scene_name"], asString(s["scene_id"]))}</strong>
                </td>
                <td>
                  <code>{asString(s["method_id"])}</code>
                </td>
                <td>{asNumber(s["segment_count"]) ?? "—"}</td>
                <td>{fmt(asNumber(lm?.["label_coverage_ratio"]))}</td>
                <td>{fmt(asNumber(lm?.["weighted_label_purity"]))}</td>
                <td>
                  <button type="button" className="ws-mini-button" onClick={onClick}>
                    {isEn ? "use V7 recipe" : "usar V7"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PerplexityTable({ runs, isEn }: { runs: Record<string, unknown>[]; isEn: boolean }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="ws-table">
        <thead>
          <tr>
            <th>{isEn ? "Dataset" : "Dataset"}</th>
            <th>K</th>
            <th>train</th>
            <th>test</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r, idx) => {
            const tm = asRecord(r["topic_model"]);
            const train = asNumber(tm?.["train_perplexity"]);
            const test = asNumber(tm?.["test_perplexity"]);
            const delta = train !== null && test !== null ? test - train : null;
            return (
              <tr key={idx}>
                <td>
                  <strong>{asString(r["dataset_name"], asString(r["dataset_id"]))}</strong>
                </td>
                <td>{asNumber(tm?.["topic_count"]) ?? "—"}</td>
                <td>{fmt(train, 2)}</td>
                <td>{fmt(test, 2)}</td>
                <td className={delta === null ? "" : delta > 0 ? "ws-neg" : "ws-pos"}>
                  {delta === null ? "—" : (delta > 0 ? "+" : "") + delta.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function fmt(v: number | null, digits = 3): string {
  if (v === null) return "—";
  return v.toFixed(digits);
}
