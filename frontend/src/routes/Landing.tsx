import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ArrowRightIcon } from "../components/chrome/Icons";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";

interface Kpis {
  datasets: number | null;
  subsets: number | null;
  recipes: number | null;
  validationBlocks: number;
}

const VALIDATION_BLOCK_COUNT = 9;

export function Landing() {
  const { t } = useTranslation();
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setOverviewSubTab = useStore((s) => s.setOverviewSubTab);
  const [kpis, setKpis] = useState<Kpis>({
    datasets: null,
    subsets: null,
    recipes: null,
    validationBlocks: VALIDATION_BLOCK_COUNT
  });

  useEffect(() => {
    void Promise.allSettled([
      api
        .getDataFamilies()
        .then((p) =>
          p.families.reduce((count, family) => count + family.current_dataset_ids.length, 0)
        ),
      api.getSubsetCardsIndex().then((idx) => idx.cards.length).catch(() => null),
      api.getInteractiveSubsets().then((p) => p.subsets.length).catch(() => null),
      api.getCorpusRecipes().then((p) => p.recipes.length).catch(() => null)
    ]).then(([datasets, subsetCards, interactiveSubsets, recipes]) => {
      setKpis({
        datasets: datasets.status === "fulfilled" ? datasets.value : null,
        subsets:
          subsetCards.status === "fulfilled" && subsetCards.value !== null
            ? subsetCards.value
            : interactiveSubsets.status === "fulfilled"
              ? interactiveSubsets.value
              : null,
        recipes: recipes.status === "fulfilled" ? recipes.value : null,
        validationBlocks: VALIDATION_BLOCK_COUNT
      });
    });
  }, []);

  return (
    <section className="landing">
      <div className="landing-hero">
        <span className="landing-eyebrow">{t("landingHeroKicker")}</span>
        <h2 className="landing-title">{t("landingHeroTitle")}</h2>
        <p className="landing-lead">{t("landingHeroLead")}</p>
        <div className="landing-cta">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveTab("workspace")}
          >
            {t("landingCtaWorkspace")}
            <ArrowRightIcon size={14} />
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setActiveTab("overview");
              setOverviewSubTab("methodology");
            }}
          >
            {t("landingCtaMethodology")}
          </button>
        </div>
      </div>

      <ul className="kpi-row">
        <li className="kpi">
          <span className="kpi-value">{kpis.datasets ?? "—"}</span>
          <span className="kpi-label">{t("landingKpiDatasets")}</span>
        </li>
        <li className="kpi">
          <span className="kpi-value">{kpis.subsets ?? "—"}</span>
          <span className="kpi-label">{t("landingKpiSubsets")}</span>
        </li>
        <li className="kpi">
          <span className="kpi-value">{kpis.recipes ?? "—"}</span>
          <span className="kpi-label">{t("landingKpiRecipes")}</span>
        </li>
        <li className="kpi">
          <span className="kpi-value">{kpis.validationBlocks}</span>
          <span className="kpi-label">{t("landingKpiBenchmarks")}</span>
        </li>
      </ul>

      <div className="papers-block">
        <h3 className="papers-block-title">{t("landingPapersTitle")}</h3>
        <ul className="papers-list">
          <li>
            <a
              className="paper-item-link"
              href="https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling"
              target="_blank"
              rel="noreferrer"
            >
              {t("landingPaperA39Title")}
            </a>
            <span className="paper-item-meta">
              Procemin Geomet 2022 · Santibañez-Leal, Ehrenfeld, Garrido, Navarro, Egaña
            </span>
          </li>
          <li>
            <a
              className="paper-item-link"
              href="https://doi.org/10.1038/s41597-023-02061-x"
              target="_blank"
              rel="noreferrer"
            >
              {t("landingPaperHidsagTitle")}
            </a>
            <span className="paper-item-meta">
              Scientific Data 10, 154 · 2023 · doi 10.1038/s41597-023-02061-x
            </span>
          </li>
          <li>
            <a
              className="paper-item-link"
              href="https://doi.org/10.3390/min10121139"
              target="_blank"
              rel="noreferrer"
            >
              {t("landingPaperEganaTitle")}
            </a>
            <span className="paper-item-meta">
              Minerals 10(12), 1139 · 2020 · Egaña, Santibañez-Leal et al.
            </span>
          </li>
        </ul>
      </div>

      <p className="landing-footnote">{t("landingFootnote")}</p>
    </section>
  );
}
