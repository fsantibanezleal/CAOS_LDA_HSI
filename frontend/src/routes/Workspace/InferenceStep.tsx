import { type SubsetCard, pickText } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

const FAMILIES_WITH_INFERENCE = new Set([
  "labeled-spectral-image",
  "regions-with-measurements",
  "individual-spectra"
]);

export function InferenceStep({ card, language }: Props) {
  const isEn = language === "en";
  const allowed = FAMILIES_WITH_INFERENCE.has(card.family_id);

  if (!allowed) {
    return (
      <div className="workspace-step-body">
        <div className="workspace-step-intro">
          <h4>{isEn ? "Inference unavailable for this family" : "Inferencia no disponible para esta familia"}</h4>
          <p>
            {isEn
              ? "Family C subsets ship without labels or measured response variables, so the supervised pipeline is hidden by design. Use the Topics and Comparison steps to reason about regimes; align against external libraries through the artifacts in the Validation step."
              : "Los subsets de Familia C no incluyen etiquetas ni variables medidas, por eso la inferencia supervisada se oculta a proposito. Usa los pasos Topicos y Comparacion para razonar sobre regimenes; alinea contra librerias externas a traves de los artefactos del paso Validacion."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Supervised inference" : "Inferencia supervisada"}</h4>
        <p>
          {isEn
            ? "Compare raw spectra, PCA features, topic-mixture features, and topic-routed local models on the same labels or measured variables. The numerical metric panel reading /api/local-core-benchmarks is the next implementation block; until then this surface lists what supervision the active subset carries and what models will be exposed."
            : "Compara espectros crudos, features PCA, mixturas de topicos y modelos topic-routed sobre las mismas etiquetas o variables medidas. El panel numerico que lee /api/local-core-benchmarks es el siguiente bloque; por ahora esta vista lista que supervision trae el subset activo y que modelos se expondran."}
        </p>
      </div>

      <ul className="workspace-evidence-grid">
        {card.evidence
          .filter((e) => e.label_scope || e.measurement_scope)
          .map((e) => (
            <li key={e.dataset_id} className="workspace-evidence-card">
              <div className="workspace-evidence-head">
                <strong>{e.dataset_name}</strong>
                <span className="workspace-evidence-modality">{e.dataset_id}</span>
              </div>
              <dl className="workspace-evidence-meta">
                {e.label_scope && (
                  <>
                    <dt>{isEn ? "Available labels" : "Etiquetas disponibles"}</dt>
                    <dd>{e.label_scope}</dd>
                  </>
                )}
                {e.measurement_scope && (
                  <>
                    <dt>{isEn ? "Measured variables" : "Variables medidas"}</dt>
                    <dd>{e.measurement_scope}</dd>
                  </>
                )}
              </dl>
              <p className="workspace-evidence-summary">
                {pickText(e.summary, language)}
              </p>
            </li>
          ))}
      </ul>

      <div className="workspace-step-intro">
        <h4>{isEn ? "Models to expose" : "Modelos a exponer"}</h4>
        <ul className="workspace-baseline-grid">
          <li className="workspace-baseline-card">
            <strong>{isEn ? "Raw / PCA baseline" : "Baseline crudo / PCA"}</strong>
            <p className="workspace-baseline-purpose">
              {isEn
                ? "Logistic regression / Ridge / PLS over raw reflectance and PCA features."
                : "Regresion logistica / Ridge / PLS sobre reflectancia cruda y features PCA."}
            </p>
          </li>
          <li className="workspace-baseline-card">
            <strong>{isEn ? "Topic-mixture features" : "Features de mixtura de topicos"}</strong>
            <p className="workspace-baseline-purpose">
              {isEn
                ? "Same downstream model but consuming the K-dimensional θ instead of bands."
                : "Mismo modelo pero consumiendo la mixtura θ K-dimensional en vez de las bandas."}
            </p>
          </li>
          <li className="workspace-baseline-card">
            <strong>{isEn ? "Topic-routed (A39 hierarchical)" : "Topic-routed (jerarquico A39)"}</strong>
            <p className="workspace-baseline-purpose">
              {isEn
                ? "Train one local model per dominant topic; predict by hard-routing or soft mix weighted by θ."
                : "Entrena un modelo local por topico dominante; predice con routing duro o mezcla suave ponderada por θ."}
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
}
