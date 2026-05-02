import { type SubsetCard } from "../../lib/api";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

export function TopicsStep({ card, language }: Props) {
  const isEn = language === "en";
  const topics = card.topics;

  if (!topics || topics.topics.length === 0) {
    return (
      <div className="workspace-step-body">
        <div className="workspace-step-intro">
          <h4>{isEn ? "Topic results" : "Resultados de topicos"}</h4>
          <p>
            {isEn
              ? "No compact topic block has been extracted for this subset yet. Run scripts/local.* build-subset-cards after generating local-core benchmarks for the dataset."
              : "Aun no se ha extraido un bloque compacto de topicos para este subset. Ejecuta scripts/local.* build-subset-cards luego de generar los benchmarks local-core."}
          </p>
        </div>
      </div>
    );
  }

  const maxWeight = Math.max(...topics.topics.map((t) => t.weight), 0.0001);

  return (
    <div className="workspace-step-body">
      <div className="workspace-step-intro">
        <h4>{isEn ? "Topic results" : "Resultados de topicos"}</h4>
        <p>
          {isEn
            ? "Top topics learned over the active recipe corpus. Each topic is a probability distribution over spectral tokens; the bars show the cumulative weight of the top words."
            : "Topicos principales aprendidos sobre el corpus de la receta activa. Cada topico es una distribucion sobre tokens espectrales; las barras muestran el peso acumulado de las palabras top."}
        </p>
      </div>

      <div className="workspace-topic-summary">
        <div className="workspace-stat">
          <span className="workspace-stat-label">{isEn ? "Topics K" : "Topicos K"}</span>
          <span className="workspace-stat-value">{topics.K ?? "—"}</span>
        </div>
        <div className="workspace-stat">
          <span className="workspace-stat-label">
            {isEn ? "Stability cosine" : "Cosine de estabilidad"}
          </span>
          <span className="workspace-stat-value">
            {topics.stability_score !== null && topics.stability_score !== undefined
              ? topics.stability_score.toFixed(3)
              : "—"}
          </span>
        </div>
        <div className="workspace-stat">
          <span className="workspace-stat-label">
            {isEn ? "Seeds compared" : "Seeds comparadas"}
          </span>
          <span className="workspace-stat-value">{topics.seeds_compared ?? "—"}</span>
        </div>
        <div className="workspace-stat">
          <span className="workspace-stat-label">
            {isEn ? "Representation" : "Representacion"}
          </span>
          <span className="workspace-stat-value workspace-mono">
            {topics.representation_id ?? "—"}
          </span>
        </div>
      </div>

      <ul className="workspace-topic-list">
        {topics.topics.map((topic) => (
          <li key={topic.topic_id} className="workspace-topic-card">
            <div className="workspace-topic-head">
              <strong>
                {isEn ? "Topic" : "Topico"} {topic.topic_id}
              </strong>
              <span className="workspace-topic-weight">
                {(topic.weight * 100).toFixed(1)}%
              </span>
            </div>
            <div
              className="workspace-topic-bar"
              role="img"
              aria-label={`weight ${(topic.weight * 100).toFixed(1)}%`}
            >
              <span
                style={{
                  width: `${Math.max((topic.weight / maxWeight) * 100, 4)}%`
                }}
              />
            </div>
            <ul className="workspace-token-list">
              {topic.top_words.map((word, idx) => (
                <li key={`${word}-${idx}`}>{word}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
