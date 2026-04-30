import { useTranslation } from "react-i18next";

import type { DemoPayload } from "../lib/api";
import { pickText } from "../lib/api";
import { useStore } from "../store/useStore";
import { LineChart, MixtureBars } from "./Charts";

interface TopicExplorerProps {
  demo: DemoPayload;
  language: string;
}

export function TopicExplorer({ demo, language }: TopicExplorerProps) {
  const { t } = useTranslation();
  const selectedSampleId = useStore((state) => state.selectedSampleId);
  const selectedTopicId = useStore((state) => state.selectedTopicId);
  const setSelectedTopicId = useStore((state) => state.setSelectedTopicId);

  const sample = demo.samples.find((entry) => entry.id === selectedSampleId) ?? demo.samples[0];
  const activeTopic =
    demo.topics.find((topic) => topic.id === selectedTopicId) ??
    demo.topics.find((topic) => topic.id === sample.dominant_topic_id) ??
    demo.topics[0];
  const topicColors = demo.topics.map((topic) => topic.color);

  return (
    <section id="topics" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">05</p>
          <h2>{t("topicsTitle")}</h2>
        </div>
      </div>

      <div className="topic-layout">
        <div className="topic-grid">
          {demo.topics.map((topic) => (
            <button
              key={topic.id}
              className={topic.id === activeTopic.id ? "card topic-card is-active" : "card topic-card"}
              type="button"
              onClick={() => setSelectedTopicId(topic.id)}
            >
              <div className="topic-card-header">
                <span className="topic-dot" style={{ background: topic.color }} />
                <h3>{pickText(topic.name, language)}</h3>
              </div>
              <p>{pickText(topic.summary, language)}</p>
              <LineChart values={topic.band_profile} stroke={topic.color} />
            </button>
          ))}
        </div>

        <div className="card topic-detail-card">
          <div className="card-header-inline">
            <div>
              <p className="small-label">{t("dominantTopic")}</p>
              <h3>{pickText(activeTopic.name, language)}</h3>
            </div>
            <span className="topic-dot large" style={{ background: activeTopic.color }} />
          </div>
          <p>{pickText(activeTopic.summary, language)}</p>
          <LineChart values={activeTopic.band_profile} stroke={activeTopic.color} />

          <p className="small-label">{t("topicWords")}</p>
          <div className="token-cloud">
            {activeTopic.top_words.map((word) => (
              <span key={word.token} className="token-pill">
                {word.token} - {word.weight.toFixed(3)}
              </span>
            ))}
          </div>

          <div className="mixture-summary">
            <div>
              <p className="small-label">{pickText(sample.label, language)}</p>
              <p>{pickText(sample.source_group, language)}</p>
            </div>
            <div>
              <p className="small-label">{t("inferredMixture")}</p>
              <MixtureBars values={sample.inferred_topic_mixture} colors={topicColors} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
