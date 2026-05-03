import { useEffect, useMemo, useState } from "react";

import {
  api,
  type LocalCoreBenchmarksPayload,
  type SegmentationBaselinesPayload,
  type SubsetCard
} from "../../lib/api";
import {
  asNumber,
  asRecord,
  asString,
  filterBenchmarks,
  filterSegmentation
} from "./benchmarkUtils";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

function fmt(value: number | null, digits = 3): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

export function ComparisonStep({ card, language }: Props) {
  const isEn = language === "en";
  const [benchmarks, setBenchmarks] = useState<LocalCoreBenchmarksPayload | null>(null);
  const [segmentation, setSegmentation] = useState<SegmentationBaselinesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void Promise.allSettled([api.getLocalCoreBenchmarks(), api.getSegmentationBaselines()])
      .then(([b, s]) => {
        if (b.status === "fulfilled") setBenchmarks(b.value);
        else setBenchmarks(null);
        if (s.status === "fulfilled") setSegmentation(s.value);
        else setSegmentation(null);
        if (b.status === "rejected" && s.status === "rejected") {
          setError("benchmark payloads could not be loaded");
        }
      })
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

  const slicScenes = useMemo(
    () => filterSegmentation(segmentation, datasetIds),
    [segmentation, datasetIds]
  );

  if (loading) {
    return (
      <div className="workspace-step-body">
        <p className="benchmarks-loading">{isEn ? "Loading benchmarks…" : "Cargando benchmarks…"}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="workspace-step-body">
        <p className="benchmarks-callout">{error}</p>
      </div>
    );
  }

  const hasAnyData =
    filtered.labeled.length +
      filtered.unlabeled.length +
      filtered.unmixing.length +
      filtered.library.length +
      slicScenes.length >
    0;

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Baseline comparison" : "Comparacion contra baselines"}</h4>
        <p>
          {isEn
            ? "Topic outputs versus non-topic baselines for the datasets in this subset. Each block declares its feature space, spatial use, and supervision use, plus the metric values from the local-core benchmarks payload."
            : "Salidas de topicos vs baselines no-topicas para los datasets de este subset. Cada bloque declara feature space, uso espacial y uso de supervision, y muestra las metricas del payload de benchmarks local-core."}
        </p>
      </div>

      {!hasAnyData && (
        <p className="workspace-selection-empty">
          {isEn
            ? "No baseline runs registered for this subset's dataset list yet. Run scripts/local.* run-core to regenerate the local-core benchmarks payload."
            : "Aun no hay corridas de baselines para los datasets de este subset. Ejecuta scripts/local.* run-core para regenerar el payload local-core."}
        </p>
      )}

      {filtered.labeled.length > 0 && (
        <ClusteringTable
          title={isEn ? "Clustering on labelled scenes" : "Clustering en escenas etiquetadas"}
          runs={filtered.labeled}
          isEn={isEn}
        />
      )}

      {filtered.unlabeled.length > 0 && (
        <ClusteringTable
          title={isEn ? "Clustering on unlabelled scenes" : "Clustering en escenas no etiquetadas"}
          runs={filtered.unlabeled}
          isEn={isEn}
          unlabelled
        />
      )}

      {filtered.unmixing.length > 0 && (
        <UnmixingTable runs={filtered.unmixing} isEn={isEn} />
      )}

      {filtered.library.length > 0 && (
        <LibraryTable runs={filtered.library} isEn={isEn} />
      )}

      {slicScenes.length > 0 && <SlicTable scenes={slicScenes} isEn={isEn} />}
    </div>
  );
}

interface RowProps {
  runs: Record<string, unknown>[];
  isEn: boolean;
}

function ClusteringTable({
  title,
  runs,
  isEn,
  unlabelled = false
}: { title: string; unlabelled?: boolean } & RowProps) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">{title}</h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? unlabelled
            ? "Unsupervised metrics — there are no labels to score against, so we report mean topic entropy and reference alignment."
            : "Lower ARI / NMI on raw spectra means topic-mixture features cluster better with respect to the ground-truth labels."
          : unlabelled
            ? "Metricas no supervisadas — no hay etiquetas, asi que reportamos entropia media de topicos y alineamiento de referencia."
            : "Si el ARI / NMI sobre espectros crudos es menor, los features de mixtura de topicos agrupan mejor respecto a las etiquetas reales."}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th>{isEn ? "Dataset" : "Dataset"}</th>
              <th>{isEn ? "Documents" : "Documentos"}</th>
              <th>{isEn ? "K (topics)" : "K (topicos)"}</th>
              <th>{isEn ? "Test perplexity" : "Perplexity test"}</th>
              <th>raw KMeans NMI</th>
              <th>topic KMeans NMI</th>
              <th>raw GMM NMI</th>
              <th>topic GMM NMI</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => {
              const tm = asRecord(r["topic_model"]);
              const clus = asRecord(r["clustering"]);
              return (
                <tr key={`${asString(r["dataset_id"])}-${idx}`}>
                  <td>
                    <strong>{asString(r["dataset_name"], asString(r["dataset_id"]))}</strong>
                    <div className="workspace-mono">{asString(r["dataset_id"])}</div>
                  </td>
                  <td>{asNumber(r["sampled_documents"]) ?? "—"}</td>
                  <td>{asNumber(tm?.["topic_count"]) ?? "—"}</td>
                  <td>
                    {fmt(
                      asNumber(tm?.["test_perplexity"] ?? tm?.["perplexity"]),
                      2
                    )}
                  </td>
                  <td>{fmt(asNumber(asRecord(clus?.["raw_kmeans"])?.["nmi"]))}</td>
                  <td>{fmt(asNumber(asRecord(clus?.["topic_kmeans"])?.["nmi"]))}</td>
                  <td>{fmt(asNumber(asRecord(clus?.["raw_gmm"])?.["nmi"]))}</td>
                  <td>{fmt(asNumber(asRecord(clus?.["topic_gmm"])?.["nmi"]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnmixingTable({ runs, isEn }: RowProps) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">
        {isEn ? "NMF / unmixing baselines" : "Baselines NMF / unmixing"}
      </h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? "Reconstruction error and matched-component angle for the topic model versus a vanilla NMF on the same scene."
          : "Error de reconstruccion y angulo de componente alineado para el modelo de topicos vs un NMF estandar sobre la misma escena."}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th>{isEn ? "Dataset" : "Dataset"}</th>
              <th>{isEn ? "References" : "Referencias"}</th>
              <th>NMF components</th>
              <th>NMF recon. err.</th>
              <th>Topic K</th>
              <th>{isEn ? "Topic perplexity" : "Perplexity topicos"}</th>
              <th>{isEn ? "Topic alignment angle (mean)" : "Angulo medio de alineamiento"}</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, idx) => {
              const tm = asRecord(r["topic_model"]);
              const nmf = asRecord(r["nmf_baseline"]);
              const tmAlign = asRecord(tm?.["alignment"]);
              return (
                <tr key={`${asString(r["dataset_id"])}-${idx}`}>
                  <td>
                    <strong>{asString(r["dataset_name"], asString(r["dataset_id"]))}</strong>
                    <div className="workspace-mono">{asString(r["dataset_id"])}</div>
                  </td>
                  <td>{asNumber(r["reference_material_count"]) ?? "—"}</td>
                  <td>{asNumber(nmf?.["component_count"]) ?? "—"}</td>
                  <td>{fmt(asNumber(nmf?.["normalized_reconstruction_error"]), 4)}</td>
                  <td>{asNumber(tm?.["topic_count"]) ?? "—"}</td>
                  <td>{fmt(asNumber(tm?.["perplexity"]), 2)}</td>
                  <td>{fmt(asNumber(tmAlign?.["matched_angle_deg_mean"]), 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LibraryTable({ runs, isEn }: RowProps) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">
        {isEn ? "Spectral-library band groups" : "Grupos de bandas de la libreria espectral"}
      </h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? "USGS samples are grouped by band count (each sensor convolution). Topic counts and perplexity per group."
          : "Las muestras USGS se agrupan por cantidad de bandas (convolucion del sensor). Topicos y perplexity por grupo."}
      </p>
      {runs.map((r, idx) => {
        const groups = Array.isArray(r["band_groups"])
          ? (r["band_groups"] as Record<string, unknown>[])
          : [];
        return (
          <div
            key={`${asString(r["dataset_id"])}-${idx}`}
            style={{ overflowX: "auto", marginTop: idx === 0 ? 0 : 12 }}
          >
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>{isEn ? "Band count" : "Bandas"}</th>
                  <th>{isEn ? "Samples" : "Muestras"}</th>
                  <th>{isEn ? "Material groups" : "Grupos de material"}</th>
                  <th>K</th>
                  <th>Perplexity</th>
                  <th>raw KMeans NMI</th>
                  <th>topic KMeans NMI</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g, gi) => {
                  const clus = asRecord(g["clustering"]);
                  return (
                    <tr key={`bg-${gi}`}>
                      <td>{asNumber(g["band_count"]) ?? "—"}</td>
                      <td>{asNumber(g["sample_count"]) ?? "—"}</td>
                      <td>{asNumber(g["group_count"]) ?? "—"}</td>
                      <td>{asNumber(g["topic_count"]) ?? "—"}</td>
                      <td>{fmt(asNumber(g["perplexity"]), 2)}</td>
                      <td>{fmt(asNumber(asRecord(clus?.["raw_kmeans"])?.["nmi"]))}</td>
                      <td>{fmt(asNumber(asRecord(clus?.["topic_kmeans"])?.["nmi"]))}</td>
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

function SlicTable({
  scenes,
  isEn
}: {
  scenes: Record<string, unknown>[];
  isEn: boolean;
}) {
  return (
    <div className="workspace-comparison-block">
      <h4 className="workspace-comparison-title">
        {isEn ? "SLIC superpixel baselines" : "Baselines SLIC superpixeles"}
      </h4>
      <p className="workspace-comparison-hint">
        {isEn
          ? "Spatial regioning baseline. Weighted purity is the label-coverage-weighted purity of segments where labels exist."
          : "Baseline de regiones espaciales. La pureza ponderada es la pureza por cobertura de etiquetas en segmentos con labels."}
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th>Scene</th>
              <th>Method</th>
              <th>{isEn ? "Segments" : "Segmentos"}</th>
              <th>{isEn ? "Label coverage" : "Cobertura"}</th>
              <th>{isEn ? "Weighted purity" : "Pureza ponderada"}</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((s, idx) => {
              const lm = asRecord(s["label_metrics"]);
              return (
                <tr key={`slic-${idx}`}>
                  <td>
                    <strong>{asString(s["scene_name"], asString(s["scene_id"]))}</strong>
                    <div className="workspace-mono">{asString(s["dataset_id"])}</div>
                  </td>
                  <td>
                    <code>{asString(s["method_id"])}</code>
                  </td>
                  <td>{asNumber(s["segment_count"]) ?? "—"}</td>
                  <td>{fmt(asNumber(lm?.["label_coverage_ratio"]))}</td>
                  <td>{fmt(asNumber(lm?.["weighted_label_purity"]))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
