import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  api,
  type ExplorationViewsPayload,
  type SubsetCard,
  type SubsetCardsIndex,
  type SubsetCardSummary,
  pickText
} from "../../lib/api";
import { useStore } from "../../store/useStore";
import { SelectionBar } from "./SelectionBar";
import { StepRail } from "./StepRail";
import { ComparisonStep } from "./steps/ComparisonStep";
import { CorpusStep } from "./steps/CorpusStep";
import { DataStep } from "./steps/DataStep";
import { InferenceStep } from "./steps/InferenceStep";
import { TopicsStep } from "./steps/TopicsStep";
import { ValidationStep } from "./steps/ValidationStep";
import { findExplorationScene } from "./workspaceUtils";

export function Workspace() {
  const { t, i18n } = useTranslation();
  const language: "en" | "es" = i18n.language.startsWith("en") ? "en" : "es";
  const selection = useStore((s) => s.selection);
  const setSubset = useStore((s) => s.setSubset);
  const setRecipe = useStore((s) => s.setRecipe);
  const step = useStore((s) => s.workspaceStep);

  const [cardIndex, setCardIndex] = useState<SubsetCardsIndex | null>(null);
  const [card, setCard] = useState<SubsetCard | null>(null);
  const [explorations, setExplorations] = useState<ExplorationViewsPayload | null>(null);
  const [missingCards, setMissingCards] = useState(false);
  const [loadingCard, setLoadingCard] = useState(false);

  useEffect(() => {
    void api
      .getSubsetCardsIndex()
      .then((idx) => {
        setCardIndex(idx);
        setMissingCards(false);
      })
      .catch(() => {
        setCardIndex(null);
        setMissingCards(true);
      });
    void api.getExplorationViews().then(setExplorations).catch(() => setExplorations(null));
  }, []);

  // Auto-select first ready subset on first visit
  useEffect(() => {
    if (selection.subsetId === null && cardIndex && cardIndex.cards.length > 0) {
      const firstReady = cardIndex.cards.find((c) => c.status === "ready") ?? cardIndex.cards[0];
      setSubset(firstReady.id);
    }
  }, [cardIndex, selection.subsetId, setSubset]);

  // Load active card
  useEffect(() => {
    if (!selection.subsetId) {
      setCard(null);
      return;
    }
    setLoadingCard(true);
    void api
      .getSubsetCard(selection.subsetId)
      .then((c) => {
        setCard(c);
        if (selection.recipeId === null && c.corpus.length > 0) {
          setRecipe(c.corpus[0].recipe_id);
        }
      })
      .catch(() => setCard(null))
      .finally(() => setLoadingCard(false));
  }, [selection.subsetId, selection.recipeId, setRecipe]);

  const matchingScene = useMemo(() => findExplorationScene(card, explorations), [card, explorations]);

  const stepStatusById = useMemo(() => {
    const map = new Map<string, string>();
    if (card) {
      for (const entry of card.workflow_steps) {
        map.set(entry.step, entry.status);
      }
    }
    return map;
  }, [card]);

  const subsetSummaries: SubsetCardSummary[] = cardIndex?.cards ?? [];

  return (
    <section className="ws-root">
      <header className="ws-root-head">
        <h2>{t("tabWorkspace")}</h2>
        <p>
          {language === "en"
            ? "Interactive workspace. Pick a subset and a recipe in the bar; every panel reacts. Click topic discs and class chips to pin them; ⌘-click to add to compare."
            : "Workspace interactivo. Elige un subset y receta arriba; cada panel reacciona. Click en discos de tópico y chips de clase para fijarlos; ⌘-click para comparar."}
        </p>
      </header>

      <SelectionBar
        language={language}
        subsetIndex={subsetSummaries}
        card={card}
        scene={matchingScene}
      />

      <div className="ws-shell">
        <StepRail language={language} stepStatusById={stepStatusById} />
        <main className="ws-content">
          {missingCards ? (
            <div className="ws-empty">
              {language === "en"
                ? "Subset cards have not been generated. Run scripts/local.* build-subset-cards."
                : "No se han generado las subset cards. Ejecuta scripts/local.* build-subset-cards."}
            </div>
          ) : !card ? (
            <div className="ws-empty">
              {loadingCard
                ? language === "en"
                  ? "Loading subset…"
                  : "Cargando subset…"
                : language === "en"
                  ? "Pick a subset to start."
                  : "Elige un subset para empezar."}
            </div>
          ) : (
            <>
              <header className="ws-active-card">
                <span className="ws-mini-label">
                  {language === "en" ? "Active subset" : "Subset activo"}
                </span>
                <strong>{pickText(card.title, language)}</strong>
                <span className="ws-mono">{card.id}</span>
                <span className={`ws-status-pill ws-status-${card.status}`}>{card.status}</span>
              </header>
              <div className="ws-step-content">
                {step === "data" && <DataStep card={card} scene={matchingScene} language={language} />}
                {step === "corpus" && <CorpusStep card={card} scene={matchingScene} language={language} />}
                {step === "topics" && <TopicsStep card={card} scene={matchingScene} language={language} />}
                {step === "comparison" && (
                  <ComparisonStep card={card} scene={matchingScene} language={language} />
                )}
                {step === "inference" && <InferenceStep card={card} language={language} />}
                {step === "validation" && <ValidationStep card={card} language={language} />}
              </div>
            </>
          )}
        </main>
      </div>
    </section>
  );
}
