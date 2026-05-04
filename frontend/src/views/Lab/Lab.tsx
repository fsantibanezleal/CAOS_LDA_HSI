import { useEffect, useMemo, useState } from "react";
import { LABELLED_SCENES } from "../../api";
import {
  Step1Scene,
  Step2Eda,
  Step3Wordification,
  Step4LdaSweep,
  Step5Intertopic,
  Step6Spectral,
  Step7Spatial,
  Step8External,
  Step9Downstream,
  Step10Bayesian,
  Step11Reconstruction,
  Step12Transfer,
  Step13Stability,
} from "./steps";

const T = {
  es: {
    title: "Laboratorio digital",
    lead: "Flujo guiado paso a paso. Cada paso desbloquea el siguiente; las selecciones que hagas en un paso fijan el contexto para los que siguen. Una visualización rica e interactiva por paso.",
    next: "Siguiente paso →",
    back: "← Anterior",
    of: "de",
  },
  en: {
    title: "Digital Laboratory",
    lead: "Guided step-by-step flow. Each step unlocks the next; selections made upstream pin the context for downstream steps. One rich interactive visualisation per step.",
    next: "Next step →",
    back: "← Back",
    of: "of",
  },
};

export interface FlowState {
  scene: string;
  recipe: string;       // V1..V12
  scheme: string;       // uniform | quantile | lloyd_max
  Q: number;            // 8 | 16 | 32
  K?: number;           // chosen K (default = canonical from existing fit)
  selectedTopic?: number;
  lambda: number;       // LDAvis λ-relevance slider [0, 1]
}

const STEPS: { id: number; key: string; titleEs: string; titleEn: string; subEs: string; subEn: string }[] = [
  { id: 1,  key: "scene",       titleEs: "Elige una escena",                titleEn: "Pick a scene",                subEs: "6 escenas etiquetadas + 5 subsets HIDSAG",       subEn: "6 labelled scenes + 5 HIDSAG subsets" },
  { id: 2,  key: "eda",         titleEs: "Distribución y espectros por clase", titleEn: "Class distribution & mean spectra", subEs: "Imbalance Gini + perfiles 5/25/50/75/95",        subEn: "Imbalance Gini + 5/25/50/75/95 percentile envelopes" },
  { id: 3,  key: "word",        titleEs: "Receta de wordificación",          titleEn: "Wordification recipe",         subEs: "V1..V12 × scheme × Q",                            subEn: "V1..V12 × scheme × Q" },
  { id: 4,  key: "K",           titleEs: "K y barrido perplejidad/coherencia", titleEn: "K & perplexity/coherence sweep", subEs: "K × seed grid + curva NPMI vs perplejidad",       subEn: "K × seed grid + NPMI vs perplexity curves" },
  { id: 5,  key: "intertopic",  titleEs: "Mapa intertópico (LDAvis-faithful)", titleEn: "Intertopic map (LDAvis-faithful)", subEs: "JS-MDS de φ + relevancia λ",                       subEn: "JS-MDS of φ + λ-relevance" },
  { id: 6,  key: "spectral",    titleEs: "Perfil espectral por tópico",      titleEn: "Per-topic spectral profile",   subEs: "Banda × abundancia + clase dominante",            subEn: "Wavelength × abundance + dominant class" },
  { id: 7,  key: "spatial",     titleEs: "Mapa espacial de dominancia",      titleEn: "Spatial dominance map",        subEs: "Raster H×W con leyenda interactiva",              subEn: "H×W raster with interactive legend" },
  { id: 8,  key: "external",    titleEs: "Alineación con USGS splib07 v7",   titleEn: "USGS splib07 v7 alignment",    subEs: "Top-N minerales por tópico + capítulos",          subEn: "Top-N minerals per topic + chapters" },
  { id: 9,  key: "downstream",  titleEs: "Batería downstream",                titleEn: "Downstream battery",           subEs: "linear probe / topic_routed / embedded",          subEn: "linear probe / topic_routed / embedded" },
  { id: 10, key: "bayes",       titleEs: "Posterior bayesiano",              titleEn: "Bayesian posterior",           subEs: "HDI94 forest + dominancia pareada",              subEn: "HDI94 forest + pairwise dominance" },
  { id: 11, key: "recon",       titleEs: "Curva rate-distortion",            titleEn: "Rate-distortion curve",        subEs: "K → RMSE para LDA / NMF / PCA",                   subEn: "K → RMSE for LDA / NMF / PCA" },
  { id: 12, key: "transfer",    titleEs: "Transferencia entre escenas",      titleEn: "Cross-scene transfer",         subEs: "Matriz 5×5 sobre la grilla AVIRIS-1997 común",    subEn: "5×5 matrix over the common AVIRIS-1997 grid" },
  { id: 13, key: "stability",   titleEs: "Estabilidad por seeds",            titleEn: "Per-seed stability",           subEs: "Hungarian-matched cosine 7×7",                    subEn: "Hungarian-matched cosine 7×7" },
];

export function Lab({ lang }: { lang: "en" | "es" }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<FlowState>({
    scene: LABELLED_SCENES[0]!.id,
    recipe: "V1",
    scheme: "uniform",
    Q: 12,
    lambda: 0.6,
  });

  const t = T[lang];

  const update = (patch: Partial<FlowState>) => setState((s) => ({ ...s, ...patch }));

  const step = STEPS[stepIdx]!;
  const titleStr = lang === "es" ? step.titleEs : step.titleEn;
  const subStr = lang === "es" ? step.subEs : step.subEn;

  const view = useMemo(() => {
    switch (step.key) {
      case "scene":      return <Step1Scene  state={state} update={update} lang={lang} />;
      case "eda":        return <Step2Eda    state={state} update={update} lang={lang} />;
      case "word":       return <Step3Wordification state={state} update={update} lang={lang} />;
      case "K":          return <Step4LdaSweep state={state} update={update} lang={lang} />;
      case "intertopic": return <Step5Intertopic state={state} update={update} lang={lang} />;
      case "spectral":   return <Step6Spectral state={state} update={update} lang={lang} />;
      case "spatial":    return <Step7Spatial state={state} update={update} lang={lang} />;
      case "external":   return <Step8External state={state} update={update} lang={lang} />;
      case "downstream": return <Step9Downstream state={state} update={update} lang={lang} />;
      case "bayes":      return <Step10Bayesian state={state} update={update} lang={lang} />;
      case "recon":      return <Step11Reconstruction state={state} update={update} lang={lang} />;
      case "transfer":   return <Step12Transfer state={state} update={update} lang={lang} />;
      case "stability":  return <Step13Stability state={state} update={update} lang={lang} />;
      default: return null;
    }
  }, [step.key, state, lang]);

  // Lock scrolling stage when navigating between steps
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [stepIdx]);

  return (
    <div className="lab">
      <aside className="lab-rail">
        {STEPS.map((s, i) => {
          const isActive = i === stepIdx;
          return (
            <div
              key={s.id}
              className={`step ${isActive ? "active" : ""}`}
              onClick={() => setStepIdx(i)}
            >
              <span className="num">{s.id}</span>
              <span>
                <span className="label">{lang === "es" ? s.titleEs : s.titleEn}</span>
                <span className="sub">{lang === "es" ? s.subEs : s.subEn}</span>
              </span>
            </div>
          );
        })}
      </aside>

      <section className="lab-stage">
        <h2>
          <small>
            {lang === "es" ? "Paso" : "Step"} {stepIdx + 1} {t.of} {STEPS.length}
          </small>
          {titleStr}
        </h2>
        <p className="lead">{subStr}</p>

        {view}

        <div className="lab-nav">
          <button onClick={() => setStepIdx(Math.max(0, stepIdx - 1))} disabled={stepIdx === 0}>
            {t.back}
          </button>
          <button
            className="primary"
            onClick={() => setStepIdx(Math.min(STEPS.length - 1, stepIdx + 1))}
            disabled={stepIdx === STEPS.length - 1}
          >
            {t.next}
          </button>
        </div>
      </section>
    </div>
  );
}
