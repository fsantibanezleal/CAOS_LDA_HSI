import type { Tab } from "./App";

const NAV_ES: Record<Tab, string> = {
  project: "Proyecto",
  lab: "Laboratorio",
  method: "Metodología",
  repro: "Reproducir",
};
const NAV_EN: Record<Tab, string> = {
  project: "Project",
  lab: "Laboratory",
  method: "Methodology",
  repro: "Reproduce",
};

export function Header({
  tab,
  onTab,
  theme,
  onTheme,
  lang,
  onLang,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  theme: "dark" | "light";
  onTheme: (t: "dark" | "light") => void;
  lang: "en" | "es";
  onLang: (l: "en" | "es") => void;
}) {
  const labels = lang === "es" ? NAV_ES : NAV_EN;
  return (
    <header className="app-header">
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <span className="brand">
          CAOS LDA HSI
          <span className="brand-sub">
            {lang === "es" ? "laboratorio digital" : "digital laboratory"}
          </span>
        </span>
        <nav>
          {(Object.keys(labels) as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => onTab(t)}>
              {labels[t]}
            </button>
          ))}
        </nav>
      </div>
      <div className="right">
        <a className="icon-btn" href="https://github.com/fsantibanezleal/CAOS_LDA_HSI" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <a
          className="icon-btn"
          href="https://www.researchgate.net/publication/369708272_Geometallurgical_estimation_of_mineral_samples_from_hyperspectral_images_and_topic_modelling"
          target="_blank"
          rel="noreferrer"
        >
          Procemin A39
        </a>
        <button className="icon-btn" onClick={() => onLang(lang === "es" ? "en" : "es")}>
          {lang === "es" ? "EN" : "ES"}
        </button>
        <button className="icon-btn" onClick={() => onTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☼" : "☾"}
        </button>
      </div>
    </header>
  );
}
