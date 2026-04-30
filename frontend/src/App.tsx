import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { BarStrip, LineChart, MixtureBars } from "./components/Charts";
import {
  api,
  pickText,
  type AppPayload,
  type DatasetEntry,
  type DemoSample,
  type FieldSceneSnapshot,
  type RealSceneSnapshot,
  type RepresentationVariant,
  type SpectralLibrarySample,
  type TopicProfile
} from "./lib/api";
import { useStore } from "./store/useStore";

type Language = "en" | "es";

const percent = (value: number) => `${Math.round(value * 100)}%`;

function formatShape(shape: number[] | null): string {
  if (!shape || shape.length === 0) {
    return "external";
  }
  return shape.join(" x ");
}

function formatSize(value: number | null): string {
  if (value === null) {
    return "external";
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;
}

function domainLabel(dataset: DatasetEntry): string {
  return dataset.domains.slice(0, 3).join(" / ");
}

function getDatasetStatus(dataset: DatasetEntry, language: Language): string {
  return pickText(dataset.local_status, language);
}

function getTopic(topics: TopicProfile[], id: string | null | undefined): TopicProfile {
  return topics.find((topic) => topic.id === id) ?? topics[0];
}

function spectralDistance(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = a[index] - b[index];
    total += delta * delta;
  }
  return Math.sqrt(total / length);
}

function nearestLibraryMatches(sample: SpectralLibrarySample, samples: SpectralLibrarySample[]) {
  return samples
    .filter((candidate) => candidate.id !== sample.id && candidate.band_count === sample.band_count)
    .map((candidate) => ({
      sample: candidate,
      distance: spectralDistance(sample.spectrum, candidate.spectrum)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 4);
}

function WorkbenchHeader({
  data,
  language,
  onLanguageChange,
  onHelp
}: {
  data: AppPayload;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onHelp: () => void;
}) {
  const { t } = useTranslation();
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return (
    <header className="app-header">
      <div className="brand-cluster">
        <div className="brand-glyph" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="app-kicker">{t("workflowFocus")}</p>
          <h1>{data.overview.title}</h1>
        </div>
      </div>

      <div className="header-summary">
        <span>{pickText(data.overview.tagline, language)}</span>
      </div>

      <div className="header-actions" aria-label={t("headerActions")}>
        <div className="segmented-control" aria-label={t("language")}>
          <button className={language === "es" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("es")}>
            ES
          </button>
          <button className={language === "en" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("en")}>
            EN
          </button>
        </div>
        <button className="icon-text-button" type="button" onClick={toggleTheme}>
          {theme === "dark" ? t("themeLight") : t("themeDark")}
        </button>
        <a className="icon-text-button" href={data.overview.repo.url} target="_blank" rel="noreferrer">
          {t("sourceCode")}
        </a>
        <button className="icon-text-button" type="button" onClick={onHelp}>
          {t("help")}
        </button>
      </div>
    </header>
  );
}

function NavigatorPanel({
  data,
  language,
  selectedSample,
  selectedScene,
  selectedField,
  selectedLibrarySample,
  query,
  onQueryChange,
  onSampleSelect,
  onSceneSelect,
  onFieldSelect,
  onLibrarySampleSelect
}: {
  data: AppPayload;
  language: Language;
  selectedSample: DemoSample;
  selectedScene: RealSceneSnapshot;
  selectedField: FieldSceneSnapshot;
  selectedLibrarySample: SpectralLibrarySample;
  query: string;
  onQueryChange: (value: string) => void;
  onSampleSelect: (id: string) => void;
  onSceneSelect: (id: string) => void;
  onFieldSelect: (id: string) => void;
  onLibrarySampleSelect: (id: string) => void;
}) {
  const { t } = useTranslation();

  const filteredDatasets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return data.datasets.datasets;
    }
    return data.datasets.datasets.filter((dataset) => {
      const text = [
        dataset.name,
        dataset.modality,
        dataset.source,
        dataset.fit_for_demo,
        dataset.domains.join(" "),
        pickText(dataset.local_status, language)
      ]
        .join(" ")
        .toLowerCase();
      return text.includes(normalized);
    });
  }, [data.datasets.datasets, language, query]);

  const filteredLibrarySamples = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return data.spectral_library.samples;
    }
    return data.spectral_library.samples.filter((sample) =>
      [sample.name, sample.group, sample.sensor, sample.source_file, sample.absorption_tokens.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    );
  }, [data.spectral_library.samples, query]);

  return (
    <aside className="left-panel">
      <div className="panel-block">
        <p className="panel-eyebrow">{t("navigatorTitle")}</p>
        <h2>{t("navigatorSubtitle")}</h2>
        <input
          className="workbench-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("searchData")}
        />
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("demoDocuments")}</span>
          <strong>{data.demo.samples.length}</strong>
        </div>
        <div className="nav-list">
          {data.demo.samples.slice(0, 10).map((sample) => (
            <button
              key={sample.id}
              className={`nav-item ${selectedSample.id === sample.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onSampleSelect(sample.id)}
            >
              <span>{pickText(sample.label, language)}</span>
              <small>{pickText(sample.source_group, language)}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("realScenes")}</span>
          <strong>{data.real_scenes.scenes.length}</strong>
        </div>
        <div className="nav-list compact">
          {data.real_scenes.scenes.map((scene) => (
            <button
              key={scene.id}
              className={`nav-item ${selectedScene.id === scene.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onSceneSelect(scene.id)}
            >
              <span>{scene.name}</span>
              <small>
                {scene.cube_shape[2]} {t("bands")} / {scene.modality}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("fieldSamples")}</span>
          <strong>{data.field_samples.scenes.length}</strong>
        </div>
        <div className="nav-list compact">
          {data.field_samples.scenes.map((scene) => (
            <button
              key={scene.id}
              className={`nav-item ${selectedField.id === scene.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onFieldSelect(scene.id)}
            >
              <span>{scene.name}</span>
              <small>
                {scene.patch_count} {t("patchesUnit")} / {scene.sensor}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("spectralLibrary")}</span>
          <strong>{filteredLibrarySamples.length}</strong>
        </div>
        <div className="nav-list compact">
          {filteredLibrarySamples.slice(0, 14).map((sample) => (
            <button
              key={sample.id}
              className={`nav-item ${selectedLibrarySample.id === sample.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onLibrarySampleSelect(sample.id)}
            >
              <span>{sample.name}</span>
              <small>
                {sample.group} / {sample.sensor}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section catalog-section">
        <div className="nav-section-header">
          <span>{t("datasetCatalog")}</span>
          <strong>{filteredDatasets.length}</strong>
        </div>
        <div className="catalog-list">
          {filteredDatasets.slice(0, 8).map((dataset) => (
            <a key={dataset.id} className="catalog-row" href={dataset.source_url} target="_blank" rel="noreferrer">
              <span>{dataset.name}</span>
              <small>{domainLabel(dataset)}</small>
              <em>{getDatasetStatus(dataset, language)}</em>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SampleWorkbench({
  sample,
  topics,
  language
}: {
  sample: DemoSample;
  topics: TopicProfile[];
  language: Language;
}) {
  const { t } = useTranslation();
  const setSelectedTopicId = useStore((state) => state.setSelectedTopicId);
  const selectedTopicId = useStore((state) => state.selectedTopicId);
  const topic = getTopic(topics, selectedTopicId ?? sample.dominant_topic_id);

  return (
    <section className="workbench-card primary-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("activeDocument")}</p>
          <h2>{pickText(sample.label, language)}</h2>
          <p>{pickText(sample.source_group, language)}</p>
        </div>
        <div className="status-pill">
          <span className="status-dot ok" />
          {t("localDemo")}
        </div>
      </div>

      <div className="chart-stack">
        <div className="chart-card">
          <div className="card-title-row tight">
            <span>{t("spectrumTitle")}</span>
            <small>{sample.spectrum.length} {t("bands")}</small>
          </div>
          <LineChart values={sample.spectrum} stroke="var(--accent-blue)" />
        </div>
        <div className="chart-card">
          <div className="card-title-row tight">
            <span>{t("quantizedTitle")}</span>
            <small>{t("levelsCount", { count: Math.max(...sample.quantized_levels) + 1 })}</small>
          </div>
          <BarStrip values={sample.quantized_levels} color="var(--accent-cyan)" />
        </div>
      </div>

      <div className="topic-mixture-zone">
        <div>
          <div className="card-title-row tight">
            <span>{t("inferredMixture")}</span>
            <small>{t("dominantTopic")}: {pickText(topic.name, language)}</small>
          </div>
          <MixtureBars values={sample.inferred_topic_mixture} colors={topics.map((item) => item.color)} />
        </div>
        <div className="topic-grid-mini">
          {topics.map((item, index) => (
            <button
              key={item.id}
              className={`topic-button ${topic.id === item.id ? "is-active" : ""}`}
              type="button"
              onClick={() => setSelectedTopicId(item.id)}
            >
              <span className="topic-dot" style={{ background: item.color }} />
              <span>{pickText(item.name, language)}</span>
              <strong>{percent(sample.inferred_topic_mixture[index] ?? 0)}</strong>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function SceneTopicMatrix({ scene }: { scene: RealSceneSnapshot }) {
  const { t } = useTranslation();
  const rows = scene.class_summaries.slice(0, 6);

  if (rows.length === 0 || scene.topics.length === 0) {
    return null;
  }

  return (
    <article className="workbench-card scene-topic-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("sceneTopicMatrix")}</p>
          <h3>{scene.name}</h3>
        </div>
        <span className="status-pill">{t("largestRegimes")}</span>
      </div>
      <div className="topic-matrix" style={{ gridTemplateColumns: `minmax(112px, 1fr) repeat(${scene.topics.length}, minmax(46px, 64px))` }}>
        <div className="topic-matrix-label topic-matrix-head">{t("classOrRegime")}</div>
        {scene.topics.map((topic) => (
          <div key={topic.id} className="topic-matrix-head" title={topic.name}>
            {topic.name.replace("Topic ", "T")}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.label_id}>
            <div key={`${row.label_id}-label`} className="topic-matrix-label" title={row.name}>
              <strong>{row.name}</strong>
              <span>{row.count.toLocaleString()}</span>
            </div>
            {scene.topics.map((topic, index) => {
              const value = row.mean_topic_mixture[index] ?? 0;
              return (
                <div
                  key={`${row.label_id}-${topic.id}`}
                  className="topic-matrix-cell"
                  style={{ background: `rgba(59, 130, 246, ${0.12 + value * 0.78})` }}
                  title={`${row.name} / ${topic.name}: ${percent(value)}`}
                >
                  {percent(value)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="scene-topic-words">
        {scene.topics.slice(0, 4).map((topic) => (
          <div key={topic.id}>
            <strong>{topic.name}</strong>
            <span>{topic.top_words.slice(0, 4).map((word) => word.token).join(" / ")}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SceneWorkbench({
  scene,
  field,
  language
}: {
  scene: RealSceneSnapshot;
  field: FieldSceneSnapshot;
  language: Language;
}) {
  const { t } = useTranslation();

  return (
    <section className="scene-grid">
      <article className="workbench-card">
        <div className="card-title-row">
          <div>
            <p className="panel-eyebrow">{t("realScenes")}</p>
            <h3>{scene.name}</h3>
            <p>{scene.sensor}</p>
          </div>
          <a className="small-link" href={scene.source_url} target="_blank" rel="noreferrer">
            {t("sourceShort")}
          </a>
        </div>
        <div className="preview-grid">
          {scene.rgb_preview_path ? <img src={scene.rgb_preview_path} alt={`${scene.name} RGB preview`} /> : null}
          {scene.label_preview_path ? <img src={scene.label_preview_path} alt={`${scene.name} label preview`} /> : null}
        </div>
        <dl className="metric-strip">
          <div>
            <dt>{t("shape")}</dt>
            <dd>{formatShape(scene.cube_shape)}</dd>
          </div>
          <div>
            <dt>{t("labeledPixels")}</dt>
            <dd>{scene.labeled_pixels.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("topicsTitle")}</dt>
            <dd>{scene.topics.length}</dd>
          </div>
        </dl>
      </article>

      <article className="workbench-card">
        <div className="card-title-row">
          <div>
            <p className="panel-eyebrow">{t("fieldSamples")}</p>
            <h3>{field.name}</h3>
            <p>{field.sensor}</p>
          </div>
          <a className="small-link" href={field.source_url} target="_blank" rel="noreferrer">
            {t("sourceShort")}
          </a>
        </div>
        <div className="preview-grid">
          <img src={field.rgb_preview_path} alt={`${field.name} RGB preview`} />
          <img src={field.ndvi_preview_path} alt={`${field.name} NDVI preview`} />
        </div>
        <dl className="metric-strip">
          <div>
            <dt>{t("patchCount")}</dt>
            <dd>{field.patch_count.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("patchSize")}</dt>
            <dd>{field.patch_size}px</dd>
          </div>
          <div>
            <dt>{t("bands")}</dt>
            <dd>{field.band_names.length}</dd>
          </div>
        </dl>
      </article>

      <SceneTopicMatrix scene={scene} />
    </section>
  );
}

function SpectralLibraryWorkbench({
  sample,
  samples,
  onSelect
}: {
  sample: SpectralLibrarySample;
  samples: SpectralLibrarySample[];
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const matches = nearestLibraryMatches(sample, samples);

  return (
    <section className="workbench-card spectral-library-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("spectralLibrary")}</p>
          <h3>{sample.name}</h3>
          <p>{sample.group} / {sample.sensor}</p>
        </div>
        <a className="small-link" href={sample.source_url} target="_blank" rel="noreferrer">
          {t("sourceShort")}
        </a>
      </div>

      <div className="chart-stack dense">
        <div className="chart-card">
          <div className="card-title-row tight">
            <span>{t("referenceSpectrum")}</span>
            <small>{sample.band_count} {t("bands")}</small>
          </div>
          <LineChart values={sample.spectrum} stroke="var(--accent-blue)" />
        </div>
        <div className="chart-card">
          <div className="card-title-row tight">
            <span>{t("spectralWords")}</span>
            <small>{sample.absorption_tokens.length} {t("absorptionTokens")}</small>
          </div>
          <div className="token-cloud compact-cloud">
            {sample.absorption_tokens.map((token) => (
              <span key={token} className="token-pill subtle">
                {token}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="token-cloud library-token-cloud">
        {sample.token_preview.slice(0, 18).map((token) => (
          <span key={token} className="token-pill">
            {token}
          </span>
        ))}
      </div>

      <div className="nearest-reference-panel">
        <div className="card-title-row tight">
          <span>{t("nearestReferences")}</span>
          <small>{sample.band_count} {t("bands")}</small>
        </div>
        <div className="nearest-reference-list">
          {matches.map((match) => (
            <button
              key={match.sample.id}
              type="button"
              className="nearest-reference-row"
              onClick={() => onSelect(match.sample.id)}
            >
              <span>
                <strong>{match.sample.name}</strong>
                <em>{match.sample.group}</em>
              </span>
              <b>{match.distance.toFixed(3)}</b>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function DatasetStatusPanel({
  datasets,
  language
}: {
  datasets: DatasetEntry[];
  language: Language;
}) {
  const { t } = useTranslation();
  const priority = datasets.filter((dataset) =>
    ["cuprite-upv-reflectance", "salinas-corrected", "cross-scene-wetland-hsi", "bigearthnet-v2", "hyspecnet-11k"].includes(dataset.id)
  );

  return (
    <section className="workbench-card dataset-status-panel">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("datasetExpansion")}</p>
          <h3>{t("availableData")}</h3>
        </div>
        <span className="status-pill">{datasets.length} {t("datasetEntries")}</span>
      </div>
      <div className="dataset-table">
        {priority.map((dataset) => (
          <div key={dataset.id} className="dataset-row">
            <div>
              <strong>{dataset.name}</strong>
              <span>{dataset.modality}</span>
            </div>
            <div>{formatSize(dataset.file_size_mb)}</div>
            <em>{getDatasetStatus(dataset, language)}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function InspectorPanel({
  data,
  sample,
  selectedTopic,
  representation,
  language
}: {
  data: AppPayload;
  sample: DemoSample;
  selectedTopic: TopicProfile;
  representation: RepresentationVariant;
  language: Language;
}) {
  const { t } = useTranslation();
  const selectedRepresentation = useStore((state) => state.selectedRepresentation);
  const setSelectedRepresentation = useStore((state) => state.setSelectedRepresentation);
  const tokens = sample.tokens_by_representation[selectedRepresentation] ?? sample.tokens_by_representation[representation.id];
  const baseline = sample.predictions.baseline ?? sample.target_value;
  const predictions = Object.entries(sample.predictions);
  const bestMetric = [...data.demo.model_metrics].sort((a, b) => a.rmse - b.rmse)[0];

  return (
    <aside className="right-panel">
      <section className="inspector-block">
        <p className="panel-eyebrow">{t("methodInspector")}</p>
        <h2>{t("selectRepresentation")}</h2>
        <div className="representation-stack">
          {data.methodology.representations.map((item) => (
            <button
              key={item.id}
              className={`representation-button ${selectedRepresentation === item.id ? "is-active" : ""}`}
              type="button"
              onClick={() => setSelectedRepresentation(item.id)}
            >
              <strong>{pickText(item.name, language)}</strong>
              <span>{pickText(item.summary, language)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("documentDefinition")}</p>
        <p>{pickText(representation.document_definition, language)}</p>
        <p className="soft-note">{pickText(representation.word_definition, language)}</p>
      </section>

      <section className="inspector-block">
        <div className="card-title-row tight">
          <span>{t("tokensTitle")}</span>
          <small>{tokens.preview.length} / {tokens.total_tokens}</small>
        </div>
        <div className="token-cloud">
          {tokens.preview.slice(0, 16).map((token) => (
            <span key={token} className="token-pill">
              {token}
            </span>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("selectedTopicProfile")}</p>
        <div className="topic-profile-title">
          <span className="topic-dot large" style={{ background: selectedTopic.color }} />
          <h3>{pickText(selectedTopic.name, language)}</h3>
        </div>
        <p>{pickText(selectedTopic.summary, language)}</p>
        <LineChart values={selectedTopic.band_profile} stroke={selectedTopic.color} />
        <div className="token-cloud">
          {selectedTopic.top_words.slice(0, 8).map((word) => (
            <span key={word.token} className="token-pill subtle">
              {word.token} {word.weight.toFixed(2)}
            </span>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("modelReadout")}</p>
        <div className="model-metric">
          <span>{pickText(bestMetric.label, language)}</span>
          <strong>{bestMetric.rmse.toFixed(2)} {t("rmse")}</strong>
        </div>
        <div className="prediction-list">
          {predictions.map(([key, value]) => (
            <div key={key}>
              <span>{key}</span>
              <strong>{value.toFixed(1)}</strong>
            </div>
          ))}
          <div>
            <span>{t("baselineDelta")}</span>
            <strong>{(sample.target_value - baseline).toFixed(1)}</strong>
          </div>
        </div>
      </section>
    </aside>
  );
}

function HelpModal({ data, onClose }: { data: AppPayload; onClose: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <div className="card-title-row">
          <div>
            <p className="panel-eyebrow">{t("helpStatus")}</p>
            <h2 id="help-title">{t("helpTitle")}</h2>
          </div>
          <button className="icon-text-button" type="button" onClick={onClose}>
            {t("close")}
          </button>
        </div>
        <div className="help-grid">
          <div>
            <h3>{t("implementedNow")}</h3>
            <ul>
              <li>{t("helpWorkbench")}</li>
              <li>{t("helpSpectralLibrary")}</li>
              <li>{t("helpSceneMatrix")}</li>
              <li>{t("helpNoDeploy")}</li>
            </ul>
          </div>
          <div>
            <h3>{t("dataState")}</h3>
            <dl className="metric-strip help-metrics">
              <div>
                <dt>{t("datasetEntries")}</dt>
                <dd>{data.datasets.datasets.length}</dd>
              </div>
              <div>
                <dt>{t("realScenes")}</dt>
                <dd>{data.real_scenes.scenes.length}</dd>
              </div>
              <div>
                <dt>{t("spectralLibrary")}</dt>
                <dd>{data.spectral_library.samples.length}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </div>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AppPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [selectedLibrarySampleId, setSelectedLibrarySampleId] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const selectedSampleId = useStore((state) => state.selectedSampleId);
  const setSelectedSampleId = useStore((state) => state.setSelectedSampleId);
  const selectedTopicId = useStore((state) => state.selectedTopicId);
  const setSelectedTopicId = useStore((state) => state.setSelectedTopicId);
  const selectedRepresentation = useStore((state) => state.selectedRepresentation);

  useEffect(() => {
    let active = true;
    api
      .getAppData()
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, []);

  const language: Language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "es";

  useEffect(() => {
    if (!data) return;
    document.title = `${data.overview.title} - ${pickText(data.overview.tagline, language)}`;
  }, [data, language]);

  useEffect(() => {
    if (!data) return;
    const firstSample = data.demo.samples[0];
    const firstTopic = data.demo.topics[0];
    const firstScene = data.real_scenes.scenes[0];
    const firstField = data.field_samples.scenes[0];
    const firstLibrarySample = data.spectral_library.samples[0];

    if (firstSample && !selectedSampleId) {
      setSelectedSampleId(firstSample.id);
    }
    if (firstTopic && !selectedTopicId) {
      setSelectedTopicId(firstTopic.id);
    }
    if (firstScene && !selectedSceneId) {
      setSelectedSceneId(firstScene.id);
    }
    if (firstField && !selectedFieldId) {
      setSelectedFieldId(firstField.id);
    }
    if (firstLibrarySample && !selectedLibrarySampleId) {
      setSelectedLibrarySampleId(firstLibrarySample.id);
    }
  }, [
    data,
    selectedFieldId,
    selectedLibrarySampleId,
    selectedSampleId,
    selectedSceneId,
    selectedTopicId,
    setSelectedSampleId,
    setSelectedTopicId
  ]);

  if (error) {
    return (
      <main className="status-shell">
        <div className="status-card">
          <h1>{t("errorTitle")}</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="status-shell">
        <div className="status-card">
          <h1>{t("loading")}</h1>
          <p>{t("loadingHint")}</p>
        </div>
      </main>
    );
  }

  const sample = data.demo.samples.find((item) => item.id === selectedSampleId) ?? data.demo.samples[0];
  const scene = data.real_scenes.scenes.find((item) => item.id === selectedSceneId) ?? data.real_scenes.scenes[0];
  const field = data.field_samples.scenes.find((item) => item.id === selectedFieldId) ?? data.field_samples.scenes[0];
  const librarySample =
    data.spectral_library.samples.find((item) => item.id === selectedLibrarySampleId) ?? data.spectral_library.samples[0];
  const selectedTopic = getTopic(data.demo.topics, selectedTopicId ?? sample.dominant_topic_id);
  const representation =
    data.methodology.representations.find((item) => item.id === selectedRepresentation) ?? data.methodology.representations[0];

  return (
    <div className="app-shell">
      <WorkbenchHeader data={data} language={language} onLanguageChange={(next) => void i18n.changeLanguage(next)} onHelp={() => setIsHelpOpen(true)} />

      <main className="workbench-shell">
        <NavigatorPanel
          data={data}
          language={language}
          selectedSample={sample}
          selectedScene={scene}
          selectedField={field}
          selectedLibrarySample={librarySample}
          query={query}
          onQueryChange={setQuery}
          onSampleSelect={(id) => {
            setSelectedSampleId(id);
            const nextSample = data.demo.samples.find((item) => item.id === id);
            if (nextSample) {
              setSelectedTopicId(nextSample.dominant_topic_id);
            }
          }}
          onSceneSelect={setSelectedSceneId}
          onFieldSelect={setSelectedFieldId}
          onLibrarySampleSelect={setSelectedLibrarySampleId}
        />

        <section className="center-workbench">
          <div className="workbench-intro">
            <div>
              <p className="panel-eyebrow">{t("workbenchMode")}</p>
              <h2>{t("workbenchTitle")}</h2>
            </div>
            <p>{pickText(data.overview.hypothesis, language)}</p>
          </div>

          <SampleWorkbench sample={sample} topics={data.demo.topics} language={language} />
          <SceneWorkbench scene={scene} field={field} language={language} />
          <SpectralLibraryWorkbench sample={librarySample} samples={data.spectral_library.samples} onSelect={setSelectedLibrarySampleId} />
          <DatasetStatusPanel datasets={data.datasets.datasets} language={language} />
        </section>

        <InspectorPanel data={data} sample={sample} selectedTopic={selectedTopic} representation={representation} language={language} />
      </main>
      {isHelpOpen ? <HelpModal data={data} onClose={() => setIsHelpOpen(false)} /> : null}
    </div>
  );
}
