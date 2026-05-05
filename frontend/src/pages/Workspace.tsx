import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMachine } from "@xstate/react";
import { useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { ClassDistributionBar } from "@/components/plots/ClassDistributionBar";
import { IntertopicMap, TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { SpectralByClass } from "@/components/plots/SpectralByClass";
import { TopicLabelHeatmap } from "@/components/plots/TopicLabelHeatmap";
import { TopicSpectrum } from "@/components/plots/TopicSpectrum";
import { workspaceMachine } from "@/state/workspaceMachine";
import type { DatasetFamily } from "@/state/useSelectionStore";
import { cn } from "@/lib/cn";

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

type ExploreTab = "raw" | "topics" | "topiclabel";

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
                { id: "topics", label: "Tópicos · LDAvis" },
                { id: "topiclabel", label: "Tópico vs etiqueta" },
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
