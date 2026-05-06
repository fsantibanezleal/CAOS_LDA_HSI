import { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry, type DatasetInventory } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { cn } from "@/lib/cn";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const BADGE_PALETTE: Record<string, string> = {
  "good-first-demo": "var(--color-success)",
  "secondary": "var(--color-accent)",
  "exploratory": "var(--color-warn)",
};

function fitColor(fit: string): string {
  return BADGE_PALETTE[fit] ?? "var(--color-fg-faint)";
}

function readHashFamily(): string | null {
  if (typeof window === "undefined") return null;
  const h = window.location.hash.replace(/^#/, "");
  return h || null;
}

export default function Databases() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory"],
    queryFn: api.inventory,
  });

  const groupedByFamily = useMemo(() => {
    if (!data)
      return [] as { family_id: string; family: string; entries: DatasetEntry[] }[];
    const familyTitleMap = new Map(
      data.family_views.map((f) => [f.family_id, f.family_title]),
    );
    const seen = new Map<string, DatasetEntry[]>();
    for (const ds of data.datasets) {
      if (!seen.has(ds.family_id)) seen.set(ds.family_id, []);
      seen.get(ds.family_id)!.push(ds);
    }
    return Array.from(seen.entries()).map(([fid, entries]) => ({
      family_id: fid,
      family: familyTitleMap.get(fid) ?? fid,
      entries,
    }));
  }, [data]);

  const [activeFamily, setActiveFamily] = useState<string | null>(null);

  // Default to the hash family if valid, else the first non-empty group.
  useEffect(() => {
    if (!groupedByFamily.length) return;
    if (activeFamily && groupedByFamily.some((g) => g.family_id === activeFamily))
      return;
    const fromHash = readHashFamily();
    const valid = fromHash
      ? groupedByFamily.find((g) => g.family_id === fromHash)
      : null;
    setActiveFamily(valid ? valid.family_id : groupedByFamily[0]!.family_id);
  }, [groupedByFamily, activeFamily]);

  // Sync hash when active family changes from a click.
  const onPickFamily = (fid: string) => {
    setActiveFamily(fid);
    if (typeof window !== "undefined") {
      window.location.hash = fid;
    }
  };

  const activeGroup =
    groupedByFamily.find((g) => g.family_id === activeFamily) ?? null;

  return (
    <PageShell
      title={t("pages:databases.title")}
      lead="21 datasets agrupados en 4 familias. Cada uno declara modalidad, dominios, estado de supervisión, y si tiene raíces locales disponibles para el pipeline. Los datos crudos no se sirven desde la app web — sólo los derivados publicables."
    >
      {isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          {t("common:states.loading", { ns: "common" })}
        </p>
      )}

      {error && (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            boxShadow: "var(--color-shadow)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            {t("common:states.endpoint_unavailable", { ns: "common" })}
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            <code>/api/local-dataset-inventory</code> —{" "}
            {error instanceof Error ? error.message : String(error)}
          </p>
        </div>
      )}

      {data && (
        <>
          <SummaryRow inventory={data} />

          <FamilyTabs
            groups={groupedByFamily}
            active={activeFamily}
            onPick={onPickFamily}
          />

          {activeGroup && (
            <section className="mt-6">
              <header className="mb-4">
                <h2
                  className="text-xl md:text-2xl font-semibold tracking-tight"
                  style={{ color: "var(--color-fg)" }}
                >
                  {activeGroup.family}
                </h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  {activeGroup.entries.length} datasets ·{" "}
                  {
                    activeGroup.entries.filter((e) => e.local_raw_available)
                      .length
                  }{" "}
                  con raíz local
                </p>
              </header>
              <div className="grid sm:grid-cols-2 gap-4">
                {activeGroup.entries.map((d) => (
                  <DatasetCard key={d.id} dataset={d} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

function FamilyTabs({
  groups,
  active,
  onPick,
}: {
  groups: { family_id: string; family: string; entries: DatasetEntry[] }[];
  active: string | null;
  onPick: (fid: string) => void;
}) {
  return (
    <nav
      role="tablist"
      aria-label="Familias de datasets"
      className="flex flex-wrap gap-2 mt-6 border-b pb-3"
      style={{ borderColor: "var(--color-border)" }}
    >
      {groups.map((g) => {
        const isActive = active === g.family_id;
        const localCount = g.entries.filter((e) => e.local_raw_available).length;
        return (
          <button
            key={g.family_id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onPick(g.family_id)}
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
            <span className="mr-2">{g.family}</span>
            <span
              className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-mono"
              style={{
                backgroundColor: isActive
                  ? "var(--color-accent)"
                  : "var(--color-bg)",
                color: isActive
                  ? "var(--color-accent-fg)"
                  : "var(--color-fg-faint)",
              }}
            >
              {g.entries.length}
              {localCount < g.entries.length && (
                <span className="opacity-70"> · {localCount} local</span>
              )}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SummaryRow({ inventory }: { inventory: DatasetInventory }) {
  const summary = inventory.summary;
  return (
    <div
      className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"
      style={{ color: "var(--color-fg-subtle)" }}
    >
      <SummaryStat label="Datasets catalogados" value={String(summary.cataloged_dataset_count)} />
      <SummaryStat
        label="Con descarga local"
        value={`${summary.datasets_with_local_raw} / ${summary.cataloged_dataset_count}`}
      />
      <SummaryStat
        label="Volumen crudo"
        value={`${summary.raw_total_size_gb.toFixed(1)} GB`}
      />
      <SummaryStat
        label="Fuentes"
        value={String(Object.keys(summary.source_group_counts).length)}
      />
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        className="text-xs uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}

function DatasetCard({ dataset }: { dataset: DatasetEntry }) {
  return (
    <article
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="flex items-start gap-3 justify-between mb-2">
        <h3
          className="text-base font-semibold leading-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {dataset.name}
        </h3>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[11px] font-mono whitespace-nowrap"
          style={{
            backgroundColor: "var(--color-accent-soft)",
            color: fitColor(dataset.fit_for_demo),
          }}
          title={`fit: ${dataset.fit_for_demo}`}
        >
          {dataset.fit_for_demo}
        </span>
      </header>

      <dl
        className="text-[13px] leading-relaxed space-y-1.5"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <KvRow label="Modalidad" value={dataset.modality} />
        <KvRow
          label="Dominios"
          value={dataset.domains.join(", ") || "—"}
        />
        <KvRow
          label="Supervisión"
          value={dataset.supervision_states.join(" · ") || "ninguna"}
        />
        <KvRow label="Acceso" value={dataset.access} />
        {dataset.local_raw_available ? (
          <KvRow
            label="Crudo local"
            value={`${dataset.raw_file_count} archivos · ${formatBytes(
              dataset.raw_total_size_bytes,
            )}`}
          />
        ) : (
          <KvRow
            label="Crudo local"
            value="no descargado en esta máquina"
          />
        )}
        {dataset.last_verified && (
          <KvRow label="Última verificación" value={dataset.last_verified} />
        )}
      </dl>

      {dataset.label_scope && (
        <p
          className="mt-3 text-[12.5px] leading-relaxed"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {dataset.label_scope}
        </p>
      )}

      {dataset.raw_files.length > 0 && (
        <details className="mt-3">
          <summary
            className="cursor-pointer text-[12.5px] font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            Archivos fuente ({dataset.raw_files.length})
          </summary>
          <ul
            className="mt-2 space-y-1 text-[12px]"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {dataset.raw_files.map((f) => (
              <li key={f.url} className="truncate">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono break-all"
                  style={{ color: "var(--color-accent)" }}
                >
                  {f.name}
                </a>
                <span className="ml-2">{formatBytes(f.size_bytes)}</span>
                {f.kind && <span className="ml-2">· {f.kind}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt
        className="shrink-0 w-32 text-[12px] uppercase tracking-wider pt-0.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </dt>
      <dd className="flex-1">{value}</dd>
    </div>
  );
}
