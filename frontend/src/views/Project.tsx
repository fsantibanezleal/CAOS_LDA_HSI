import { useEffect, useState } from "react";
import type { Tab } from "../App";
import { fetchManifest, type Manifest } from "../api";

const T = {
  es: {
    eyebrow: "Modelado de tópicos en imágenes hiperespectrales",
    title: "Cuando las imágenes hiperespectrales se vuelven texto.",
    lead: "Tratamos cada píxel como un documento, cada banda como una palabra y aplicamos LDA. La pregunta no es si los tópicos predicen mejor que el espectro crudo — pierden por construcción al ser una compresión 6/200 — sino si el espacio de tópicos es una representación intermedia útil. Lo evaluamos en ocho ejes (Addendum B), no con un solo número.",
    cta1: "Entrar al laboratorio",
    cta2: "Leer la metodología",
    findings: "Hallazgos clave",
    f1Title: "θ como puerta gana, θ como feature pierde",
    f1: "El posterior bayesiano sobre escenas etiquetadas (5 métodos × 6 escenas × 5 folds = 150 obs, NUTS jerárquico) coloca topic_routed_soft (μ=+0.737) por delante de raw_logistic (+0.732). theta_logistic queda lejos en +0.408. La crítica del usuario al cycle inicial — \"nunca se modela sobre theta, se usa como compuerta sobre especialistas\" — está validada empíricamente.",
    f2Title: "El \"colapso de KSC\" es artefacto de muestreo, no del dato",
    f2: "El re-fit de LDA sobre todos los píxeles etiquetados de KSC (~5200) recupera tópicos espacialmente coherentes (Moran's I = 0.837 vs 0.064 con la submuestra estratificada 220-por-clase). NMF en la misma matriz submuestreada también obtiene c_v = 0.787. KSC es buena escena; el pipeline canónico mete sesgo.",
    f3Title: "Comparación justa de baselines en cada eje",
    f3: "PCA gana reconstrucción a cada K (es la compresión L2-óptima); ICA-10 gana clasificación lineal directa en todas las 6 escenas etiquetadas; tomotopy_lda gana coherencia c_v en 4 de 6 escenas. La pregunta no es \"qué método gana\" sino \"qué eje pesa más para tu pregunta\".",
    layers: "Capas de evidencia disponibles",
    l1: "39 builders implementados",
    l2: "1118 artefactos derivados, 60 claims permitidos, 65 MB",
    l3: "104 endpoints API en producción",
    l4: "12 recetas de wordificación (V1..V12 del master plan §7)",
    l5: "8 ejes Addendum B operacionalizados (B-1..B-11 + Bayes-labelled + B-10 full-pixel)",
  },
  en: {
    eyebrow: "Topic modelling on hyperspectral imagery",
    title: "When hyperspectral images become text.",
    lead: "We treat each pixel as a document, each band as a word, and apply LDA. The question isn't whether topics predict better than the raw spectrum — they lose by construction as a 6/200 compression — but whether the topic space is a useful intermediate representation. We evaluate it on eight axes (Addendum B), not with a single number.",
    cta1: "Enter the laboratory",
    cta2: "Read the methodology",
    findings: "Key findings",
    f1Title: "θ as a gate wins, θ as a feature loses",
    f1: "Bayesian posterior on labelled scenes (5 methods × 6 scenes × 5 folds = 150 obs, hierarchical NUTS) places topic_routed_soft (μ=+0.737) ahead of raw_logistic (+0.732). theta_logistic trails far behind at +0.408. The user's pushback against the initial cycle — \"you never model on theta, you use it as a gate over specialists\" — is empirically validated.",
    f2Title: "KSC's \"topic collapse\" is a sampling artifact, not a data problem",
    f2: "Refitting LDA on every labelled pixel of KSC (~5200) recovers spatially-coherent topics (Moran's I = 0.837 vs 0.064 under the canonical 220-per-class stratified subsample). NMF on the same subsampled matrix also recovers c_v = 0.787. KSC is fine — the canonical pipeline introduces bias.",
    f3Title: "Fair-baseline comparison per axis",
    f3: "PCA wins reconstruction at every K (it's L2-optimal); ICA-10 wins direct linear classification on all 6 labelled scenes; tomotopy_lda wins c_v coherence on 4 of 6. The question isn't \"which method wins\" but \"which axis matters most for your question\".",
    layers: "Evidence layers available",
    l1: "39 builders implemented",
    l2: "1118 derived artifacts, 60 claims_allowed, 65 MB",
    l3: "104 production API endpoints",
    l4: "12 wordification recipes (V1..V12 from master plan §7)",
    l5: "8 Addendum B axes operationalised (B-1..B-11 + Bayes-labelled + B-10 full-pixel)",
  },
};

export function Project({ lang, onTab }: { lang: "en" | "es"; onTab: (t: Tab) => void }) {
  const [m, setM] = useState<Manifest | null>(null);
  const t = T[lang];
  useEffect(() => {
    void fetchManifest().then(setM).catch(() => setM(null));
  }, []);

  return (
    <div>
      <section className="hero">
        <div>
          <h1>
            <small>{t.eyebrow}</small>
            {t.title}
          </h1>
          <p className="lead">{t.lead}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button
              className="lab-nav primary"
              onClick={() => onTab("lab")}
              style={{ padding: "10px 22px", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer" }}
            >
              {t.cta1} →
            </button>
            <button
              onClick={() => onTab("method")}
              style={{ padding: "10px 18px", background: "var(--bg-soft)", border: "1px solid var(--border-mid)", color: "var(--text-primary)", borderRadius: 8, cursor: "pointer" }}
            >
              {t.cta2}
            </button>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi">
            <div className="label">{lang === "es" ? "artefactos" : "artifacts"}</div>
            <div className="value">{m?.artifact_count ?? "…"}</div>
            <div className="detail">{m?.derived_total_bytes ? `${(m.derived_total_bytes / (1024 * 1024)).toFixed(0)} MB` : ""}</div>
          </div>
          <div className="kpi">
            <div className="label">builders</div>
            <div className="value">{m?.builder_count ?? "…"}</div>
            <div className="detail">{lang === "es" ? "scripts python" : "python scripts"}</div>
          </div>
          <div className="kpi">
            <div className="label">claims</div>
            <div className="value">{m?.claims_allowed_count ?? "…"}</div>
            <div className="detail">{lang === "es" ? "trazables a evidencia" : "traceable to evidence"}</div>
          </div>
          <div className="kpi">
            <div className="label">API</div>
            <div className="value">104</div>
            <div className="detail">{lang === "es" ? "endpoints en producción" : "production endpoints"}</div>
          </div>
        </div>
      </section>

      <h2 style={{ marginTop: 36, marginBottom: 14, fontSize: 18 }}>{t.findings}</h2>
      <div className="col-3">
        <div className="card">
          <h3>{t.f1Title}</h3>
          <p>{t.f1}</p>
        </div>
        <div className="card">
          <h3>{t.f2Title}</h3>
          <p>{t.f2}</p>
        </div>
        <div className="card">
          <h3>{t.f3Title}</h3>
          <p>{t.f3}</p>
        </div>
      </div>

      <h2 style={{ marginTop: 36, marginBottom: 14, fontSize: 18 }}>{t.layers}</h2>
      <ul className="list-clean card" style={{ padding: 0 }}>
        <li>{t.l1}</li>
        <li>{t.l2}</li>
        <li>{t.l3}</li>
        <li>{t.l4}</li>
        <li>{t.l5}</li>
      </ul>
    </div>
  );
}
