import { Fragment, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  BarStrip,
  ClusterScatter,
  MixtureBars,
  SpectralProfileChart,
  type SpectralSeries
} from "./components/Charts";
import {
  api,
  pickText,
  type AppPayload,
  type FieldSceneSnapshot,
  type LibraryClusterDiagnostic,
  type RealClassSummary,
  type RealExampleDocument,
  type RealSceneSnapshot,
  type RepresentationVariant,
  type SceneClusterDiagnostic,
  type SpectralLibrarySample
} from "./lib/api";
import { useStore } from "./store/useStore";

type Language = "en" | "es";

const topicColors = [
  "var(--accent-blue)",
  "var(--accent-cyan)",
  "var(--accent-purple)",
  "var(--cluster-amber)",
  "var(--cluster-rose)",
  "var(--cluster-slate)"
];

const seriesColors = [
  "var(--accent-blue)",
  "var(--accent-cyan)",
  "var(--accent-purple)",
  "var(--cluster-amber)",
  "var(--cluster-rose)",
  "var(--cluster-slate)"
];

const implementedDatasetIds = new Set([
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "cuprite-upv-reflectance",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
  "micasense-rededge-samples",
  "usgs-splib07"
]);

const percent = (value: number) => `${Math.round(value * 100)}%`;

function formatScore(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function formatShape(shape: number[] | null): string {
  if (!shape || shape.length === 0) {
    return "external";
  }
  return shape.join(" x ");
}

function sceneLabelKind(scene: RealSceneSnapshot): "official" | "inferred" {
  return scene.notes.toLowerCase().includes("inferred") ? "inferred" : "official";
}

function topRegimes(scene: RealSceneSnapshot, limit = 6): RealClassSummary[] {
  return [...scene.class_summaries].sort((a, b) => b.count - a.count).slice(0, limit);
}

function getSelectedRegime(scene: RealSceneSnapshot, selectedRegimeId: number | null): RealClassSummary {
  return (
    scene.class_summaries.find((item) => item.label_id === selectedRegimeId) ??
    topRegimes(scene, 1)[0] ??
    scene.class_summaries[0]
  );
}

function getExampleForRegime(scene: RealSceneSnapshot, regime: RealClassSummary): RealExampleDocument | null {
  return (
    scene.example_documents.find((item) => item.label_id === regime.label_id) ??
    scene.example_documents[0] ??
    null
  );
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

function nearestLibraryMatches(values: number[], samples: SpectralLibrarySample[], limit = 5) {
  return samples
    .filter((sample) => sample.spectrum.length === values.length)
    .map((sample) => ({ sample, distance: spectralDistance(values, sample.spectrum) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function buildTokens(example: RealExampleDocument | null, scene: RealSceneSnapshot, representationId: string): string[] {
  if (!example) {
    return [];
  }
  return example.quantized_levels.slice(0, 36).map((level, index) => {
    const wavelength = scene.approximate_wavelengths_nm[index] ?? index + 1;
    const band = `${Math.round(wavelength)}nm`;
    if (representationId === "a") {
      return band;
    }
    if (representationId === "b") {
      return `q${String(level).padStart(2, "0")}`;
    }
    return `${band}_q${String(level).padStart(2, "0")}`;
  });
}

function WorkbenchHeader({
  data,
  language,
  onLanguageChange
}: {
  data: AppPayload;
  language: Language;
  onLanguageChange: (language: Language) => void;
}) {
  const { t } = useTranslation();
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return (
    <header className="app-header scientific-header">
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
        <span>{t("scientificHeaderSummary")}</span>
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
      </div>
    </header>
  );
}

function SourceNavigator({
  data,
  language,
  query,
  selectedScene,
  selectedField,
  selectedLibrarySample,
  onQueryChange,
  onSceneSelect,
  onFieldSelect,
  onLibrarySelect
}: {
  data: AppPayload;
  language: Language;
  query: string;
  selectedScene: RealSceneSnapshot;
  selectedField: FieldSceneSnapshot;
  selectedLibrarySample: SpectralLibrarySample;
  onQueryChange: (value: string) => void;
  onSceneSelect: (id: string) => void;
  onFieldSelect: (id: string) => void;
  onLibrarySelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const normalized = query.trim().toLowerCase();

  const scenes = data.real_scenes.scenes.filter((scene) =>
    [scene.name, scene.sensor, scene.modality, scene.notes].join(" ").toLowerCase().includes(normalized)
  );
  const fields = data.field_samples.scenes.filter((field) =>
    [field.name, field.sensor, field.notes].join(" ").toLowerCase().includes(normalized)
  );
  const library = data.spectral_library.samples.filter((sample) =>
    [sample.name, sample.group, sample.sensor, sample.absorption_tokens.join(" ")].join(" ").toLowerCase().includes(normalized)
  );
  const catalog = data.datasets.datasets.filter((dataset) =>
    [dataset.name, dataset.modality, dataset.source, dataset.domains.join(" "), pickText(dataset.local_status, language)]
      .join(" ")
      .toLowerCase()
      .includes(normalized)
  );

  return (
    <aside className="left-panel source-navigator">
      <div className="panel-block">
        <p className="panel-eyebrow">{t("evidenceSources")}</p>
        <h2>{t("sourceNavigatorTitle")}</h2>
        <input
          className="workbench-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("searchEvidence")}
        />
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("localHsiScenes")}</span>
          <strong>{scenes.length}</strong>
        </div>
        <div className="source-list">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              className={`source-button ${selectedScene.id === scene.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onSceneSelect(scene.id)}
            >
              <span>{scene.name}</span>
              <small>
                {scene.sensor} / {scene.cube_shape[2]} {t("bands")} / {sceneLabelKind(scene) === "official" ? t("officialLabels") : t("inferredStrata")}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("fieldSamples")}</span>
          <strong>{fields.length}</strong>
        </div>
        <div className="source-list compact">
          {fields.map((field) => (
            <button
              key={field.id}
              className={`source-button ${selectedField.id === field.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onFieldSelect(field.id)}
            >
              <span>{field.name}</span>
              <small>
                {field.patch_count.toLocaleString()} {t("patchesUnit")} / {field.band_names.join(", ")}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("materialReferences")}</span>
          <strong>{library.length}</strong>
        </div>
        <div className="source-list compact">
          {library.slice(0, 16).map((sample) => (
            <button
              key={sample.id}
              className={`source-button ${selectedLibrarySample.id === sample.id ? "is-active" : ""}`}
              type="button"
              onClick={() => onLibrarySelect(sample.id)}
            >
              <span>{sample.name}</span>
              <small>
                {sample.group} / {sample.sensor} / {sample.band_count} {t("bands")}
              </small>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-section-header">
          <span>{t("catalogStatus")}</span>
          <strong>{catalog.length}</strong>
        </div>
        <div className="catalog-list">
          {catalog.slice(0, 10).map((dataset) => (
            <a key={dataset.id} className="catalog-row" href={dataset.source_url} target="_blank" rel="noreferrer">
              <span>{dataset.name}</span>
              <small>{dataset.modality}</small>
              <em className={implementedDatasetIds.has(dataset.id) ? "is-local" : ""}>{pickText(dataset.local_status, language)}</em>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function StudyRail() {
  const { t } = useTranslation();
  const steps = [t("stageSource"), t("stageSpectra"), t("stageTopics"), t("stageValidation")];
  return (
    <div className="study-rail">
      {steps.map((step, index) => (
        <div key={step} className="study-stage">
          <strong>{index + 1}</strong>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function SceneOverview({
  scene,
  selectedRegime,
  onRegimeSelect
}: {
  scene: RealSceneSnapshot;
  selectedRegime: RealClassSummary;
  onRegimeSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const regimes = topRegimes(scene, 7);

  return (
    <section className="workbench-card scene-overview-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("activeScene")}</p>
          <h2>{scene.name}</h2>
          <p>{scene.sensor} / {scene.modality}</p>
        </div>
        <a className="small-link" href={scene.source_url} target="_blank" rel="noreferrer">
          {t("sourceShort")}
        </a>
      </div>

      <div className="scene-overview-grid">
        <div className="scene-preview-pair">
          {scene.rgb_preview_path ? <img src={scene.rgb_preview_path} alt={`${scene.name} RGB preview`} /> : null}
          {scene.label_preview_path ? <img src={scene.label_preview_path} alt={`${scene.name} label preview`} /> : null}
        </div>
        <div className="scene-facts">
          <dl className="metric-strip evidence-metrics">
            <div>
              <dt>{t("shape")}</dt>
              <dd>{formatShape(scene.cube_shape)}</dd>
            </div>
            <div>
              <dt>{t("labeledPixels")}</dt>
              <dd>{scene.labeled_pixels.toLocaleString()}</dd>
            </div>
            <div>
              <dt>{t("labelBasis")}</dt>
              <dd>{sceneLabelKind(scene) === "official" ? t("officialLabels") : t("inferredStrata")}</dd>
            </div>
          </dl>
          <p className="scientific-note">{scene.notes}</p>
          <div className="regime-list">
            {regimes.map((regime) => (
              <button
                key={regime.label_id}
                className={`regime-row ${selectedRegime.label_id === regime.label_id ? "is-active" : ""}`}
                type="button"
                onClick={() => onRegimeSelect(regime.label_id)}
              >
                <span>
                  <strong>{regime.name}</strong>
                  <small>{regime.count.toLocaleString()} {t("pixelsOrSamples")}</small>
                </span>
                <MixtureBars values={regime.mean_topic_mixture} colors={topicColors} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SpectralEvidence({
  scene,
  selectedRegime,
  librarySamples
}: {
  scene: RealSceneSnapshot;
  selectedRegime: RealClassSummary;
  librarySamples: SpectralLibrarySample[];
}) {
  const { t } = useTranslation();
  const regimes = topRegimes(scene, 6);
  const series: SpectralSeries[] = regimes.map((regime, index) => ({
    id: String(regime.label_id),
    label: regime.name,
    values: regime.mean_spectrum,
    color: regime.label_id === selectedRegime.label_id ? "var(--text)" : seriesColors[index % seriesColors.length]
  }));
  const matches = nearestLibraryMatches(selectedRegime.mean_spectrum, librarySamples, 5);

  return (
    <section className="workbench-card spectral-evidence-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("spectralEvidence")}</p>
          <h3>{t("meanRegimeSpectra")}</h3>
          <p>{t("meanRegimeSpectraHint")}</p>
        </div>
        <span className="status-pill">{scene.approximate_wavelengths_nm.length} {t("bands")}</span>
      </div>

      <SpectralProfileChart
        wavelengths={scene.approximate_wavelengths_nm}
        series={series}
        xLabel={t("bandCenterAxis")}
        yLabel={t("normalizedResponseAxis")}
      />
      <div className="chart-legend">
        {series.map((item) => (
          <span key={item.id}>
            <i style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="evidence-detail-grid">
        <div>
          <div className="card-title-row tight">
            <span>{t("selectedRegime")}</span>
            <small>{selectedRegime.name}</small>
          </div>
          <BarStrip values={selectedRegime.mean_topic_mixture.map((value) => Math.round(value * 100))} color="var(--accent-cyan)" />
        </div>
        <div className="nearest-reference-panel flush">
          <div className="card-title-row tight">
            <span>{t("nearestMaterialReferences")}</span>
            <small>{matches.length > 0 ? t("sameBandCount") : t("noBandMatch")}</small>
          </div>
          <div className="nearest-reference-list">
            {matches.map((match) => (
              <div key={match.sample.id} className="nearest-reference-row static-row">
                <span>
                  <strong>{match.sample.name}</strong>
                  <em>{match.sample.group} / {match.sample.sensor}</em>
                </span>
                <b>{match.distance.toFixed(3)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TopicEvidence({ scene }: { scene: RealSceneSnapshot }) {
  const { t } = useTranslation();
  const rows = topRegimes(scene, 7);

  if (rows.length === 0 || scene.topics.length === 0) {
    return null;
  }

  return (
    <section className="workbench-card topic-evidence-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("topicEvidence")}</p>
          <h3>{t("topicMixtureMatrix")}</h3>
          <p>{t("topicMixtureMatrixHint")}</p>
        </div>
        <span className="status-pill">{scene.topics.length} {t("topicsTitle")}</span>
      </div>

      <div className="topic-matrix scientific-matrix" style={{ gridTemplateColumns: `minmax(150px, 1.35fr) repeat(${scene.topics.length}, minmax(54px, 72px))` }}>
        <div className="topic-matrix-label topic-matrix-head">{t("classOrRegime")}</div>
        {scene.topics.map((topic) => (
          <div key={topic.id} className="topic-matrix-head" title={topic.name}>
            {topic.name.replace("Topic ", "T")}
          </div>
        ))}
        {rows.map((row) => (
          <Fragment key={row.label_id}>
            <div className="topic-matrix-label" title={row.name}>
              <strong>{row.name}</strong>
              <span>{row.count.toLocaleString()}</span>
            </div>
            {scene.topics.map((topic, index) => {
              const value = row.mean_topic_mixture[index] ?? 0;
              return (
                <div
                  key={`${row.label_id}-${topic.id}`}
                  className="topic-matrix-cell"
                  style={{ background: `rgba(59, 130, 246, ${0.08 + value * 0.82})` }}
                  title={`${row.name} / ${topic.name}: ${percent(value)}`}
                >
                  {percent(value)}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="topic-profile-grid">
        {scene.topics.slice(0, 6).map((topic, index) => (
          <div key={topic.id} className="topic-profile-card">
            <div>
              <strong>{topic.name}</strong>
              <span>{topic.top_words.slice(0, 5).map((word) => word.token).join(" / ")}</span>
            </div>
            <BarStrip values={topic.band_profile.map((value) => Math.round(value * 100))} color={seriesColors[index % seriesColors.length]} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ClusterDiagnostics({ diagnostic }: { diagnostic: SceneClusterDiagnostic | null }) {
  const { t } = useTranslation();

  if (!diagnostic) {
    return null;
  }

  const variance = diagnostic.explained_variance_ratio.reduce((total, value) => total + value, 0);

  return (
    <section className="workbench-card cluster-diagnostics-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("validationDiagnostics")}</p>
          <h3>{t("topicSpaceGeometry")}</h3>
          <p>{diagnostic.feature_space}</p>
        </div>
        <span className="status-pill">{diagnostic.item_count} {t("points")}</span>
      </div>
      <div className="cluster-layout">
        <div className="chart-card cluster-plot-card">
          <ClusterScatter points={diagnostic.points} />
        </div>
        <div className="cluster-side">
          <dl className="metric-strip cluster-metrics">
            <div>
              <dt>{t("clusters")}</dt>
              <dd>{diagnostic.cluster_count}</dd>
            </div>
            <div>
              <dt>{t("silhouette")}</dt>
              <dd>{formatScore(diagnostic.silhouette_score)}</dd>
            </div>
            <div>
              <dt>{t("pcaVariance")}</dt>
              <dd>{percent(variance)}</dd>
            </div>
          </dl>
          <div className="cluster-profile-list">
            {diagnostic.cluster_profiles.map((profile) => (
              <div key={profile.cluster_id} className="cluster-profile-row">
                <div className="cluster-profile-title">
                  <span className="cluster-chip">C{profile.cluster_id + 1}</span>
                  <strong>{t("dominantFeature", { index: profile.dominant_feature_index + 1 })}</strong>
                  <em>{profile.support_count.toLocaleString()}</em>
                </div>
                <MixtureBars values={profile.mean_vector} colors={topicColors} />
                <small>{profile.top_labels.join(" / ")}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LibraryEvidence({
  selectedSample,
  diagnostic,
  onSelect
}: {
  selectedSample: SpectralLibrarySample;
  diagnostic: LibraryClusterDiagnostic | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();

  const series: SpectralSeries[] = [
    {
      id: selectedSample.id,
      label: selectedSample.name,
      values: selectedSample.spectrum,
      color: "var(--accent-blue)"
    }
  ];

  const pairs =
    diagnostic?.nearest_pairs.filter((pair) => pair.a_label === selectedSample.name || pair.b_label === selectedSample.name) ??
    [];

  return (
    <section className="workbench-card library-evidence-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("referenceEvidence")}</p>
          <h3>{selectedSample.name}</h3>
          <p>{selectedSample.group} / {selectedSample.sensor}</p>
        </div>
        <a className="small-link" href={selectedSample.source_url} target="_blank" rel="noreferrer">
          {t("sourceShort")}
        </a>
      </div>
      <div className="library-evidence-grid">
        <div>
          <SpectralProfileChart
            wavelengths={selectedSample.wavelengths_nm}
            series={series}
            height={220}
            xLabel={t("bandCenterAxis")}
            yLabel={t("normalizedResponseAxis")}
          />
          <div className="token-cloud">
            {selectedSample.absorption_tokens.slice(0, 12).map((token) => (
              <span key={token} className="token-pill subtle">
                {token}
              </span>
            ))}
          </div>
        </div>
        {diagnostic ? (
          <div className="chart-card cluster-plot-card compact-plot">
            <ClusterScatter points={diagnostic.points} selectedPointId={selectedSample.id} />
            <dl className="metric-strip cluster-metrics">
              <div>
                <dt>{t("clusters")}</dt>
                <dd>{diagnostic.cluster_count}</dd>
              </div>
              <div>
                <dt>{t("silhouette")}</dt>
                <dd>{formatScore(diagnostic.silhouette_score)}</dd>
              </div>
              <div>
                <dt>{t("bands")}</dt>
                <dd>{diagnostic.band_count}</dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
      <div className="nearest-reference-list">
        {pairs.slice(0, 5).map((pair) => (
          <button
            key={`${pair.a_label}-${pair.b_label}`}
            className="nearest-reference-row"
            type="button"
            onClick={() => {
              const next = pair.a_label === selectedSample.name ? pair.b_label : pair.a_label;
              const target = diagnostic?.points.find((point) => point.label === next);
              if (target) {
                onSelect(target.id);
              }
            }}
          >
            <span>
              <strong>{pair.a_label} / {pair.b_label}</strong>
              <em>{t("nearestReferencePair")}</em>
            </span>
            <b>{pair.feature_distance.toFixed(3)}</b>
          </button>
        ))}
      </div>
    </section>
  );
}

function FieldEvidence({ field }: { field: FieldSceneSnapshot }) {
  const { t } = useTranslation();
  const series: SpectralSeries[] = field.strata_summaries.slice(0, 5).map((stratum, index) => ({
    id: String(stratum.label_id),
    label: stratum.name,
    values: stratum.mean_spectrum,
    color: seriesColors[index % seriesColors.length]
  }));

  return (
    <section className="workbench-card field-evidence-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("fieldTransferEvidence")}</p>
          <h3>{field.name}</h3>
          <p>{field.notes}</p>
        </div>
        <span className="status-pill">{field.patch_count.toLocaleString()} {t("patchesUnit")}</span>
      </div>
      <div className="field-evidence-grid">
        <div className="scene-preview-pair">
          <img src={field.rgb_preview_path} alt={`${field.name} RGB preview`} />
          <img src={field.ndvi_preview_path} alt={`${field.name} NDVI preview`} />
        </div>
        <SpectralProfileChart
          wavelengths={field.band_centers_nm}
          series={series}
          height={220}
          xLabel={t("bandCenterAxis")}
          yLabel={t("normalizedResponseAxis")}
        />
      </div>
    </section>
  );
}

function SyntheticCheck({ data, language }: { data: AppPayload; language: Language }) {
  const { t } = useTranslation();
  const metrics = [...data.demo.model_metrics].sort((a, b) => a.rmse - b.rmse);

  return (
    <section className="workbench-card synthetic-check-card">
      <div className="card-title-row">
        <div>
          <p className="panel-eyebrow">{t("methodSanityCheck")}</p>
          <h3>{pickText(data.demo.title, language)}</h3>
          <p>{pickText(data.demo.narrative, language)}</p>
        </div>
        <span className="status-pill">{data.demo.samples.length} {t("demoDocuments")}</span>
      </div>
      <div className="metric-row-list">
        {metrics.map((metric) => (
          <div key={metric.id} className="metric-row">
            <span>{pickText(metric.label, language)}</span>
            <strong>{metric.rmse.toFixed(2)} {t("rmse")}</strong>
            <small>{pickText(metric.note, language)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function InspectorPanel({
  data,
  scene,
  selectedRegime,
  example,
  representation,
  language,
  nearestMatches
}: {
  data: AppPayload;
  scene: RealSceneSnapshot;
  selectedRegime: RealClassSummary;
  example: RealExampleDocument | null;
  representation: RepresentationVariant;
  language: Language;
  nearestMatches: ReturnType<typeof nearestLibraryMatches>;
}) {
  const { t } = useTranslation();
  const selectedRepresentation = useStore((state) => state.selectedRepresentation);
  const setSelectedRepresentation = useStore((state) => state.setSelectedRepresentation);
  const tokens = buildTokens(example, scene, selectedRepresentation);

  return (
    <aside className="right-panel scientific-inspector">
      <section className="inspector-block">
        <p className="panel-eyebrow">{t("interpretationStatus")}</p>
        <h2>{t("whatCanBeClaimed")}</h2>
        <div className="claim-stack">
          <div>
            <strong>{t("observedEvidence")}</strong>
            <span>{t("observedEvidenceBody")}</span>
          </div>
          <div>
            <strong>{t("diagnosticOnly")}</strong>
            <span>{t("diagnosticOnlyBody")}</span>
          </div>
          <div>
            <strong>{t("notClaimed")}</strong>
            <span>{t("notClaimedBody")}</span>
          </div>
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("selectedRegime")}</p>
        <h3>{selectedRegime.name}</h3>
        <dl className="metric-strip inspector-metrics">
          <div>
            <dt>{t("support")}</dt>
            <dd>{selectedRegime.count.toLocaleString()}</dd>
          </div>
          <div>
            <dt>{t("labelBasis")}</dt>
            <dd>{sceneLabelKind(scene) === "official" ? t("officialLabels") : t("inferredStrata")}</dd>
          </div>
        </dl>
        <div className="nearest-reference-list compact">
          {nearestMatches.slice(0, 4).map((match) => (
            <div key={match.sample.id} className="nearest-reference-row static-row">
              <span>
                <strong>{match.sample.name}</strong>
                <em>{match.sample.group}</em>
              </span>
              <b>{match.distance.toFixed(3)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("representationLab")}</p>
        <h3>{t("selectRepresentation")}</h3>
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
        <p className="soft-note">{pickText(representation.document_definition, language)}</p>
        <div className="token-cloud">
          {tokens.map((token) => (
            <span key={token} className="token-pill">
              {token}
            </span>
          ))}
        </div>
      </section>

      <section className="inspector-block">
        <p className="panel-eyebrow">{t("implementedSurface")}</p>
        <ul className="scope-list">
          <li>{t("surfaceRealScenes", { count: data.real_scenes.scenes.length })}</li>
          <li>{t("surfaceFieldSamples", { count: data.field_samples.scenes.length })}</li>
          <li>{t("surfaceLibrary", { count: data.spectral_library.samples.length })}</li>
          <li>{t("surfaceDiagnostics", { count: data.analysis.scene_diagnostics.length })}</li>
        </ul>
      </section>
    </aside>
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
  const [selectedRegimeId, setSelectedRegimeId] = useState<number | null>(null);

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
    document.title = `${data.overview.title} - ${t("scientificHeaderSummary")}`;
  }, [data, t]);

  useEffect(() => {
    if (!data) return;
    const preferredScene = data.real_scenes.scenes.find((scene) => scene.id.includes("cuprite")) ?? data.real_scenes.scenes[0];
    const firstField = data.field_samples.scenes[0];
    const firstLibrarySample = data.spectral_library.samples.find((sample) => sample.band_count === preferredScene?.cube_shape[2]) ?? data.spectral_library.samples[0];
    if (preferredScene && !selectedSceneId) {
      setSelectedSceneId(preferredScene.id);
      setSelectedRegimeId(topRegimes(preferredScene, 1)[0]?.label_id ?? null);
    }
    if (firstField && !selectedFieldId) {
      setSelectedFieldId(firstField.id);
    }
    if (firstLibrarySample && !selectedLibrarySampleId) {
      setSelectedLibrarySampleId(firstLibrarySample.id);
    }
  }, [data, selectedFieldId, selectedLibrarySampleId, selectedSceneId]);

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

  const scene = data.real_scenes.scenes.find((item) => item.id === selectedSceneId) ?? data.real_scenes.scenes[0];
  const field = data.field_samples.scenes.find((item) => item.id === selectedFieldId) ?? data.field_samples.scenes[0];
  const librarySample =
    data.spectral_library.samples.find((item) => item.id === selectedLibrarySampleId) ?? data.spectral_library.samples[0];
  const selectedRegime = getSelectedRegime(scene, selectedRegimeId);
  const example = getExampleForRegime(scene, selectedRegime);
  const sceneDiagnostic = data.analysis.scene_diagnostics.find((item) => item.scene_id === scene.id) ?? null;
  const libraryDiagnostic = data.analysis.library_diagnostics.find((item) => item.band_count === librarySample.band_count) ?? null;
  const representation =
    data.methodology.representations.find((item) => item.id === selectedRepresentation) ?? data.methodology.representations[0];
  const nearestMatches = nearestLibraryMatches(selectedRegime.mean_spectrum, data.spectral_library.samples, 5);

  return (
    <div className="app-shell scientific-shell">
      <WorkbenchHeader data={data} language={language} onLanguageChange={(next) => void i18n.changeLanguage(next)} />
      <main className="workbench-shell scientific-workbench-shell">
        <SourceNavigator
          data={data}
          language={language}
          query={query}
          selectedScene={scene}
          selectedField={field}
          selectedLibrarySample={librarySample}
          onQueryChange={setQuery}
          onSceneSelect={(id) => {
            const nextScene = data.real_scenes.scenes.find((item) => item.id === id);
            setSelectedSceneId(id);
            setSelectedRegimeId(nextScene ? topRegimes(nextScene, 1)[0]?.label_id ?? null : null);
          }}
          onFieldSelect={setSelectedFieldId}
          onLibrarySelect={setSelectedLibrarySampleId}
        />

        <section className="center-workbench scientific-center">
          <StudyRail />
          <SceneOverview scene={scene} selectedRegime={selectedRegime} onRegimeSelect={setSelectedRegimeId} />
          <SpectralEvidence scene={scene} selectedRegime={selectedRegime} librarySamples={data.spectral_library.samples} />
          <TopicEvidence scene={scene} />
          <ClusterDiagnostics diagnostic={sceneDiagnostic} />
          <LibraryEvidence selectedSample={librarySample} diagnostic={libraryDiagnostic} onSelect={setSelectedLibrarySampleId} />
          <FieldEvidence field={field} />
          <SyntheticCheck data={data} language={language} />
        </section>

        <InspectorPanel
          data={data}
          scene={scene}
          selectedRegime={selectedRegime}
          example={example}
          representation={representation}
          language={language}
          nearestMatches={nearestMatches}
        />
      </main>
    </div>
  );
}
