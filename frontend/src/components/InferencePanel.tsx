import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { DemoPayload } from "../lib/api";
import { pickText } from "../lib/api";
import { useStore } from "../store/useStore";

interface InferencePanelProps {
  demo: DemoPayload;
  language: string;
}

export function InferencePanel({ demo, language }: InferencePanelProps) {
  const { t } = useTranslation();
  const selectedSampleId = useStore((state) => state.selectedSampleId);
  const setSelectedSampleId = useStore((state) => state.setSelectedSampleId);
  const selectedSample = demo.samples.find((entry) => entry.id === selectedSampleId) ?? demo.samples[0];

  const baseline = demo.model_metrics.find((entry) => entry.id === "baseline_linear") ?? demo.model_metrics[0];

  const orderedRows = useMemo(() => {
    return [...demo.samples].sort((a, b) => a.id.localeCompare(b.id));
  }, [demo.samples]);

  return (
    <section id="inference" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">06</p>
          <h2>{t("inferenceTitle")}</h2>
        </div>
        <div className="section-note">
          <strong>{t("routingRule")}</strong>
          <p>{pickText(demo.routing_rule, language)}</p>
        </div>
      </div>

      <div className="metric-grid">
        {demo.model_metrics
          .slice()
          .sort((a, b) => a.rmse - b.rmse)
          .map((metric) => {
            const improvement = baseline.rmse > 0 ? ((baseline.rmse - metric.rmse) / baseline.rmse) * 100 : 0;
            return (
              <article key={metric.id} className="card metric-card">
                <p className="small-label">{t("rmse")}</p>
                <h3>{pickText(metric.label, language)}</h3>
                <div className="metric-value">{metric.rmse.toFixed(3)}</div>
                <p>{pickText(metric.note, language)}</p>
                <p className="metric-improvement">
                  {metric.id === baseline.id
                    ? t("baselineLabel")
                    : t("improvementVsBaseline", { improvement: improvement.toFixed(1) })}
                </p>
              </article>
            );
          })}
      </div>

      <div className="card table-card">
        <div className="card-header-inline">
          <div>
            <p className="small-label">{t("samplePredictions")}</p>
            <h3>{pickText(selectedSample.label, language)}</h3>
          </div>
          <div className="prediction-focus">
            <span>{t("targetValue")}: {selectedSample.target_value.toFixed(2)}</span>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("sampleColumn")}</th>
                <th>{t("targetValue")}</th>
                {demo.model_metrics.map((metric) => (
                  <th key={metric.id}>{pickText(metric.label, language)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orderedRows.map((sample) => (
                <tr
                  key={sample.id}
                  className={sample.id === selectedSample.id ? "is-active" : ""}
                  onClick={() => setSelectedSampleId(sample.id)}
                >
                  <td>{pickText(sample.label, language)}</td>
                  <td>{sample.target_value.toFixed(2)}</td>
                  {demo.model_metrics.map((metric) => (
                    <td key={`${sample.id}-${metric.id}`}>
                      {sample.predictions[metric.id].toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
