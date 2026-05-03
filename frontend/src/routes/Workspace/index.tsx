import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { SubTabBar } from "../../components/chrome/SubTabBar";
import {
  api,
  type DataFamiliesPayload,
  type SubsetCard,
  type SubsetCardsIndex,
  type SubsetCardSummary,
  pickText
} from "../../lib/api";
import {
  useStore,
  WORKSPACE_STEPS,
  type WorkspaceStep
} from "../../store/useStore";
import { ComparisonStep } from "./ComparisonStep";
import { CorpusStep } from "./CorpusStep";
import { DataStep } from "./DataStep";
import { InferenceStep } from "./InferenceStep";
import { TopicsStep } from "./TopicsStep";
import { ValidationStep } from "./ValidationStep";

const STEP_LABEL_EN: Record<WorkspaceStep, string> = {
  data: "Data",
  corpus: "Corpus",
  topics: "Topics",
  comparison: "Comparison",
  inference: "Inference",
  validation: "Validation"
};

const STEP_LABEL_ES: Record<WorkspaceStep, string> = {
  data: "Datos",
  corpus: "Corpus",
  topics: "Topicos",
  comparison: "Comparacion",
  inference: "Inferencia",
  validation: "Validacion"
};

export function Workspace() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith("en") ? "en" : "es";

  const selectedFamilyId = useStore((s) => s.selectedFamilyId);
  const setSelectedFamilyId = useStore((s) => s.setSelectedFamilyId);
  const selectedSubsetId = useStore((s) => s.selectedSubsetId);
  const setSelectedSubsetId = useStore((s) => s.setSelectedSubsetId);
  const workspaceStep = useStore((s) => s.workspaceStep);
  const setWorkspaceStep = useStore((s) => s.setWorkspaceStep);
  const selectedRecipeId = useStore((s) => s.selectedRecipeId);
  const setSelectedRecipeId = useStore((s) => s.setSelectedRecipeId);

  const [families, setFamilies] = useState<DataFamiliesPayload | null>(null);
  const [index, setIndex] = useState<SubsetCardsIndex | null>(null);
  const [card, setCard] = useState<SubsetCard | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);

  useEffect(() => {
    void api.getDataFamilies().then(setFamilies);
    void api
      .getSubsetCardsIndex()
      .then((idx) => {
        setIndex(idx);
        setMissing(false);
      })
      .catch(() => {
        setIndex(null);
        setMissing(true);
      });
  }, []);

  useEffect(() => {
    if (!selectedSubsetId) {
      setCard(null);
      return;
    }
    setLoadingCard(true);
    void api
      .getSubsetCard(selectedSubsetId)
      .then((c) => {
        setCard(c);
        if (
          selectedRecipeId === null &&
          c.corpus.length > 0
        ) {
          setSelectedRecipeId(c.corpus[0].recipe_id);
        }
      })
      .catch(() => setCard(null))
      .finally(() => setLoadingCard(false));
  }, [selectedSubsetId, selectedRecipeId, setSelectedRecipeId]);

  const subsetsByFamily = useMemo(() => {
    if (!index) return new Map<string, SubsetCardSummary[]>();
    const map = new Map<string, SubsetCardSummary[]>();
    for (const summary of index.cards) {
      const list = map.get(summary.family_id) ?? [];
      list.push(summary);
      map.set(summary.family_id, list);
    }
    return map;
  }, [index]);

  const familiesWithSubsets = useMemo(() => {
    if (!families || !index) return [];
    return families.families.filter((f) =>
      subsetsByFamily.has(f.id) && (subsetsByFamily.get(f.id)?.length ?? 0) > 0
    );
  }, [families, index, subsetsByFamily]);

  const visibleSubsets = useMemo(() => {
    if (!selectedFamilyId) return [];
    return subsetsByFamily.get(selectedFamilyId) ?? [];
  }, [selectedFamilyId, subsetsByFamily]);

  const stepLabels = language === "en" ? STEP_LABEL_EN : STEP_LABEL_ES;

  const stepStatusById = useMemo(() => {
    const map = new Map<string, string>();
    if (card) {
      for (const entry of card.workflow_steps) {
        map.set(entry.step, entry.status);
      }
    }
    return map;
  }, [card]);

  const renderStep = () => {
    if (!card) return null;
    switch (workspaceStep) {
      case "data":
        return <DataStep card={card} language={language} />;
      case "corpus":
        return (
          <CorpusStep
            card={card}
            language={language}
            selectedRecipeId={selectedRecipeId}
            onRecipeChange={setSelectedRecipeId}
          />
        );
      case "topics":
        return <TopicsStep card={card} language={language} />;
      case "comparison":
        return <ComparisonStep card={card} language={language} />;
      case "inference":
        return <InferenceStep card={card} language={language} />;
      case "validation":
        return <ValidationStep card={card} language={language} />;
      default:
        return null;
    }
  };

  return (
    <section className="workspace section">
      <div>
        <h2 className="section-title">{t("tabWorkspace")}</h2>
        <p className="section-lead">{t("workspaceLead")}</p>
      </div>

      {/* ============= Selection block ============= */}
      <div className="workspace-selection">
        <div className="workspace-selection-step">
          <span className="workspace-step-marker">1</span>
          <div className="workspace-selection-body">
            <span className="workspace-selection-label">
              {language === "en" ? "Pick a family" : "Elige una familia"}
            </span>
            {missing ? (
              <p className="benchmarks-callout">{t("benchmarksMissing")}</p>
            ) : (
              <div className="datasets-family-row">
                {familiesWithSubsets.map((family) => {
                  const supervision = family.supervision_states.join(", ");
                  return (
                    <button
                      key={family.id}
                      type="button"
                      className={
                        family.id === selectedFamilyId
                          ? "family-pill is-active"
                          : "family-pill"
                      }
                      onClick={() => {
                        setSelectedFamilyId(family.id);
                        setSelectedSubsetId(null);
                        setCard(null);
                        setSelectedRecipeId(null);
                      }}
                    >
                      <span className="family-pill-code">Family {family.code}</span>
                      <span className="family-pill-name">
                        {pickText(family.title, language)}
                      </span>
                      <span className="family-pill-supervision">
                        {language === "en" ? "Supervision: " : "Supervision: "}
                        {supervision || (language === "en" ? "none" : "ninguna")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="workspace-selection-step">
          <span className="workspace-step-marker">2</span>
          <div className="workspace-selection-body">
            <span className="workspace-selection-label">
              {language === "en" ? "Pick a subset" : "Elige un subset"}
            </span>
            {!selectedFamilyId ? (
              <p className="workspace-selection-empty">
                {language === "en"
                  ? "Pick a family above first."
                  : "Elige una familia arriba primero."}
              </p>
            ) : visibleSubsets.length === 0 ? (
              <p className="workspace-selection-empty">
                {language === "en"
                  ? "No public subsets available for this family yet."
                  : "Aun no hay subsets publicos para esta familia."}
              </p>
            ) : (
              <div className="workspace-subset-grid">
                {visibleSubsets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={
                      s.id === selectedSubsetId
                        ? "workspace-subset-card is-active"
                        : "workspace-subset-card"
                    }
                    onClick={() => {
                      setSelectedSubsetId(s.id);
                      setSelectedRecipeId(null);
                    }}
                  >
                    <span className="workspace-subset-card-head">
                      <span className={`subset-pill-dot ${s.status}`} aria-hidden />
                      <span className="workspace-subset-status">{s.status}</span>
                    </span>
                    <span className="workspace-subset-card-title">
                      {pickText(s.title, language)}
                    </span>
                    <span className="workspace-subset-card-id">{s.id}</span>
                    <span className="workspace-subset-card-foot">
                      {language === "en" ? "Validated" : "Validado"}{" "}
                      {s.last_validated ?? "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============= Step canvas ============= */}
      {selectedSubsetId && card ? (
        <div className="workspace-canvas">
          <div className="workspace-canvas-head">
            <span className="workspace-canvas-eyebrow">
              {language === "en" ? "Active subset" : "Subset activo"}
            </span>
            <h3 className="workspace-canvas-title">
              {pickText(card.title, language)}
            </h3>
            <p className="workspace-canvas-lead">{pickText(card.summary, language)}</p>
          </div>

          <SubTabBar<WorkspaceStep>
            tabs={WORKSPACE_STEPS.map((s) => {
              const status = stepStatusById.get(s);
              const isBlocked = status === "blocked";
              return {
                id: s,
                label: stepLabels[s],
                status:
                  status === "ready"
                    ? "ready"
                    : status === "prototype"
                      ? "prototype"
                      : status === "blocked"
                        ? "blocked"
                        : null,
                disabled: isBlocked
              };
            })}
            active={workspaceStep}
            onChange={setWorkspaceStep}
          />

          <div className="workspace-step-canvas">
            {loadingCard ? (
              <p className="benchmarks-loading">{t("loading")}</p>
            ) : (
              renderStep()
            )}
          </div>
        </div>
      ) : selectedSubsetId && loadingCard ? (
        <p className="benchmarks-loading">{t("loading")}</p>
      ) : (
        <p className="workspace-selection-empty">
          {language === "en"
            ? "Pick a family and a subset above to start."
            : "Elige una familia y un subset arriba para empezar."}
        </p>
      )}
    </section>
  );
}
