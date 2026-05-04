import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PageFallback } from "@/components/PageFallback";

const Overview = lazy(() => import("@/pages/Overview"));
const Methodology = lazy(() => import("@/pages/Methodology"));
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
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-fg)" }}
    >
      <Header />
      <main className="flex-1 w-full">
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/methodology" element={<Methodology />}>
              <Route index element={<Navigate to="theory" replace />} />
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
