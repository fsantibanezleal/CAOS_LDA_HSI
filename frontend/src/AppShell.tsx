import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Footer } from "./components/chrome/Footer";
import { Header } from "./components/chrome/Header";
import { Benchmarks } from "./routes/Benchmarks";
import { Datasets } from "./routes/Datasets";
import { Landing } from "./routes/Landing";
import { Overview } from "./routes/Overview";
import { Usage } from "./routes/Usage";
import { Workspace } from "./routes/Workspace";
import { useStore, type AppTab } from "./store/useStore";

import "./styles/shell.css";
import "./styles/workspace-shell.css";

const TAB_RENDERERS: Record<AppTab, () => JSX.Element> = {
  landing: () => <Landing />,
  overview: () => <Overview />,
  datasets: () => <Datasets />,
  workspace: () => <Workspace />,
  benchmarks: () => <Benchmarks />,
  usage: () => <Usage />
};

export function AppShell() {
  const { i18n } = useTranslation();
  const language: "en" | "es" = i18n.language.startsWith("en") ? "en" : "es";
  const activeTab = useStore((s) => s.activeTab);

  const handleLanguage = (next: "en" | "es") => {
    void i18n.changeLanguage(next);
  };

  useEffect(() => {
    document.documentElement.setAttribute("lang", language);
  }, [language]);

  const Renderer = TAB_RENDERERS[activeTab];

  return (
    <div className="app">
      <Header language={language} onLanguageChange={handleLanguage} />
      <main className="app-main">
        <Renderer />
      </main>
      <Footer />
    </div>
  );
}
