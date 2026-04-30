import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { DemoPayload, Methodology, TopicProfile } from "../lib/api";
import { pickText } from "../lib/api";
import { useStore } from "../store/useStore";
import { BarStrip, LineChart, MixtureBars } from "./Charts";

interface SpectrumWorkbenchProps {
  demo: DemoPayload;
  methodology: Methodology;
  language: string;
}

export function SpectrumWorkbench({ demo, methodology, language }: SpectrumWorkbenchProps) {
  const { t } = useTranslation();
  const selectedRepresentation = useStore((state) => state.selectedRepresentation);
  const setSelectedRepresentation = useStore((state) => state.setSelectedRepresentation);
  const selectedSampleId = useStore((state) => state.selectedSampleId);
  const setSelectedSampleId = useStore((state) => state.setSelectedSampleId);
  const selectedTopicId = useStore((state) => state.selectedTopicId);
  const setSelectedTopicId = useStore((state) => state.setSelectedTopicId);

  useEffect(() => {
    if (!selectedSampleId && demo.samples.length > 0) {
      setSelectedSampleId(demo.samples[0].id);
    }
    if (!selectedTopicId && demo.topics.length > 0) {
      setSelectedTopicId(demo.topics[0].id);
    }
  }, [demo.samples, demo.topics, selectedSampleId, selectedTopicId, setSelectedSampleId, setSelectedTopicId]);

  const sample = demo.samples.find((entry) => entry.id === selectedSampleId) ?? demo.samples[0];
  const representation =
    methodology.representations.find((entry) => entry.id === selectedRepresentation) ??
    methodology.representations[0];
  const topicColors = demo.topics.map((topic) => topic.color);
  const activeTopic =
    demo.topics.find((topic) => topic.id === selectedTopicId) ??
    demo.topics.find((topic) => topic.id === sample.dominant_topic_id) ??
    demo.topics[0];

  const topicById = new Map<string, TopicProfile>(demo.topics.map((topic) => [topic.id, topic]));
  const dominantTopic = topicById.get(sample.dominant_topic_id) ?? activeTopic;

  return (
    <section id="representations" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">04</p>
          <h2>{t("representationsTitle")}</h2>
        </div>
        <div className="section-note">
          <strong>{pickText(demo.title, language)}</strong>
          <p>{pickText(demo.narrative, language)}</p>
        </div>
      </div>

      <div className="sample-picker">
        <span>{t("selectSample")}</span>
        <div className="pill-row">
          {demo.samples.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === sample.id ? "pill is-active" : "pill"}
              type="button"
              onClick={() => setSelectedSampleId(entry.id)}
            >
              {pickText(entry.label, language)}
            </button>
          ))}
        </div>
      </div>

      <div className="representation-grid">
        <div className="card workbench-card">
          <p className="small-label">{t("selectRepresentation")}</p>
          <div className="representation-list">
            {methodology.representations.map((entry) => (
              <button
                key={entry.id}
                className={entry.id === representation.id ? "representation-choice is-active" : "representation-choice"}
                type="button"
                onClick={() => setSelectedRepresentation(entry.id)}
              >
                <strong>{pickText(entry.name, language)}</strong>
                <span>{pickText(entry.summary, language)}</span>
              </button>
            ))}
          </div>

          <div className="definition-grid">
            <div>
              <p className="small-label">{t("documentDefinition")}</p>
              <p>{pickText(representation.document_definition, language)}</p>
            </div>
            <div>
              <p className="small-label">{t("wordDefinition")}</p>
              <p>{pickText(representation.word_definition, language)}</p>
            </div>
            <div>
              <p className="small-label">{t("strength")}</p>
              <p>{pickText(representation.strength, language)}</p>
            </div>
            <div>
              <p className="small-label">{t("caution")}</p>
              <p>{pickText(representation.caution, language)}</p>
            </div>
          </div>
        </div>

        <div className="card spectrum-card">
          <div className="card-header-inline">
            <div>
              <p className="small-label">{t("spectrumTitle")}</p>
              <h3>{pickText(sample.label, language)}</h3>
            </div>
            <p className="sample-group">{pickText(sample.source_group, language)}</p>
          </div>
          <LineChart values={sample.spectrum} stroke="var(--chart-spectrum)" />
          <div className="axis-caption">
            <span>{Math.round(demo.wavelengths_nm[0])} nm</span>
            <span>{Math.round(demo.wavelengths_nm[demo.wavelengths_nm.length - 1])} nm</span>
          </div>

          <p className="small-label">{t("quantizedTitle")}</p>
          <BarStrip values={sample.quantized_levels} color="var(--chart-quantized)" />
          <div className="axis-caption">
            <span>0</span>
            <span>{demo.quantization_levels - 1}</span>
          </div>

          <div className="mixture-panel">
            <div>
              <p className="small-label">{t("dominantTopic")}</p>
              <div className="dominant-topic-chip" style={{ borderColor: dominantTopic.color }}>
                <span className="topic-dot" style={{ background: dominantTopic.color }} />
                {pickText(dominantTopic.name, language)}
              </div>
            </div>
            <div>
              <p className="small-label">{t("inferredMixture")}</p>
              <MixtureBars values={sample.inferred_topic_mixture} colors={topicColors} />
            </div>
            <div>
              <p className="small-label">{t("latentMixture")}</p>
              <MixtureBars values={sample.latent_mixture} colors={topicColors} />
            </div>
          </div>
        </div>

        <div className="card token-card">
          <div className="card-header-inline">
            <div>
              <p className="small-label">{t("tokensTitle")}</p>
              <h3>{pickText(representation.name, language)}</h3>
            </div>
          </div>
          <p className="small-copy">
            {t("tokensShown", {
              shown: sample.tokens_by_representation[representation.id].preview.length,
              total: sample.tokens_by_representation[representation.id].total_tokens
            })}
          </p>
          <div className="token-cloud">
            {sample.tokens_by_representation[representation.id].preview.map((token, index) => (
              <span key={`${token}-${index}`} className="token-pill">
                {token}
              </span>
            ))}
          </div>
          <div className="example-block">
            <p className="small-label">{t("exampleTokens")}</p>
            <div className="token-cloud">
              {representation.token_example.map((token) => (
                <span key={token} className="token-pill subtle">
                  {token}
                </span>
              ))}
            </div>
          </div>
          <div className="example-block">
            <p className="small-label">{t("selectedTopicProfile")}</p>
            <LineChart values={activeTopic.band_profile} stroke={activeTopic.color} />
          </div>
        </div>
      </div>
    </section>
  );
}
