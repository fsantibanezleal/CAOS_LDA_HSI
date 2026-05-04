import { useEffect, useState } from "react";
import { Header } from "./Header";
import { Project } from "./views/Project";
import { Lab } from "./views/Lab";
import { Methodology } from "./views/Methodology";
import { Reproducibility } from "./views/Reproducibility";

export type Tab = "project" | "lab" | "method" | "repro";

export function App() {
  const [tab, setTab] = useState<Tab>("project");
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem("caos-theme") as "dark" | "light") ?? "dark"
  );
  const [lang, setLang] = useState<"en" | "es">(() =>
    (localStorage.getItem("caos-lang") as "en" | "es") ?? "es"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("caos-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("lang", lang);
    localStorage.setItem("caos-lang", lang);
  }, [lang]);

  return (
    <div className="app">
      <Header
        tab={tab}
        onTab={setTab}
        theme={theme}
        onTheme={setTheme}
        lang={lang}
        onLang={setLang}
      />
      <main className="app-main">
        {tab === "project" && <Project lang={lang} onTab={setTab} />}
        {tab === "lab" && <Lab lang={lang} />}
        {tab === "method" && <Methodology lang={lang} />}
        {tab === "repro" && <Reproducibility lang={lang} />}
      </main>
      <footer className="app-footer">
        CAOS LDA HSI · {new Date().getFullYear()} · Felipe Santibáñez-Leal · MIT-license source on
        <a href="https://github.com/fsantibanezleal/CAOS_LDA_HSI" target="_blank" rel="noreferrer">
          {" "}GitHub
        </a>
      </footer>
    </div>
  );
}
