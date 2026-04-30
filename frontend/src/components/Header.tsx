import { useTranslation } from "react-i18next";

import type { ProjectOverview } from "../lib/api";
import { pickText } from "../lib/api";
import { useStore } from "../store/useStore";

interface HeaderProps {
  overview: ProjectOverview;
  language: string;
}

export function Header({ overview, language }: HeaderProps) {
  const { t, i18n } = useTranslation();
  const theme = useStore((state) => state.theme);
  const toggleTheme = useStore((state) => state.toggleTheme);

  return (
    <header className="site-header">
      <div className="brand-block">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <div className="brand-title">{overview.title}</div>
          <div className="brand-tagline">{pickText(overview.tagline, language)}</div>
        </div>
      </div>

      <div className="header-actions">
        <div className="lang-switch" role="group" aria-label="Language switch">
          <button
            className={language.startsWith("es") ? "is-active" : ""}
            onClick={() => void i18n.changeLanguage("es")}
            type="button"
          >
            ES
          </button>
          <button
            className={language.startsWith("en") ? "is-active" : ""}
            onClick={() => void i18n.changeLanguage("en")}
            type="button"
          >
            EN
          </button>
        </div>

        <button className="ghost-button" type="button" onClick={toggleTheme}>
          {theme === "dark" ? t("themeLight") : t("themeDark")}
        </button>

        <a className="ghost-button" href={overview.repo.url} target="_blank" rel="noreferrer">
          {t("sourceCode")}
        </a>
      </div>
    </header>
  );
}
