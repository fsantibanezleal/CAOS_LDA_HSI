import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="app-footer">
      <span>CAOS LDA HSI</span>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <span>{t("footerNote")}</span>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <a
        href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki"
        target="_blank"
        rel="noreferrer"
      >
        Wiki
      </a>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://orcid.org/0000-0002-0150-3246" target="_blank" rel="noreferrer">
        0000-0002-0150-3246
      </a>
    </footer>
  );
}
