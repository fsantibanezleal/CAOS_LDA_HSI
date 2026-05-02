import { type SubsetCard, pickText } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

export function DataStep({ card, language }: Props) {
  const isEn = language === "en";
  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Available evidence" : "Evidencia disponible"}</h4>
        <p>
          {isEn
            ? "What this subset actually carries — sensor, dimensions, supervision scope, and provenance."
            : "Lo que este subset realmente carga — sensor, dimensiones, alcance de supervision y procedencia."}
        </p>
      </div>

      <ul className="workspace-evidence-grid">
        {card.evidence.map((item) => (
          <li key={item.dataset_id} className="workspace-evidence-card">
            <div className="workspace-evidence-head">
              <strong>{item.dataset_name}</strong>
              <span className="workspace-evidence-modality">{item.modality}</span>
            </div>
            <p className="workspace-evidence-summary">
              {pickText(item.summary, language)}
            </p>
            <dl className="workspace-evidence-meta">
              {typeof item.band_count === "number" && (
                <>
                  <dt>{isEn ? "Bands" : "Bandas"}</dt>
                  <dd>{item.band_count}</dd>
                </>
              )}
              {Array.isArray(item.spatial_shape) && item.spatial_shape.length > 0 && (
                <>
                  <dt>{isEn ? "Shape" : "Forma"}</dt>
                  <dd>{item.spatial_shape.join(" × ")}</dd>
                </>
              )}
              {item.label_scope && (
                <>
                  <dt>{isEn ? "Labels" : "Etiquetas"}</dt>
                  <dd>{item.label_scope}</dd>
                </>
              )}
              {item.measurement_scope && (
                <>
                  <dt>{isEn ? "Measurements" : "Mediciones"}</dt>
                  <dd>{item.measurement_scope}</dd>
                </>
              )}
              <dt>{isEn ? "Dataset id" : "ID del dataset"}</dt>
              <dd className="workspace-mono">{item.dataset_id}</dd>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
