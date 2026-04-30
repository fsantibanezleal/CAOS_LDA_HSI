import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DatasetCatalog } from "./components/DatasetCatalog";
import { FieldSamplePanel } from "./components/FieldSamplePanel";
import { Header } from "./components/Header";
import { InferencePanel } from "./components/InferencePanel";
import { RealScenePanel } from "./components/RealScenePanel";
import { SectionNav } from "./components/SectionNav";
import { SpectrumWorkbench } from "./components/SpectrumWorkbench";
import { TheoryPanel } from "./components/TheoryPanel";
import { TopicExplorer } from "./components/TopicExplorer";
import { api, pickText, type AppPayload } from "./lib/api";

export function App() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<AppPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const language = i18n.resolvedLanguage?.startsWith("en") ? "en" : "es";

  useEffect(() => {
    if (data) {
      document.title = `${data.overview.title} - ${pickText(data.overview.tagline, language)}`;
    }
  }, [data, language]);

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

  return (
    <div className="app-shell">
      <Header overview={data.overview} language={language} />

      <main className="page-shell">
        <section className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">{t("heroKicker")}</p>
            <h1>{data.overview.title}</h1>
            <p className="hero-tagline">{pickText(data.overview.tagline, language)}</p>
            <p className="hero-hypothesis">{pickText(data.overview.hypothesis, language)}</p>
          </div>

          <div className="hero-stats">
            {data.overview.hero_stats.map((stat) => (
              <article key={stat.label.en} className="card stat-card">
                <p className="small-label">{pickText(stat.label, language)}</p>
                <div className="stat-value">{stat.value}</div>
                <p>{pickText(stat.detail, language)}</p>
              </article>
            ))}
          </div>
        </section>

        <SectionNav sections={data.overview.sections} language={language} />

        <DatasetCatalog catalog={data.datasets} language={language} />
        <RealScenePanel payload={data.real_scenes} />
        <FieldSamplePanel payload={data.field_samples} />
        <SpectrumWorkbench demo={data.demo} methodology={data.methodology} language={language} />
        <TopicExplorer demo={data.demo} language={language} />
        <InferencePanel demo={data.demo} language={language} />
        <TheoryPanel overview={data.overview} methodology={data.methodology} language={language} />
      </main>

      <footer className="site-footer">
        <span>{t("footerNote")}</span>
        <a href={data.overview.repo.url} target="_blank" rel="noreferrer">
          {t("sourceCode")}
        </a>
      </footer>
    </div>
  );
}
