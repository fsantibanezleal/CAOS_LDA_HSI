import { Suspense, lazy, useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageFallback } from "@/components/PageFallback";
import { CommandPalette } from "@/components/CommandPalette";

const Overview = lazy(() => import("@/pages/Overview"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Methodology = lazy(() => import("@/pages/Methodology"));
const MethodologyIndex = lazy(() => import("@/pages/methodology/Index"));
const MethodologyTheory = lazy(() => import("@/pages/methodology/Theory"));
const MethodologyRepresentations = lazy(
  () => import("@/pages/methodology/Representations"),
);
const MethodologyPipeline = lazy(() => import("@/pages/methodology/Pipeline"));
const MethodologyApplication = lazy(
  () => import("@/pages/methodology/Application"),
);
const Databases = lazy(() => import("@/pages/Databases"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Benchmarks = lazy(() => import("@/pages/Benchmarks"));

export function App() {
  const { i18n } = useTranslation();
  useEffect(() => {
    // Keep `<html lang>` in sync with the active i18n locale so screen
    // readers + browsers announce content in the correct language.
    // Fixes the audit-flagged a11y gap (`<html lang="en">` was stuck
    // regardless of the LanguageToggle state).
    const lang = i18n.resolvedLanguage ?? i18n.language;
    if (lang) document.documentElement.setAttribute("lang", lang);
  }, [i18n, i18n.resolvedLanguage, i18n.language]);
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-fg)" }}
    >
      <Header />
      <CommandPalette />
      <main className="flex-1 w-full">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/methodology" element={<Methodology />}>
              <Route index element={<MethodologyIndex />} />
              <Route path="theory" element={<MethodologyTheory />} />
              <Route
                path="representations"
                element={<MethodologyRepresentations />}
              />
              <Route path="pipeline" element={<MethodologyPipeline />} />
              <Route path="application" element={<MethodologyApplication />} />
            </Route>
            <Route path="/databases" element={<Databases />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/benchmarks" element={<Benchmarks />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
