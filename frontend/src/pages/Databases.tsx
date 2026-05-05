import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api, type DatasetEntry, type DatasetInventory } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

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

export default function Databases() {
  const { t } = useTranslation(["pages"]);
  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory"],
    queryFn: api.inventory,
  });

  const groupedByFamily = useMemo(() => {
    if (!data) return [];
    const groups: { family: string; family_id: string; entries: DatasetEntry[] }[] = [];
    const familyTitleMap = new Map(
      data.family_views.map((f) => [f.family_id, f.family_title]),
    );
    const seen = new Map<string, DatasetEntry[]>();
    for (const ds of data.datasets) {
      if (!seen.has(ds.family_id)) seen.set(ds.family_id, []);
      seen.get(ds.family_id)!.push(ds);
    }
    for (const [fid, entries] of seen.entries()) {
      groups.push({
        family_id: fid,
        family: familyTitleMap.get(fid) ?? fid,
        entries,
      });
    }
    return groups;
  }, [data]);

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

          <div className="space-y-12 mt-10">
            {groupedByFamily.map((g) => (
              <Section key={g.family_id} id={g.family_id} title={g.family}>
                <div className="grid sm:grid-cols-2 gap-4 mt-2">
                  {g.entries.map((d) => (
                    <DatasetCard key={d.id} dataset={d} />
                  ))}
                </div>
              </Section>
            ))}
          </div>
        </>
      )}
    </PageShell>
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
