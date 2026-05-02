import { type SubsetCard, pickText } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

const STATUS_CLASS: Record<string, string> = {
  ready: "overview-status-active",
  prototype: "overview-status-prototype",
  blocked: "overview-status-research",
  passed: "overview-status-active",
  partial: "overview-status-prototype",
  pending: "overview-status-research",
  failed: "overview-status-research"
};

export function ValidationStep({ card, language }: Props) {
  const isEn = language === "en";
  const blocks = card.validation;

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Validation block status" : "Estado por bloque de validacion"}</h4>
        <p>
          {isEn
            ? "Compact summary of which validation blocks have been satisfied for this subset. A claim that has not survived its applicable blocks is presented as a hypothesis, never as a result."
            : "Resumen compacto de que bloques de validacion satisfizo este subset. Una afirmacion que no ha pasado sus bloques aplicables se presenta como hipotesis, nunca como resultado."}
        </p>
      </div>

      {blocks.length === 0 ? (
        <p className="workspace-selection-empty">
          {isEn
            ? "No validation block status recorded for this subset yet."
            : "Aun no se registra estado de bloques de validacion para este subset."}
        </p>
      ) : (
        <ul className="workspace-validation-list">
          {blocks.map((block) => {
            const klass = STATUS_CLASS[block.status] ?? "overview-status-research";
            return (
              <li key={block.block_id} className="workspace-validation-card">
                <div className="workspace-validation-head">
                  <strong>{prettifyBlockId(block.block_id)}</strong>
                  <span className={`overview-status ${klass}`}>{block.status}</span>
                </div>
                {block.detail && (
                  <p className="workspace-validation-detail">
                    {pickText(block.detail, language)}
                  </p>
                )}
                {block.metric_name && block.metric_value !== null && (
                  <div className="workspace-validation-metric">
                    <span className="workspace-evidence-modality">
                      {block.metric_name}
                    </span>
                    <strong>{Number(block.metric_value).toFixed(3)}</strong>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <section className="workspace-claims">
        <div className="workspace-claims-block">
          <h4>{isEn ? "Supported claims" : "Afirmaciones soportadas"}</h4>
          {card.supported_claims.length === 0 ? (
            <p className="workspace-selection-empty">—</p>
          ) : (
            <ul className="workspace-claim-list">
              {card.supported_claims.map((c) => (
                <li key={c.id}>
                  <strong>{pickText(c.title, language)}</strong>
                  <p>{pickText(c.detail, language)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="workspace-claims-block workspace-claims-block-blocked">
          <h4>{isEn ? "Blocked claims" : "Afirmaciones bloqueadas"}</h4>
          {card.blocked_claims.length === 0 ? (
            <p className="workspace-selection-empty">—</p>
          ) : (
            <ul className="workspace-claim-list">
              {card.blocked_claims.map((c) => (
                <li key={c.id}>
                  <strong>{pickText(c.title, language)}</strong>
                  <p>{pickText(c.detail, language)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function prettifyBlockId(id: string) {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
