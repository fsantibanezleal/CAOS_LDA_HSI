import { useTranslation } from "react-i18next";

import { type AppTab, APP_TABS, useStore } from "../../store/useStore";
import {
  BarsIcon,
  BeakerIcon,
  DatabaseIcon,
  GithubIcon,
  HomeIcon,
  LanguagesIcon,
  LayoutIcon,
  MoonIcon,
  OrcidIcon,
  PaperIcon,
  SunIcon,
  TerminalIcon
} from "./Icons";

const PAPER_URL =
  "https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling";
const ORCID_URL = "https://orcid.org/0000-0002-0150-3246";
const REPO_URL = "https://github.com/fsantibanezleal/CAOS_LDA_HSI";

const TAB_ICON: Record<AppTab, (props: { size?: number }) => JSX.Element> = {
  landing: HomeIcon,
  overview: BeakerIcon,
  datasets: DatabaseIcon,
  workspace: LayoutIcon,
  benchmarks: BarsIcon,
  usage: TerminalIcon
};

const TAB_KEY: Record<AppTab, string> = {
  landing: "tabLanding",
  overview: "tabOverview",
  datasets: "tabDatasets",
  workspace: "tabWorkspace",
  benchmarks: "tabBenchmarks",
  usage: "tabUsage"
};

interface Props {
  language: "en" | "es";
  onLanguageChange: (next: "en" | "es") => void;
}

export function Header({ language, onLanguageChange }: Props) {
  const { t } = useTranslation();
  const theme = useStore((s) => s.theme);
  const toggleTheme = useStore((s) => s.toggleTheme);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const nextLocale = language === "es" ? "en" : "es";

  return (
    <header className="app-header">
      <div className="header-left">
        <span className="header-brand">CAOS LDA HSI</span>
        <nav className="header-nav" aria-label="primary">
          {APP_TABS.map((tab) => {
            const Icon = TAB_ICON[tab];
            return (
              <button
                key={tab}
                type="button"
                className={
                  tab === activeTab ? "header-nav-item is-active" : "header-nav-item"
                }
                onClick={() => setActiveTab(tab)}
              >
                <Icon size={14} />
                {t(TAB_KEY[tab])}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="header-right">
        <button
          type="button"
          className="icon-btn"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? t("themeLight") : t("themeDark")}
          title={theme === "dark" ? t("themeLight") : t("themeDark")}
        >
          {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>

        <button
          type="button"
          className="locale-btn"
          onClick={() => onLanguageChange(nextLocale)}
          aria-label={`Switch to ${nextLocale.toUpperCase()}`}
          title={`Switch to ${nextLocale.toUpperCase()}`}
        >
          <LanguagesIcon size={14} />
          {nextLocale}
        </button>

        <span className="header-divider" aria-hidden="true" />

        <a
          className="header-link-icon"
          href={PAPER_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Procemin 2022 paper"
          title="Procemin 2022 paper"
        >
          <PaperIcon size={16} />
        </a>
        <a
          className="header-link-icon"
          href={ORCID_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="ORCID 0000-0002-0150-3246"
          title="ORCID 0000-0002-0150-3246"
        >
          <OrcidIcon size={16} />
        </a>
        <a
          className="header-link-icon"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub repository"
          title="GitHub repository"
        >
          <GithubIcon size={16} />
        </a>
      </div>
    </header>
  );
}
