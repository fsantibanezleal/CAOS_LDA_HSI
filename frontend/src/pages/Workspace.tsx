import { lazy, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMachine } from "@xstate/react";
import { useQuery } from "@tanstack/react-query";

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
      lead="Flujo guiado en cuatro pasos: familia → conjunto → representación → explorar. Cada paso depende de los anteriores; puedes retroceder en cualquier momento."
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
  | "stability"
  | "usgs"
  | "metrics";

function ExploreStep({
  subsetId,
  rep,
  onBack,
}: {
  subsetId: string | null;
  rep: string | null;
  onBack: () => void;
}) {
  const isLabelled = subsetId !== null && LABELLED_SCENES.has(subsetId);
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

      {!isLabelled && (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <p style={{ color: "var(--color-fg-subtle)" }}>
            Esta vista cruda actualmente sólo está implementada para las 6
            escenas etiquetadas (Indian Pines, Salinas, Salinas-A, Pavia U,
            KSC, Botswana). Para HIDSAG / unmixing / individual-spectra los
            paneles equivalentes (medición por estrato, abundancias por
            endmember, espectros por material) se construyen en próximas
            entregas.
          </p>
        </div>
      )}

      {isLabelled && (
        <>
          <nav
            role="tablist"
            aria-label="Paneles de exploración"
            className="flex flex-wrap gap-2 border-b mb-6 pb-3"
            style={{ borderColor: "var(--color-border)" }}
          >
            {(
              [
                { id: "raw", label: "Cruda · clases" },
                { id: "browser", label: "Browser · 8000 espectros" },
                { id: "topics", label: "Tópicos · LDAvis" },
                { id: "topiclabel", label: "Tópico vs etiqueta" },
                { id: "routed", label: "Routed · ranking" },
                { id: "raster", label: "Mapa espacial" },
                { id: "embed3d", label: "Embedding 3D · θ-PCA" },
                { id: "stability", label: "Estabilidad · 7-seed" },
                { id: "usgs", label: "USGS · librería v7" },
                { id: "metrics", label: "Reconstrucción + MI" },
              ] as { id: ExploreTab; label: string }[]
            ).map((opt) => {
              const isActive = tab === opt.id;
              return (
                <button
                  key={opt.id}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setTab(opt.id)}
                  className={cn(
                    "rounded-md border px-4 py-2 text-sm transition-colors",
                    isActive ? "font-semibold" : "opacity-80 hover:opacity-100",
                  )}
                  style={{
                    borderColor: isActive
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    backgroundColor: isActive
                      ? "var(--color-accent-soft)"
                      : "var(--color-panel)",
                    color: isActive ? "var(--color-accent)" : "var(--color-fg)",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
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
            />
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

function StabilityTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: import("@/api/client").TopicStability | null;
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
            Estabilidad de tópicos · matched-cosine entre {data.seeds.length}{" "}
            seeds
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
