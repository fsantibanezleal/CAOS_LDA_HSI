import { useTranslation } from "react-i18next";

import type { Methodology, ProjectOverview } from "../lib/api";
import { pickText } from "../lib/api";

interface TheoryPanelProps {
  overview: ProjectOverview;
  methodology: Methodology;
  language: string;
}

export function TheoryPanel({ overview, methodology, language }: TheoryPanelProps) {
  const { t } = useTranslation();

  return (
    <section id="theory" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">07</p>
          <h2>{t("theoryTitle")}</h2>
        </div>
      </div>

      <div className="theory-grid">
        <div className="card timeline-card">
          <p className="small-label">{t("workflowTitle")}</p>
          <ol className="timeline">
            {methodology.workflow.map((step) => (
              <li key={step.order}>
                <span className="timeline-index">{step.order}</span>
                <div>
                  <h3>{pickText(step.title, language)}</h3>
                  <p>{pickText(step.body, language)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="principle-column">
          {overview.principles.map((principle) => (
            <article key={principle.id} className="card principle-card">
              <p className="principle-emphasis">{principle.emphasis}</p>
              <h3>{pickText(principle.title, language)}</h3>
              <p>{pickText(principle.body, language)}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="card applications-card">
        <div className="card-header-inline">
          <div>
            <p className="small-label">{t("applicationsTitle")}</p>
            <h3>{t("inferenceTitle")}</h3>
          </div>
        </div>
        <div className="applications-grid">
          {methodology.inference_modes.map((mode) => (
            <article key={mode.id} className="application-mode-card">
              <h3>{pickText(mode.title, language)}</h3>
              <p>{pickText(mode.description, language)}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="card citation-card">
        <div className="card-header-inline">
          <div>
            <p className="small-label">{t("citationsTitle")}</p>
            <h3>{t("openSource")}</h3>
          </div>
        </div>
        <div className="citation-list">
          {overview.citations.map((citation) => (
            <a key={citation.id} href={citation.url} target="_blank" rel="noreferrer" className="citation-item">
              <strong>{citation.title}</strong>
              <span>{citation.source}</span>
              <p>{pickText(citation.note, language)}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
