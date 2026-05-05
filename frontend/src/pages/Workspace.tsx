import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useMachine } from "@xstate/react";
import { useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { workspaceMachine } from "@/state/workspaceMachine";
import type { DatasetFamily } from "@/state/useSelectionStore";
import { cn } from "@/lib/cn";

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
          <PendingStep
            label="Representación"
            description="Aquí escogerás el modelo (PTM, LDA, NMF, PCA, AE) y el wordification + cuantización para el conjunto seleccionado. La grilla de configuraciones precalculadas se sirve desde /api/wordifications + /api/topic-variants. Esta vista se construye en una próxima entrega."
            onBack={() => send({ type: "BACK" })}
          />
        )}

        {String(state.value).startsWith("explore") && (
          <PendingStep
            label="Explorar"
            description="Aquí verás los gráficos espectrales (cientos a miles de espectros), el mapa raster con click-to-inspect, t-SNE 2D y 3D, distribuciones tópico-vs-etiqueta, y la firma φ_k por tópico. Todo precalculado del lado del pipeline. Se construye en sucesivas entregas."
            onBack={() => send({ type: "BACK" })}
          />
        )}
      </div>
    </PageShell>
  );
}

function PendingStep({
  label,
  description,
  onBack,
}: {
  label: string;
  description: string;
  onBack: () => void;
}) {
  return (
    <div
      className="rounded-lg border p-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h3
        className="text-base font-semibold mb-2"
        style={{ color: "var(--color-fg)" }}
      >
        {label}
      </h3>
      <p style={{ color: "var(--color-fg-subtle)" }}>{description}</p>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 rounded-md px-3 py-1.5 text-sm border"
        style={{
          borderColor: "var(--color-border)",
          color: "var(--color-fg)",
          backgroundColor: "transparent",
        }}
      >
        ← Volver al paso anterior
      </button>
    </div>
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
