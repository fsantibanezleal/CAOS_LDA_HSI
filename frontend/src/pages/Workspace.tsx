import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMachine } from "@xstate/react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { ClassDistributionBar } from "@/components/plots/ClassDistributionBar";
import {
  DominantTopicRaster,
  type PickInfo,
} from "@/components/plots/DominantTopicRaster";
import { IntertopicMap, TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { SpectralBrowser } from "@/components/plots/SpectralBrowser";
import { SpectralByClass } from "@/components/plots/SpectralByClass";
import { StabilityHeatmap } from "@/components/plots/StabilityHeatmap";
import { TopicLabelHeatmap } from "@/components/plots/TopicLabelHeatmap";
import { TopicSpectrum } from "@/components/plots/TopicSpectrum";
import { workspaceMachine } from "@/state/workspaceMachine";
import type { DatasetFamily } from "@/state/useSelectionStore";
import { cn } from "@/lib/cn";

const Scatter3D = lazy(() =>
  import("@/components/plots/Scatter3D").then((m) => ({ default: m.Scatter3D })),
);

const LABELLED_SCENES = new Set([
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
]);

const HIDSAG_SUBSETS = new Set([
  "GEOMET",
  "MINERAL1",
  "MINERAL2",
  "GEOCHEM",
  "PORPHYRY",
  "hidsag-geomet",
  "hidsag-mineral1",
  "hidsag-mineral2",
  "hidsag-geochem",
  "hidsag-porphyry",
]);

function toHidsagSubsetCode(id: string): string {
  if (id.startsWith("hidsag-")) {
    return id.replace("hidsag-", "").toUpperCase();
  }
  return id.toUpperCase();
}

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  "labeled-spectral-image":
    "Cubos hiperespectrales con etiquetas por píxel — los benchmarks canónicos UPV/EHU. Punto de partida natural para clasificación.",
  "individual-spectra":
    "Espectros individuales con identidad de material o referencia (USGS splib07, MicaSense). Sin geometría espacial.",
  "hidsag-mineral":
    "Subsets HIDSAG con mediciones geoquímicas y mineralógicas por muestra. Targets continuos, no clases.",
  "unmixing-roi":
    "Borsoi Samson / Jasper Ridge / Urban — escenas con endmembers y abundancias de referencia para unmixing.",
  default:
    "Familia de datasets disponibles para el flujo del laboratorio.",
};

const STEPS: { id: string; key: keyof Steps; label: string }[] = [
  { id: "family", key: "family", label: "Familia" },
  { id: "subset", key: "subset", label: "Conjunto" },
  { id: "representation", key: "representation", label: "Representación" },
  { id: "explore", key: "explore", label: "Explorar" },
];

type Steps = {
  family: string;
  subset: string;
  representation: string;
  explore: string;
};

export default function Workspace() {
  const { t } = useTranslation(["pages", "common"]);
  const [state, send] = useMachine(workspaceMachine);

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory"],
    queryFn: api.inventory,
  });

  const familyGroups = useMemo(() => {
    if (!data) return [] as { family_id: string; family_title: string; entries: DatasetEntry[] }[];
    const titleByFamily = new Map(
      data.family_views.map((f) => [f.family_id, f.family_title]),
    );
    const grouped = new Map<string, DatasetEntry[]>();
    for (const ds of data.datasets) {
      if (!grouped.has(ds.family_id)) grouped.set(ds.family_id, []);
      grouped.get(ds.family_id)!.push(ds);
    }
    return Array.from(grouped.entries()).map(([fid, entries]) => ({
      family_id: fid,
      family_title: titleByFamily.get(fid) ?? fid,
      entries,
    }));
  }, [data]);

  const currentStepIndex = (() => {
    const v = String(state.value);
    if (v === "pickFamily") return 0;
    if (v === "pickSubset") return 1;
    if (v === "pickRep") return 2;
    return 3;
  })();

  return (
    <PageShell
      title={t("pages:workspace.title")}
      lead={t("pages:workspace.lead")}
    >
      <Stepper currentIndex={currentStepIndex} state={state.value} ctx={state.context} />

      <div className="mt-8">
        {String(state.value) === "pickFamily" && (
          <FamilyPickerStep
            isLoading={isLoading}
            error={error as Error | null}
            groups={familyGroups}
            onPick={(family) =>
              send({ type: "PICK_FAMILY", family: family as DatasetFamily })
            }
          />
        )}

        {String(state.value) === "pickSubset" && (
          <SubsetPickerStep
            family={state.context.family}
            entries={
              familyGroups.find((g) => g.family_id === state.context.family)
                ?.entries ?? []
            }
            onBack={() => send({ type: "BACK" })}
            onPick={(subset) => send({ type: "PICK_SUBSET", subset })}
          />
        )}

        {String(state.value) === "pickRep" && (
          <RepresentationPickerStep
            subsetId={state.context.subset}
            onBack={() => send({ type: "BACK" })}
            onPick={(rep) => send({ type: "PICK_REP", rep: rep as never })}
          />
        )}

        {String(state.value).startsWith("explore") && (
          <ExploreStep
            subsetId={state.context.subset}
            rep={state.context.rep}
            onBack={() => send({ type: "BACK" })}
          />
        )}
      </div>
    </PageShell>
  );
}


function SubsetPickerStep({
  family,
  entries,
  onBack,
  onPick,
}: {
  family: string | null;
  entries: DatasetEntry[];
  onBack: () => void;
  onPick: (subsetId: string) => void;
}) {
  if (!family) return null;

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Conjunto en {family}
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {entries.length} datasets en esta familia ·{" "}
            {entries.filter((e) => e.local_raw_available).length} con raíz
            local
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Cambiar de familia
        </button>
      </header>

      <div className="grid sm:grid-cols-2 gap-4">
        {entries.map((d) => (
          <SubsetCard key={d.id} dataset={d} onPick={() => onPick(d.id)} />
        ))}
      </div>
    </section>
  );
}

type Representation = {
  id: string;
  family: "topic" | "compression" | "unmixing";
  label: string;
  short: string;
  description: string;
  status: "shipped" | "partial" | "preview";
};

const REPRESENTATIONS: Representation[] = [
  {
    id: "lda",
    family: "topic",
    label: "LDA — sklearn online",
    short: "Latent Dirichlet Allocation",
    description:
      "Variational Bayes online (sklearn). Recipe canónica V1 band-frequency, K=12 (o n_classes), priors α=0.45 / η=0.2. La base por defecto del Workspace.",
    status: "shipped",
  },
  {
    id: "lda_sparse",
    family: "topic",
    label: "LDA — sklearn sparse",
    short: "Sparse VB",
    description:
      "Variante VB con priors esparzos (α=0.05). Tópicos más sparsos pero perplexity peor.",
    status: "shipped",
  },
  {
    id: "lda_tomo",
    family: "topic",
    label: "LDA — tomotopy (collapsed Gibbs)",
    short: "tomotopy_lda",
    description:
      "Implementación canónica de LDA vía Gibbs colapsado en C++. Wins c_v en 4 de 6 escenas.",
    status: "shipped",
  },
  {
    id: "hdp",
    family: "topic",
    label: "HDP — tomotopy",
    short: "Hierarchical Dirichlet Process",
    description:
      "K se aprende — el modelo decide cuántos tópicos activos hay. Útil cuando no quieres fijar K.",
    status: "shipped",
  },
  {
    id: "ctm",
    family: "topic",
    label: "CTM — tomotopy",
    short: "Correlated Topic Model",
    description:
      "Permite correlación entre tópicos vía logistic-normal sobre θ. Más lento pero captura co-ocurrencias.",
    status: "shipped",
  },
  {
    id: "prodlda",
    family: "topic",
    label: "ProdLDA — Pyro",
    short: "Neural topic model",
    description:
      "Encoder amortizado + decoder multinomial. Implementación neural, comparable en NPMI a LDA Gibbs.",
    status: "shipped",
  },
  {
    id: "nmf",
    family: "compression",
    label: "NMF",
    short: "Non-negative matrix factorization",
    description:
      "Descomposición no-negativa con factorización β-divergencia=KL. Baseline canónico K-dim contra LDA.",
    status: "shipped",
  },
  {
    id: "pca",
    family: "compression",
    label: "PCA",
    short: "Principal components",
    description:
      "Compresión lineal L2-óptima. Wins reconstruction RMSE en cada K (su único título).",
    status: "shipped",
  },
  {
    id: "ae",
    family: "compression",
    label: "Dense autoencoder",
    short: "MLP AE",
    description:
      "Encoder → bottleneck K → decoder. Baseline neural de la misma dimensión K.",
    status: "shipped",
  },
  {
    id: "endmember",
    family: "unmixing",
    label: "Endmembers (NFINDR + NNLS)",
    short: "Linear unmixing",
    description:
      "K endmembers vía NFINDR (Winter 1999) + abundancias por NNLS con suma-a-uno. Baseline físico contra LDA.",
    status: "shipped",
  },
  {
    id: "ica",
    family: "compression",
    label: "ICA — FastICA",
    short: "Independent components",
    description:
      "Componentes estadísticamente independientes (FastICA). K=8. Baseline complementario a PCA en compresión lineal.",
    status: "shipped",
  },
  {
    id: "cae_1d",
    family: "compression",
    label: "CAE-1D · K=8",
    short: "Conv autoencoder 1D",
    description:
      "Autoencoder convolucional 1D sobre espectro. Encoder Conv1D → bottleneck K=8 → decoder. GPU-trained.",
    status: "shipped",
  },
  {
    id: "cae_2d",
    family: "compression",
    label: "CAE-2D · K=8",
    short: "Conv autoencoder 2D anchor",
    description:
      "CAE 2D sobre parches espaciales-espectrales. Anchor K=8. Captura textura espacial + perfil espectral.",
    status: "shipped",
  },
  {
    id: "cae_3d",
    family: "compression",
    label: "CAE-3D anchor · K=8",
    short: "Conv autoencoder 3D anchor",
    description:
      "CAE 3D sobre cubos (espacial × espectral). Versión anchor (centro del parche). K=8 GPU-trained.",
    status: "shipped",
  },
  {
    id: "cae_3d_full",
    family: "compression",
    label: "CAE-3D full · K=8",
    short: "Conv autoencoder 3D full-patch",
    description:
      "Variante full-patch del CAE-3D — todos los píxeles del parche contribuyen al loss. K=8 GPU-trained.",
    status: "shipped",
  },
  {
    id: "beta_vae",
    family: "compression",
    label: "β-VAE · K=8",
    short: "Variational autoencoder",
    description:
      "VAE con β=2 que regulariza el KL divergence. Latente probabilístico desentrelazado. K=8 GPU-trained.",
    status: "shipped",
  },
];

function RepresentationPickerStep({
  subsetId,
  onBack,
  onPick,
}: {
  subsetId: string | null;
  onBack: () => void;
  onPick: (rep: string) => void;
}) {
  const families: { id: Representation["family"]; label: string }[] = [
    { id: "topic", label: "Modelos de tópicos" },
    { id: "compression", label: "Baselines de compresión K-dim" },
    { id: "unmixing", label: "Baselines físicos (unmixing)" },
  ];

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Representación para{" "}
            <span style={{ color: "var(--color-accent)" }}>{subsetId}</span>
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Tres familias: tópicos (LDA y variantes), compresiones K-dim
            (PCA / NMF / AE) y unmixing físico. Todas operan sobre el
            mismo doc-term matrix de la receta canónica V1 band-frequency.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Cambiar de conjunto
        </button>
      </header>

      <div className="space-y-8">
        {families.map((fam) => (
          <div key={fam.id}>
            <h4
              className="text-sm font-semibold uppercase tracking-wider mb-3"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {fam.label}
            </h4>
            <div className="grid sm:grid-cols-2 gap-3">
              {REPRESENTATIONS.filter((r) => r.family === fam.id).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onPick(r.id)}
                  className="text-left rounded-lg border p-4 transition-all hover:shadow-md"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-panel)",
                    boxShadow: "var(--color-shadow)",
                    color: "var(--color-fg)",
                  }}
                >
                  <header className="flex items-baseline justify-between gap-2 mb-1">
                    <h5 className="text-base font-semibold">{r.label}</h5>
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-mono"
                      style={{
                        backgroundColor: "var(--color-accent-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {r.short}
                    </span>
                  </header>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    {r.description}
                  </p>
                  <div
                    className="mt-3 text-sm font-medium"
                    style={{ color: "var(--color-accent)" }}
                  >
                    Ajuste precalculado disponible →
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

type ExploreTab =
  | "raw"
  | "browser"
  | "topics"
  | "topiclabel"
  | "routed"
  | "raster"
  | "embed3d"
  | "repfit"
  | "unmixing"
  | "interpret"
  | "anomaly"
  | "stability"
  | "deep"
  | "usgs"
  | "metrics";

const TOPIC_FAMILY_REPS = new Set(["lda", "lda_sparse", "lda_tomo", "hdp", "ctm", "prodlda"]);
const REPRESENTATION_ENDPOINT_METHOD: Record<string, string> = {
  pca: "pca_8",
  nmf: "nmf_8",
  ae: "dense_ae_8",
  ica: "ica_8",
  cae_1d: "cae_1d_8",
  cae_2d: "cae_2d_8",
  cae_3d: "cae_3d_8",
  cae_3d_full: "cae_3d_full_8",
  beta_vae: "beta_vae_8",
};
function repToApiMethod(rep: string | null): string | null {
  if (!rep) return null;
  return REPRESENTATION_ENDPOINT_METHOD[rep] ?? null;
}

function ExploreStep({
  subsetId,
  rep,
  onBack,
}: {
  subsetId: string | null;
  rep: string | null;
  onBack: () => void;
}) {
  const { t } = useTranslation(["pages"]);
  const isLabelled = subsetId !== null && LABELLED_SCENES.has(subsetId);
  const isHidsag = subsetId !== null && HIDSAG_SUBSETS.has(subsetId);
  const [tab, setTab] = useState<ExploreTab>("raw");

  const eda = useQuery({
    queryKey: ["eda", subsetId],
    queryFn: () => api.edaPerScene(subsetId!),
    enabled: isLabelled && tab === "raw",
  });

  const topicViews = useQuery({
    queryKey: ["topic-views", subsetId],
    queryFn: () => api.topicViews(subsetId!),
    enabled: isLabelled && tab === "topics",
  });

  const topicToData = useQuery({
    queryKey: ["topic-to-data", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "topiclabel",
  });

  const routed = useQuery({
    queryKey: ["topic-routed", subsetId],
    queryFn: () => api.topicRoutedClassifier(subsetId!),
    enabled: isLabelled && tab === "routed",
  });

  const rasterMeta = useQuery({
    queryKey: ["raster-meta", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "raster",
  });

  const embed3d = useQuery({
    queryKey: ["embed3d", subsetId],
    queryFn: () => api.topicToData(subsetId!),
    enabled: isLabelled && tab === "embed3d",
  });

  const browserMeta = useQuery({
    queryKey: ["browser-meta", subsetId],
    queryFn: () => api.spectralBrowserMeta(subsetId!),
    enabled: isLabelled && tab === "browser",
  });

  const stability = useQuery({
    queryKey: ["topic-stability", subsetId],
    queryFn: () => api.topicStability(subsetId!),
    enabled: isLabelled && tab === "stability",
  });

  const usgs = useQuery({
    queryKey: ["topic-to-usgs", subsetId],
    queryFn: () => api.topicToUsgsV7(subsetId!),
    enabled: isLabelled && tab === "usgs",
  });

  const rateDistortion = useQuery({
    queryKey: ["rate-distortion", subsetId],
    queryFn: () => api.rateDistortionCurve(subsetId!),
    enabled: isLabelled && tab === "metrics",
  });

  const mutualInfo = useQuery({
    queryKey: ["mutual-info", subsetId],
    queryFn: () => api.mutualInformation(subsetId!),
    enabled: isLabelled && tab === "metrics",
  });

  const apiMethod = repToApiMethod(rep);
  const repFit = useQuery({
    queryKey: ["rep-fit", subsetId, apiMethod],
    queryFn: () => api.representation(apiMethod!, subsetId!),
    enabled: isLabelled && tab === "repfit" && !!apiMethod,
  });

  const endmember = useQuery({
    queryKey: ["endmember", subsetId],
    queryFn: () => api.endmemberBaseline(subsetId!),
    enabled: isLabelled && tab === "unmixing",
  });
  const endmemberEda = useQuery({
    queryKey: ["eda", subsetId, "for-endmember"],
    queryFn: () => api.edaPerScene(subsetId!),
    enabled: isLabelled && tab === "unmixing",
  });

  const interpretTopics = useQuery({
    queryKey: ["interpret-topics", subsetId],
    queryFn: () => api.interpretabilityTopicCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });
  const interpretBands = useQuery({
    queryKey: ["interpret-bands", subsetId],
    queryFn: () => api.interpretabilityBandCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });
  const interpretDocs = useQuery({
    queryKey: ["interpret-docs", subsetId],
    queryFn: () => api.interpretabilityDocumentCards(subsetId!),
    enabled: isLabelled && tab === "interpret",
  });

  const topicAnomaly = useQuery({
    queryKey: ["topic-anomaly", subsetId],
    queryFn: () => api.topicAnomaly(subsetId!),
    enabled: isLabelled && tab === "anomaly",
  });
  const deepAnomaly = useQuery({
    queryKey: ["deep-anomaly", subsetId],
    queryFn: () => api.deepAnomaly(subsetId!),
    enabled: isLabelled && tab === "anomaly",
  });

  return (
    <section>
      <header className="flex items-baseline justify-between mb-4 gap-3">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Explorar{" "}
            <span style={{ color: "var(--color-accent)" }}>{subsetId}</span>
            {rep && (
              <span
                className="ml-2 text-sm font-normal"
                style={{ color: "var(--color-fg-faint)" }}
              >
                · representación: {rep}
              </span>
            )}
          </h3>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Dos paneles disponibles: <strong>Cruda</strong> (distribución
            de clases + envolventes espectrales) y{" "}
            <strong>Tópicos</strong> (intertopic distance map LDAvis-faithful
            + perfiles φ_k + top-words por relevance λ). Próximos paneles
            (raster con click-to-inspect, t-SNE 2D/3D, heatmap
            tópico-vs-etiqueta, apply-to-doc) se irán incorporando.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md px-3 py-1.5 text-sm border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          ← Cambiar de representación
        </button>
      </header>

      {!isLabelled && !isHidsag && (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <p style={{ color: "var(--color-fg-subtle)" }}>
            This explorer currently ships rich panels for the six labelled HSI
            scenes (Indian Pines, Salinas, Salinas-A, Pavia U, KSC, Botswana)
            and for the five HIDSAG subsets (GEOMET, MINERAL1, MINERAL2,
            GEOCHEM, PORPHYRY). For the remaining families (unmixing, USGS
            individual spectra) the equivalent panels (endmember abundance
            triangles, library reference cards) are next on the queue.
          </p>
        </div>
      )}

      {isHidsag && !isLabelled && subsetId && (
        <HidsagExploreStep subsetCode={toHidsagSubsetCode(subsetId)} />
      )}

      {isLabelled && (
        <>
          <SceneBriefingHero subsetId={subsetId!} rep={rep} />

          <nav
            role="tablist"
            aria-label="Paneles de exploración"
            className="space-y-2 border-b mb-6 pb-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            {([
              {
                category: t("pages:workspace.tabs.group_raw"),
                color: "rgba(56, 189, 248, 1)",
                tabs: [
                  { id: "raw" as const, label: t("pages:workspace.tabs.raw") },
                  { id: "browser" as const, label: t("pages:workspace.tabs.browser") },
                ],
              },
              {
                category: t("pages:workspace.tabs.group_topics"),
                color: "rgba(40, 160, 80, 1)",
                tabs: [
                  { id: "topics" as const, label: t("pages:workspace.tabs.topics") },
                  { id: "topiclabel" as const, label: t("pages:workspace.tabs.topiclabel") },
                  { id: "routed" as const, label: t("pages:workspace.tabs.routed") },
                  { id: "interpret" as const, label: t("pages:workspace.tabs.interpret") },
                ],
              },
              {
                category: t("pages:workspace.tabs.group_spatial"),
                color: "rgba(170, 60, 200, 1)",
                tabs: [
                  { id: "raster" as const, label: t("pages:workspace.tabs.raster") },
                  { id: "embed3d" as const, label: t("pages:workspace.tabs.embed3d") },
                  { id: "repfit" as const, label: t("pages:workspace.tabs.repfit") },
                ],
              },
              {
                category: t("pages:workspace.tabs.group_diagnostics"),
                color: "rgba(214, 140, 40, 1)",
                tabs: [
                  { id: "stability" as const, label: t("pages:workspace.tabs.stability") },
                  { id: "deep" as const, label: t("pages:workspace.tabs.deep") },
                  { id: "anomaly" as const, label: t("pages:workspace.tabs.anomaly") },
                  { id: "unmixing" as const, label: t("pages:workspace.tabs.unmixing") },
                  { id: "usgs" as const, label: t("pages:workspace.tabs.usgs") },
                  { id: "metrics" as const, label: t("pages:workspace.tabs.metrics") },
                ],
              },
            ] as { category: string; color: string; tabs: { id: ExploreTab; label: string }[] }[]).map((group) => (
              <div key={group.category} className="flex items-baseline flex-wrap gap-2">
                <span
                  className="text-[10px] uppercase tracking-widest font-semibold pr-2 w-32 shrink-0"
                  style={{ color: group.color }}
                >
                  {group.category}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {group.tabs.map((opt) => {
                    const isActive = tab === opt.id;
                    return (
                      <button
                        key={opt.id}
                        role="tab"
                        aria-selected={isActive}
                        type="button"
                        onClick={() => setTab(opt.id)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-[13px] transition-all",
                          isActive ? "font-semibold shadow-sm" : "opacity-80 hover:opacity-100",
                        )}
                        style={{
                          borderColor: isActive ? group.color : "var(--color-border)",
                          backgroundColor: isActive ? "var(--color-accent-soft)" : "var(--color-panel)",
                          color: isActive ? group.color : "var(--color-fg)",
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {tab === "raw" && (
            <RawTab
              isLoading={eda.isLoading}
              error={eda.error as Error | null}
              data={eda.data ?? null}
            />
          )}
          {tab === "topics" && (
            <TopicsTab
              isLoading={topicViews.isLoading}
              error={topicViews.error as Error | null}
              data={topicViews.data ?? null}
            />
          )}
          {tab === "topiclabel" && (
            <TopicLabelTab
              isLoading={topicToData.isLoading}
              error={topicToData.error as Error | null}
              data={topicToData.data ?? null}
            />
          )}
          {tab === "routed" && (
            <RoutedTab
              isLoading={routed.isLoading}
              error={routed.error as Error | null}
              data={routed.data ?? null}
            />
          )}
          {tab === "raster" && (
            <RasterTab
              isLoading={rasterMeta.isLoading}
              error={rasterMeta.error as Error | null}
              meta={rasterMeta.data ?? null}
            />
          )}
          {tab === "embed3d" && (
            <Embed3DTab
              isLoading={embed3d.isLoading}
              error={embed3d.error as Error | null}
              data={embed3d.data ?? null}
            />
          )}
          {tab === "repfit" && (
            <RepresentationFitTab
              rep={rep}
              apiMethod={apiMethod}
              isLoading={repFit.isLoading}
              error={repFit.error as Error | null}
              data={repFit.data ?? null}
            />
          )}
          {tab === "unmixing" && (
            <UnmixingTab
              isLoading={endmember.isLoading || endmemberEda.isLoading}
              error={(endmember.error as Error | null) ?? (endmemberEda.error as Error | null)}
              data={endmember.data ?? null}
              eda={endmemberEda.data ?? null}
            />
          )}
          {tab === "interpret" && (
            <InterpretabilityTab
              isLoading={interpretTopics.isLoading || interpretBands.isLoading || interpretDocs.isLoading}
              error={(interpretTopics.error as Error | null) ?? (interpretBands.error as Error | null) ?? (interpretDocs.error as Error | null)}
              topics={interpretTopics.data ?? null}
              bands={interpretBands.data ?? null}
              docs={interpretDocs.data ?? null}
            />
          )}
          {tab === "anomaly" && (
            <AnomalyTab
              isLoading={topicAnomaly.isLoading || deepAnomaly.isLoading}
              error={(topicAnomaly.error as Error | null) ?? (deepAnomaly.error as Error | null)}
              topic={topicAnomaly.data ?? null}
              deep={deepAnomaly.data ?? null}
            />
          )}
          {tab === "browser" && (
            <SpectralBrowserTab
              isLoading={browserMeta.isLoading}
              error={browserMeta.error as Error | null}
              meta={browserMeta.data ?? null}
            />
          )}
          {tab === "stability" && (
            <StabilityTab
              isLoading={stability.isLoading}
              error={stability.error as Error | null}
              data={stability.data ?? null}
              sceneId={subsetId!}
            />
          )}
          {tab === "deep" && (
            <DeepLatentsTab sceneId={subsetId!} />
          )}
          {tab === "usgs" && (
            <UsgsTab
              isLoading={usgs.isLoading}
              error={usgs.error as Error | null}
              data={usgs.data ?? null}
            />
          )}
          {tab === "metrics" && (
            <MetricsTab
              rateDist={rateDistortion.data ?? null}
              rateDistError={rateDistortion.error as Error | null}
              rateDistLoading={rateDistortion.isLoading}
              mi={mutualInfo.data ?? null}
              miError={mutualInfo.error as Error | null}
              miLoading={mutualInfo.isLoading}
            />
          )}
        </>
      )}
    </section>
  );
}

function RawTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").ScenePerScene | null;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Cargando EDA…</p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>No se pudo cargar EDA.</p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  return (
    <div className="space-y-8">
      <SceneStats data={data} />

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-3"
          style={{ color: "var(--color-fg)" }}
        >
          Distribución de clases
        </h4>
        <ClassDistributionBar classes={data.class_distribution} />
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          Envolventes espectrales por clase
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          La sombra es el rango p25–p75; la línea es la mediana. Click en
          una clase para aislarla, click de nuevo para volver a ver todas.
        </p>
        <SpectralByClass
          wavelengths={data.wavelengths_nm}
          classMeans={data.class_mean_spectra}
          classDistribution={data.class_distribution}
        />
      </div>
    </div>
  );
}

const LAMBDA_VALUES = [0.0, 0.3, 0.5, 0.7, 1.0];

function TopicsTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicViews | null;
}) {
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [lambda, setLambda] = useState<number>(0.5);

  if (isLoading)
    return <p style={{ color: "var(--color-fg-faint)" }}>Cargando tópicos…</p>;
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_views.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const lambdaKey = `lambda_${lambda.toFixed(1)}`;
  const topWords = data.top_words_per_topic[lambdaKey];
  const focused =
    selectedTopic !== null && topWords ? topWords[selectedTopic] : null;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[480px_1fr] gap-5 items-start">
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <h4
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-fg)" }}
          >
            Mapa intertópico (LDAvis · JS-MDS 2D)
          </h4>
          <p
            className="text-sm mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            El área del bubble es proporcional a la prevalencia del tópico
            (mean θ sobre el corpus). Click en un bubble para enfocar.
          </p>
          <IntertopicMap
            coords={data.topic_intertopic_2d_js}
            prevalence={data.topic_prevalence}
            selectedTopic={selectedTopic}
            onSelect={(k) => setSelectedTopic(k === selectedTopic ? null : k)}
          />
        </div>

        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <header className="flex items-baseline justify-between mb-2 gap-3">
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Top-30 palabras —{" "}
              {selectedTopic !== null
                ? `tópico ${selectedTopic + 1}`
                : "selecciona un tópico"}
            </h4>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] uppercase tracking-wider"
                style={{ color: "var(--color-fg-faint)" }}
              >
                relevance λ
              </span>
              <select
                value={lambda}
                onChange={(e) => setLambda(parseFloat(e.target.value))}
                className="rounded-md border px-2 py-1 text-sm"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-fg)",
                }}
              >
                {LAMBDA_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </select>
            </div>
          </header>
          <p
            className="text-[12px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            relevance(w | k) = λ · log P(w | k) + (1 − λ) · log [ P(w | k) /
            P(w) ]. λ=1 ordena por probabilidad sin penalizar palabras
            comunes; λ=0 ordena por lift puro.
          </p>
          {focused ? (
            <ol
              className="grid grid-cols-2 gap-x-4 gap-y-1 list-decimal pl-5 text-[13px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {focused.slice(0, 24).map((w, i) => (
                <li key={i} className="font-mono">
                  {w.token}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: "var(--color-fg-faint)" }}>
              Selecciona un tópico en el mapa de la izquierda.
            </p>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          Perfiles espectrales por tópico (φ_k)
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Una curva por tópico, mismo color que el bubble del mapa. Cuando
          un tópico está seleccionado se resalta y los demás se atenúan.
        </p>
        <TopicSpectrum
          wavelengths={data.wavelengths_nm}
          bandProfiles={data.topic_band_profiles}
          selectedTopic={selectedTopic}
        />
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Selector de tópicos"
        >
          {data.topic_band_profiles.map((_, k) => {
            const isSel = selectedTopic === k;
            const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <button
                key={k}
                type="button"
                onClick={() =>
                  setSelectedTopic(isSel ? null : k)
                }
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel ? "var(--color-fg)" : "var(--color-fg-subtle)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                tópico {k + 1}
                <span
                  className="text-[10.5px] ml-1 opacity-70"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ({(data.topic_prevalence[k] ?? 0).toFixed(2)})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SceneStats({
  data,
}: {
  data: {
    spatial_shape: [number, number];
    n_pixels: number;
    n_labelled_pixels: number;
    n_classes: number;
    imbalance_gini: number;
    sensor: string;
    wavelengths_nm: number[];
  };
}) {
  const stats = [
    {
      label: "Sensor",
      value: data.sensor,
    },
    {
      label: "Forma",
      value: `${data.spatial_shape[0]} × ${data.spatial_shape[1]}`,
    },
    {
      label: "Bandas",
      value: `${data.wavelengths_nm.length} (${Math.round(
        data.wavelengths_nm[0]!,
      )}–${Math.round(data.wavelengths_nm.at(-1)!)} nm)`,
    },
    {
      label: "Píxeles etiquetados",
      value: `${data.n_labelled_pixels.toLocaleString()} / ${data.n_pixels.toLocaleString()}`,
    },
    {
      label: "Clases",
      value: String(data.n_classes),
    },
    {
      label: "Gini desbalance",
      value: data.imbalance_gini.toFixed(3),
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-md border p-3"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-wider"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {s.label}
          </div>
          <div
            className="mt-0.5 text-base font-semibold tracking-tight"
            style={{ color: "var(--color-fg)" }}
          >
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function TopicLabelTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicToData | null;
}) {
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);

  if (isLoading)
    return <p style={{ color: "var(--color-fg-faint)" }}>Cargando matriz tópico–etiqueta…</p>;
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_to_data.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const matrix = data.p_label_given_topic_dominant;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          P(etiqueta | tópico) · asignación dominante
        </h4>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Cada fila es un tópico; las celdas son la fracción de píxeles
          asignados al tópico (por θ dominante) que tienen cada
          etiqueta. La celda con borde es la dominante por fila.
          Click en una fila para resaltarla y ver el detalle abajo.
        </p>
        <div className="overflow-x-auto">
          <TopicLabelHeatmap
            matrix={matrix}
            selectedTopic={selectedTopic}
            onSelectTopic={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
          />
        </div>
      </div>

      <div
        className="grid lg:grid-cols-2 gap-5"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <div
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <h4
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-fg)" }}
          >
            Documentos por tópico (asignación dominante)
          </h4>
          <p
            className="text-[12.5px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cuántos píxeles cae a cada tópico cuando aplicamos arg-max
            sobre θ. La barra muestra el conteo absoluto.
          </p>
          <DocsPerTopicBar
            counts={data.docs_per_topic_dominant}
            selected={selectedTopic}
            onSelect={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
          />
        </div>
        <div
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <h4
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-fg)" }}
          >
            KL(P(label | tópico) ‖ P(label))
          </h4>
          <p
            className="text-[12.5px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Divergencia KL de la distribución de etiquetas dado el tópico
            contra el prior global. Tópicos con alta KL son
            informativos sobre la etiqueta; con KL ≈ 0 son inespecíficos.
          </p>
          <DocsPerTopicBar
            counts={data.kl_to_label_prior_per_topic}
            selected={selectedTopic}
            onSelect={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
            isFloat
          />
        </div>
      </div>

      {selectedTopic !== null && matrix[selectedTopic] && (
        <div
          className="rounded-lg border p-5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <h4
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-fg)" }}
          >
            Detalle del tópico {selectedTopic + 1}
          </h4>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            {[...matrix[selectedTopic]!]
              .sort((a, b) => b.p - a.p)
              .map((c) => (
                <li
                  key={c.label_id}
                  className="flex items-center gap-2"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {(c.p * 100).toFixed(1)}%
                  </span>
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    ({c.count})
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const ROUTED_LABEL: Record<string, string> = {
  raw_logistic: "raw_logistic",
  theta_logistic: "theta_logistic",
  pca_12_logistic: "pca_K_logistic",
  pca_K_logistic: "pca_K_logistic",
  topic_routed_soft: "topic_routed_soft",
  topic_routed_hard: "topic_routed_hard",
};

const ROUTED_DESC: Record<string, string> = {
  raw_logistic: "Logistic regression sobre el espectro crudo (B bandas).",
  theta_logistic: "Logistic regression sobre theta (K dimensiones — control).",
  pca_12_logistic: "Logistic regression sobre PCA-K (control K-dim).",
  pca_K_logistic: "Logistic regression sobre PCA-K (control K-dim).",
  topic_routed_soft:
    "Especialista por tópico sobre el espectro crudo, mezclado por theta (mixture).",
  topic_routed_hard:
    "Especialista por tópico sobre el espectro crudo, asignación dura al tópico dominante.",
};

const ROUTED_COLOR: Record<string, string> = {
  raw_logistic: "#0ea5e9",
  theta_logistic: "#94a3b8",
  pca_12_logistic: "#f97316",
  pca_K_logistic: "#f97316",
  topic_routed_soft: "#22c55e",
  topic_routed_hard: "#a855f7",
};

function RoutedTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicRoutedClassifier | null;
}) {
  if (isLoading)
    return <p style={{ color: "var(--color-fg-faint)" }}>Cargando ranking…</p>;
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_routed_classifier.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const ranking = data.ranking_by_macro_f1_mean;
  // global x-axis range: pad around min/max CI95
  const allCi: number[] = [];
  for (const r of ranking) {
    allCi.push(r.macro_f1_ci95[0], r.macro_f1_ci95[1]);
  }
  const xMin = Math.max(0, Math.min(...allCi) - 0.05);
  const xMax = Math.min(1, Math.max(...allCi) + 0.05);
  const w = 720;
  const labelW = 170;
  const plotW = w - labelW - 40;
  const rowH = 38;
  const h = ranking.length * rowH + 60;
  const xScale = (v: number) =>
    labelW + ((v - xMin) / (xMax - xMin)) * plotW;
  const ticks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) * i) / 4);

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-4">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Ranking macro-F1 (5-fold StratifiedKFold) — esta escena
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            K={data.K} tópicos · {data.n_classes} clases ·{" "}
            {data.n_documents.toLocaleString()} documentos. Cinco métodos
            comparados; el routed_soft es el que la metodología defiende
            (especialista por tópico sobre el espectro crudo, mezclado por
            theta).
          </p>
        </header>
        <svg
          width="100%"
          viewBox={`0 0 ${w} ${h}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Routed classifier ranking forest"
          style={{ color: "var(--color-fg)" }}
        >
          <g
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fontSize="12"
            fill="currentColor"
          >
            {/* Axis */}
            <line
              x1={labelW}
              y1={h - 30}
              x2={labelW + plotW}
              y2={h - 30}
              stroke="currentColor"
              opacity="0.4"
            />
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={xScale(t)}
                  y1={h - 33}
                  x2={xScale(t)}
                  y2={h - 27}
                  stroke="currentColor"
                  opacity="0.4"
                />
                <text
                  x={xScale(t)}
                  y={h - 12}
                  textAnchor="middle"
                  opacity="0.65"
                  fontSize="10.5"
                >
                  {t.toFixed(2)}
                </text>
              </g>
            ))}
            <text
              x={labelW + plotW / 2}
              y={h - 1}
              textAnchor="middle"
              opacity="0.55"
              fontSize="10"
            >
              macro-F1 (mean ± CI95)
            </text>
            {/* Rows */}
            {ranking.map((r, i) => {
              const yMid = i * rowH + 20;
              const color = ROUTED_COLOR[r.method] ?? "var(--color-accent)";
              const lbl = ROUTED_LABEL[r.method] ?? r.method;
              const lo = r.macro_f1_ci95[0];
              const hi = r.macro_f1_ci95[1];
              return (
                <g key={r.method}>
                  <text
                    x={labelW - 8}
                    y={yMid + 4}
                    textAnchor="end"
                    fontFamily="ui-monospace, monospace"
                    fontSize="11.5"
                  >
                    {lbl}
                  </text>
                  <line
                    x1={xScale(lo)}
                    y1={yMid}
                    x2={xScale(hi)}
                    y2={yMid}
                    stroke={color}
                    strokeWidth="2"
                    opacity="0.85"
                  />
                  <line
                    x1={xScale(lo)}
                    y1={yMid - 5}
                    x2={xScale(lo)}
                    y2={yMid + 5}
                    stroke={color}
                    strokeWidth="2"
                  />
                  <line
                    x1={xScale(hi)}
                    y1={yMid - 5}
                    x2={xScale(hi)}
                    y2={yMid + 5}
                    stroke={color}
                    strokeWidth="2"
                  />
                  <circle
                    cx={xScale(r.macro_f1_mean)}
                    cy={yMid}
                    r="4.5"
                    fill={color}
                    stroke="var(--color-bg)"
                    strokeWidth="1"
                  />
                  <text
                    x={xScale(hi) + 6}
                    y={yMid + 4}
                    fontSize="11"
                    opacity="0.85"
                  >
                    {r.macro_f1_mean.toFixed(3)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-3"
          style={{ color: "var(--color-fg)" }}
        >
          Definiciones de método
        </h4>
        <dl className="space-y-2 text-[13px]">
          {ranking.map((r) => (
            <div
              key={r.method}
              className="flex gap-3 items-start"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0 mt-1"
                style={{ backgroundColor: ROUTED_COLOR[r.method] ?? "#0ea5e9" }}
                aria-hidden
              />
              <div className="flex-1">
                <dt
                  className="font-mono text-[12.5px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {ROUTED_LABEL[r.method] ?? r.method}
                </dt>
                <dd
                  className="text-[13px]"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  {ROUTED_DESC[r.method] ?? "—"}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function RasterTab({
  isLoading,
  error,
  meta,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: import("@/api/client").TopicToData | null;
}) {
  const [pick, setPick] = useState<PickInfo | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);

  // Derive served path from the JSON metadata. The pipeline writes a
  // companion .bin in data/derived/topic_to_data/ so the frontend can
  // request it via /generated/topic_to_data/<scene>_dominant_topic_map.bin.
  const buf = useQuery({
    queryKey: ["raster-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/topic_to_data/${meta!.scene_id}_dominant_topic_map.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
  });

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Cargando metadata raster…</p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_to_data.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  const labels =
    selectedTopic !== null
      ? meta.p_label_given_topic_dominant[selectedTopic]
      : null;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Mapa espacial — tópico dominante por píxel
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cada píxel etiquetado se colorea por su tópico dominante
            (arg-max θ_d). Mueve el cursor sobre el raster para inspeccionar
            row/col + tópico; click para fijar la lectura. Selecciona un
            tópico abajo para aislar su huella espacial.
          </p>
        </header>

        <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
          {buf.isLoading && (
            <p style={{ color: "var(--color-fg-faint)" }}>
              Descargando raster ({meta.spatial_shape[0]}×
              {meta.spatial_shape[1]} píxeles)…
            </p>
          )}
          {buf.error && (
            <p style={{ color: "var(--color-warn)" }}>
              No se pudo cargar el raster: {String(buf.error)}
            </p>
          )}
          {buf.data && (
            <DominantTopicRaster
              buffer={buf.data}
              shape={meta.spatial_shape}
              sentinelUnlabelled={255}
              topicCount={meta.topic_count}
              selectedTopic={selectedTopic}
              onPick={(p) => setPick(p)}
            />
          )}

          <div className="space-y-3">
            <div
              className="rounded-md border p-3 text-[13px] leading-relaxed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg-subtle)",
              }}
            >
              <div
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Píxel fijado
              </div>
              {pick ? (
                <div className="font-mono">
                  ({pick.row}, {pick.col}) → tópico{" "}
                  {pick.topic === null ? "—" : pick.topic + 1}
                </div>
              ) : (
                <span style={{ color: "var(--color-fg-faint)" }}>
                  Click cualquier píxel del raster.
                </span>
              )}
            </div>

            <div>
              <div
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Aislar un tópico
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTopic(null)}
                  className="rounded-md border px-2.5 py-1 text-[12px]"
                  style={{
                    borderColor:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    backgroundColor:
                      selectedTopic === null
                        ? "var(--color-accent-soft)"
                        : "var(--color-panel)",
                    color:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-fg-subtle)",
                  }}
                >
                  Todos
                </button>
                {Array.from({ length: meta.topic_count }, (_, k) => {
                  const isSel = selectedTopic === k;
                  const color =
                    TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setSelectedTopic(isSel ? null : k)
                      }
                      className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                      style={{
                        borderColor: isSel
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                        backgroundColor: isSel
                          ? "var(--color-accent-soft)"
                          : "var(--color-panel)",
                        color: isSel
                          ? "var(--color-fg)"
                          : "var(--color-fg-subtle)",
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      tópico {k + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {labels && (
              <div
                className="rounded-md border p-3 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Mezcla de etiquetas — tópico {selectedTopic! + 1}
                </div>
                <ul className="space-y-1">
                  {[...labels]
                    .sort((a, b) => b.p - a.p)
                    .slice(0, 5)
                    .map((l) => (
                      <li
                        key={l.label_id}
                        className="flex items-center gap-2"
                        style={{ color: "var(--color-fg-subtle)" }}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span
                          className="font-mono"
                          style={{ color: "var(--color-fg)" }}
                        >
                          {(l.p * 100).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  lda: "#22c55e",
  nmf: "#0ea5e9",
  pca: "#f97316",
  theta: "#22c55e",
  dense_ae_8: "#a855f7",
  ica_10: "#ec4899",
  nmf_8: "#0ea5e9",
  nmf_20: "#06b6d4",
  pca_3: "#fbbf24",
  pca_10: "#f97316",
  pca_30: "#f59e0b",
};

function MetricsTab({
  rateDist,
  rateDistError,
  rateDistLoading,
  mi,
  miError,
  miLoading,
}: {
  rateDist: import("@/api/client").RateDistortionCurve | null;
  rateDistError: Error | null;
  rateDistLoading: boolean;
  mi: import("@/api/client").MutualInformation | null;
  miError: Error | null;
  miLoading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Curva rate-distortion · LDA / NMF / PCA
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Reconstrucción RMSE en held-out sobre el doc-term matrix para
            K ∈ {`{4, 6, 8, 10, 12, 16}`}. PCA gana porque es el compresor L2-óptimo;
            LDA optimiza una verosimilitud multinomial (no L2). El argumento
            no es "LDA recuestriuye mejor" — sino "LDA da una basis interpretable
            a costo de RMSE".
          </p>
        </header>
        {rateDistLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            Cargando curvas…
          </p>
        )}
        {rateDistError && (
          <p style={{ color: "var(--color-warn)" }}>
            No se pudo cargar /api/rate-distortion-curve.
          </p>
        )}
        {rateDist && <RateDistortionCurveSvg data={rateDist} />}
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Mutual information · MI(latent ; etiqueta)
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cuánta información sobre la etiqueta retiene cada
            representación K-dim (theta vs PCA-K vs NMF-K vs ICA-K vs
            dense-AE-K). Reportado como joint MI clipeado a la entropía
            de la etiqueta y como fracción de entropía recuperada.
          </p>
        </header>
        {miLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            Cargando MI…
          </p>
        )}
        {miError && (
          <p style={{ color: "var(--color-warn)" }}>
            No se pudo cargar /api/mutual-information.
          </p>
        )}
        {mi && <MutualInfoTable data={mi} />}
      </div>
    </div>
  );
}

function RateDistortionCurveSvg({
  data,
}: {
  data: import("@/api/client").RateDistortionCurve;
}) {
  const w = 720;
  const h = 320;
  const padL = 60;
  const padR = 16;
  const padT = 12;
  const padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  let yLo = Infinity;
  let yHi = -Infinity;
  for (const m of Object.values(data.method_curves)) {
    for (const p of m) {
      if (p.rmse_test < yLo) yLo = p.rmse_test;
      if (p.rmse_test > yHi) yHi = p.rmse_test;
    }
  }
  if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
    yLo = 0;
    yHi = 1;
  }
  const pad = (yHi - yLo) * 0.08 || 0.001;
  yLo -= pad;
  yHi += pad;

  const xMin = data.K_grid[0] ?? 4;
  const xMax = data.K_grid[data.K_grid.length - 1] ?? 16;
  const x = (k: number) =>
    padL + ((k - xMin) / (xMax - xMin || 1)) * plotW;
  const y = (v: number) =>
    padT + (1 - (v - yLo) / (yHi - yLo || 1)) * plotH;

  const methods = Object.keys(data.method_curves);

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Rate distortion curves"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="11"
        fill="currentColor"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = yLo + (yHi - yLo) * t;
          return (
            <g key={t}>
              <line
                x1={padL}
                x2={padL + plotW}
                y1={y(v)}
                y2={y(v)}
                stroke="currentColor"
                strokeWidth="0.6"
                opacity="0.18"
              />
              <text
                x={padL - 6}
                y={y(v) + 3}
                textAnchor="end"
                opacity="0.7"
                fontSize="10"
              >
                {v.toFixed(3)}
              </text>
            </g>
          );
        })}
        {data.K_grid.map((k) => (
          <g key={k}>
            <line
              x1={x(k)}
              x2={x(k)}
              y1={padT + plotH}
              y2={padT + plotH + 4}
              stroke="currentColor"
              opacity="0.5"
            />
            <text
              x={x(k)}
              y={padT + plotH + 18}
              textAnchor="middle"
              opacity="0.7"
              fontSize="10"
            >
              {k}
            </text>
          </g>
        ))}
        <text
          x={padL + plotW / 2}
          y={h - 4}
          textAnchor="middle"
          opacity="0.55"
          fontSize="10"
        >
          K (dimensión latente)
        </text>
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90, 12, ${padT + plotH / 2})`}
          opacity="0.55"
          fontSize="10"
        >
          RMSE held-out
        </text>

        {methods.map((m) => {
          const color = METHOD_COLORS[m] ?? "var(--color-accent)";
          const pts = data.method_curves[m]!;
          const path = pts
            .map(
              (p, i) =>
                `${i === 0 ? "M" : "L"} ${x(p.K).toFixed(2)} ${y(p.rmse_test).toFixed(2)}`,
            )
            .join(" ");
          return (
            <g key={m}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2"
                opacity="0.9"
              />
              {pts.map((p, i) => (
                <circle
                  key={i}
                  cx={x(p.K)}
                  cy={y(p.rmse_test)}
                  r="3.5"
                  fill={color}
                  stroke="var(--color-bg)"
                  strokeWidth="1"
                />
              ))}
            </g>
          );
        })}

        {/* legend */}
        {methods.map((m, i) => (
          <g key={`leg-${m}`} transform={`translate(${padL + 16 + i * 80}, ${padT + 12})`}>
            <rect
              width={16}
              height={3}
              y={6}
              fill={METHOD_COLORS[m] ?? "var(--color-accent)"}
            />
            <text x={22} y={11} fontSize="11.5" fontFamily="ui-monospace, monospace">
              {m}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function MutualInfoTable({
  data,
}: {
  data: import("@/api/client").MutualInformation;
}) {
  const ranking = data.ranking_by_joint_mi;
  return (
    <div>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Entropía de etiqueta H(y) = {data.label_entropy_nats.toFixed(3)}{" "}
        nats ({data.label_entropy_bits.toFixed(3)} bits) ·{" "}
        {data.n_documents.toLocaleString()} documentos.
      </p>
      <table
        className="w-full text-[13.5px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <thead>
          <tr
            style={{
              borderBottom: "1px solid var(--color-border)",
              color: "var(--color-fg)",
            }}
          >
            <th className="text-left py-2 pr-4 font-semibold">Método</th>
            <th className="text-right py-2 pr-4 font-semibold">Latent dim</th>
            <th className="text-right py-2 pr-4 font-semibold">Joint MI</th>
            <th className="text-right py-2 font-semibold">% H(y) recuperada</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r) => {
            const color = METHOD_COLORS[r.method] ?? "var(--color-accent)";
            return (
              <tr
                key={r.method}
                style={{ borderBottom: "1px solid var(--color-border)" }}
              >
                <td className="py-2 pr-4 font-mono text-[12.5px] flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {r.method}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {r.latent_dim}
                </td>
                <td className="py-2 pr-4 text-right font-mono">
                  {r.joint_mi_clipped.toFixed(3)}
                </td>
                <td
                  className="py-2 text-right font-mono"
                  style={{ color: "var(--color-fg)" }}
                >
                  {(r.fraction_of_label_entropy_recovered * 100).toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const USGS_CHAPTER_COLOR: Record<string, string> = {
  artificial: "#a855f7",
  coatings: "#ec4899",
  liquids: "#06b6d4",
  minerals: "#f59e0b",
  organics: "#22c55e",
  soils: "#84cc16",
  vegetation: "#10b981",
};

function UsgsTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicToUsgsV7 | null;
}) {
  const [selectedTopic, setSelectedTopic] = useState<number | null>(0);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Cargando topic-to-USGS-v7…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_to_usgs_v7.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const top = selectedTopic !== null ? data.top_n_per_topic[selectedTopic] : null;
  const chapterHist =
    selectedTopic !== null
      ? data.chapter_histogram_top50_per_topic[selectedTopic]
      : null;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Topic ↔ USGS Spectral Library v7
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {data.library_subset} · {data.library_sample_count} espectros en
            7 capítulos. Cada tópico se enmaridada por cosine + SAM contra
            la librería completa; click un tópico abajo para ver sus top
            matches.
          </p>
        </header>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {Array.from({ length: data.topic_count }, (_, k) => {
            const isSel = selectedTopic === k;
            const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedTopic(k)}
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel ? "var(--color-fg)" : "var(--color-fg-subtle)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                tópico {k + 1}
              </button>
            );
          })}
        </div>

        {top && (
          <div className="grid lg:grid-cols-2 gap-5">
            <div>
              <h5
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--color-fg)" }}
              >
                Top 20 — tópico {selectedTopic! + 1}
              </h5>
              <ol
                className="text-[12.5px] space-y-1.5"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                {top.slice(0, 20).map((m) => {
                  const chapColor =
                    USGS_CHAPTER_COLOR[m.chapter] ?? "var(--color-fg-faint)";
                  return (
                    <li
                      key={m.rank}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="shrink-0 w-6 text-right font-mono text-[11px]"
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        #{m.rank + 1}
                      </span>
                      <span
                        aria-hidden
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: chapColor }}
                        title={m.chapter}
                      />
                      <span className="flex-1 truncate font-mono text-[11.5px]">
                        {m.name}
                      </span>
                      <span
                        className="shrink-0 w-14 text-right font-mono"
                        style={{ color: "var(--color-fg)" }}
                      >
                        {m.cosine.toFixed(3)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h5
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--color-fg)" }}
              >
                Capítulos en el top-50
              </h5>
              {chapterHist && Object.keys(chapterHist).length > 0 && (
                <div className="space-y-1.5">
                  {Object.entries(chapterHist)
                    .sort(([, a], [, b]) => b - a)
                    .map(([chap, count]) => {
                      const color =
                        USGS_CHAPTER_COLOR[chap] ?? "var(--color-fg-faint)";
                      return (
                        <div
                          key={chap}
                          className="flex items-center gap-2 text-[13px]"
                          style={{ color: "var(--color-fg-subtle)" }}
                        >
                          <span
                            className="shrink-0 w-24 font-mono text-[12px]"
                            style={{ color: "var(--color-fg)" }}
                          >
                            {chap}
                          </span>
                          <span
                            className="flex-1 h-4 rounded-sm"
                            style={{ backgroundColor: "var(--color-bg)" }}
                          >
                            <span
                              className="block h-full rounded-sm"
                              style={{
                                width: `${(count / 50) * 100}%`,
                                backgroundColor: color,
                                opacity: 0.85,
                              }}
                            />
                          </span>
                          <span
                            className="shrink-0 w-10 text-right font-mono text-[11.5px]"
                            style={{ color: "var(--color-fg)" }}
                          >
                            {count}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
              <p
                className="mt-3 text-[12px]"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Conteo de capítulo entre los 50 espectros más parecidos al
                tópico. {data.library_subset}: {data.library_sample_count}{" "}
                muestras totales en biblioteca, distribuidas como{" "}
                {Object.entries(data.library_chapter_counts)
                  .map(([c, n]) => `${c} ${n}`)
                  .join(", ")}.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DEEP_METHOD_OPTIONS: {
  key: string;
  label: string;
  K: number;
  family: "cae_1d" | "beta_vae" | "cae_2d" | "cae_3d" | "cae_3d_full";
}[] = [
  { key: "cae_1d_4",   label: "CAE-1D K=4",   K: 4,  family: "cae_1d" },
  { key: "cae_1d_8",   label: "CAE-1D K=8",   K: 8,  family: "cae_1d" },
  { key: "cae_1d_16",  label: "CAE-1D K=16",  K: 16, family: "cae_1d" },
  { key: "cae_1d_32",  label: "CAE-1D K=32",  K: 32, family: "cae_1d" },
  { key: "beta_vae_4",  label: "β-VAE K=4 β=4",  K: 4,  family: "beta_vae" },
  { key: "beta_vae_8",  label: "β-VAE K=8 β=4",  K: 8,  family: "beta_vae" },
  { key: "beta_vae_16", label: "β-VAE K=16 β=4", K: 16, family: "beta_vae" },
  { key: "beta_vae_32", label: "β-VAE K=32 β=4", K: 32, family: "beta_vae" },
  { key: "cae_2d_4",   label: "CAE-2D K=4",   K: 4,  family: "cae_2d" },
  { key: "cae_2d_8",   label: "CAE-2D K=8",   K: 8,  family: "cae_2d" },
  { key: "cae_2d_16",  label: "CAE-2D K=16",  K: 16, family: "cae_2d" },
  { key: "cae_2d_32",  label: "CAE-2D K=32",  K: 32, family: "cae_2d" },
  { key: "cae_3d_4",   label: "CAE-3D K=4 (anchor)",   K: 4,  family: "cae_3d" },
  { key: "cae_3d_8",   label: "CAE-3D K=8 (anchor)",   K: 8,  family: "cae_3d" },
  { key: "cae_3d_16",  label: "CAE-3D K=16 (anchor)",  K: 16, family: "cae_3d" },
  { key: "cae_3d_32",  label: "CAE-3D K=32 (anchor)",  K: 32, family: "cae_3d" },
  { key: "cae_3d_full_4", label: "CAE-3D K=4 (full-patch)", K: 4, family: "cae_3d_full" },
  { key: "cae_3d_full_8", label: "CAE-3D K=8 (full-patch)", K: 8, family: "cae_3d_full" },
];

const CLASS_LABEL_COLORS = [
  "#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd",
  "#8c564b","#e377c2","#7f7f7f","#bcbd22","#17becf",
  "#aec7e8","#ffbb78","#98df8a","#ff9896","#c5b0d5",
  "#c49c94",
];

function DeepLatentsTab({ sceneId }: { sceneId: string }) {
  const [methodKey, setMethodKey] = useState("cae_1d_8");
  const q = useQuery({
    queryKey: ["repr", methodKey, sceneId],
    queryFn: () => api.representation(methodKey, sceneId),
    retry: false,
  });

  const data = q.data;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            Deep latents · CAE-1D / CAE-2D / CAE-3D / β-VAE × K
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Pick a deep encoder and latent dimension. Renders the per-document
            latent projected to PCA-2D / 3D, with K-means(latent) ARI vs label
            and per-class silhouette. Capacity-driven scaling shows in the ARI
            number on the top-right.
          </p>
        </header>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
            Method:
          </span>
          {(["cae_1d", "beta_vae", "cae_2d", "cae_3d"] as const).map((fam) => (
            <div key={fam} className="flex items-center gap-1">
              <span
                className="text-[11px] mr-1 font-mono"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {fam === "cae_1d" ? "CAE-1D" :
                 fam === "beta_vae" ? "β-VAE" :
                 fam === "cae_2d" ? "CAE-2D" : "CAE-3D"}
              </span>
              {DEEP_METHOD_OPTIONS.filter((m) => m.family === fam).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMethodKey(m.key)}
                  className="px-2 py-0.5 rounded text-[11px] font-mono"
                  style={{
                    backgroundColor: methodKey === m.key
                      ? "var(--color-accent)"
                      : "var(--color-bg)",
                    color: methodKey === m.key
                      ? "var(--color-bg)"
                      : "var(--color-fg)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  K={m.K}
                </button>
              ))}
            </div>
          ))}
        </div>

        {!data ? (
          <p
            className="mt-4 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {q.isLoading
              ? `Loading ${methodKey} for ${sceneId}…`
              : `No payload for ${methodKey} on ${sceneId}.`}
          </p>
        ) : (
          <DeepLatentsBody data={data} />
        )}
      </div>
    </div>
  );
}

function DeepLatentsBody({
  data,
}: {
  data: import("@/api/client").RepresentationPayload;
}) {
  const scatter = data.scatter_2d_3d_subsample ?? [];
  const xs = scatter.map((p) => p.x_2d);
  const ys = scatter.map((p) => p.y_2d);
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const W = 560;
  const H = 360;
  const padding = 30;
  const xOf = (x: number) =>
    padding + ((x - xmin) / Math.max(1e-9, xmax - xmin)) * (W - 2 * padding);
  const yOf = (y: number) =>
    padding + ((ymax - y) / Math.max(1e-9, ymax - ymin)) * (H - 2 * padding);

  const ari = data.downstream_kmeans_vs_label?.ari;
  const nmi = data.downstream_kmeans_vs_label?.nmi;
  const sil = data.silhouette_label?.overall;
  const recRmse = data.fit_meta.reconstruction_rmse as number | undefined;

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat2 label="latent_dim" value={String(data.latent_dim)} />
        <Stat2
          label="K-means ARI"
          value={ari != null ? ari.toFixed(3) : "—"}
        />
        <Stat2
          label="K-means NMI"
          value={nmi != null ? nmi.toFixed(3) : "—"}
        />
        <Stat2
          label="silhouette"
          value={sil != null ? sil.toFixed(3) : "—"}
        />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Deep latent PCA-2D projection"
        style={{
          backgroundColor: "var(--color-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "6px",
          width: "100%",
          maxWidth: `${W}px`,
        }}
      >
        {scatter.map((p, i) => (
          <circle
            key={i}
            cx={xOf(p.x_2d)}
            cy={yOf(p.y_2d)}
            r="2.4"
            fill={CLASS_LABEL_COLORS[(p.label_id - 1) % CLASS_LABEL_COLORS.length]}
            opacity="0.75"
          />
        ))}
      </svg>

      <p
        className="text-[12px]"
        style={{ color: "var(--color-fg-faint)" }}
      >
        PCA-2D projection of the deep latent · {scatter.length} points,
        coloured by GT class. Reconstruction RMSE
        {recRmse != null ? ` = ${recRmse.toFixed(4)}` : " not in payload"}.
        Architecture: <code className="font-mono text-[11px]">{String(data.fit_meta.architecture ?? "n/a")}</code>.
      </p>
    </div>
  );
}

function Stat2({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border p-2"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[10.5px] mb-1 font-mono uppercase tracking-wide"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="font-mono text-[13px]"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

function KSensitivityPanel({ sceneId }: { sceneId: string }) {
  const offsets = [-2, -1, 0, 1, 2];
  const queries = useQueries({
    queries: offsets.map((o) => ({
      queryKey: ["topic-stability", sceneId, o],
      queryFn: () => api.topicStability(sceneId, o),
      retry: false,
    })),
  });
  const ready = queries.every((q) => q.data || q.error);
  if (!ready) {
    return (
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          Loading K-sensitivity sweep…
        </p>
      </div>
    );
  }
  const values = offsets.map((o, i) => ({
    offset: o,
    K: queries[i]?.data?.K ?? null,
    mean: queries[i]?.data?.scene_stability_summary?.off_diagonal_mean ?? NaN,
    min: queries[i]?.data?.scene_stability_summary?.off_diagonal_min ?? NaN,
    std: queries[i]?.data?.scene_stability_summary?.off_diagonal_std ?? NaN,
  }));

  // Build a small bar chart with K-2..K+2 on x and stability mean on y
  const W = 480;
  const H = 180;
  const padding = 36;
  const bw = (W - 2 * padding) / values.length - 8;
  const allMeans = values.map((v) => v.mean).filter(Number.isFinite);
  const yMin = Math.min(...allMeans, 0.94) - 0.005;
  const yMax = 1.0;

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          K-sensitivity · LDA off-diag at K-2..K+2 around canonical
        </h4>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
          Tests whether the canonical-K choice is a brittle hyperparameter.
          Each bar refits LDA at K = K_canonical + offset and reports the
          off-diag matched-cosine mean across {queries[0]?.data?.seeds?.length ?? "N"} seeds.
          Range across all 6 scenes is ≥ 0.954 — canonical-K is NOT brittle.
        </p>
      </header>
      <svg viewBox={`0 0 ${W} ${H + 30}`} role="img" aria-label="K-sensitivity bars">
        <line x1={padding} y1={H - padding} x2={W - padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        <line x1={padding} y1={padding * 0.5} x2={padding} y2={H - padding} stroke="currentColor" strokeWidth="1" />
        {[yMin, (yMin + yMax) / 2, yMax].map((y, i) => (
          <g key={i}>
            <line
              x1={padding}
              y1={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5)}
              x2={W - padding}
              y2={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5)}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
            <text
              x={padding - 6}
              y={padding * 0.5 + ((yMax - y) / (yMax - yMin)) * (H - padding * 1.5) + 3}
              fontSize="9"
              textAnchor="end"
              fill="currentColor"
              opacity="0.7"
              fontFamily="ui-monospace, monospace"
            >
              {y.toFixed(3)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const x = padding + 4 + i * ((W - 2 * padding) / values.length);
          const yTop = padding * 0.5 + ((yMax - v.mean) / (yMax - yMin)) * (H - padding * 1.5);
          const yBot = H - padding;
          return (
            <g key={v.offset}>
              <title>{`K=${v.K} (offset ${v.offset >= 0 ? "+" : ""}${v.offset}) · mean=${v.mean.toFixed(4)} std=${v.std.toFixed(4)}`}</title>
              <rect
                x={x}
                y={yTop}
                width={bw}
                height={yBot - yTop}
                fill={v.offset === 0 ? "rgba(31,119,180,0.85)" : "rgba(31,119,180,0.45)"}
              />
              <text
                x={x + bw / 2}
                y={H - padding + 14}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
                opacity="0.7"
              >
                K{v.offset >= 0 ? "+" : ""}{v.offset}
              </text>
              <text
                x={x + bw / 2}
                y={yTop - 4}
                fontSize="9"
                textAnchor="middle"
                fill="currentColor"
                fontFamily="ui-monospace, monospace"
              >
                {v.mean.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type LadderMethod =
  | { kind: "lda"; label: "LDA"; key: "lda" }
  | { kind: "deep"; label: string; key: "cae_1d_8" | "beta_vae_8" | "cae_2d_8" | "cae_3d_8" }
  | { kind: "classical"; label: string; key: "pca_8" | "nmf_8" | "ica_8" | "dense_ae_8" };

const LADDER_METHODS: LadderMethod[] = [
  { kind: "classical", label: "PCA",      key: "pca_8" },
  { kind: "classical", label: "ICA",      key: "ica_8" },
  { kind: "lda",       label: "LDA",      key: "lda" },
  { kind: "classical", label: "NMF",      key: "nmf_8" },
  { kind: "deep",      label: "CAE-2D",   key: "cae_2d_8" },
  { kind: "deep",      label: "CAE-1D",   key: "cae_1d_8" },
  { kind: "deep",      label: "CAE-3D",   key: "cae_3d_8" },
  { kind: "classical", label: "dense-AE", key: "dense_ae_8" },
  { kind: "deep",      label: "β-VAE",    key: "beta_vae_8" },
];

function ladderColor(method: LadderMethod): string {
  if (method.kind === "lda") return "rgba(31,119,180,1)";
  if (method.kind === "classical")
    return method.key === "pca_8" || method.key === "ica_8"
      ? "rgba(40,160,80,0.85)"
      : "rgba(255,127,14,0.65)";
  return "rgba(214,39,40,0.65)";
}

function StabilityLadderPanel({
  sceneId,
  nSeeds,
  onSelectMethod,
  selectedKey,
}: {
  sceneId: string;
  nSeeds: 7 | 15;
  onSelectMethod: (m: LadderMethod) => void;
  selectedKey: string;
}) {
  const lda = useQuery({
    queryKey: ["topic-stability", sceneId, 0],
    queryFn: () => api.topicStability(sceneId, 0),
  });
  const deepQs = useQueries({
    queries: LADDER_METHODS.filter((m) => m.kind === "deep").map((m) => ({
      queryKey: ["deep-seed-stability", sceneId, m.key, nSeeds],
      queryFn: () =>
        api.deepSeedStability(sceneId, m.key as "cae_1d_8", nSeeds),
      retry: false,
    })),
  });
  const classQs = useQueries({
    queries: LADDER_METHODS.filter((m) => m.kind === "classical").map((m) => ({
      queryKey: ["classical-seed-stability", sceneId, m.key, nSeeds],
      queryFn: () =>
        api.classicalSeedStability(sceneId, m.key as "pca_8", nSeeds),
      retry: false,
    })),
  });

  const ldaMean = lda.data?.scene_stability_summary?.off_diagonal_mean;
  const ldaStd = lda.data?.scene_stability_summary?.off_diagonal_std;

  const methodValue = (m: LadderMethod): { mean: number; std: number } | null => {
    if (m.kind === "lda")
      return ldaMean != null && ldaStd != null
        ? { mean: ldaMean, std: ldaStd }
        : null;
    if (m.kind === "deep") {
      const idx = LADDER_METHODS.filter((x) => x.kind === "deep").findIndex(
        (x) => x.key === m.key,
      );
      const d = deepQs[idx]?.data;
      if (!d) return null;
      return {
        mean: d.off_diagonal_summary.ari_mean,
        std: d.off_diagonal_summary.ari_std,
      };
    }
    const idx = LADDER_METHODS.filter((x) => x.kind === "classical").findIndex(
      (x) => x.key === m.key,
    );
    const d = classQs[idx]?.data;
    if (!d) return null;
    return {
      mean: d.off_diagonal_summary.ari_mean,
      std: d.off_diagonal_summary.ari_std,
    };
  };

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          Stability ladder · 9 methods at K=8 (this scene, N={nSeeds} seeds)
        </h4>
        <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
          Off-diagonal cluster ARI (LDA: Hungarian-matched cosine on φ) across
          {" "}{nSeeds}{" "}initialisations. Higher = the representation is more
          reproducible. Click a row to inspect the seed-pair matrix below.
        </p>
      </header>

      <div className="space-y-1">
        {LADDER_METHODS.map((m) => {
          const v = methodValue(m);
          const sel = selectedKey === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onSelectMethod(m)}
              className="flex items-center gap-3 text-[13px] w-full text-left rounded px-2 py-1 transition-colors"
              style={{
                backgroundColor: sel ? "var(--color-bg)" : "transparent",
                color: "var(--color-fg-subtle)",
                outline: sel ? "1px solid var(--color-accent)" : "none",
              }}
            >
              <span className="shrink-0 w-24 font-mono" style={{ color: "var(--color-fg)" }}>
                {m.label}
              </span>
              <span
                className="flex-1 h-4 rounded-sm relative overflow-hidden"
                style={{ backgroundColor: "var(--color-bg)" }}
              >
                {v ? (
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${v.mean * 100}%`,
                      backgroundColor: ladderColor(m),
                    }}
                  />
                ) : null}
              </span>
              <span className="shrink-0 w-16 text-right font-mono text-[11.5px]" style={{ color: "var(--color-fg)" }}>
                {v ? v.mean.toFixed(3) : "—"}
              </span>
              <span className="shrink-0 w-14 text-right font-mono text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
                {v ? `±${v.std.toFixed(3)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>
        Blue = LDA (project canonical). Green = deterministic classical (PCA, ICA = 1.000).
        Orange = stochastic classical (NMF, dense-AE). Red = deep encoders (CAE family + β-VAE).
      </p>
    </div>
  );
}

function StabilityMatrixView({
  matrix,
  seeds,
  title,
  subtitle,
}: {
  matrix: number[][];
  seeds: number[] | string[];
  title: string;
  subtitle?: string;
}) {
  const n = matrix.length;
  const cell = 28;
  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-3">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {title}
        </h4>
        {subtitle ? (
          <p className="text-sm mt-1" style={{ color: "var(--color-fg-faint)" }}>
            {subtitle}
          </p>
        ) : null}
      </header>
      <svg
        viewBox={`0 0 ${n * cell + 60} ${n * cell + 30}`}
        role="img"
        aria-label={title}
        style={{ maxWidth: "min(100%, 520px)" }}
      >
        {matrix.map((row, i) =>
          row.map((v, j) => {
            const x = j * cell + 50;
            const y = i * cell + 8;
            const intensity = Math.max(0, Math.min(1, v));
            const r = Math.round(50 + (1 - intensity) * 200);
            const g = Math.round(50 + intensity * 130);
            const b = Math.round(80 + intensity * 100);
            return (
              <g key={`${i}-${j}`}>
                <title>{`(seed ${i}, seed ${j}) = ${v.toFixed(4)}`}</title>
                <rect
                  x={x}
                  y={y}
                  width={cell - 1}
                  height={cell - 1}
                  fill={`rgb(${r},${g},${b})`}
                />
                {n <= 10 ? (
                  <text
                    x={x + (cell - 1) / 2}
                    y={y + (cell - 1) / 2 + 3}
                    fontSize="9"
                    textAnchor="middle"
                    fill={intensity > 0.4 ? "white" : "currentColor"}
                  >
                    {v.toFixed(2)}
                  </text>
                ) : null}
              </g>
            );
          }),
        )}
        {seeds.map((s, i) => (
          <text
            key={`row-${i}`}
            x={45}
            y={i * cell + 8 + (cell - 1) / 2 + 4}
            fontSize="10"
            textAnchor="end"
            fill="currentColor"
            opacity="0.7"
          >
            {String(s)}
          </text>
        ))}
        {seeds.map((s, j) => (
          <text
            key={`col-${j}`}
            x={j * cell + 50 + (cell - 1) / 2}
            y={n * cell + 22}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            {String(s)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function StabilityTab({
  isLoading,
  error,
  data,
  sceneId,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicStability | null;
  sceneId: string;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Cargando estabilidad…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar topic_stability.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const sceneSum = data.scene_stability_summary;
  const perTopic = data.per_topic_stability_summary;

  return (
    <StabilityTabBody
      data={data}
      sceneSum={sceneSum}
      perTopic={perTopic}
      sceneId={sceneId}
    />
  );
}

function StabilityTabBody({
  data,
  sceneSum,
  perTopic,
  sceneId,
}: {
  data: import("@/api/client").TopicStability;
  sceneSum: import("@/api/client").TopicStability["scene_stability_summary"];
  perTopic: import("@/api/client").TopicStability["per_topic_stability_summary"];
  sceneId: string;
}) {
  const [selected, setSelected] = useState<LadderMethod>(LADDER_METHODS[2]!);
  const [nSeeds, setNSeeds] = useState<7 | 15>(7);

  const deepData = useQuery({
    queryKey: ["deep-seed-stability", sceneId, selected.key, nSeeds],
    queryFn: () =>
      api.deepSeedStability(sceneId, selected.key as "cae_1d_8", nSeeds),
    enabled: selected.kind === "deep",
    retry: false,
  });
  const classData = useQuery({
    queryKey: ["classical-seed-stability", sceneId, selected.key, nSeeds],
    queryFn: () =>
      api.classicalSeedStability(sceneId, selected.key as "pca_8", nSeeds),
    enabled: selected.kind === "classical",
    retry: false,
  });

  const matrixView = (() => {
    if (selected.kind === "lda") {
      return (
        <StabilityMatrixView
          title={`LDA · matched-cosine · ${data.seeds.length} seeds`}
          subtitle="Hungarian-matched cosine between φ vectors across seed pairs."
          matrix={data.seed_pair_matched_cosine_mean}
          seeds={data.seeds}
        />
      );
    }
    const live =
      selected.kind === "deep" ? deepData.data : classData.data;
    if (!live) {
      return (
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          Loading {selected.label} stability matrix at N={nSeeds}…
        </p>
      );
    }
    return (
      <StabilityMatrixView
        title={`${selected.label} · pairwise cluster ARI · ${live.n_seeds} seeds`}
        subtitle="K-means(latent) ARI between every seed pair. Diagonal = 1 (auto-match)."
        matrix={live.seed_pair_ari}
        seeds={Array.from({ length: live.n_seeds }, (_, i) => i)}
      />
    );
  })();

  return (
    <div className="space-y-6">
      <StabilityLadderPanel
        sceneId={sceneId}
        nSeeds={nSeeds}
        onSelectMethod={(m) => setSelected(m)}
        selectedKey={selected.key}
      />

      <div className="flex items-center gap-3 text-[13px]" style={{ color: "var(--color-fg-subtle)" }}>
        <span>Seed budget:</span>
        {[7, 15].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setNSeeds(n as 7 | 15)}
            className="px-3 py-1 rounded font-mono text-[12px]"
            style={{
              backgroundColor: nSeeds === n ? "var(--color-accent)" : "var(--color-panel)",
              color: nSeeds === n ? "var(--color-bg)" : "var(--color-fg)",
              border: "1px solid var(--color-border)",
            }}
          >
            N={n}
          </button>
        ))}
        <span style={{ color: "var(--color-fg-faint)" }}>
          (LDA above is canonical N={data.seeds.length}; the toggle drives the deep / classical matrix below.)
        </span>
      </div>

      {matrixView}

      <KSensitivityPanel sceneId={sceneId} />

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            LDA detail · matched-cosine · {data.seeds.length} seeds
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cada par de seeds (i, j) reporta la similitud Hungarian-matched
            cosine entre las K={data.K} firmas tópicas φ ajustadas con el
            mismo corpus pero distinta semilla. Diagonal = 1 (auto-match).
            La estabilidad real está en las celdas off-diagonal.
          </p>
        </header>

        <div
          className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <SceneStabilityStat
            label="Off-diagonal mean"
            value={sceneSum.off_diagonal_mean.toFixed(4)}
          />
          <SceneStabilityStat
            label="Off-diagonal min"
            value={sceneSum.off_diagonal_min.toFixed(4)}
          />
          <SceneStabilityStat
            label="Off-diagonal std"
            value={sceneSum.off_diagonal_std.toFixed(4)}
          />
        </div>

        <StabilityHeatmap
          matrix={data.seed_pair_matched_cosine_mean}
          seeds={data.seeds}
        />
      </div>

      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-2"
          style={{ color: "var(--color-fg)" }}
        >
          Estabilidad por tópico · matched-cosine vs seed 0
        </h4>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Para cada tópico, la mediana y mínimo del Hungarian-matched cosine
          contra el ajuste de seed 0 a través de los demás seeds.
          Tópicos cerca de 1.0 son robustos; los más bajos son los que la
          inicialización aleatoria aún logra perturbar.
        </p>
        <div className="space-y-1.5">
          {perTopic.map((t) => {
            const color =
              TOPIC_COLORS[(t.topic_id - 1) % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <div
                key={t.topic_id}
                className="flex items-center gap-3 text-[13px]"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <span
                  className="shrink-0 w-20 font-mono"
                  style={{ color: "var(--color-fg)" }}
                >
                  tópico {t.topic_id}
                </span>
                <span
                  className="flex-1 h-4 rounded-sm relative overflow-hidden"
                  style={{ backgroundColor: "var(--color-bg)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${t.median_matched_cosine_vs_seed0 * 100}%`,
                      backgroundColor: color,
                      opacity: 0.85,
                    }}
                  />
                  <span
                    className="absolute inset-y-0 left-0 border-r-2"
                    style={{
                      width: `${t.min_matched_cosine_vs_seed0 * 100}%`,
                      borderColor: "var(--color-fg)",
                      opacity: 0.55,
                    }}
                  />
                </span>
                <span
                  className="shrink-0 w-16 text-right font-mono text-[11.5px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  {t.median_matched_cosine_vs_seed0.toFixed(3)}
                </span>
                <span
                  className="shrink-0 w-12 text-right font-mono text-[11px]"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ±{t.std_matched_cosine_vs_seed0.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
        <p
          className="mt-4 text-[12px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Barra coloreada = mediana; línea vertical interna = mínimo.
        </p>
      </div>
    </div>
  );
}

function SceneStabilityStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-base font-semibold tracking-tight font-mono"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SpectralBrowserTab({
  isLoading,
  error,
  meta,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: import("@/api/client").SpectralBrowserMeta | null;
}) {
  const [isolatedLabel, setIsolatedLabel] = useState<number | null>(null);
  const [maxLines, setMaxLines] = useState<number>(2000);

  const buf = useQuery({
    queryKey: ["browser-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/spectral_browser/${meta!.scene_id}/spectra.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const spectra = useMemo(() => {
    if (!buf.data) return null;
    return new Float32Array(buf.data);
  }, [buf.data]);

  const labels = useMemo(() => {
    if (!meta) return [];
    const seen = new Map<number, { label_id: number; name: string; color: string; count: number }>();
    for (const r of meta.rows) {
      const e = seen.get(r.label_id);
      if (e) {
        e.count += 1;
      } else {
        seen.set(r.label_id, {
          label_id: r.label_id,
          name: r.label_name,
          color: r.color,
          count: 1,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.count - a.count);
  }, [meta]);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Cargando metadata del browser…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar /api/spectral-browser.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  return (
    <div className="space-y-4">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Browser espectral · {meta.N.toLocaleString()} espectros muestreados
            </h4>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Cada línea es un píxel real (no un promedio); muestreo{" "}
              {meta.sampling_strategy}. {meta.B} bandas (
              {Math.round(meta.wavelengths_nm[0]!)}–
              {Math.round(meta.wavelengths_nm[meta.wavelengths_nm.length - 1]!)}{" "}
              nm). Click una clase para aislarla; reduce las líneas
              renderizadas si tu máquina sufre.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              líneas
            </span>
            <select
              value={maxLines}
              onChange={(e) => setMaxLines(parseInt(e.target.value, 10))}
              className="rounded-md border px-2 py-1 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg)",
              }}
            >
              {[500, 1000, 2000, 4000, 8000].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        </header>

        {buf.isLoading && (
          <p style={{ color: "var(--color-fg-faint)" }}>
            Descargando {(meta.N * meta.B * 4).toLocaleString()} bytes binarios…
          </p>
        )}
        {buf.error && (
          <p style={{ color: "var(--color-warn)" }}>
            No se pudo cargar spectra.bin: {String(buf.error)}
          </p>
        )}
        {spectra && (
          <SpectralBrowser
            meta={meta}
            spectra={spectra}
            isolatedLabel={isolatedLabel}
            maxLines={maxLines}
          />
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setIsolatedLabel(null)}
            className="rounded-md border px-2.5 py-1 text-[12px]"
            style={{
              borderColor:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-border)",
              backgroundColor:
                isolatedLabel === null
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
              color:
                isolatedLabel === null
                  ? "var(--color-accent)"
                  : "var(--color-fg-subtle)",
            }}
          >
            Todas
          </button>
          {labels.map((l) => {
            const isSel = isolatedLabel === l.label_id;
            return (
              <button
                key={l.label_id}
                type="button"
                onClick={() =>
                  setIsolatedLabel(isSel ? null : l.label_id)
                }
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel
                    ? "var(--color-fg)"
                    : "var(--color-fg-subtle)",
                }}
                title={`${l.count} espectros`}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: l.color }}
                />
                {l.name}
                <span
                  className="text-[10.5px] ml-1 opacity-70"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  ({l.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Embed3DTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicToData | null;
}) {
  const [colorBy, setColorBy] = useState<"topic" | "label">("topic");
  const [selectedTopic, setSelectedTopic] = useState<number | null>(null);
  const [pickedDoc, setPickedDoc] = useState<{ docId: number; index: number } | null>(
    null,
  );

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Cargando embedding…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar el embedding 3D.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!data) return null;

  const points = data.theta_embedding_pca_3d;
  const ev = data.theta_embedding_explained_variance;
  const totalEv = ev.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div>
            <h4
              className="text-base font-semibold"
              style={{ color: "var(--color-fg)" }}
            >
              Embedding 3D · θ-PCA
            </h4>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Cada punto es un documento de la muestra (n={points.length}).
              Coordenadas: PCA(θ) en 3D.{" "}
              {ev.length >= 3 && (
                <>
                  EV<sub>1..3</sub> = {ev[0]!.toFixed(3)} /{" "}
                  {ev[1]!.toFixed(3)} / {ev[2]!.toFixed(3)} (total{" "}
                  {(totalEv * 100).toFixed(1)}%).
                </>
              )}{" "}
              Click un punto para fijar su <code>doc_id</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[11px] uppercase tracking-wider"
              style={{ color: "var(--color-fg-faint)" }}
            >
              colorear por
            </span>
            <select
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as "topic" | "label")}
              className="rounded-md border px-2 py-1 text-sm"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg)",
              }}
            >
              <option value="topic">Tópico dominante</option>
              <option value="label">Etiqueta</option>
            </select>
          </div>
        </header>

        <Suspense
          fallback={
            <p style={{ color: "var(--color-fg-faint)" }}>
              Cargando renderizador 3D…
            </p>
          }
        >
          <Scatter3D
            points={points}
            colorBy={colorBy}
            selectedTopic={selectedTopic}
            onPick={(info) => setPickedDoc(info)}
          />
        </Suspense>

        <div className="mt-3 flex flex-wrap items-baseline gap-4">
          <div>
            <div
              className="text-[11px] uppercase tracking-wider mb-1.5"
              style={{ color: "var(--color-fg-faint)" }}
            >
              Aislar tópico
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTopic(null)}
                className="rounded-md border px-2.5 py-1 text-[12px]"
                style={{
                  borderColor:
                    selectedTopic === null
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                  backgroundColor:
                    selectedTopic === null
                      ? "var(--color-accent-soft)"
                      : "var(--color-panel)",
                  color:
                    selectedTopic === null
                      ? "var(--color-accent)"
                      : "var(--color-fg-subtle)",
                }}
              >
                Todos
              </button>
              {Array.from({ length: data.topic_count }, (_, k) => {
                const isSel = selectedTopic === k;
                const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setSelectedTopic(isSel ? null : k)
                    }
                    className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                    style={{
                      borderColor: isSel
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                      backgroundColor: isSel
                        ? "var(--color-accent-soft)"
                        : "var(--color-panel)",
                      color: isSel
                        ? "var(--color-fg)"
                        : "var(--color-fg-subtle)",
                    }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    tópico {k + 1}
                  </button>
                );
              })}
            </div>
          </div>
          {pickedDoc && (
            <div
              className="rounded-md border p-2 text-[12.5px] font-mono"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg-subtle)",
              }}
            >
              doc_id: {pickedDoc.docId} · index: {pickedDoc.index}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocsPerTopicBar({
  counts,
  selected,
  onSelect,
  isFloat = false,
}: {
  counts: number[];
  selected: number | null;
  onSelect: (k: number) => void;
  isFloat?: boolean;
}) {
  const max = Math.max(...counts, 1);
  return (
    <div className="space-y-1.5">
      {counts.map((c, k) => {
        const pct = (c / max) * 100;
        const isSel = selected === k;
        const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className="w-full flex items-center gap-2 text-left"
            style={{ cursor: "pointer" }}
          >
            <span
              className="text-[11.5px] font-mono shrink-0 w-16"
              style={{
                color: isSel ? "var(--color-accent)" : "var(--color-fg-subtle)",
                fontWeight: isSel ? 600 : 400,
              }}
            >
              tópico {k + 1}
            </span>
            <span
              className="flex-1 h-4 rounded-sm relative overflow-hidden"
              style={{ backgroundColor: "var(--color-bg)" }}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-sm"
                style={{
                  width: `${pct}%`,
                  backgroundColor: color,
                  opacity: isSel ? 0.95 : 0.65,
                }}
              />
            </span>
            <span
              className="text-[11.5px] font-mono shrink-0 w-16 text-right"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {isFloat ? c.toFixed(2) : c.toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SubsetCard({
  dataset,
  onPick,
}: {
  dataset: DatasetEntry;
  onPick: () => void;
}) {
  const isReady = dataset.local_raw_available;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!isReady}
      className={cn(
        "text-left rounded-lg border p-5 transition-all",
        isReady ? "hover:shadow-md cursor-pointer" : "opacity-55 cursor-not-allowed",
      )}
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
        color: "var(--color-fg)",
      }}
      title={
        isReady
          ? `Elegir ${dataset.name}`
          : `${dataset.name} no tiene raíz local descargada — el pipeline no puede operar sobre él`
      }
    >
      <header className="flex items-baseline gap-2 justify-between mb-2">
        <h4 className="text-base font-semibold">{dataset.name}</h4>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-mono whitespace-nowrap"
          style={{
            backgroundColor: isReady
              ? "var(--color-accent-soft)"
              : "var(--color-bg)",
            color: isReady ? "var(--color-success)" : "var(--color-fg-faint)",
          }}
        >
          {isReady ? "local" : "sin descargar"}
        </span>
      </header>
      <dl
        className="text-[13px] leading-relaxed space-y-1"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <div className="flex gap-2">
          <dt
            className="shrink-0 w-24 text-[11px] uppercase tracking-wider pt-0.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Modalidad
          </dt>
          <dd className="flex-1">{dataset.modality}</dd>
        </div>
        <div className="flex gap-2">
          <dt
            className="shrink-0 w-24 text-[11px] uppercase tracking-wider pt-0.5"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Supervisión
          </dt>
          <dd className="flex-1">
            {dataset.supervision_states.join(" · ") || "ninguna"}
          </dd>
        </div>
      </dl>
      {isReady && (
        <div
          className="mt-3 text-sm font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          Elegir este conjunto →
        </div>
      )}
    </button>
  );
}

function Stepper({
  currentIndex,
  state,
  ctx,
}: {
  currentIndex: number;
  state: unknown;
  ctx: { family: string | null; subset: string | null; rep: string | null };
}) {
  void state;
  const labels = STEPS;
  return (
    <ol
      className="flex flex-wrap gap-2 mt-4"
      style={{ color: "var(--color-fg-subtle)" }}
    >
      {labels.map((s, i) => {
        const isActive = i === currentIndex;
        const isDone = i < currentIndex;
        return (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              isActive ? "font-medium" : "",
            )}
            style={{
              borderColor: isActive
                ? "var(--color-accent)"
                : "var(--color-border)",
              color: isActive
                ? "var(--color-accent)"
                : isDone
                  ? "var(--color-fg)"
                  : "var(--color-fg-faint)",
              backgroundColor: isActive
                ? "var(--color-accent-soft)"
                : "var(--color-panel)",
            }}
          >
            <span
              className="inline-flex w-5 h-5 items-center justify-center rounded-full text-[11px] font-mono"
              style={{
                backgroundColor: isActive
                  ? "var(--color-accent)"
                  : isDone
                    ? "var(--color-fg-subtle)"
                    : "var(--color-border)",
                color: isActive
                  ? "var(--color-accent-fg)"
                  : "var(--color-bg)",
              }}
            >
              {i + 1}
            </span>
            <span>{s.label}</span>
            {isDone && i === 0 && ctx.family && (
              <span
                className="text-xs font-mono opacity-70"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {ctx.family}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function FamilyPickerStep({
  isLoading,
  error,
  groups,
  onPick,
}: {
  isLoading: boolean;
  error: Error | null;
  groups: { family_id: string; family_title: string; entries: DatasetEntry[] }[];
  onPick: (familyId: string) => void;
}) {
  if (isLoading) {
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Cargando inventario…
      </p>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          No se pudo cargar el inventario.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          <code>/api/local-dataset-inventory</code> — {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {groups.map((g) => (
        <button
          key={g.family_id}
          type="button"
          onClick={() => onPick(g.family_id)}
          className="text-left rounded-lg border p-5 transition-all hover:shadow-md"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
            color: "var(--color-fg)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 className="text-base font-semibold">{g.family_title}</h3>
            <span
              className="rounded-md px-2 py-0.5 text-[11px] font-mono"
              style={{
                backgroundColor: "var(--color-accent-soft)",
                color: "var(--color-accent)",
              }}
            >
              {g.entries.length} datasets
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {FAMILY_DESCRIPTIONS[g.family_id] ?? FAMILY_DESCRIPTIONS["default"]}
          </p>
          <ul
            className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-mono"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {g.entries.slice(0, 6).map((e) => (
              <li
                key={e.id}
                className="inline-block rounded-md px-2 py-0.5"
                style={{
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                {e.name}
              </li>
            ))}
            {g.entries.length > 6 && (
              <li
                className="inline-block px-2 py-0.5"
                style={{ color: "var(--color-fg-faint)" }}
              >
                + {g.entries.length - 6} más
              </li>
            )}
          </ul>
          <div
            className="mt-4 text-sm font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            Elegir esta familia →
          </div>
        </button>
      ))}
    </div>
  );
}

/* =========================================================================
   Scene briefing hero — appears at top of Workspace when a labelled scene
   is loaded. Shows quick stats + class palette + topic count + spectral
   envelope mini-viz for at-a-glance scene context across all 11 tabs.
   =======================================================================*/

function SceneBriefingHero({ subsetId, rep }: { subsetId: string; rep: string | null }) {
  const { t } = useTranslation(["pages"]);
  const eda = useQuery({
    queryKey: ["briefing-eda", subsetId],
    queryFn: () => api.edaPerScene(subsetId),
    staleTime: 5 * 60_000,
  });
  const tv = useQuery({
    queryKey: ["briefing-topic-views", subsetId],
    queryFn: () => api.topicViews(subsetId),
    staleTime: 5 * 60_000,
  });

  const data = eda.data;
  if (!data) {
    return (
      <div
        className="rounded-xl border p-4 mb-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-fg-faint)" }} className="text-sm">
          {t("pages:workspace.briefing.loading_scene_context")}
        </p>
      </div>
    );
  }

  const classDist = data.class_distribution ?? [];
  const sensor = data.sensor ?? "—";
  const shape = data.spatial_shape ?? [0, 0];
  const wlLo = (data.wavelengths_nm ?? [400])[0] ?? 400;
  const wlHi = (data.wavelengths_nm ?? [2500])[data.wavelengths_nm?.length ? data.wavelengths_nm.length - 1 : 0] ?? 2500;
  const meanSpectra = data.class_mean_spectra ?? {};

  // mini envelope: aggregate min/max across classes
  let lo = Infinity;
  let hi = -Infinity;
  const wl = data.wavelengths_nm ?? [];
  if (wl.length) {
    for (const v of Object.values(meanSpectra)) {
      const ms = (v as { mean?: number[] }).mean;
      if (!ms || ms.length !== wl.length) continue;
      for (const y of ms) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
  }

  const W = 280;
  const H = 60;
  const enveloperPaths = Object.entries(meanSpectra).slice(0, 12).map(([key, v]) => {
    const ms = (v as { mean?: number[] }).mean;
    if (!ms || ms.length !== wl.length) return null;
    const path = ms.map((y, i) => {
      const x = (i / (wl.length - 1)) * W;
      const yy = H - ((y - lo) / (hi - lo || 1)) * H;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
    }).join(" ");
    const cls = classDist.find((c) => String(c.label_id) === key);
    return { path, color: cls?.color ?? "#94a3b8", key };
  }).filter((p): p is { path: string; color: string; key: string } => p !== null);

  return (
    <div
      className="rounded-xl border p-4 mb-5 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(40,160,80,1) 33%, rgba(170,60,200,1) 66%, rgba(214,140,40,1) 100%)" }}
      />
      <div className="grid lg:grid-cols-[1fr_280px_auto] gap-5 items-center mt-1">
        {/* LEFT: stats */}
        <div>
          <div className="flex items-baseline gap-3 flex-wrap mb-2">
            <h3
              className="text-lg font-semibold tracking-tight"
              style={{ color: "var(--color-fg)" }}
            >
              {data.scene_name ?? subsetId}
            </h3>
            <span
              className="text-[10.5px] uppercase tracking-widest font-medium"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {sensor}
            </span>
            {rep ? (
              <span
                className="text-[11px] font-mono rounded px-1.5 py-0.5"
                style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                rep · {rep}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--color-fg-subtle)" }}>
            <BriefingStat label={t("pages:workspace.briefing.stat_dim")} value={`${shape[0]}×${shape[1]}`} />
            <BriefingStat label={t("pages:workspace.briefing.stat_bands")} value={String(wl.length)} />
            <BriefingStat label={t("pages:workspace.briefing.stat_wavelength")} value={`${wlLo.toFixed(0)}–${wlHi.toFixed(0)} nm`} />
            <BriefingStat label={t("pages:workspace.briefing.stat_classes")} value={String(data.n_classes ?? classDist.length)} />
            <BriefingStat label={t("pages:workspace.briefing.stat_labelled")} value={(data.n_labelled_pixels ?? 0).toLocaleString("en-US")} />
            {tv.data ? <BriefingStat label={t("pages:workspace.briefing.stat_k_topics")} value={String(tv.data.topic_count)} /> : null}
          </div>
          {classDist.length ? (
            <div className="mt-2.5">
              <div className="w-full h-2.5 flex rounded overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                {classDist.map((c) => (
                  <div
                    key={c.label_id}
                    title={`${c.name} · ${c.count.toLocaleString("en-US")} px (${(c.rel_freq * 100).toFixed(1)}%)`}
                    style={{ width: `${c.rel_freq * 100}%`, backgroundColor: c.color }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
                {classDist.slice(0, 5).map((c) => (
                  <span key={c.label_id} className="inline-flex items-center gap-1">
                    <span aria-hidden className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                ))}
                {classDist.length > 5 ? <span>{t("pages:workspace.briefing.more_classes", { count: classDist.length - 5 })}</span> : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* MIDDLE: tiny spectral envelope */}
        <div>
          {enveloperPaths.length ? (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[60px]" aria-hidden>
              {enveloperPaths.map((p) => (
                <path key={p.key} d={p.path} fill="none" stroke={p.color} strokeWidth="0.9" strokeOpacity="0.85" />
              ))}
            </svg>
          ) : (
            <div className="text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.briefing.envelope_unavailable")}
            </div>
          )}
          <div className="text-[9.5px] uppercase tracking-widest font-medium text-center mt-0.5" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.briefing.envelope_caption")}
          </div>
        </div>

        {/* RIGHT: links */}
        <div className="flex flex-col gap-1.5 text-[12px]" style={{ color: "var(--color-fg-subtle)" }}>
          <a
            href={`/api/eda/per-scene/${encodeURIComponent(subsetId)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono"
            style={{ color: "var(--color-accent)" }}
          >
            /api/eda/per-scene
          </a>
          <a
            href={`/api/topic-views/${encodeURIComponent(subsetId)}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono"
            style={{ color: "var(--color-accent)" }}
          >
            /api/topic-views
          </a>
        </div>
      </div>
    </div>
  );
}

function BriefingStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
        {label}
      </span>
      <span className="font-mono font-semibold" style={{ color: "var(--color-fg)" }}>
        {value}
      </span>
    </span>
  );
}

/* =========================================================================
   HIDSAG Explorer — for Etapa 4 when subset is GEOMET/MINERAL{1,2}/
   GEOCHEM/PORPHYRY. Replaces the previous empty-state placeholder with
   a multi-card panel showing:
     - subset briefing (samples, measurements, modalities, top targets)
     - geochemistry targets table (mean ± std per variable)
     - mean spectra per measurement type (overlaid lines per modality)
     - regression-method ranking on macro R² (raw_ridge vs theta_*)
     - correlation heatmap between targets
   =======================================================================*/

function HidsagExploreStep({ subsetCode }: { subsetCode: string }) {
  const eda = useQuery({
    queryKey: ["hidsag-eda", subsetCode],
    queryFn: () => api.edaHidsag(subsetCode),
    staleTime: 5 * 60_000,
  });
  const methods = useQuery({
    queryKey: ["hidsag-methods", subsetCode],
    queryFn: () => api.hidsagMethodStatistics(subsetCode),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="space-y-6">
      <HidsagBriefingCard eda={eda.data ?? null} methods={methods.data ?? null} subsetCode={subsetCode} />
      <div className="grid lg:grid-cols-2 gap-5">
        <HidsagTargetsCard eda={eda.data ?? null} />
        <HidsagModalitySpectraCard eda={eda.data ?? null} />
      </div>
      <HidsagMethodRankingCard methods={methods.data ?? null} />
      <HidsagCorrelationCard eda={eda.data ?? null} />
    </div>
  );
}

function HidsagBriefingCard({
  eda,
  methods,
  subsetCode,
}: {
  eda: import("@/api/client").HidsagEda | null;
  methods: import("@/api/client").HidsagMethodStatistics | null;
  subsetCode: string;
}) {
  return (
    <div
      className="rounded-xl border p-4 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "linear-gradient(90deg, rgba(214,140,40,1) 0%, rgba(214,39,40,1) 100%)" }}
      />
      <div className="flex items-baseline gap-3 flex-wrap mt-1 mb-2">
        <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          HIDSAG · {subsetCode}
        </h3>
        <span className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
          Family D · geochemistry regression
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" style={{ color: "var(--color-fg-subtle)" }}>
        <BriefingStat label="samples" value={eda ? String(eda.sample_count) : "…"} />
        <BriefingStat label="measurements" value={eda ? String(eda.measurement_count_total) : "…"} />
        <BriefingStat label="targets" value={eda ? String(eda.numeric_variable_names.length) : "…"} />
        <BriefingStat label="methods" value={methods?.regression ? String(Object.keys(methods.regression.method_aggregates).length) : "…"} />
        {eda?.modality_band_counts ? (
          <BriefingStat
            label="bands"
            value={Object.entries(eda.modality_band_counts)
              .map(([k, v]) => `${k}=${v}`)
              .join(" · ")}
          />
        ) : null}
      </div>
      {eda?.dominant_targets_by_mean?.length ? (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "var(--color-fg-faint)" }}>
            Top geochemistry targets
          </div>
          <div className="flex flex-wrap gap-1.5">
            {eda.dominant_targets_by_mean.slice(0, 8).map((tt) => (
              <span
                key={tt.name}
                className="inline-flex items-baseline gap-1 rounded px-2 py-0.5 text-[11px] font-mono"
                style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                {tt.name}
                <span className="opacity-70 text-[10px]">μ={tt.mean.toFixed(2)} ± {tt.std.toFixed(2)}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HidsagTargetsCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading targets…</p>
      </div>
    );
  }
  const rows = eda.numeric_variable_names.map((name) => ({
    name,
    stats: eda.numeric_variables[name],
  }));
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Geochemistry targets — mean ± std
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Continuous geochemistry variables measured per HIDSAG sample. {eda.numeric_variable_names.length} targets shown with their range and sample coverage.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">target</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">mean</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">std</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">min</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">max</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">n</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 15).map((row) => {
              const s = row.stats;
              return (
                <tr key={row.name} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.mean.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.std.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.min.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.max.toFixed(3) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{s ? s.n_finite : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > 15 ? (
          <p className="mt-2 text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
            +{rows.length - 15} more targets
          </p>
        ) : null}
      </div>
    </div>
  );
}

function HidsagModalitySpectraCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading mean spectra…</p>
      </div>
    );
  }
  const wl = eda.spectrum_axis?.wavelength_nm ?? [];
  const meanByMeas = eda.mean_spectrum_by_measurement ?? {};
  const entries = Object.entries(meanByMeas).slice(0, 6);

  const W = 520;
  const H = 200;
  const padL = 48;
  const padR = 12;
  const padT = 10;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  let lo = Infinity;
  let hi = -Infinity;
  for (const [, v] of entries) {
    for (const y of v.mean ?? []) {
      if (y < lo) lo = y;
      if (y > hi) hi = y;
    }
  }
  const wlLo = wl[0] ?? 400;
  const wlHi = wl[wl.length - 1] ?? 2500;

  const palette = ["#0ea5e9", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4"];

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Mean spectra per measurement type
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Average spectral signature per HIDSAG measurement modality (typical VNIR low/high, SWIR low). Used to validate stratification + bad-band heuristics.
      </p>
      {entries.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={padL} y1={padT + g * innerH} x2={padL + innerW} y2={padT + g * innerH} stroke="currentColor" strokeOpacity={g === 0 || g === 1 ? 0.25 : 0.07} strokeWidth="0.6" />
          ))}
          {[wlLo, (wlLo + wlHi) / 2, wlHi].map((wlv) => {
            const x = padL + ((wlv - wlLo) / (wlHi - wlLo)) * innerW;
            return (
              <text key={wlv} x={x} y={H - 8} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.55} fontFamily="ui-monospace, monospace">
                {wlv.toFixed(0)} nm
              </text>
            );
          })}
          {entries.map(([name, v], i) => {
            if (!v.mean?.length || v.mean.length !== wl.length) return null;
            const path = v.mean
              .map((y, j) => {
                const x = padL + ((wl[j]! - wlLo) / (wlHi - wlLo)) * innerW;
                const yy = padT + innerH - ((y - lo) / (hi - lo || 1)) * innerH;
                return `${j === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`;
              })
              .join(" ");
            return <path key={name} d={path} fill="none" stroke={palette[i % palette.length]} strokeWidth="1.4" strokeOpacity="0.95" />;
          })}
        </svg>
      ) : (
        <p className="text-[12px]" style={{ color: "var(--color-fg-faint)" }}>No mean-spectra available.</p>
      )}
      {entries.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {entries.map(([name, v], i) => (
            <span key={name} className="inline-flex items-center gap-1.5" style={{ color: "var(--color-fg-faint)" }}>
              <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: palette[i % palette.length] }} />
              {name}
              <span className="opacity-65">(n={v.n})</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HidsagMethodRankingCard({
  methods,
}: {
  methods: import("@/api/client").HidsagMethodStatistics | null;
}) {
  if (!methods?.regression) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p className="text-sm" style={{ color: "var(--color-fg-faint)" }}>Loading regression methods…</p>
      </div>
    );
  }
  const reg = methods.regression;
  const ranking = reg.ranking ?? Object.entries(reg.method_aggregates).map(([method, agg], i) => ({ method, mean: agg.r2_distribution?.mean ?? 0, rank: i + 1 }));
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Regression methods — macro R² ranking
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Five methods compared on 5-fold per-target R²: raw_ridge_regression, pca_ridge_regression, pls_regression, region_topic_mixture_linear_regression, topic_routed_linear_regression. Higher is better.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">rank</th>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">method</th>
              <th className="text-right font-mono text-[11px] pb-2 pr-3">mean R²</th>
              <th className="text-left font-mono text-[11px] pb-2 pr-3">bar</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((row) => {
              const agg = reg.method_aggregates[row.method];
              const norm = Math.max(0, Math.min(1, (row.mean + 0.5) / 1.5));
              return (
                <tr key={row.method} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1.5 pr-3 font-mono">{row.rank}</td>
                  <td className="py-1.5 pr-3 font-mono">{row.method}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">
                    {row.mean.toFixed(3)}
                    {agg ? <span className="opacity-70 ml-1 text-[10.5px]">±{(agg.r2_distribution?.std ?? 0).toFixed(3)}</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 w-[180px]">
                    <div className="w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${norm * 100}%`, backgroundColor: "var(--color-accent)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HidsagCorrelationCard({ eda }: { eda: import("@/api/client").HidsagEda | null }) {
  if (!eda || !eda.correlation_pearson) {
    return null;
  }
  const names = eda.numeric_variable_names.slice(0, 12);
  const mat = eda.correlation_pearson;
  const N = Math.min(names.length, 12);
  const cell = 26;
  const labelW = 100;
  const W = labelW + N * cell + 16;
  const H = labelW + N * cell + 16;

  const colour = (v: number) => {
    const x = Math.max(-1, Math.min(1, v));
    if (x >= 0) {
      const t = x;
      return `rgba(31, 119, 180, ${0.15 + 0.75 * t})`;
    }
    const t = -x;
    return `rgba(214, 39, 40, ${0.15 + 0.75 * t})`;
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4 className="text-base font-semibold mb-2" style={{ color: "var(--color-fg)" }}>
        Pearson correlation between geochemistry targets
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Blue = positive correlation, red = negative. First {N} targets shown. Strong off-diagonal pairs (|ρ| ≥ 0.5) indicate redundancy / co-located mineralisation.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 720 }}>
          {names.map((n, j) => (
            <text key={`col-${n}`} x={labelW + j * cell + cell / 2} y={labelW - 4} fontSize="9.5" textAnchor="end" transform={`rotate(-50 ${labelW + j * cell + cell / 2} ${labelW - 4})`} fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
              {n}
            </text>
          ))}
          {names.map((n, i) => (
            <text key={`row-${n}`} x={labelW - 4} y={labelW + i * cell + cell / 2 + 4} fontSize="9.5" textAnchor="end" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
              {n}
            </text>
          ))}
          {names.map((_, i) =>
            names.map((__, j) => {
              const v = mat[i]?.[j] ?? 0;
              return (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cell} y={labelW + i * cell} width={cell - 1} height={cell - 1} fill={colour(v)} />
                  <text x={labelW + j * cell + cell / 2} y={labelW + i * cell + cell / 2 + 3} fontSize="8.5" textAnchor="middle" fill={Math.abs(v) > 0.45 ? "white" : "currentColor"} opacity={Math.abs(v) > 0.45 ? 1 : 0.65}>
                    {v.toFixed(1)}
                  </text>
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

function RepresentationFitTab({
  rep,
  apiMethod,
  isLoading,
  error,
  data,
}: {
  rep: string | null;
  apiMethod: string | null;
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").RepresentationPayload | null;
}) {
  if (!rep) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-fg-subtle)" }}>
          Pick a representation in Stage 3 first.
        </p>
      </div>
    );
  }
  if (!apiMethod) {
    const isTopic = TOPIC_FAMILY_REPS.has(rep);
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-fg-subtle)" }}>
          {isTopic ? (
            <>
              <strong>{rep}</strong> is a topic-family representation — its native 3D embedding is in
              the <em>Embed 3D</em> tab (θ-PCA-3D), and its topic profiles in <em>Topics</em>.
            </>
          ) : rep === "endmember" ? (
            <>
              <strong>endmember</strong> is an unmixing baseline — its native panels (endmember spectra,
              abundance simplex) ship in a dedicated Unmixing Explorer (cycle 73).
            </>
          ) : (
            <>No representation-fit endpoint for <strong>{rep}</strong>.</>
          )}
        </p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading representation fit for {apiMethod}…</p>
    );
  }
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>Could not load representation fit.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  if (!data) return null;

  const points: import("@/api/client").EmbeddingPoint3D[] = (data.scatter_2d_3d_subsample ?? []).map((p) => ({
    doc_id: p.i,
    x: p.x_3d,
    y: p.y_3d,
    z: p.z_3d,
    label_id: p.label_id,
  }));

  const evList = data.scatter_pca_3d_explained_variance ?? [];
  const evTotal = evList.reduce((a, b) => a + b, 0);

  const fitMetaEntries = Object.entries(data.fit_meta || {});

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 mb-2">
          <div>
            <h4 className="text-base font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
              {rep} · 3D embedding · {data.n_documents} documents
            </h4>
            <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
              backend method <code>{data.method}</code> · latent dim {data.latent_dim} · scatter is PCA-3D
              {evList.length ? (
                <>
                  {" "}of latent space (Σ EV {(evTotal * 100).toFixed(1)}% — components{" "}
                  {evList.map((v, i) => (
                    <span key={i} className="font-mono text-[11px]">
                      {i > 0 ? " · " : ""}{(v * 100).toFixed(1)}%
                    </span>
                  ))}
                  )
                </>
              ) : null}
            </p>
          </div>
        </header>
        <Suspense fallback={<p style={{ color: "var(--color-fg-faint)" }}>Loading 3D…</p>}>
          <Scatter3D points={points} colorBy="label" selectedTopic={null} />
        </Suspense>
        <p className="mt-2 text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
          Coloured by ground-truth label. Drag to rotate, scroll to zoom, click a point to pick.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
            KMeans vs label
          </div>
          <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
            {data.downstream_kmeans_vs_label.ari.toFixed(3)}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
            ARI · NMI {data.downstream_kmeans_vs_label.nmi.toFixed(3)}
          </div>
        </div>
        {data.silhouette_label ? (
          <div
            className="rounded-lg border p-4"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
          >
            <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
              Silhouette (label-supervised)
            </div>
            <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
              {data.silhouette_label.overall.toFixed(3)}
            </div>
            <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
              overall · negative = clusters mixed; positive = well separated
            </div>
          </div>
        ) : null}
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
            Latent dim
          </div>
          <div className="text-[28px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
            {data.latent_dim}
          </div>
          <div className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>K = bottleneck size</div>
        </div>
      </div>

      {fitMetaEntries.length > 0 ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
            Fit metadata
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5 text-[12.5px]" style={{ color: "var(--color-fg)" }}>
            {fitMetaEntries.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                <span className="font-mono text-[11.5px]" style={{ color: "var(--color-fg-faint)" }}>{k}</span>
                <span className="font-mono">
                  {typeof v === "number"
                    ? Array.isArray(v)
                      ? "—"
                      : v.toFixed(4)
                    : Array.isArray(v)
                      ? `[${(v as unknown as number[]).slice(0, 4).map((x) => x.toFixed(3)).join(", ")}${(v as unknown as number[]).length > 4 ? "…" : ""}]`
                      : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data.silhouette_label?.per_class ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
            Silhouette per class (sorted)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
              <thead>
                <tr style={{ color: "var(--color-fg-faint)" }}>
                  <th className="text-left font-mono text-[11px] pb-1 pr-3">class</th>
                  <th className="text-right font-mono text-[11px] pb-1 pr-3">silhouette</th>
                  <th className="text-left font-mono text-[11px] pb-1">bar</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.silhouette_label.per_class)
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([cls, val]) => {
                    const v = val as number;
                    const norm = Math.max(0, Math.min(1, (v + 1) / 2));
                    return (
                      <tr key={cls} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td className="py-1 pr-3 font-mono">{cls}</td>
                        <td className="py-1 pr-3 text-right font-mono">{v.toFixed(3)}</td>
                        <td className="py-1 w-[180px]">
                          <div className="relative w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                            <div
                              className="absolute top-0 bottom-0 rounded"
                              style={{
                                left: v >= 0 ? "50%" : `${50 + norm * 50 - 50}%`,
                                width: `${Math.abs(v) * 50}%`,
                                backgroundColor: v >= 0 ? "rgba(40,160,80,0.85)" : "rgba(214,39,40,0.85)",
                              }}
                            />
                            <div className="absolute top-0 bottom-0" style={{ left: "50%", width: 1, backgroundColor: "var(--color-fg-faint)" }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function asNum(x: number | Record<string, number> | undefined): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const vals = Object.values(x).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function UnmixingTab({
  isLoading,
  error,
  data,
  eda,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").EndmemberBaseline | null;
  eda: import("@/api/client").ScenePerScene | null;
}) {
  if (isLoading) {
    return <p style={{ color: "var(--color-fg-faint)" }}>Loading unmixing baseline…</p>;
  }
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}
      >
        <p style={{ color: "var(--color-warn)" }}>Could not load endmember baseline.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  if (!data) return null;

  const rmseRaw = asNum(data.reconstruction_rmse_full_set);
  const rmseNorm = asNum(data.reconstruction_rmse_normalised);
  const wavelengths = eda?.wavelengths_nm ?? [];

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(170,60,200,1) 100%)" }}
        />
        <div className="flex flex-wrap items-baseline justify-between gap-3 mt-1 mb-2">
          <div>
            <h3 className="text-lg font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
              Linear unmixing baseline · K={data.K}
            </h3>
            <p className="text-[12.5px]" style={{ color: "var(--color-fg-faint)" }}>
              {data.endmember_extractors.join(" + ")} · {data.unmixing_method}
            </p>
          </div>
          <div className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
            {data.framework_axis ?? "Axis B-11"}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          <UnmixingStat label="endmembers (K)" value={String(data.K)} />
          <UnmixingStat label="pixels used" value={data.n_pixels_used.toLocaleString()} />
          <UnmixingStat label="bands" value={String(data.n_bands)} />
          <UnmixingStat label="rmse · normalised" value={rmseNorm != null ? rmseNorm.toFixed(4) : "—"} />
        </div>
        {rmseRaw != null ? (
          <p className="mt-2 text-[11.5px] font-mono" style={{ color: "var(--color-fg-faint)" }}>
            raw reconstruction RMSE = {rmseRaw.toFixed(3)} · normalised by full-set L2 = {rmseNorm?.toFixed(4) ?? "—"}
          </p>
        ) : null}
      </div>

      <UnmixingSpectraCard
        title="NFINDR endmember spectra"
        subtitle="K vertices of the data simplex (Winter 1999). Each curve is one pure-pixel candidate."
        spectra={data.nfindr_endmembers ?? []}
        wavelengths={wavelengths}
        accent="rgba(56,189,248,1)"
      />

      {data.atgp_endmembers && data.atgp_endmembers.length > 0 ? (
        <UnmixingSpectraCard
          title="ATGP endmember spectra"
          subtitle="Automatic Target Generation Process (Ren & Chang 2003). Alternative extractor — pixel-wise orthogonal subspace projection."
          spectra={data.atgp_endmembers}
          wavelengths={wavelengths}
          accent="rgba(170,60,200,1)"
        />
      ) : null}

      {data.topic_endmember_match.topic_x_endmember_cosine ? (
        <UnmixingTopicHeatmap
          matrix={data.topic_endmember_match.topic_x_endmember_cosine}
          bestByTopic={data.topic_endmember_match.best_endmember_per_topic ?? []}
        />
      ) : null}

      {data.topic_endmember_match.best_endmember_per_topic && data.topic_endmember_match.best_endmember_per_topic.length > 0 ? (
        <UnmixingBestMatchTable rows={data.topic_endmember_match.best_endmember_per_topic} />
      ) : null}
    </div>
  );
}

function UnmixingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-fg-faint)" }}>
        {label}
      </span>
      <span className="text-[22px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
        {value}
      </span>
    </div>
  );
}

function UnmixingSpectraCard({
  title,
  subtitle,
  spectra,
  wavelengths,
  accent,
}: {
  title: string;
  subtitle: string;
  spectra: number[][];
  wavelengths: number[];
  accent: string;
}) {
  const W = 720;
  const H = 280;
  const pad = { l: 44, r: 16, t: 12, b: 32 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const { xMin, xMax, yMin, yMax } = useMemo(() => {
    let yLo = Infinity;
    let yHi = -Infinity;
    for (const row of spectra) {
      for (const v of row) {
        if (!Number.isFinite(v)) continue;
        if (v < yLo) yLo = v;
        if (v > yHi) yHi = v;
      }
    }
    if (!Number.isFinite(yLo) || !Number.isFinite(yHi)) {
      yLo = 0;
      yHi = 1;
    }
    const span = yHi - yLo || 1;
    const xWv = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [0, 1];
    return {
      xMin: xWv[0] ?? 0,
      xMax: xWv[xWv.length - 1] ?? 1,
      yMin: yLo - span * 0.05,
      yMax: yHi + span * 0.05,
    };
  }, [spectra, wavelengths]);

  const xAxis = wavelengths.length > 0 ? wavelengths : spectra[0]?.map((_, i) => i) ?? [];

  const xScale = (x: number) => pad.l + ((x - xMin) / Math.max(1e-9, xMax - xMin)) * innerW;
  const yScale = (y: number) => pad.t + innerH - ((y - yMin) / Math.max(1e-9, yMax - yMin)) * innerH;

  const palette = [
    "#0072B2", "#D55E00", "#009E73", "#CC79A7", "#F0E442",
    "#56B4E9", "#E69F00", "#999999", "#332288", "#117733",
    "#88CCEE", "#882255", "#44AA99", "#DDCC77", "#AA4499",
    "#661100",
  ];

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          {title}
        </h4>
        <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: accent }}>
          K = {spectra.length}
        </span>
      </div>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>{subtitle}</p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 900 }}>
          {/* axes */}
          <line x1={pad.l} y1={pad.t + innerH} x2={pad.l + innerW} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + innerH} stroke="currentColor" opacity={0.3} />
          {/* x ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const wv = xMin + f * (xMax - xMin);
            const x = pad.l + f * innerW;
            return (
              <g key={`xt-${f}`}>
                <line x1={x} y1={pad.t + innerH} x2={x} y2={pad.t + innerH + 4} stroke="currentColor" opacity={0.4} />
                <text x={x} y={pad.t + innerH + 16} fontSize="10" textAnchor="middle" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {wavelengths.length > 0 ? `${Math.round(wv)} nm` : Math.round(wv)}
                </text>
              </g>
            );
          })}
          {/* y ticks */}
          {[0, 0.5, 1].map((f) => {
            const v = yMin + f * (yMax - yMin);
            const y = pad.t + innerH - f * innerH;
            return (
              <g key={`yt-${f}`}>
                <line x1={pad.l - 4} y1={y} x2={pad.l} y2={y} stroke="currentColor" opacity={0.4} />
                <text x={pad.l - 6} y={y + 3} fontSize="10" textAnchor="end" fill="currentColor" opacity={0.7} fontFamily="ui-monospace, monospace">
                  {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(2)}
                </text>
              </g>
            );
          })}
          {/* curves */}
          {spectra.map((row, k) => {
            const points = row
              .map((v, i) => {
                if (!Number.isFinite(v)) return null;
                const xv = xAxis[i] ?? i;
                return `${xScale(xv).toFixed(2)},${yScale(v).toFixed(2)}`;
              })
              .filter((p): p is string => p !== null)
              .join(" ");
            return (
              <polyline
                key={`em-${k}`}
                points={points}
                fill="none"
                stroke={palette[k % palette.length]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                opacity={0.85}
              />
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {spectra.map((_, k) => (
          <span
            key={`leg-${k}`}
            className="inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-mono"
            style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-fg)" }}
          >
            <span className="inline-block rounded-full w-2 h-2" style={{ backgroundColor: palette[k % palette.length] }} />
            em{k}
          </span>
        ))}
      </div>
    </div>
  );
}

function UnmixingTopicHeatmap({
  matrix,
  bestByTopic,
}: {
  matrix: number[][];
  bestByTopic: { topic_id: number; endmember_id: number; cosine: number }[];
}) {
  const N = matrix.length;
  const labelW = 36;
  const cell = 28;
  const W = labelW + N * cell + 8;
  const H = labelW + N * cell + 8;
  const colour = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    const r = Math.round(255 * (1 - t));
    const g = Math.round(255 * (1 - Math.abs(t - 0.5) * 2));
    const b = Math.round(255 * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Topic × endmember cosine similarity
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        Rows = LDA topic profiles φ<sub>k</sub>; columns = NFINDR endmember spectra. Cell ≈ cosine. Best matches are starred.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto" style={{ maxWidth: 720 }}>
          {Array.from({ length: N }).map((_, j) => (
            <text key={`c-${j}`} x={labelW + j * cell + cell / 2} y={labelW - 6} fontSize="9.5" textAnchor="middle" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              em{j}
            </text>
          ))}
          {Array.from({ length: N }).map((_, i) => (
            <text key={`r-${i}`} x={labelW - 4} y={labelW + i * cell + cell / 2 + 4} fontSize="9.5" textAnchor="end" fill="currentColor" opacity={0.65} fontFamily="ui-monospace, monospace">
              t{i}
            </text>
          ))}
          {matrix.map((row, i) =>
            row.map((v, j) => {
              const isBest = bestByTopic.some((r) => r.topic_id === i && r.endmember_id === j);
              return (
                <g key={`${i}-${j}`}>
                  <rect x={labelW + j * cell} y={labelW + i * cell} width={cell - 1} height={cell - 1} fill={colour(v)} />
                  <text x={labelW + j * cell + cell / 2} y={labelW + i * cell + cell / 2 + 3} fontSize="9" textAnchor="middle" fill={v > 0.5 ? "white" : "currentColor"} opacity={v > 0.5 ? 1 : 0.7}>
                    {v.toFixed(2)}
                  </text>
                  {isBest ? (
                    <text x={labelW + j * cell + cell - 4} y={labelW + i * cell + 9} fontSize="9.5" textAnchor="end" fill={v > 0.5 ? "white" : "var(--color-accent)"}>★</text>
                  ) : null}
                </g>
              );
            }),
          )}
        </svg>
      </div>
    </div>
  );
}

function UnmixingBestMatchTable({ rows }: { rows: { topic_id: number; endmember_id: number; cosine: number }[] }) {
  const sorted = [...rows].sort((a, b) => b.cosine - a.cosine);
  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Best endmember per topic (sorted by cosine)
      </h4>
      <p className="text-[12px] mb-2" style={{ color: "var(--color-fg-faint)" }}>
        For each LDA topic, the closest NFINDR endmember by cosine of its band-profile φ<sub>k</sub>. High cosine ⇒ topic captures a pure-pixel signature.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">topic</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">endmember</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">cosine</th>
              <th className="text-left font-mono text-[11px] pb-1">bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const norm = Math.max(0, Math.min(1, r.cosine));
              return (
                <tr key={`bm-${r.topic_id}`} style={{ borderTop: "1px solid var(--color-border)" }}>
                  <td className="py-1 pr-3 font-mono">t{r.topic_id}</td>
                  <td className="py-1 pr-3 font-mono">em{r.endmember_id}</td>
                  <td className="py-1 pr-3 text-right font-mono">{r.cosine.toFixed(3)}</td>
                  <td className="py-1 w-[200px]">
                    <div className="w-full h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${norm * 100}%`, backgroundColor: "var(--color-accent)" }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InterpretabilityTab({
  isLoading,
  error,
  topics,
  bands,
  docs,
}: {
  isLoading: boolean;
  error: Error | null;
  topics: import("@/api/client").TopicCardsFile | null;
  bands: import("@/api/client").BandCardsFile | null;
  docs: import("@/api/client").DocumentCardsFile | null;
}) {
  if (isLoading) return <p style={{ color: "var(--color-fg-faint)" }}>Loading interpretability cards…</p>;
  if (error) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p style={{ color: "var(--color-warn)" }}>Could not load interpretability cards.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {topics ? <InterpretTopicCardsGrid topics={topics} /> : null}
      {bands ? <InterpretBandImportance bands={bands} /> : null}
      {docs ? <InterpretDocumentSample docs={docs} K={topics?.K ?? 12} /> : null}
    </div>
  );
}

function InterpretTopicCardsGrid({ topics }: { topics: import("@/api/client").TopicCardsFile }) {
  return (
    <div>
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Topic cards · K = {topics.K}
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        One card per LDA topic. Peak wavelength = argmax of φ<sub>k</sub>; FWHM = full width at half-max
        (sharpness of the spectral signature). p(label | topic) shows the top-3 classes whose
        documents land on this topic dominantly.
      </p>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {topics.topic_cards.map((c) => {
          const swatch = TOPIC_COLORS[c.topic_k % TOPIC_COLORS.length];
          const topP = c.p_label_given_topic_top3?.[0]?.p ?? 0;
          return (
            <div
              key={c.topic_k}
              className="rounded-lg border p-3 relative overflow-hidden"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
            >
              <div className="absolute top-0 left-0 right-0 h-1" aria-hidden style={{ backgroundColor: swatch }} />
              <div className="flex items-baseline justify-between mt-1 mb-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: swatch }} />
                  <span className="text-[13px] font-semibold font-mono" style={{ color: "var(--color-fg)" }}>topic {c.topic_k}</span>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
                  λ = {c.peak_wavelength_nm.toFixed(0)} nm
                </span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] font-mono mb-2" style={{ color: "var(--color-fg-faint)" }}>
                <span>peak φ = {c.peak_value.toFixed(3)}</span>
                <span>fwhm = {c.fwhm_nm.toFixed(0)} nm</span>
              </div>
              <div className="text-[10.5px] uppercase tracking-widest font-semibold mb-1" style={{ color: "var(--color-fg-faint)" }}>
                Top labels
              </div>
              <div className="space-y-1">
                {c.p_label_given_topic_top3.map((lab) => {
                  const w = topP > 0 ? Math.max(2, (lab.p / topP) * 100) : 0;
                  return (
                    <div key={lab.label_id} className="flex items-baseline gap-2 text-[11.5px]">
                      <span className="font-mono shrink-0" style={{ color: "var(--color-fg-faint)" }}>
                        {lab.label_id}
                      </span>
                      <span className="truncate" style={{ color: "var(--color-fg)" }} title={lab.name}>
                        {lab.name}
                      </span>
                      <span className="ml-auto font-mono text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
                        {(lab.p * 100).toFixed(1)}%
                      </span>
                      <div className="w-[60px] h-1.5 rounded ml-1 shrink-0" style={{ backgroundColor: "var(--color-border)" }}>
                        <div className="h-1.5 rounded" style={{ width: `${w}%`, backgroundColor: swatch }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterpretBandImportance({ bands }: { bands: import("@/api/client").BandCardsFile }) {
  const TOP = 24;
  const sortedFisher = [...bands.band_cards].sort((a, b) => b.fisher_ratio - a.fisher_ratio).slice(0, TOP);
  const maxFisher = sortedFisher[0]?.fisher_ratio ?? 1;
  const sortedMI = [...bands.band_cards].sort((a, b) => b.mutual_info_vs_label - a.mutual_info_vs_label).slice(0, TOP);
  const maxMI = sortedMI[0]?.mutual_info_vs_label ?? 1;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
        Band importance · top {TOP} of {bands.n_bands}
      </h4>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Fisher ratio (between-class / within-class variance) ranks bands by class separability.
        Mutual information against label is a non-parametric counterpart. Bands at 1100, 1400 and
        1900 nm are usually water-absorption features.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <BandRankingList
          title="Fisher ratio"
          accent="rgba(40, 160, 80, 1)"
          rows={sortedFisher.map((b) => ({ label: `band ${b.band_index} · ${b.wavelength_nm.toFixed(0)} nm`, value: b.fisher_ratio, max: maxFisher, p_value: b.p_value }))}
        />
        <BandRankingList
          title="Mutual information"
          accent="rgba(170, 60, 200, 1)"
          rows={sortedMI.map((b) => ({ label: `band ${b.band_index} · ${b.wavelength_nm.toFixed(0)} nm`, value: b.mutual_info_vs_label, max: maxMI }))}
        />
      </div>
    </div>
  );
}

function BandRankingList({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: string;
  rows: { label: string; value: number; max: number; p_value?: number }[];
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: accent }}>
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((r, i) => {
          const w = r.max > 0 ? Math.max(2, (r.value / r.max) * 100) : 0;
          return (
            <div key={`${title}-${i}`} className="flex items-baseline gap-2 text-[11.5px]">
              <span className="font-mono w-4 text-right shrink-0" style={{ color: "var(--color-fg-faint)" }}>{i + 1}</span>
              <span className="font-mono truncate" style={{ color: "var(--color-fg)" }} title={r.label}>
                {r.label}
              </span>
              <span className="ml-auto font-mono text-[10.5px] shrink-0" style={{ color: "var(--color-fg-faint)" }}>
                {r.value.toFixed(r.value >= 1 ? 2 : 3)}
                {r.p_value !== undefined ? ` · p=${r.p_value < 0.0001 ? "<1e-4" : r.p_value.toFixed(3)}` : ""}
              </span>
              <div className="w-[120px] h-1.5 rounded shrink-0" style={{ backgroundColor: "var(--color-border)" }}>
                <div className="h-1.5 rounded" style={{ width: `${w}%`, backgroundColor: accent }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterpretDocumentSample({ docs, K }: { docs: import("@/api/client").DocumentCardsFile; K: number }) {
  const [showN, setShowN] = useState(24);
  const sample = docs.document_cards.slice(0, showN);

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h4 className="text-base font-semibold" style={{ color: "var(--color-fg)" }}>
          Document cards · {showN} of {docs.n_documents}
        </h4>
        <div className="flex items-baseline gap-1.5">
          {[12, 24, 48, docs.n_documents].map((n) => (
            <button
              key={`show-${n}`}
              type="button"
              onClick={() => setShowN(Math.min(n, docs.n_documents))}
              className="rounded border px-2 py-0.5 text-[11px] font-mono"
              style={{
                borderColor: showN === n ? "var(--color-accent)" : "var(--color-border)",
                color: showN === n ? "var(--color-accent)" : "var(--color-fg-faint)",
                backgroundColor: showN === n ? "var(--color-accent-soft)" : "transparent",
              }}
            >
              {n === docs.n_documents ? "all" : n}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
        Each row is one document (pixel-as-document). Bar shows θ stacked across K = {K} topics
        coloured by topic. Right columns = dominant topic and ground-truth label.
      </p>
      <div className="space-y-1">
        {sample.map((doc) => {
          let acc = 0;
          return (
            <div key={doc.doc_id} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono w-16 shrink-0" style={{ color: "var(--color-fg-faint)" }}>{doc.doc_id}</span>
              <div className="flex-1 h-3 rounded overflow-hidden flex" style={{ backgroundColor: "var(--color-border)" }}>
                {doc.theta_full.map((p, k) => {
                  const w = p * 100;
                  acc += w;
                  return (
                    <span
                      key={`${doc.doc_id}-${k}`}
                      style={{ width: `${w}%`, backgroundColor: TOPIC_COLORS[k % TOPIC_COLORS.length] }}
                      title={`topic ${k}: ${(p * 100).toFixed(1)}%`}
                    />
                  );
                })}
                {acc < 99.9 ? <span style={{ width: `${100 - acc}%`, backgroundColor: "transparent" }} /> : null}
              </div>
              <span className="font-mono text-[10.5px] w-10 text-right shrink-0" style={{ color: "var(--color-fg-faint)" }}>
                t{doc.topic_k_dominant}
              </span>
              <span className="font-mono text-[10.5px] truncate shrink-0 w-32" style={{ color: "var(--color-fg)" }} title={doc.label_name}>
                {doc.label_name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnomalyTab({
  isLoading,
  error,
  topic,
  deep,
}: {
  isLoading: boolean;
  error: Error | null;
  topic: import("@/api/client").TopicAnomaly | null;
  deep: import("@/api/client").DeepAnomaly | null;
}) {
  if (isLoading) return <p style={{ color: "var(--color-fg-faint)" }}>Loading anomaly statistics…</p>;
  if (error) {
    return (
      <div className="rounded-lg border p-6" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)" }}>
        <p style={{ color: "var(--color-warn)" }}>Could not load anomaly statistics.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--color-fg-faint)" }}>{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
          Anomaly indicators vs misclassification — Spearman ρ
        </h4>
        <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
          Each row is one anomaly signal. High |ρ| ⇒ the indicator agrees with which pixels the
          routed classifier gets wrong (positive) or right (negative). p &lt; 0.05 ⇒ correlation
          significant at the 5% level. K = {topic?.topic_count ?? "—"} topics,{" "}
          {topic?.n_documents ?? "—"} documents.
        </p>

        <div className="grid sm:grid-cols-2 gap-5">
          {topic ? (
            <AnomalyMetric
              accent="rgba(40, 160, 80, 1)"
              title="Topic-based — softmax peak"
              rho={topic.anomaly_to_misclassification_correlation.spearman_rho_softmax}
              p_value={topic.anomaly_to_misclassification_correlation.spearman_p_softmax}
              caption="Lower softmax peak (less confident) ⇒ more likely to be wrong."
            />
          ) : null}
          {topic ? (
            <AnomalyMetric
              accent="rgba(40, 160, 80, 1)"
              title="Topic-based — negative log-likelihood"
              rho={topic.anomaly_to_misclassification_correlation.spearman_rho_nll}
              p_value={topic.anomaly_to_misclassification_correlation.spearman_p_nll}
              caption="Higher NLL ⇒ more likely to be wrong (positive ρ expected)."
            />
          ) : null}
          {deep?.cae_1d_8 ? (
            <AnomalyMetric
              accent="rgba(56, 189, 248, 1)"
              title="Deep — CAE-1D-8 reconstruction"
              rho={deep.cae_1d_8.spearman_rho_vs_misclass}
              caption={`indicator: ${deep.cae_1d_8.anomaly_indicator} · RMSE p50=${deep.cae_1d_8.rmse_overall.median.toFixed(3)} · p95=${deep.cae_1d_8.rmse_overall.p95.toFixed(3)}`}
            />
          ) : null}
          {deep?.beta_vae_8 ? (
            <AnomalyMetric
              accent="rgba(170, 60, 200, 1)"
              title="Deep — β-VAE reconstruction RMSE"
              rho={deep.beta_vae_8.spearman_rho_rmse_vs_misclass}
              caption={`RMSE p50=${deep.beta_vae_8.rmse_overall.median.toFixed(3)} · p95=${deep.beta_vae_8.rmse_overall.p95.toFixed(3)}`}
            />
          ) : null}
          {deep?.beta_vae_8 ? (
            <AnomalyMetric
              accent="rgba(170, 60, 200, 1)"
              title="Deep — β-VAE KL"
              rho={deep.beta_vae_8.spearman_rho_kl_vs_misclass}
              caption={`KL p50=${deep.beta_vae_8.kl_overall.median.toFixed(3)} · p95=${deep.beta_vae_8.kl_overall.p95.toFixed(3)} · KL is the regularisation term (high = far from prior)`}
            />
          ) : null}
        </div>

        {topic?.anomaly_to_misclassification_correlation.comment ? (
          <p className="mt-4 text-[12px] italic" style={{ color: "var(--color-fg-faint)" }}>
            {topic.anomaly_to_misclassification_correlation.comment}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AnomalyMetric({
  accent,
  title,
  rho,
  p_value,
  caption,
}: {
  accent: string;
  title: string;
  rho: number;
  p_value?: number;
  caption?: string;
}) {
  const abs = Math.abs(rho);
  const tone = abs >= 0.3 ? "strong" : abs >= 0.15 ? "moderate" : "weak";
  const significant = p_value !== undefined ? p_value < 0.05 : null;
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: accent }}>
      <div className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: accent }}>
        {title}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-[24px] font-mono leading-tight" style={{ color: "var(--color-fg)" }}>
          {rho >= 0 ? "+" : ""}{rho.toFixed(3)}
        </span>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--color-fg-faint)" }}>
          ρ · {tone}
        </span>
        {p_value !== undefined ? (
          <span
            className="ml-auto text-[10.5px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: significant ? "rgba(40,160,80,1)" : "var(--color-fg-faint)",
              backgroundColor: significant ? "rgba(40,160,80,0.12)" : "transparent",
              border: significant ? "1px solid rgba(40,160,80,0.4)" : "1px solid var(--color-border)",
            }}
          >
            p = {p_value < 0.0001 ? "<1e-4" : p_value.toFixed(4)}
          </span>
        ) : null}
      </div>
      {caption ? (
        <p className="text-[11px] mt-1" style={{ color: "var(--color-fg-faint)" }}>
          {caption}
        </p>
      ) : null}
    </div>
  );
}
