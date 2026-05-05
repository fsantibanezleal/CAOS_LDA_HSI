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

        {String(state.value) !== "pickFamily" && (
          <div
            className="rounded-lg border p-6"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <p style={{ color: "var(--color-fg-subtle)" }}>
              Pasos posteriores (conjunto, representación, exploración) se
              activan progresivamente mientras se construyen las
              visualizaciones. Cada paso siguiente reusará la misma máquina
              XState de la página y los selectores precalculados que sirve
              el backend.
            </p>
            <button
              type="button"
              onClick={() => send({ type: "BACK" })}
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
        )}
      </div>
    </PageShell>
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
