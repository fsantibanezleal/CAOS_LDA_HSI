import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, type SubsetCardsIndex, pickText } from "../../lib/api";

type StepStatus = "ready" | "prototype" | "blocked";

interface StepCard {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
}

const STEPS_EN: StepCard[] = [
  {
    id: "data",
    title: "Data",
    description:
      "Scene preview, spectral curves, labels and measurements for the selected subset.",
    status: "prototype"
  },
  {
    id: "corpus",
    title: "Corpus",
    description:
      "Recipe selector with alphabet, word and document declarations plus document-length distribution.",
    status: "prototype"
  },
  {
    id: "topics",
    title: "Topics",
    description:
      "Topic-word distributions, document-topic mixtures, multi-seed stability metrics, topic maps.",
    status: "prototype"
  },
  {
    id: "comparison",
    title: "Comparison",
    description:
      "Topic outputs versus SLIC superpixels, KMeans, GMM, SAM reference alignment, NMF unmixing.",
    status: "prototype"
  },
  {
    id: "inference",
    title: "Inference",
    description:
      "Hidden when the subset has no labels or measurements. Otherwise: target selector, splits, baselines, topic-routed metrics.",
    status: "blocked"
  },
  {
    id: "validation",
    title: "Validation",
    description:
      "Per-block status with metrics, caveats, and the supported / blocked claims for the selected subset.",
    status: "prototype"
  }
];

const STEPS_ES: StepCard[] = [
  {
    id: "data",
    title: "Datos",
    description:
      "Preview de la escena, curvas espectrales, etiquetas y mediciones del subset elegido.",
    status: "prototype"
  },
  {
    id: "corpus",
    title: "Corpus",
    description:
      "Selector de receta con declaraciones de alfabeto, palabra y documento, mas distribucion de largo.",
    status: "prototype"
  },
  {
    id: "topics",
    title: "Topicos",
    description:
      "Distribuciones topico-palabra, mezclas documento-topico, estabilidad multi-seed, mapas de topicos.",
    status: "prototype"
  },
  {
    id: "comparison",
    title: "Comparacion",
    description:
      "Salidas de topicos vs SLIC, KMeans, GMM, SAM y NMF unmixing.",
    status: "prototype"
  },
  {
    id: "inference",
    title: "Inferencia",
    description:
      "Oculto si el subset no tiene etiquetas ni mediciones. En caso contrario: targets, splits, baselines y modelos topic-routed.",
    status: "blocked"
  },
  {
    id: "validation",
    title: "Validacion",
    description:
      "Estado por bloque con metricas, caveats y claims soportados o bloqueados para el subset elegido.",
    status: "prototype"
  }
];

const STATUS_LABEL: Record<StepStatus, { en: string; es: string }> = {
  ready: { en: "ready", es: "listo" },
  prototype: { en: "in build", es: "en construccion" },
  blocked: { en: "gated", es: "gateado" }
};

const STATUS_CLASS: Record<StepStatus, string> = {
  ready: "overview-status-active",
  prototype: "overview-status-prototype",
  blocked: "overview-status-research"
};

export function Workspace() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith("en") ? "en" : "es";
  const steps = language === "en" ? STEPS_EN : STEPS_ES;
  const [index, setIndex] = useState<SubsetCardsIndex | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void api
      .getSubsetCardsIndex()
      .then((idx) => {
        setIndex(idx);
        setMissing(false);
      })
      .catch(() => {
        setIndex(null);
        setMissing(true);
      });
  }, []);

  return (
    <section className="workspace-placeholder section">
      <div>
        <h2 className="section-title">{t("tabWorkspace")}</h2>
        <p className="section-lead">{t("workspaceLead")}</p>
      </div>

      {missing ? (
        <p className="benchmarks-callout">{t("benchmarksMissing")}</p>
      ) : (
        <div className="workspace-subset-row">
          {(index?.cards ?? []).map((card) => (
            <span key={card.id} className="subset-pill">
              <span
                className={`subset-pill-dot ${card.status}`}
                aria-hidden="true"
              />
              {pickText(card.title, language)}
            </span>
          ))}
        </div>
      )}

      <div className="workspace-step-board">
        {steps.map((step) => (
          <article key={step.id} className="workspace-step-card">
            <span
              className={`workspace-step-card-status overview-status ${STATUS_CLASS[step.status]}`}
            >
              {STATUS_LABEL[step.status][language]}
            </span>
            <h4>{step.title}</h4>
            <p>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
