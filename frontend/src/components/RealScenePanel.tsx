import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RealScenesPayload } from "../lib/api";
import { BarStrip, LineChart, MixtureBars } from "./Charts";

interface RealScenePanelProps {
  payload: RealScenesPayload;
}

function formatMB(sizeBytes: number): string {
  return `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function RealScenePanel({ payload }: RealScenePanelProps) {
  const { t } = useTranslation();
  const [sceneId, setSceneId] = useState<string>(payload.scenes[0]?.id ?? "");

  const scene = useMemo(
    () => payload.scenes.find((entry) => entry.id === sceneId) ?? payload.scenes[0],
    [payload.scenes, sceneId]
  );

  const largestClasses = [...scene.class_summaries].sort((a, b) => b.count - a.count).slice(0, 6);
  const topicColors = ["#63c7b2", "#e0a146", "#d96a43", "#7e8ce0", "#6abf73", "#c9824d"];

  return (
    <section id="real-data" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">02</p>
          <h2>{t("realScenesTitle")}</h2>
        </div>
        <div className="section-note">
          <strong>{t("downloadedLocal")}</strong>
          <p>{payload.source}</p>
        </div>
      </div>

      <div className="sample-picker">
        <span>{t("sceneSelector")}</span>
        <div className="pill-row">
          {payload.scenes.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === scene.id ? "pill is-active" : "pill"}
              type="button"
              onClick={() => setSceneId(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      </div>

      <div className="real-scene-grid">
        <div className="card real-scene-meta">
          <div className="card-header-inline">
            <div>
              <p className="small-label">{scene.modality}</p>
              <h3>{scene.name}</h3>
            </div>
            <a href={scene.source_url} target="_blank" rel="noreferrer">
              {t("datasetsSource")}
            </a>
          </div>

          <div className="meta-grid">
            <div>
              <span>{t("sensor")}</span>
              <strong>{scene.sensor}</strong>
            </div>
            <div>
              <span>{t("datasetsShape")}</span>
              <strong>{scene.cube_shape.join(" x ")}</strong>
            </div>
            <div>
              <span>{t("labeledPixels")}</span>
              <strong>{scene.labeled_pixels.toLocaleString()}</strong>
            </div>
            <div>
              <span>{t("rawFiles")}</span>
              <strong>{scene.local_raw_files.length}</strong>
            </div>
            {scene.label_coverage_ratio !== null && (
              <div>
                <span>{t("labelCoverage")}</span>
                <strong>{(scene.label_coverage_ratio * 100).toFixed(1)}%</strong>
              </div>
            )}
          </div>

          <p>{scene.notes}</p>

          {scene.rgb_preview_path && scene.label_preview_path && (
            <div className="preview-grid">
              <figure className="preview-card">
                <img src={scene.rgb_preview_path} alt={`${scene.name} RGB preview`} loading="lazy" />
                <figcaption>{t("rgbPreview")}</figcaption>
              </figure>
              <figure className="preview-card">
                <img src={scene.label_preview_path} alt={`${scene.name} label preview`} loading="lazy" />
                <figcaption>{t("labelPreview")}</figcaption>
              </figure>
            </div>
          )}

          <div className="raw-file-list">
            {scene.local_raw_files.map((file) => (
              <div key={file.name} className="raw-file-item">
                <span>{file.name}</span>
                <strong>{formatMB(file.size_bytes)}</strong>
              </div>
            ))}
          </div>
        </div>

        <div className="card real-scene-topics">
          <p className="small-label">{t("sceneTopics")}</p>
          <div className="topic-grid compact">
            {scene.topics.map((topic, index) => (
              <article key={topic.id} className="topic-card static">
                <div className="topic-card-header">
                  <span className="topic-dot" style={{ background: topicColors[index % topicColors.length] }} />
                  <h3>{topic.name}</h3>
                </div>
                <LineChart values={topic.band_profile} stroke={topicColors[index % topicColors.length]} />
                <div className="token-cloud">
                  {topic.top_words.map((word) => (
                    <span key={`${topic.id}-${word.token}`} className="token-pill">
                      {word.token}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="small-label">{t("classOverview")}</p>
        <div className="real-class-grid">
          {largestClasses.map((classSummary) => (
            <article key={`${scene.id}-${classSummary.label_id}`} className="real-class-card">
              <div className="card-header-inline">
                <div>
                  <h3>{classSummary.name}</h3>
                  <p className="muted-list">{classSummary.count.toLocaleString()} px</p>
                </div>
              </div>
              <p className="small-label">{t("meanSpectrum")}</p>
              <LineChart values={classSummary.mean_spectrum} stroke="var(--chart-spectrum)" />
              <p className="small-label">{t("meanTopicMixture")}</p>
              <MixtureBars values={classSummary.mean_topic_mixture} colors={topicColors} />
            </article>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="small-label">{t("exampleDocuments")}</p>
        <div className="real-example-grid">
          {scene.example_documents.map((document) => (
            <article key={`${scene.id}-${document.label_id}`} className="real-example-card">
              <h3>{document.class_name}</h3>
              <LineChart values={document.spectrum} stroke="var(--accent-warm)" />
              <BarStrip values={document.quantized_levels} color="var(--chart-quantized)" />
              <p className="small-label">{t("topicMixture")}</p>
              <MixtureBars values={document.topic_mixture} colors={topicColors} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
