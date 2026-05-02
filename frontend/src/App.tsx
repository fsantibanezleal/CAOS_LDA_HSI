import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  ComparisonBars,
  InteractiveHeatmap,
  InteractiveLinePlot,
  InteractiveScatter,
  RankedBars,
  type HeatmapColumn,
  type HeatmapRow,
  type PlotSeries,
  type RankedBarDatum,
  type ScatterPoint
} from "./components/ScientificPlots";
import {
  api,
  pickText,
  type AppPayload,
  type CorpusPreview,
  type CorpusRecipe,
  type DataFamily,
  type HidsagBandQualityPayload,
  type HidsagCuratedSubsetPayload,
  type HidsagPreprocessingSensitivityPayload,
  type HidsagRegionDocumentsPayload,
  type HidsagSubsetInventoryPayload,
  type InteractiveSubset,
  type InteractiveSubsetsPayload,
  type LibraryClusterDiagnostic,
  type LocalCoreBenchmarksPayload,
  type LocalValidationMatrixPayload,
  type RealClassSummary,
  type RealSceneSnapshot,
  type SceneClusterDiagnostic,
  type SpectralLibrarySample
} from "./lib/api";

type Language = "en" | "es";
type Theme = "dark" | "light";
type WorkflowStepId = "evidence" | "corpus" | "topics" | "baselines" | "inference" | "validation";
type HidsagState = "idle" | "loading" | "ready" | "error";
type LooseRecord = Record<string, unknown>;

interface ShellData {
  appData: AppPayload;
  interactiveSubsets: InteractiveSubsetsPayload;
  localValidation: LocalValidationMatrixPayload;
  localCore: LocalCoreBenchmarksPayload;
}

interface HidsagBundle {
  subsetInventory: HidsagSubsetInventoryPayload;
  curatedSubset: HidsagCuratedSubsetPayload;
  regionDocuments: HidsagRegionDocumentsPayload;
  bandQuality: HidsagBandQualityPayload;
  preprocessingSensitivity: HidsagPreprocessingSensitivityPayload;
}

const workflowOrder: WorkflowStepId[] = ["evidence", "corpus", "topics", "baselines", "inference", "validation"];
const datasetAliases: Record<string, string[]> = {
  "cuprite-upv-reflectance": ["cuprite-aviris-reflectance"],
  "micasense-rededge-samples": ["micasense-example-1", "micasense-example-2"]
};
const subsetPalette = ["#0f766e", "#b45309", "#be123c", "#1d4ed8", "#4d7c0f", "#6d28d9", "#9a3412", "#0f766e"];

function asRecord(value: unknown): LooseRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as LooseRecord) : null;
}

function asRecords(value: unknown): LooseRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((entry): entry is LooseRecord => entry !== null) : [];
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function prettyLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusRank(status: string): number {
  if (status === "ready") return 0;
  if (status === "prototype") return 1;
  return 2;
}

function statusTone(status: string): string {
  if (status === "ready") return "status-ready";
  if (status === "prototype") return "status-prototype";
  return "status-blocked";
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(digits);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }
  return `${Math.round(value * 100)}%`;
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

function normalizeVector(values: number[]): number[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values.map((value) => (value - min) / range);
}

function topRegimes(scene: RealSceneSnapshot, limit = 6): RealClassSummary[] {
  return [...scene.class_summaries].sort((a, b) => b.count - a.count).slice(0, limit);
}

function datasetMatches(datasetId: string, candidateId: string): boolean {
  return datasetId === candidateId || (datasetAliases[datasetId] ?? []).includes(candidateId);
}

function firstEnabledStep(subset: InteractiveSubset): WorkflowStepId {
  const available = workflowOrder.find((step) => subset.workflow_steps.find((entry) => entry.step === step)?.status !== "blocked");
  return available ?? "evidence";
}

function subsetDatasets(bundle: ShellData, subset: InteractiveSubset) {
  return subset.dataset_ids
    .map((id) => bundle.appData.datasets.datasets.find((entry) => entry.id === id))
    .filter((entry): entry is AppPayload["datasets"]["datasets"][number] => Boolean(entry));
}

function subsetRecipes(bundle: ShellData, subset: InteractiveSubset): CorpusRecipe[] {
  return subset.recipe_ids
    .map((id) => bundle.appData.corpus_recipes.recipes.find((entry) => entry.id === id))
    .filter((entry): entry is CorpusRecipe => Boolean(entry));
}

function subsetPreviews(bundle: ShellData, subset: InteractiveSubset): CorpusPreview[] {
  return bundle.appData.corpus_previews.previews.filter(
    (entry) => subset.dataset_ids.includes(entry.dataset_id) && subset.recipe_ids.includes(entry.recipe_id)
  );
}

function subsetScenes(bundle: ShellData, subset: InteractiveSubset): RealSceneSnapshot[] {
  return bundle.appData.real_scenes.scenes.filter((scene) => subset.dataset_ids.some((id) => datasetMatches(id, scene.id)));
}

function subsetSegmentation(bundle: ShellData, subset: InteractiveSubset) {
  return bundle.appData.segmentation_baselines.scenes.filter((scene) => subset.dataset_ids.includes(scene.dataset_id));
}

function subsetSceneDiagnostic(bundle: ShellData, subset: InteractiveSubset): SceneClusterDiagnostic[] {
  return bundle.appData.analysis.scene_diagnostics.filter((entry) => subset.dataset_ids.some((id) => datasetMatches(id, entry.scene_id)));
}

function nearestLibraryMatches(values: number[], samples: SpectralLibrarySample[], limit = 4) {
  return samples
    .filter((sample) => sample.spectrum.length === values.length)
    .map((sample) => ({ sample, distance: spectralDistance(values, sample.spectrum) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function sectionTitleForStep(step: WorkflowStepId, t: (key: string) => string): string {
  const mapping: Record<WorkflowStepId, string> = {
    evidence: t("stepEvidence"),
    corpus: t("stepCorpus"),
    topics: t("stepTopics"),
    baselines: t("stepBaselines"),
    inference: t("stepInference"),
    validation: t("stepValidation")
  };
  return mapping[step];
}

function SectionCard({
  eyebrow,
  title,
  subtitle,
  action,
  children
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="lab-card">
      <div className="lab-card-head">
        <div>
          <p className="lab-eyebrow">{eyebrow}</p>
          <h3>{title}</h3>
          {subtitle ? <p className="lab-subtitle">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="lab-card-body">{children}</div>
    </section>
  );
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`status-badge ${statusTone(status)}`}>{label}</span>;
}

function HeaderBar({
  overview,
  language,
  theme,
  onLanguageChange,
  onThemeToggle
}: {
  overview: AppPayload["overview"];
  language: Language;
  theme: Theme;
  onLanguageChange: (value: Language) => void;
  onThemeToggle: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="lab-header">
      <div className="lab-brand">
        <div className="lab-brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <p className="lab-eyebrow">{t("scientificHeaderSummary")}</p>
          <h1>{overview.title}</h1>
          <p>{pickText(overview.hypothesis, language)}</p>
        </div>
      </div>
      <div className="lab-header-actions">
        <div className="lab-segmented" aria-label={t("language")}>
          <button className={language === "es" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("es")}>
            ES
          </button>
          <button className={language === "en" ? "is-active" : ""} type="button" onClick={() => onLanguageChange("en")}>
            EN
          </button>
        </div>
        <button className="lab-ghost-button" type="button" onClick={onThemeToggle}>
          {theme === "dark" ? t("themeLight") : t("themeDark")}
        </button>
        <a className="lab-ghost-button" href={overview.repo.url} target="_blank" rel="noreferrer">
          {t("sourceCode")}
        </a>
      </div>
    </header>
  );
}

function FamilySidebar({
  bundle,
  subsets,
  activeFamilyId,
  activeSubsetId,
  language,
  onFamilyChange,
  onSubsetChange
}: {
  bundle: ShellData;
  subsets: InteractiveSubset[];
  activeFamilyId: string;
  activeSubsetId: string;
  language: Language;
  onFamilyChange: (id: string) => void;
  onSubsetChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const families = bundle.appData.data_families.families;
  const subsetsByFamily = new Map<string, InteractiveSubset[]>();
  subsets.forEach((subset) => {
    const current = subsetsByFamily.get(subset.family_id) ?? [];
    current.push(subset);
    subsetsByFamily.set(subset.family_id, current);
  });

  return (
    <aside className="lab-sidebar">
      <SectionCard eyebrow={t("familySelector")} title={t("familySelectorTitle")} subtitle={t("familySelectorHint")}>
        <div className="family-stack">
          {families.map((family) => {
            const familySubsets = (subsetsByFamily.get(family.id) ?? []).sort(
              (a, b) => statusRank(a.status) - statusRank(b.status) || a.title.en.localeCompare(b.title.en)
            );
            const readyCount = familySubsets.filter((entry) => entry.status === "ready").length;
            return (
              <button
                key={family.id}
                type="button"
                className={family.id === activeFamilyId ? "family-card is-active" : "family-card"}
                onClick={() => onFamilyChange(family.id)}
              >
                <div className="family-card-head">
                  <strong>{family.code}</strong>
                  <span>{familySubsets.length}</span>
                </div>
                <h4>{pickText(family.title, language)}</h4>
                <p>{pickText(family.definition, language)}</p>
                <small>
                  {readyCount} {t("statusReady")} / {familySubsets.length - readyCount} {t("statusPrototype")}
                </small>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("subsetRegistry")} title={t("subsetRegistryTitle")} subtitle={t("subsetRegistryHint")}>
        <div className="subset-stack">
          {subsets
            .filter((subset) => subset.family_id === activeFamilyId)
            .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.title.en.localeCompare(b.title.en))
            .map((subset) => {
              const datasets = subsetDatasets(bundle, subset);
              return (
                <button
                  key={subset.id}
                  type="button"
                  className={subset.id === activeSubsetId ? "subset-card is-active" : "subset-card"}
                  onClick={() => onSubsetChange(subset.id)}
                >
                  <div className="subset-card-head">
                    <StatusBadge status={subset.status} label={t(`status${prettyLabel(subset.status).replace(/\s/g, "")}`)} />
                    <small>{subset.last_validated}</small>
                  </div>
                  <h4>{pickText(subset.title, language)}</h4>
                  <p>{pickText(subset.summary, language)}</p>
                  <div className="subset-chip-row">
                    {datasets.map((entry) => (
                      <span key={entry.id} className="subset-chip">
                        {entry.name}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
        </div>
      </SectionCard>
    </aside>
  );
}

function StepTabs({
  subset,
  activeStep,
  onStepChange
}: {
  subset: InteractiveSubset;
  activeStep: WorkflowStepId;
  onStepChange: (step: WorkflowStepId) => void;
}) {
  const { t } = useTranslation();
  const statusMap = new Map(subset.workflow_steps.map((entry) => [entry.step as WorkflowStepId, entry]));
  return (
    <div className="step-tabs">
      {workflowOrder.map((step) => {
        const definition = statusMap.get(step);
        const status = definition?.status ?? "blocked";
        const disabled = status === "blocked";
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            className={step === activeStep ? "step-tab is-active" : "step-tab"}
            onClick={() => onStepChange(step)}
          >
            <span>{sectionTitleForStep(step, t)}</span>
            <small className={statusTone(status)}>{t(`status${prettyLabel(status).replace(/\s/g, "")}`)}</small>
          </button>
        );
      })}
    </div>
  );
}

function InspectorColumn({
  bundle,
  subset,
  family,
  language
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  family: DataFamily;
  language: Language;
}) {
  const { t } = useTranslation();
  const datasets = subsetDatasets(bundle, subset);

  return (
    <aside className="lab-inspector">
      <SectionCard eyebrow={t("activeSubset")} title={pickText(subset.title, language)} subtitle={pickText(family.title, language)}>
        <div className="inspector-stack">
          <div className="inspector-block">
            <strong>{t("publicGoal")}</strong>
            <p>{pickText(subset.public_goal, language)}</p>
          </div>
          <div className="inspector-block">
            <strong>{t("subsetDatasets")}</strong>
            <ul className="detail-list">
              {datasets.map((entry) => (
                <li key={entry.id}>
                  <span>{entry.name}</span>
                  <em>{entry.modality}</em>
                </li>
              ))}
            </ul>
          </div>
          <div className="inspector-block">
            <strong>{t("workflowSteps")}</strong>
            <ul className="status-list">
              {subset.workflow_steps.map((entry) => (
                <li key={entry.step}>
                  <StatusBadge status={entry.status} label={t(`status${prettyLabel(entry.status).replace(/\s/g, "")}`)} />
                  <span>{sectionTitleForStep(entry.step as WorkflowStepId, t)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("supportedClaims")} title={t("supportedClaimsTitle")} subtitle={t("supportedClaimsHint")}>
        <div className="claim-list">
          {subset.supported_claims.map((entry) => (
            <article key={entry.id} className="claim-card">
              <strong>{pickText(entry.title, language)}</strong>
              <p>{pickText(entry.detail, language)}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("blockedClaims")} title={t("blockedClaimsTitle")} subtitle={t("blockedClaimsHint")}>
        <div className="claim-list caution">
          {subset.blocked_claims.map((entry) => (
            <article key={entry.id} className="claim-card caution">
              <strong>{pickText(entry.title, language)}</strong>
              <p>{pickText(entry.detail, language)}</p>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("artifacts")} title={t("artifactsTitle")} subtitle={t("artifactsHint")}>
        <div className="artifact-list">
          {subset.artifacts.map((entry) => (
            <a key={entry.id} href={entry.path} className="artifact-card" target="_blank" rel="noreferrer">
              <strong>{pickText(entry.title, language)}</strong>
              <span>{entry.path}</span>
              <p>{pickText(entry.purpose, language)}</p>
            </a>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("validationStatus")} title={t("validationStatusTitle")} subtitle={t("validationStatusHint")}>
        <ul className="status-list">
          {subset.validation_status.map((entry) => (
            <li key={entry.block_id}>
              <StatusBadge status={entry.status} label={t(`status${prettyLabel(entry.status).replace(/\s/g, "")}`)} />
              <span>{prettyLabel(entry.block_id)}</span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard eyebrow={t("nextSteps")} title={t("nextStepsTitle")} subtitle={t("nextStepsHint")}>
        <ul className="detail-list">
          {subset.next_steps.map((entry, index) => (
            <li key={index}>
              <span>{pickText(entry, language)}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </aside>
  );
}

function FamilyAEvidenceView({ bundle }: { bundle: ShellData }) {
  const { t } = useTranslation();
  const samples = bundle.appData.spectral_library.samples;
  const [selectedSampleId, setSelectedSampleId] = useState<string>(samples[0]?.id ?? "");
  const selected = samples.find((entry) => entry.id === selectedSampleId) ?? samples[0];
  const matches = selected
    ? nearestLibraryMatches(
        selected.spectrum,
        samples.filter((entry) => entry.id !== selected.id && entry.band_count === selected.band_count),
        4
      )
    : [];
  const series: PlotSeries[] = selected
    ? [
        { id: selected.id, label: selected.name, values: selected.spectrum, color: subsetPalette[0] },
        ...matches.map((match, index) => ({
          id: match.sample.id,
          label: match.sample.name,
          values: match.sample.spectrum,
          color: subsetPalette[(index + 1) % subsetPalette.length]
        }))
      ]
    : [];
  const tokenItems: RankedBarDatum[] =
    selected?.absorption_tokens.slice(0, 12).map((entry, index) => ({
      id: `${entry}-${index}`,
      label: entry,
      value: selected.absorption_tokens.length - index,
      detail: selected.sensor
    })) ?? [];
  const previewItems: RankedBarDatum[] =
    selected?.token_preview.slice(0, 14).map((entry, index) => ({
      id: `${entry}-${index}`,
      label: entry,
      value: selected.token_preview.length - index
    })) ?? [];

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("sampleSelector")} title={selected?.name ?? t("missingSurface")} subtitle={selected?.group}>
        <div className="selector-row">
          {samples.slice(0, 18).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selectedSampleId ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedSampleId(entry.id)}
            >
              <strong>{entry.name}</strong>
              <span>
                {entry.group} / {entry.band_count}
              </span>
            </button>
          ))}
        </div>
      </SectionCard>

      {selected ? (
        <SectionCard
          eyebrow={t("spectralEvidence")}
          title={t("spectralComparison")}
          subtitle={`${selected.sensor} / ${selected.band_count} ${t("datasetsBands").toLowerCase()}`}
        >
          <InteractiveLinePlot
            xValues={selected.wavelengths_nm}
            series={series}
            xLabel={t("bandCenterAxis")}
            yLabel={t("normalizedResponseAxis")}
            selectedSeriesId={selected.id}
          />
        </SectionCard>
      ) : null}

      <SectionCard eyebrow={t("topicTokens")} title={t("absorptionTokens")} subtitle={selected?.source_file}>
        <RankedBars items={tokenItems} formatter={(value) => value.toFixed(0)} />
      </SectionCard>

      <SectionCard eyebrow={t("exampleTokens")} title={t("tokensTitle")} subtitle={selected?.name}>
        <RankedBars items={previewItems} formatter={(value) => value.toFixed(0)} />
      </SectionCard>
    </div>
  );
}

function SceneEvidenceView({
  bundle,
  subset,
  language,
  showReferences
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
  showReferences: boolean;
}) {
  const { t } = useTranslation();
  const scenes = subsetScenes(bundle, subset).sort((a, b) => b.class_summaries.length - a.class_summaries.length);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id ?? "");
  const scene = scenes.find((entry) => entry.id === selectedSceneId) ?? scenes[0];
  const regimes = scene ? topRegimes(scene, 6) : [];
  const [selectedRegimeId, setSelectedRegimeId] = useState<number>(regimes[0]?.label_id ?? 0);

  useEffect(() => {
    setSelectedSceneId(scenes[0]?.id ?? "");
  }, [subset.id]);

  useEffect(() => {
    setSelectedRegimeId(regimes[0]?.label_id ?? 0);
  }, [selectedSceneId]);

  if (!scene) {
    return (
      <SectionCard eyebrow={t("spectralEvidence")} title={t("missingSurface")} subtitle={t("missingSurfaceHint")}>
        <p>{t("missingSurfaceHint")}</p>
      </SectionCard>
    );
  }

  const selectedRegime = regimes.find((entry) => entry.label_id === selectedRegimeId) ?? regimes[0];
  const series: PlotSeries[] = regimes.map((entry, index) => ({
    id: String(entry.label_id),
    label: entry.name,
    values: entry.mean_spectrum,
    color: subsetPalette[index % subsetPalette.length]
  }));
  const heatmapRows: HeatmapRow[] = regimes.map((entry) => ({
    id: String(entry.label_id),
    label: entry.name,
    values: entry.mean_topic_mixture
  }));
  const heatmapColumns: HeatmapColumn[] = scene.topics.map((entry) => ({ id: entry.id, label: entry.name }));
  const diagnostic = subsetSceneDiagnostic(bundle, subset).find((entry) => entry.scene_id === scene.id) ?? null;
  const scatterPoints: ScatterPoint[] =
    diagnostic?.points.map((entry) => ({
      id: entry.id,
      label: entry.label,
      group: entry.group,
      x: entry.x,
      y: entry.y,
      size: entry.size,
      cluster: entry.cluster
    })) ?? [];
  const nearest =
    showReferences && selectedRegime
      ? nearestLibraryMatches(selectedRegime.mean_spectrum, bundle.appData.spectral_library.samples, 5).map((match, index) => ({
          id: match.sample.id,
          label: match.sample.name,
          value: Math.max(0.001, 1 / (match.distance + 0.01)),
          detail: `${match.sample.group} / ${match.distance.toFixed(3)}`,
          color: subsetPalette[index % subsetPalette.length]
        }))
      : [];
  const regimeItems: RankedBarDatum[] = regimes.map((entry, index) => ({
    id: String(entry.label_id),
    label: entry.name,
    value: entry.count,
    detail: `${entry.count.toLocaleString()} ${t("pixelsOrSamples")}`,
    color: subsetPalette[index % subsetPalette.length]
  }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("sceneSelector")} title={scene.name} subtitle={`${scene.sensor} / ${scene.modality}`}>
        <div className="selector-row">
          {scenes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === scene.id ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedSceneId(entry.id)}
            >
              <strong>{entry.name}</strong>
              <span>{entry.class_summaries.length} regimes</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("selectedRegime")} title={selectedRegime?.name ?? t("missingSurface")} subtitle={scene.notes}>
        <RankedBars
          items={regimeItems}
          selectedId={String(selectedRegime?.label_id ?? "")}
          onSelect={(value) => setSelectedRegimeId(Number(value))}
          formatter={(value) => Math.round(value).toLocaleString()}
        />
      </SectionCard>

      <SectionCard eyebrow={t("spectralEvidence")} title={t("meanRegimeSpectra")} subtitle={scene.name}>
        <InteractiveLinePlot
          xValues={scene.approximate_wavelengths_nm}
          series={series}
          xLabel={t("bandCenterAxis")}
          yLabel={t("normalizedResponseAxis")}
          selectedSeriesId={String(selectedRegime?.label_id ?? "")}
          onSeriesSelect={(value) => setSelectedRegimeId(Number(value))}
        />
      </SectionCard>

      <SectionCard eyebrow={t("topicEvidence")} title={t("topicMixtureMatrix")} subtitle={t("topicMixtureMatrixHint")}>
        <InteractiveHeatmap
          columns={heatmapColumns}
          rows={heatmapRows}
          selectedRowId={String(selectedRegime?.label_id ?? "")}
          onRowSelect={(value) => setSelectedRegimeId(Number(value))}
          formatter={(value) => formatPercent(value)}
        />
      </SectionCard>

      {diagnostic ? (
        <SectionCard eyebrow={t("validationDiagnostics")} title={t("topicSpaceGeometry")} subtitle={diagnostic.feature_space}>
          <InteractiveScatter points={scatterPoints} />
        </SectionCard>
      ) : null}

      {showReferences ? (
        <SectionCard eyebrow={t("nearestMaterialReferences")} title={t("nearestReferences")} subtitle={selectedRegime?.name}>
          <RankedBars items={nearest} formatter={(value) => value.toFixed(3)} />
        </SectionCard>
      ) : null}
    </div>
  );
}

function FamilyDEvidenceView({
  hidsag,
  hidsagState
}: {
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();

  if (hidsagState !== "ready" || !hidsag) {
    return (
      <SectionCard eyebrow={t("spectralEvidence")} title={t("loadingFamilyD")} subtitle={t("loadingFamilyDHint")}>
        <p>{hidsagState === "loading" ? t("loadingFamilyDHint") : t("loading")}</p>
      </SectionCard>
    );
  }

  const inventoryRows = hidsag.subsetInventory.subsets;
  const curatedRows = hidsag.curatedSubset.subsets;
  const [selectedCode, setSelectedCode] = useState<string>(asString(inventoryRows[0]?.subset_code));
  const inventoryRow = inventoryRows.find((entry) => asString(entry.subset_code) === selectedCode) ?? inventoryRows[0];
  const curatedRow = curatedRows.find((entry) => asString(entry.subset_code) === selectedCode) ?? curatedRows[0];
  const volumeItems: RankedBarDatum[] = inventoryRows.map((entry, index) => ({
    id: asString(entry.subset_code),
    label: asString(entry.subset_code),
    value: asNumber(entry.sample_count),
    detail: `${asNumber(entry.measurement_count_total, asNumber(entry.sample_count)).toLocaleString()} measurements`,
    color: subsetPalette[index % subsetPalette.length]
  }));
  const targetItems: RankedBarDatum[] = asRecords(curatedRow?.dominant_targets_by_mean)
    .slice(0, 8)
    .map((entry, index) => ({
      id: asString(entry.name),
      label: asString(entry.name),
      value: asNumber(entry.mean),
      detail: `${asNumber(entry.nonzero_samples).toLocaleString()} samples`,
      color: subsetPalette[index % subsetPalette.length]
    }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("hidsagSubsetSelector")} title={selectedCode} subtitle={t("hidsagEvidenceHint")}>
        <div className="selector-row">
          {inventoryRows.map((entry) => {
            const code = asString(entry.subset_code);
            return (
              <button
                key={code}
                type="button"
                className={code === selectedCode ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedCode(code)}
              >
                <strong>{code}</strong>
                <span>{asNumber(entry.sample_count).toLocaleString()} samples</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("spectralEvidence")} title={t("familyDInventory")} subtitle={t("familyDInventoryHint")}>
        <RankedBars items={volumeItems} selectedId={selectedCode} onSelect={setSelectedCode} formatter={(value) => Math.round(value).toLocaleString()} />
      </SectionCard>

      <SectionCard eyebrow={t("supportedClaims")} title={t("dominantTargets")} subtitle={selectedCode}>
        <RankedBars items={targetItems} formatter={(value) => value.toFixed(2)} />
      </SectionCard>

      <SectionCard eyebrow={t("validationDiagnostics")} title={t("familyDInventoryStats")} subtitle={selectedCode}>
        <div className="metric-panel-grid">
          <div>
            <span>{t("sampleCountLabel")}</span>
            <strong>{asNumber(inventoryRow?.sample_count).toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("measurementCountLabel")}</span>
            <strong>{asNumber(curatedRow?.measurement_count_total).toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("numericTargetsLabel")}</span>
            <strong>{asNumber(curatedRow?.numeric_variable_count).toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("categoricalTargetsLabel")}</span>
            <strong>{asNumber(curatedRow?.categorical_variable_count).toLocaleString()}</strong>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function EvidenceView({
  bundle,
  subset,
  language,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  if (subset.family_id === "individual-spectra") {
    return <FamilyAEvidenceView bundle={bundle} />;
  }
  if (subset.family_id === "regions-with-measurements") {
    return <FamilyDEvidenceView hidsag={hidsag} hidsagState={hidsagState} />;
  }
  return <SceneEvidenceView bundle={bundle} subset={subset} language={language} showReferences={subset.family_id === "unlabeled-spectral-image"} />;
}

function CorpusView({
  bundle,
  subset,
  language,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();
  const recipes = subsetRecipes(bundle, subset);
  const previews = subsetPreviews(bundle, subset);
  const [selectedPreviewId, setSelectedPreviewId] = useState<string>(previews[0]?.id ?? "");
  const preview = previews.find((entry) => entry.id === selectedPreviewId) ?? previews[0];
  const recipe = preview ? recipes.find((entry) => entry.id === preview.recipe_id) ?? recipes[0] : recipes[0];
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>(preview?.example_documents[0]?.id ?? "");

  useEffect(() => {
    setSelectedPreviewId(previews[0]?.id ?? "");
  }, [subset.id]);

  useEffect(() => {
    setSelectedDocumentId(preview?.example_documents[0]?.id ?? "");
  }, [selectedPreviewId]);

  if (!preview) {
    if (subset.family_id === "regions-with-measurements" && hidsagState === "ready" && hidsag) {
      const rows = hidsag.regionDocuments.subsets;
      const items: RankedBarDatum[] = rows.map((entry, index) => ({
        id: asString(entry.subset_code),
        label: asString(entry.subset_code),
        value: asNumber(entry.region_document_count),
        detail: `${asNumber(entry.sample_count).toLocaleString()} samples`,
        color: subsetPalette[index % subsetPalette.length]
      }));
      return (
        <div className="workspace-grid">
          <SectionCard eyebrow={t("stepCorpus")} title={t("prototypeCorpusSurface")} subtitle={t("prototypeCorpusSurfaceHint")}>
            <p>{t("prototypeCorpusSurfaceBody")}</p>
          </SectionCard>
          <SectionCard eyebrow={t("documentDefinition")} title={t("familyDRegionDocuments")} subtitle={t("familyDRegionDocumentsHint")}>
            <RankedBars items={items} formatter={(value) => Math.round(value).toLocaleString()} />
          </SectionCard>
        </div>
      );
    }

    return (
      <SectionCard eyebrow={t("stepCorpus")} title={t("missingSurface")} subtitle={t("noPublicCorpusYet")}>
        <p>{t("noPublicCorpusYet")}</p>
      </SectionCard>
    );
  }

  const statsItems: RankedBarDatum[] = [
    { id: "min", label: "min", value: preview.document_length.min },
    { id: "median", label: "median", value: preview.document_length.median },
    { id: "mean", label: "mean", value: preview.document_length.mean },
    { id: "max", label: "max", value: preview.document_length.max }
  ];
  const tokenItems: RankedBarDatum[] = preview.top_tokens.slice(0, 16).map((entry, index) => ({
    id: entry.token,
    label: entry.token,
    value: entry.count,
    color: subsetPalette[index % subsetPalette.length]
  }));
  const selectedDocument = preview.example_documents.find((entry) => entry.id === selectedDocumentId) ?? preview.example_documents[0];

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("recipesLabel")} title={pickText(recipe.title, language)} subtitle={pickText(recipe.summary, language)}>
        <div className="selector-row">
          {previews.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === preview.id ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedPreviewId(entry.id)}
            >
              <strong>{entry.dataset_name}</strong>
              <span>{prettyLabel(entry.recipe_id)}</span>
            </button>
          ))}
        </div>
        <div className="metric-panel-grid">
          <div>
            <span>{t("documentCountLabel")}</span>
            <strong>{preview.document_count.toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("vocabularySizeLabel")}</span>
            <strong>{preview.vocabulary_size.toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("zeroTokenDocumentsLabel")}</span>
            <strong>{preview.zero_token_documents.toLocaleString()}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("documentDefinition")} title={t("corpusDefinitions")} subtitle={preview.dataset_name}>
        <div className="definition-grid">
          <article>
            <strong>{t("alphabetLabel")}</strong>
            <p>{pickText(recipe.alphabet_definition, language)}</p>
          </article>
          <article>
            <strong>{t("wordDefinition")}</strong>
            <p>{pickText(recipe.word_definition, language)}</p>
          </article>
          <article>
            <strong>{t("documentDefinition")}</strong>
            <p>{pickText(recipe.document_definition, language)}</p>
          </article>
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("documentLengths")} title={t("documentLengthDistribution")} subtitle={preview.id}>
        <RankedBars items={statsItems} formatter={(value) => value.toFixed(1)} />
      </SectionCard>

      <SectionCard eyebrow={t("topTokens")} title={t("topTokensTitle")} subtitle={preview.dataset_name}>
        <RankedBars items={tokenItems} formatter={(value) => Math.round(value).toLocaleString()} />
      </SectionCard>

      <SectionCard eyebrow={t("exampleDocuments")} title={selectedDocument?.label ?? t("missingSurface")} subtitle={selectedDocument?.source}>
        <div className="selector-row">
          {preview.example_documents.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selectedDocument?.id ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedDocumentId(entry.id)}
            >
              <strong>{entry.label}</strong>
              <span>{entry.token_count} tokens</span>
            </button>
          ))}
        </div>
        <div className="token-grid">
          {(selectedDocument?.tokens ?? []).slice(0, 48).map((entry) => (
            <span key={entry} className="token-cell">
              {entry}
            </span>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function FamilyATopicsView({ bundle }: { bundle: ShellData }) {
  const { t } = useTranslation();
  const run = bundle.localCore.spectral_library_runs[0];
  const groups = asRecords(asRecord(run)?.band_groups);
  const [selectedBandCount, setSelectedBandCount] = useState<number>(asNumber(groups[0]?.band_count));
  const group = groups.find((entry) => asNumber(entry.band_count) === selectedBandCount) ?? groups[0];
  const topics = asRecords(group?.top_band_tokens);
  const [selectedTopicId, setSelectedTopicId] = useState<number>(asNumber(topics[0]?.topic_id));
  const topic = topics.find((entry) => asNumber(entry.topic_id) === selectedTopicId) ?? topics[0];
  const tokenItems: RankedBarDatum[] = asRecords(topic?.tokens).map((entry, index) => ({
    id: asString(entry.token),
    label: asString(entry.token),
    value: asNumber(entry.weight),
    color: subsetPalette[index % subsetPalette.length]
  }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("bandGroupSelector")} title={t("topicModelSnapshot")} subtitle={prettyLabel(asString(asRecord(run)?.representation ? asString(asRecord(asRecord(run)?.representation)?.id) : ""))}>
        <div className="selector-row">
          {groups.map((entry) => {
            const value = asNumber(entry.band_count);
            return (
              <button
                key={value}
                type="button"
                className={value === selectedBandCount ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedBandCount(value)}
              >
                <strong>{value} bands</strong>
                <span>{formatNumber(asNumber(entry.perplexity), 2)} perplexity</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicSelector")} title={`T${selectedTopicId}`} subtitle={`${asNumber(group?.sample_count).toLocaleString()} samples`}>
        <div className="selector-row">
          {topics.map((entry) => {
            const value = asNumber(entry.topic_id);
            return (
              <button
                key={value}
                type="button"
                className={value === selectedTopicId ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedTopicId(value)}
              >
                <strong>T{value}</strong>
                <span>{asRecords(entry.tokens).length} tokens</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicTokens")} title={t("topicTokensTitle")} subtitle={`${selectedBandCount} bands`}>
        <RankedBars items={tokenItems} formatter={(value) => value.toFixed(4)} />
      </SectionCard>
    </div>
  );
}

function SceneTopicsView({
  bundle,
  subset,
  language
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
}) {
  const { t } = useTranslation();
  const scenes = subsetScenes(bundle, subset).sort((a, b) => b.class_summaries.length - a.class_summaries.length);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(scenes[0]?.id ?? "");
  const scene = scenes.find((entry) => entry.id === selectedSceneId) ?? scenes[0];
  const [selectedTopicId, setSelectedTopicId] = useState<string>(scene?.topics[0]?.id ?? "");
  const regimes = scene ? topRegimes(scene, 6) : [];
  const selectedRegime = regimes[0];

  useEffect(() => {
    setSelectedSceneId(scenes[0]?.id ?? "");
  }, [subset.id]);

  useEffect(() => {
    setSelectedTopicId(scene?.topics[0]?.id ?? "");
  }, [selectedSceneId]);

  if (!scene) {
    return null;
  }

  const topic = scene.topics.find((entry) => entry.id === selectedTopicId) ?? scene.topics[0];
  const series: PlotSeries[] = topic
    ? [
        {
          id: topic.id,
          label: topic.name,
          values: normalizeVector(topic.band_profile),
          color: subsetPalette[0]
        },
        {
          id: "selected-regime",
          label: selectedRegime?.name ?? "regime",
          values: normalizeVector(selectedRegime?.mean_spectrum ?? []),
          color: subsetPalette[1]
        }
      ]
    : [];
  const tokenItems: RankedBarDatum[] =
    topic?.top_words.map((entry, index) => ({
      id: `${topic.id}-${entry.token}`,
      label: entry.token,
      value: entry.weight,
      color: subsetPalette[index % subsetPalette.length]
    })) ?? [];
  const rows: HeatmapRow[] = regimes.map((entry) => ({
    id: String(entry.label_id),
    label: entry.name,
    values: entry.mean_topic_mixture
  }));
  const columns: HeatmapColumn[] = scene.topics.map((entry) => ({ id: entry.id, label: entry.name }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("sceneSelector")} title={scene.name} subtitle={scene.notes}>
        <div className="selector-row">
          {scenes.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === scene.id ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedSceneId(entry.id)}
            >
              <strong>{entry.name}</strong>
              <span>{entry.topics.length} topics</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicSelector")} title={topic?.name ?? t("missingSurface")} subtitle={scene.name}>
        <div className="selector-row">
          {scene.topics.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={entry.id === selectedTopicId ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedTopicId(entry.id)}
            >
              <strong>{entry.name}</strong>
              <span>{entry.top_words.length} tokens</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicEvidence")} title={t("topicProfileAgainstRegime")} subtitle={selectedRegime?.name}>
        <InteractiveLinePlot
          xValues={scene.approximate_wavelengths_nm}
          series={series}
          xLabel={t("bandCenterAxis")}
          yLabel={t("normalizedResponseAxis")}
          selectedSeriesId={topic?.id ?? null}
        />
      </SectionCard>

      <SectionCard eyebrow={t("topicTokens")} title={t("topicWords")} subtitle={topic?.name}>
        <RankedBars items={tokenItems} formatter={(value) => value.toFixed(4)} />
      </SectionCard>

      <SectionCard eyebrow={t("topicEvidence")} title={t("topicMixtureMatrix")} subtitle={scene.name}>
        <InteractiveHeatmap columns={columns} rows={rows} formatter={(value) => formatPercent(value)} />
      </SectionCard>
    </div>
  );
}

function FamilyDTopicsView({
  bundle,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();
  const runs = bundle.localCore.measured_target_runs;

  if (hidsagState !== "ready" || !hidsag || runs.length === 0) {
    return (
      <SectionCard eyebrow={t("stepTopics")} title={t("loadingFamilyD")} subtitle={t("loadingFamilyDHint")}>
        <p>{t("loadingFamilyDHint")}</p>
      </SectionCard>
    );
  }

  const [selectedCode, setSelectedCode] = useState<string>(asString(runs[0]?.subset_code));
  const [selectedModelKey, setSelectedModelKey] = useState<string>("regional_topic_model");
  const run = asRecord(runs.find((entry) => asString(entry.subset_code) === selectedCode)) ?? asRecord(runs[0]) ?? {};
  const topicModel = asRecord(run[selectedModelKey]) ?? {};
  const topics = asRecords(topicModel.top_tokens);
  const [selectedTopicId, setSelectedTopicId] = useState<number>(asNumber(topics[0]?.topic_id));
  const topic = topics.find((entry) => asNumber(entry.topic_id) === selectedTopicId) ?? topics[0];
  const tokenItems: RankedBarDatum[] = asRecords(topic?.tokens).map((entry, index) => ({
    id: asString(entry.token),
    label: asString(entry.token),
    value: asNumber(entry.weight),
    color: subsetPalette[index % subsetPalette.length]
  }));
  const dominantItems: RankedBarDatum[] = asRecords(topicModel.dominant_topic_counts).map((entry, index) => ({
    id: `topic-${asNumber(entry.topic_id)}`,
    label: `T${asNumber(entry.topic_id)}`,
    value: asNumber(entry.sample_count),
    color: subsetPalette[index % subsetPalette.length]
  }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("hidsagSubsetSelector")} title={selectedCode} subtitle={t("topicModelSnapshot")}>
        <div className="selector-row">
          {runs.map((entry) => {
            const code = asString(entry.subset_code);
            return (
              <button
                key={code}
                type="button"
                className={code === selectedCode ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedCode(code)}
              >
                <strong>{code}</strong>
                <span>{asNumber(entry.sample_count).toLocaleString()} samples</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("modelLevel")} title={prettyLabel(selectedModelKey)} subtitle={asString(topicModel.topic_activity_warning)}>
        <div className="selector-row">
          {["topic_model", "regional_topic_model", "hierarchical_topic_model"].map((entry) => (
            <button
              key={entry}
              type="button"
              className={entry === selectedModelKey ? "selector-button is-active" : "selector-button"}
              onClick={() => setSelectedModelKey(entry)}
            >
              <strong>{prettyLabel(entry)}</strong>
              <span>{asNumber(asRecord(run[entry])?.topic_count)} topics</span>
            </button>
          ))}
        </div>
        <div className="metric-panel-grid">
          <div>
            <span>{t("topicCountLabel")}</span>
            <strong>{asNumber(topicModel.topic_count).toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("activeTopicCountLabel")}</span>
            <strong>{asNumber(topicModel.active_topic_count).toLocaleString()}</strong>
          </div>
          <div>
            <span>{t("perplexityLabel")}</span>
            <strong>{formatNumber(asNumber(topicModel.perplexity), 2)}</strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicSelector")} title={`T${selectedTopicId}`} subtitle={selectedCode}>
        <div className="selector-row">
          {topics.map((entry) => {
            const value = asNumber(entry.topic_id);
            return (
              <button
                key={value}
                type="button"
                className={value === selectedTopicId ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedTopicId(value)}
              >
                <strong>T{value}</strong>
                <span>{asRecords(entry.tokens).length} tokens</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("topicTokens")} title={t("topicWords")} subtitle={prettyLabel(selectedModelKey)}>
        <RankedBars items={tokenItems} formatter={(value) => value.toFixed(4)} />
      </SectionCard>

      <SectionCard eyebrow={t("validationDiagnostics")} title={t("dominantTopicSupport")} subtitle={selectedCode}>
        <RankedBars items={dominantItems} formatter={(value) => Math.round(value).toLocaleString()} />
      </SectionCard>
    </div>
  );
}

function TopicsView({
  bundle,
  subset,
  language,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  if (subset.family_id === "individual-spectra") {
    return <FamilyATopicsView bundle={bundle} />;
  }
  if (subset.family_id === "regions-with-measurements") {
    return <FamilyDTopicsView bundle={bundle} hidsag={hidsag} hidsagState={hidsagState} />;
  }
  return <SceneTopicsView bundle={bundle} subset={subset} language={language} />;
}

function BaselinesView({
  bundle,
  subset,
  language
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  language: Language;
}) {
  const { t } = useTranslation();
  const spectralRun = asRecord(bundle.localCore.spectral_library_runs[0]) ?? {};
  const spectralGroups = asRecords(spectralRun.band_groups);
  const [selectedBandCount, setSelectedBandCount] = useState<number>(asNumber(spectralGroups[0]?.band_count));

  useEffect(() => {
    if (spectralGroups.length === 0) {
      return;
    }
    const hasSelected = spectralGroups.some((entry) => asNumber(entry.band_count) === selectedBandCount);
    if (!hasSelected) {
      setSelectedBandCount(asNumber(spectralGroups[0]?.band_count));
    }
  }, [selectedBandCount, spectralGroups]);

  if (subset.family_id === "individual-spectra") {
    const group = spectralGroups.find((entry) => asNumber(entry.band_count) === selectedBandCount) ?? spectralGroups[0];
    const clustering = asRecord(group?.clustering) ?? {};
    const metricItems: RankedBarDatum[] = Object.entries(clustering).map(([id, entry], index) => ({
      id,
      label: prettyLabel(id),
      value: asNumber(asRecord(entry)?.nmi),
      detail: asString(asRecord(entry)?.feature_space),
      color: subsetPalette[index % subsetPalette.length]
    }));
      return (
        <div className="workspace-grid">
          <SectionCard eyebrow={t("bandGroupSelector")} title={t("clusterComparison")} subtitle={t("familyABaselineHint")}>
            <div className="selector-row">
              {spectralGroups.map((entry) => {
                const value = asNumber(entry.band_count);
                return (
                  <button
                  key={value}
                  type="button"
                  className={value === selectedBandCount ? "selector-button is-active" : "selector-button"}
                  onClick={() => setSelectedBandCount(value)}
                >
                  <strong>{value} bands</strong>
                  <span>{asNumber(entry.group_count).toLocaleString()} groups</span>
                </button>
              );
            })}
          </div>
        </SectionCard>
        <SectionCard eyebrow={t("clusterComparison")} title={t("nmiComparison")} subtitle={`${selectedBandCount} bands`}>
          <ComparisonBars items={metricItems} formatter={(value) => value.toFixed(3)} />
        </SectionCard>
      </div>
    );
  }

  if (subset.family_id === "unlabeled-spectral-image") {
    const run = asRecord(bundle.localCore.unlabeled_scene_runs.find((entry) => subset.dataset_ids.includes(asString(entry.dataset_id)))) ?? {};
    const clustering = asRecord(run.clustering) ?? {};
    const clusterItems: RankedBarDatum[] = Object.entries(clustering).map(([id, entry], index) => ({
      id,
      label: prettyLabel(id),
      value: asRecords(asRecord(entry)?.cluster_summary).reduce((total, row) => total + asNumber(row.size), 0),
      detail: asString(asRecord(entry)?.feature_space),
      color: subsetPalette[index % subsetPalette.length]
    }));
    const alignment = asRecord(asRecord(run.reference_alignment)?.topic_alignment) ?? {};
    const nmfAlignment = asRecord(asRecord(run.reference_alignment)?.nmf_alignment) ?? {};
    const comparison: RankedBarDatum[] = [
      {
        id: "topic",
        label: "topic alignment",
        value: -asNumber(alignment.matched_angle_deg_mean),
        detail: "lower angle is better",
        color: subsetPalette[0]
      },
      {
        id: "nmf",
        label: "nmf alignment",
        value: -asNumber(nmfAlignment.matched_angle_deg_mean),
        detail: "lower angle is better",
        color: subsetPalette[1]
      }
    ];
    return (
      <div className="workspace-grid">
        <SectionCard eyebrow={t("clusterComparison")} title={t("clusterMassSummary")} subtitle={t("familyCBaselineHint")}>
          <RankedBars items={clusterItems} formatter={(value) => Math.round(value).toLocaleString()} />
        </SectionCard>
        <SectionCard eyebrow={t("nearestMaterialReferences")} title={t("alignmentComparison")} subtitle={asString(asRecord(run.reference_alignment)?.reference_source)}>
          <ComparisonBars items={comparison} formatter={(value) => Math.abs(value).toFixed(2)} />
        </SectionCard>
      </div>
    );
  }

  const segmentation = subsetSegmentation(bundle, subset)[0];
  const run = asRecord(bundle.localCore.labeled_scene_runs.find((entry) => asString(entry.dataset_id) === "salinas-corrected")) ?? {};
  const clustering = asRecord(run.clustering) ?? {};
  const metricItems: RankedBarDatum[] = Object.entries(clustering).map(([id, entry], index) => ({
    id,
    label: prettyLabel(id),
    value: asNumber(asRecord(entry)?.ari),
    detail: asString(asRecord(entry)?.feature_space),
    color: subsetPalette[index % subsetPalette.length]
  }));

  return (
    <div className="workspace-grid">
      {segmentation ? (
        <SectionCard eyebrow={t("stepBaselines")} title={t("slicBaselineTitle")} subtitle={segmentation.scene_name}>
          <div className="metric-panel-grid">
            <div>
              <span>{t("segmentsLabel")}</span>
              <strong>{segmentation.segment_count.toLocaleString()}</strong>
            </div>
            <div>
              <span>{t("labelCoverage")}</span>
              <strong>{formatPercent(segmentation.label_metrics.label_coverage_ratio)}</strong>
            </div>
            <div>
              <span>{t("weightedPurityLabel")}</span>
              <strong>{formatNumber(segmentation.label_metrics.weighted_label_purity, 3)}</strong>
            </div>
            <div>
              <span>{t("compactnessLabel")}</span>
              <strong>{formatNumber(segmentation.slic_parameters.compactness, 2)}</strong>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard eyebrow={t("clusterComparison")} title={t("ariComparison")} subtitle="Salinas corrected">
        <ComparisonBars items={metricItems} formatter={(value) => value.toFixed(3)} />
      </SectionCard>

      {subsetSceneDiagnostic(bundle, subset).find((entry) => entry.scene_id === "salinas-corrected") ? (
        <SectionCard eyebrow={t("validationDiagnostics")} title={t("topicSpaceGeometry")} subtitle="Salinas corrected">
          <InteractiveScatter
            points={
              (subsetSceneDiagnostic(bundle, subset).find((entry) => entry.scene_id === "salinas-corrected")?.points ?? []).map((entry) => ({
                id: entry.id,
                label: entry.label,
                group: entry.group,
                x: entry.x,
                y: entry.y,
                size: entry.size,
                cluster: entry.cluster
              })) as ScatterPoint[]
            }
          />
        </SectionCard>
      ) : null}
    </div>
  );
}

function FamilyDInferenceView({
  bundle,
  hidsagState
}: {
  bundle: ShellData;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();
  const runs = bundle.localCore.measured_target_runs;

  if (hidsagState !== "ready" || runs.length === 0) {
    return (
      <SectionCard eyebrow={t("stepInference")} title={t("loadingFamilyD")} subtitle={t("loadingFamilyDHint")}>
        <p>{t("loadingFamilyDHint")}</p>
      </SectionCard>
    );
  }

  const [selectedCode, setSelectedCode] = useState<string>(asString(runs[0]?.subset_code));
  const [taskKind, setTaskKind] = useState<"classification" | "regression">("regression");
  const run = asRecord(runs.find((entry) => asString(entry.subset_code) === selectedCode)) ?? asRecord(runs[0]) ?? {};
  const tasks = taskKind === "classification" ? asRecords(run.classification_tasks) : asRecords(run.regression_tasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    taskKind === "classification" ? asString(tasks[0]?.task_id) : asString(tasks[0]?.target)
  );

  useEffect(() => {
    setSelectedTaskId(taskKind === "classification" ? asString(tasks[0]?.task_id) : asString(tasks[0]?.target));
  }, [selectedCode, taskKind]);

  const task =
    tasks.find((entry) => (taskKind === "classification" ? asString(entry.task_id) === selectedTaskId : asString(entry.target) === selectedTaskId)) ??
    tasks[0];
  const metrics = asRecord(task?.metrics) ?? {};
  const metricName = taskKind === "classification" ? "balanced_accuracy" : "r2";
  const items: RankedBarDatum[] = Object.entries(metrics).map(([id, entry], index) => ({
    id,
    label: prettyLabel(id),
    value: asNumber(asRecord(entry)?.[metricName]),
    color: subsetPalette[index % subsetPalette.length]
  }));
  const predictionRows = asRecords(task?.sample_predictions).slice(0, 8);

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("hidsagSubsetSelector")} title={selectedCode} subtitle={t("measuredTargetWorkbench")}>
        <div className="selector-row">
          {runs.map((entry) => {
            const code = asString(entry.subset_code);
            return (
              <button
                key={code}
                type="button"
                className={code === selectedCode ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedCode(code)}
              >
                <strong>{code}</strong>
                <span>{asNumber(entry.sample_count).toLocaleString()} samples</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("modelLevel")} title={t("taskSelector")} subtitle={taskKind}>
        <div className="selector-row">
          <button type="button" className={taskKind === "classification" ? "selector-button is-active" : "selector-button"} onClick={() => setTaskKind("classification")}>
            <strong>{t("classificationTasks")}</strong>
            <span>{asRecords(run.classification_tasks).length}</span>
          </button>
          <button type="button" className={taskKind === "regression" ? "selector-button is-active" : "selector-button"} onClick={() => setTaskKind("regression")}>
            <strong>{t("regressionTasks")}</strong>
            <span>{asRecords(run.regression_tasks).length}</span>
          </button>
        </div>
        <div className="selector-row">
          {tasks.slice(0, 12).map((entry) => {
            const taskId = taskKind === "classification" ? asString(entry.task_id) : asString(entry.target);
            const label = taskKind === "classification" ? asString(entry.target) : asString(entry.target);
            return (
              <button
                key={taskId}
                type="button"
                className={taskId === selectedTaskId ? "selector-button is-active" : "selector-button"}
                onClick={() => setSelectedTaskId(taskId)}
              >
                <strong>{label}</strong>
                <span>{taskKind === "classification" ? asString(entry.label_definition) : asString(asRecord(entry.summary)?.units, "target")}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard eyebrow={t("modelComparison")} title={prettyLabel(metricName)} subtitle={prettyLabel(asString(taskKind === "classification" ? task?.target : task?.target))}>
        <ComparisonBars items={items} formatter={(value) => value.toFixed(3)} />
      </SectionCard>

      <SectionCard eyebrow={t("samplePredictions")} title={t("predictionSlice")} subtitle={selectedCode}>
        <div className="prediction-table">
          <div className="prediction-head">
            <span>{t("sampleColumn")}</span>
            <span>{taskKind === "classification" ? t("targetValue") : t("trueValueLabel")}</span>
            <span>{t("bestModelLabel")}</span>
          </div>
          {predictionRows.map((entry) => {
            const bestModelId = asString(asRecord(task?.best_model)?.model_id);
            const predictions = asRecord(entry.predictions) ?? {};
            return (
              <div key={asString(entry.sample_name)} className="prediction-row">
                <span>{asString(entry.sample_name)}</span>
                <span>{taskKind === "classification" ? asString(entry.true_label) : formatNumber(asNumber(entry.true_value), 3)}</span>
                <span>{String(predictions[bestModelId] ?? "n/a")}</span>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

function InferenceView({
  bundle,
  subset,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();

  if (subset.family_id === "regions-with-measurements") {
    return <FamilyDInferenceView bundle={bundle} hidsagState={hidsagState} />;
  }

  if (subset.family_id !== "labeled-spectral-image") {
    return (
      <SectionCard eyebrow={t("stepInference")} title={t("noInferenceAllowed")} subtitle={t("noInferenceAllowedHint")}>
        <p>{t("noInferenceAllowedBody")}</p>
      </SectionCard>
    );
  }

  const row = asRecord(bundle.localCore.labeled_scene_runs.find((entry) => asString(entry.dataset_id) === "salinas-corrected")) ?? {};
  const classification = asRecord(row.classification) ?? {};
  const items: RankedBarDatum[] = Object.entries(classification).map(([id, entry], index) => ({
    id,
    label: prettyLabel(id),
    value: asNumber(asRecord(entry)?.macro_f1),
    detail: `${formatNumber(asNumber(asRecord(entry)?.accuracy), 3)} acc`,
    color: subsetPalette[index % subsetPalette.length]
  }));

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("stepInference")} title={t("modelComparison")} subtitle="Salinas corrected">
        <ComparisonBars items={items} formatter={(value) => value.toFixed(3)} />
      </SectionCard>
      <SectionCard eyebrow={t("supportedClaims")} title={t("inferenceReading")} subtitle="Salinas corrected">
        <div className="definition-grid">
          <article>
            <strong>{t("trainSetLabel")}</strong>
            <p>{asNumber(row.train_size).toLocaleString()}</p>
          </article>
          <article>
            <strong>{t("testSetLabel")}</strong>
            <p>{asNumber(row.test_size).toLocaleString()}</p>
          </article>
          <article>
            <strong>{t("classCountLabel")}</strong>
            <p>{asNumber(row.class_count).toLocaleString()}</p>
          </article>
        </div>
      </SectionCard>
    </div>
  );
}

function ValidationView({
  bundle,
  subset,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  const { t } = useTranslation();
  const statusItems: RankedBarDatum[] = subset.validation_status.map((entry, index) => ({
    id: entry.block_id,
    label: prettyLabel(entry.block_id),
    value: entry.status === "ready" ? 3 : entry.status === "prototype" ? 2 : 1,
    detail: entry.status,
    color: subsetPalette[index % subsetPalette.length]
  }));
  const sensitivityRows = hidsag?.preprocessingSensitivity.subsets ?? [];
  const bandRows = hidsag?.bandQuality.subsets ?? [];
  const [selectedCode, setSelectedCode] = useState<string>(asString(sensitivityRows[0]?.subset_code));

  useEffect(() => {
    if (sensitivityRows.length === 0) {
      return;
    }
    const hasSelected = sensitivityRows.some((entry) => asString(entry.subset_code) === selectedCode);
    if (!hasSelected) {
      setSelectedCode(asString(sensitivityRows[0]?.subset_code));
    }
  }, [selectedCode, sensitivityRows]);

  if (subset.family_id === "individual-spectra") {
    const run = asRecord(bundle.localCore.spectral_library_runs[0]) ?? {};
    const groupItems: RankedBarDatum[] = asRecords(run.band_groups).map((entry, index) => ({
      id: `${asNumber(entry.band_count)}`,
      label: `${asNumber(entry.band_count)} bands`,
      value: asNumber(entry.perplexity),
      detail: `${asNumber(entry.group_count).toLocaleString()} groups`,
      color: subsetPalette[index % subsetPalette.length]
    }));
    return (
      <div className="workspace-grid">
        <SectionCard eyebrow={t("validationStatus")} title={t("validationReadiness")} subtitle={t("subsetRegistryTitle")}>
          <RankedBars items={statusItems} formatter={(value) => value.toFixed(0)} />
        </SectionCard>
        <SectionCard eyebrow={t("validationDiagnostics")} title={t("perplexityByBandGroup")} subtitle="USGS spectral library">
          <ComparisonBars items={groupItems} formatter={(value) => value.toFixed(2)} />
        </SectionCard>
      </div>
    );
  }

  if (subset.family_id === "unlabeled-spectral-image") {
    const row = asRecord(bundle.localCore.unlabeled_scene_runs.find((entry) => subset.dataset_ids.includes(asString(entry.dataset_id)))) ?? {};
    const referenceAlignment = asRecord(row.reference_alignment) ?? {};
    const comparison: RankedBarDatum[] = [
      {
        id: "topic-angle",
        label: "topic alignment",
        value: -asNumber(asRecord(referenceAlignment.topic_alignment)?.matched_angle_deg_mean),
        detail: "mean angle"
      },
      {
        id: "nmf-angle",
        label: "nmf alignment",
        value: -asNumber(asRecord(referenceAlignment.nmf_alignment)?.matched_angle_deg_mean),
        detail: "mean angle"
      },
      {
        id: "nmf-reconstruction",
        label: "nmf reconstruction",
        value: -asNumber(referenceAlignment.nmf_reconstruction_error),
        detail: "lower is better"
      }
    ];
    return (
      <div className="workspace-grid">
        <SectionCard eyebrow={t("validationStatus")} title={t("validationReadiness")} subtitle={subset.id}>
          <RankedBars items={statusItems} formatter={(value) => value.toFixed(0)} />
        </SectionCard>
        <SectionCard eyebrow={t("validationDiagnostics")} title={t("alignmentComparison")} subtitle={asString(referenceAlignment.reference_source)}>
          <ComparisonBars items={comparison} formatter={(value) => Math.abs(value).toFixed(2)} />
        </SectionCard>
      </div>
    );
  }

  if (subset.family_id === "regions-with-measurements") {
    if (hidsagState !== "ready" || !hidsag) {
      return (
        <SectionCard eyebrow={t("validationStatus")} title={t("loadingFamilyD")} subtitle={t("loadingFamilyDHint")}>
          <p>{t("loadingFamilyDHint")}</p>
        </SectionCard>
      );
    }

    const sensitivity = sensitivityRows.find((entry) => asString(entry.subset_code) === selectedCode) ?? sensitivityRows[0];
    const bandRow = bandRows.find((entry) => asString(entry.subset_code) === selectedCode) ?? bandRows[0];
    const classItems: RankedBarDatum[] = asRecords(sensitivity?.classification_policy_ranking).map((entry, index) => ({
      id: asString(entry.policy_id),
      label: prettyLabel(asString(entry.policy_id)),
      value: asNumber(entry.best_balanced_accuracy),
      detail: asString(entry.best_model),
      color: subsetPalette[index % subsetPalette.length]
    }));
    const regItems: RankedBarDatum[] = asRecords(sensitivity?.regression_policy_ranking).map((entry, index) => ({
      id: asString(entry.policy_id),
      label: prettyLabel(asString(entry.policy_id)),
      value: asNumber(entry.best_r2),
      detail: asString(entry.best_model),
      color: subsetPalette[index % subsetPalette.length]
    }));
    const modalityItems: RankedBarDatum[] = asRecords(bandRow?.modalities).map((entry, index) => ({
      id: asString(entry.modality),
      label: prettyLabel(asString(entry.modality)),
      value: asNumber(asRecord(entry.heuristic_policy)?.masked_fraction),
      detail: `${asNumber(asRecord(entry.heuristic_policy)?.masked_band_count).toLocaleString()} masked`,
      color: subsetPalette[index % subsetPalette.length]
    }));

    return (
      <div className="workspace-grid">
        <SectionCard eyebrow={t("hidsagSubsetSelector")} title={selectedCode} subtitle={t("validationReadiness")}>
          <div className="selector-row">
            {sensitivityRows.map((entry) => {
              const code = asString(entry.subset_code);
              return (
                <button
                  key={code}
                  type="button"
                  className={code === selectedCode ? "selector-button is-active" : "selector-button"}
                  onClick={() => setSelectedCode(code)}
                >
                  <strong>{code}</strong>
                  <span>{asNumber(entry.sample_count).toLocaleString()} samples</span>
                </button>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard eyebrow={t("validationDiagnostics")} title={t("classificationPolicyRanking")} subtitle={selectedCode}>
          <ComparisonBars items={classItems} formatter={(value) => value.toFixed(3)} />
        </SectionCard>

        <SectionCard eyebrow={t("validationDiagnostics")} title={t("regressionPolicyRanking")} subtitle={selectedCode}>
          <ComparisonBars items={regItems} formatter={(value) => value.toFixed(3)} />
        </SectionCard>

        <SectionCard eyebrow={t("validationDiagnostics")} title={t("maskedBandFraction")} subtitle={selectedCode}>
          <ComparisonBars items={modalityItems} formatter={(value) => value.toFixed(3)} />
        </SectionCard>
      </div>
    );
  }

  const row = asRecord(bundle.localCore.topic_stability_runs.find((entry) => asString(entry.dataset_id) === "salinas-corrected")) ?? {};
  const items: RankedBarDatum[] = [
    { id: "perplexity-mean", label: "perplexity mean", value: asNumber(row.perplexity_mean) },
    { id: "perplexity-std", label: "perplexity std", value: asNumber(row.perplexity_std) },
    { id: "cosine-mean", label: "matched cosine mean", value: asNumber(row.matched_topic_cosine_mean) },
    { id: "cosine-min", label: "matched cosine min", value: asNumber(row.matched_topic_cosine_min) },
    { id: "jaccard-mean", label: "token jaccard mean", value: asNumber(row.matched_top_token_jaccard_mean) }
  ];

  return (
    <div className="workspace-grid">
      <SectionCard eyebrow={t("validationStatus")} title={t("validationReadiness")} subtitle={subset.id}>
        <RankedBars items={statusItems} formatter={(value) => value.toFixed(0)} />
      </SectionCard>
      <SectionCard eyebrow={t("validationDiagnostics")} title={t("topicStabilitySummary")} subtitle="Salinas corrected">
        <ComparisonBars items={items} formatter={(value) => value.toFixed(3)} />
      </SectionCard>
    </div>
  );
}

function WorkspaceSurface({
  bundle,
  subset,
  activeStep,
  language,
  hidsag,
  hidsagState
}: {
  bundle: ShellData;
  subset: InteractiveSubset;
  activeStep: WorkflowStepId;
  language: Language;
  hidsag: HidsagBundle | null;
  hidsagState: HidsagState;
}) {
  switch (activeStep) {
    case "evidence":
      return <EvidenceView bundle={bundle} subset={subset} language={language} hidsag={hidsag} hidsagState={hidsagState} />;
    case "corpus":
      return <CorpusView bundle={bundle} subset={subset} language={language} hidsag={hidsag} hidsagState={hidsagState} />;
    case "topics":
      return <TopicsView bundle={bundle} subset={subset} language={language} hidsag={hidsag} hidsagState={hidsagState} />;
    case "baselines":
      return <BaselinesView bundle={bundle} subset={subset} language={language} />;
    case "inference":
      return <InferenceView bundle={bundle} subset={subset} hidsagState={hidsagState} />;
    case "validation":
      return <ValidationView bundle={bundle} subset={subset} hidsag={hidsag} hidsagState={hidsagState} />;
    default:
      return null;
  }
}

export function App() {
  const { t, i18n } = useTranslation();
  const [bundle, setBundle] = useState<ShellData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem("caos-lda-hsi-workspace-theme");
    return stored === "light" ? "light" : "dark";
  });
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null);
  const [selectedSubsetId, setSelectedSubsetId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<WorkflowStepId>("evidence");
  const [hidsag, setHidsag] = useState<HidsagBundle | null>(null);
  const [hidsagState, setHidsagState] = useState<HidsagState>("idle");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("caos-lda-hsi-workspace-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    Promise.all([api.getAppData(), api.getInteractiveSubsets(), api.getLocalValidationMatrix(), api.getLocalCoreBenchmarks()])
      .then(([appData, interactiveSubsets, localValidation, localCore]) => {
        if (!active) return;
        setBundle({ appData, interactiveSubsets, localValidation, localCore });
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

  const sortedSubsets = useMemo(
    () =>
      (bundle?.interactiveSubsets.subsets ?? []).slice().sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.title.en.localeCompare(b.title.en)),
    [bundle]
  );

  useEffect(() => {
    if (!bundle || selectedFamilyId) {
      return;
    }
    const first = sortedSubsets[0];
    if (!first) {
      return;
    }
    setSelectedFamilyId(first.family_id);
    setSelectedSubsetId(first.id);
    setSelectedStep(firstEnabledStep(first));
  }, [bundle, selectedFamilyId, sortedSubsets]);

  const activeFamily = bundle?.appData.data_families.families.find((entry) => entry.id === selectedFamilyId) ?? bundle?.appData.data_families.families[0] ?? null;
  const familySubsets = useMemo(
    () =>
      sortedSubsets.filter((entry) => entry.family_id === (selectedFamilyId ?? activeFamily?.id ?? "")).sort(
        (a, b) => statusRank(a.status) - statusRank(b.status) || a.title.en.localeCompare(b.title.en)
      ),
    [activeFamily?.id, selectedFamilyId, sortedSubsets]
  );
  const activeSubset = familySubsets.find((entry) => entry.id === selectedSubsetId) ?? familySubsets[0] ?? null;

  useEffect(() => {
    if (!activeFamily || familySubsets.length === 0) {
      return;
    }
    if (!selectedFamilyId) {
      setSelectedFamilyId(activeFamily.id);
    }
    if (!activeSubset) {
      setSelectedSubsetId(familySubsets[0].id);
      return;
    }
    if (selectedSubsetId !== activeSubset.id) {
      setSelectedSubsetId(activeSubset.id);
    }
  }, [activeFamily, activeSubset, familySubsets, selectedFamilyId, selectedSubsetId]);

  useEffect(() => {
    if (!activeSubset) {
      return;
    }
    const valid = activeSubset.workflow_steps.find((entry) => entry.step === selectedStep)?.status !== "blocked";
    if (!valid) {
      setSelectedStep(firstEnabledStep(activeSubset));
    }
  }, [activeSubset, selectedStep]);

  useEffect(() => {
    if (!activeSubset || activeSubset.family_id !== "regions-with-measurements" || hidsagState !== "idle") {
      return;
    }
    let active = true;
    setHidsagState("loading");
    Promise.all([
      api.getHidsagSubsetInventory(),
      api.getHidsagCuratedSubset(),
      api.getHidsagRegionDocuments(),
      api.getHidsagBandQuality(),
      api.getHidsagPreprocessingSensitivity()
    ])
      .then(([subsetInventory, curatedSubset, regionDocuments, bandQuality, preprocessingSensitivity]) => {
        if (!active) return;
        setHidsag({
          subsetInventory,
          curatedSubset,
          regionDocuments,
          bandQuality,
          preprocessingSensitivity
        });
        setHidsagState("ready");
      })
      .catch(() => {
        if (!active) return;
        setHidsagState("error");
      });
    return () => {
      active = false;
    };
  }, [activeSubset, hidsagState]);

  useEffect(() => {
    if (!bundle || !activeSubset) return;
    document.title = `${bundle.appData.overview.title} - ${pickText(activeSubset.title, language)}`;
  }, [activeSubset, bundle, language]);

  if (error) {
    return (
      <main className="status-screen">
        <div className="status-card">
          <h1>{t("errorTitle")}</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!bundle || !activeFamily || !activeSubset) {
    return (
      <main className="status-screen">
        <div className="status-card">
          <h1>{t("loading")}</h1>
          <p>{t("loadingHint")}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="lab-shell">
      <HeaderBar
        overview={bundle.appData.overview}
        language={language}
        theme={theme}
        onLanguageChange={(next) => void i18n.changeLanguage(next)}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />
      <main className="lab-layout">
        <FamilySidebar
          bundle={bundle}
          subsets={sortedSubsets}
          activeFamilyId={activeFamily.id}
          activeSubsetId={activeSubset.id}
          language={language}
          onFamilyChange={(id) => {
            setSelectedFamilyId(id);
            const nextSubset = sortedSubsets.find((entry) => entry.family_id === id);
            if (nextSubset) {
              setSelectedSubsetId(nextSubset.id);
              setSelectedStep(firstEnabledStep(nextSubset));
            }
          }}
          onSubsetChange={(id) => {
            const nextSubset = sortedSubsets.find((entry) => entry.id === id);
            setSelectedSubsetId(id);
            if (nextSubset) {
              setSelectedStep(firstEnabledStep(nextSubset));
            }
          }}
        />

        <section className="lab-main">
          <div className="lab-main-head">
            <div>
              <p className="lab-eyebrow">{t("workflowSteps")}</p>
              <h2>{pickText(activeSubset.title, language)}</h2>
              <p>{pickText(activeSubset.summary, language)}</p>
            </div>
            <StatusBadge status={activeSubset.status} label={t(`status${prettyLabel(activeSubset.status).replace(/\s/g, "")}`)} />
          </div>
          <StepTabs subset={activeSubset} activeStep={selectedStep} onStepChange={setSelectedStep} />
          <WorkspaceSurface
            key={`${activeSubset.id}-${selectedStep}`}
            bundle={bundle}
            subset={activeSubset}
            activeStep={selectedStep}
            language={language}
            hidsag={hidsag}
            hidsagState={hidsagState}
          />
        </section>

        <InspectorColumn bundle={bundle} subset={activeSubset} family={activeFamily} language={language} />
      </main>
    </div>
  );
}
