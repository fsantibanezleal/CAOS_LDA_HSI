import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LABELLED_SCENES, type ScenePeek } from "./types";

export function ScenesShowcase({ scenes }: { scenes: (ScenePeek | null)[] | null }) {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-end justify-between flex-wrap gap-3">
        <div>
          <span
            className="text-[11px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--color-accent)" }}
          >
            {t("pages:overview.scenes.tag")}
          </span>
          <h2
            className="text-xl md:text-2xl font-semibold tracking-tight mt-1"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:overview.scenes.title")}
          </h2>
          <p
            className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            {t("pages:overview.scenes.lead")}
          </p>
        </div>
        <Link
          to="/databases"
          className="text-[12.5px] underline-offset-4"
          style={{ color: "var(--color-accent)" }}
        >
          {t("pages:overview.scenes.open_catalogue")}
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LABELLED_SCENES.map((meta, i) => {
          const peek = scenes?.[i];
          return <SceneCard key={meta.id} meta={meta} peek={peek} />;
        })}
      </div>
    </section>
  );
}

function SceneCard({
  meta,
  peek,
}: {
  meta: { id: string; label: string; sensor: string };
  peek: ScenePeek | null | undefined;
}) {
  const { t } = useTranslation(["pages"]);
  const dist = peek?.class_distribution ?? [];
  return (
    <Link
      to={`/workspace?scene=${encodeURIComponent(meta.id)}`}
      className="rounded-lg border p-4 transition-all hover:shadow-lg hover:scale-[1.01] block"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: "var(--color-fg)" }}>
          {meta.label}
        </h3>
        <span
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {meta.sensor}
        </span>
      </div>
      <div
        className="text-[11.5px] mb-2"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {peek
          ? `${peek.n_classes} ${t("pages:overview.scenes.n_classes_short")} · ${peek.n_labelled_pixels.toLocaleString("en-US")} ${t("pages:overview.scenes.n_pixels_short")} · ${peek.wavelengths_nm.length} ${t("pages:overview.scenes.n_bands_short")}`
          : t("pages:overview.scenes.loading_stat")}
      </div>
      {dist.length ? (
        <div className="w-full h-7 flex rounded overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
          {dist.map((c) => (
            <div
              key={c.label_id}
              title={`${c.name} · ${c.count.toLocaleString("en-US")} px (${(c.rel_freq * 100).toFixed(1)}%)`}
              style={{
                width: `${c.rel_freq * 100}%`,
                backgroundColor: c.color,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="w-full h-7 rounded"
          style={{ backgroundColor: "var(--color-border)", opacity: 0.4 }}
        />
      )}
      {dist.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {dist.slice(0, 4).map((c) => (
            <span key={c.label_id} className="inline-flex items-center gap-1 text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>
              <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: c.color }}/>
              {c.name}
            </span>
          ))}
          {dist.length > 4 ? (
            <span className="text-[10.5px]" style={{ color: "var(--color-fg-faint)" }}>{t("pages:overview.scenes.more_classes", { count: dist.length - 4 })}</span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

/* =========================================================================
   6. Pillars triptych — rich SVG icons
   =======================================================================*/

