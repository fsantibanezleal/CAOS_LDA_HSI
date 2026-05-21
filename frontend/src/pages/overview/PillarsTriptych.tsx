import { useTranslation } from "react-i18next";

export function PillarsTriptych() {
  const { t } = useTranslation(["pages"]);
  const pillars = [
    {
      title: t("pages:overview.pillars.documents_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 1 }),
      body: t("pages:overview.pillars.documents_body"),
      icon: "doc",
    },
    {
      title: t("pages:overview.pillars.discretisation_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 2 }),
      body: t("pages:overview.pillars.discretisation_body"),
      icon: "tok",
    },
    {
      title: t("pages:overview.pillars.model_title"),
      tag: t("pages:overview.pillars.lever_label", { idx: 3 }),
      body: t("pages:overview.pillars.model_body"),
      icon: "mod",
    },
  ];
  return (
    <section className="mt-12">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.pillars.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.pillars.title")}
        </h2>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {pillars.map((p) => (
          <div
            key={p.title}
            className="rounded-xl border p-5 relative overflow-hidden hover:shadow-lg transition-shadow"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div className="mb-3">
              <PillarIcon kind={p.icon as "doc" | "tok" | "mod"} />
            </div>
            <span className="text-[10.5px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
              {p.tag}
            </span>
            <h3 className="text-base font-semibold mt-1 mb-2" style={{ color: "var(--color-fg)" }}>
              {p.title}
            </h3>
            <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
              {p.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PillarIcon({ kind }: { kind: "doc" | "tok" | "mod" }) {
  if (kind === "doc") {
    return (
      <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
        {/* grid of pixels with one highlighted */}
        {Array.from({ length: 5 }, (_, r) =>
          Array.from({ length: 8 }, (_, c) => (
            <rect
              key={`${r}-${c}`}
              x={c * 12 + 2}
              y={r * 11 + 2}
              width="10"
              height="9"
              fill={r === 2 && c === 4 ? "rgba(214,39,40,0.9)" : `rgba(56,189,248,${0.2 + 0.5 * ((r + c) % 3) / 2})`}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
          )),
        )}
      </svg>
    );
  }
  if (kind === "tok") {
    return (
      <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
        {/* spectrum line and quantisation bars */}
        <path d="M 0,40 C 12,10 24,55 36,30 S 60,5 72,38 S 96,12 100,28" fill="none" stroke="rgba(170,60,200,1)" strokeWidth="1.5"/>
        {Array.from({ length: 10 }, (_, i) => (
          <rect key={i} x={i * 10 + 1} y="42" width="8" height={8 + (i % 4) * 4} fill="rgba(170,60,200,0.55)" stroke="currentColor" strokeOpacity="0.2" strokeWidth="0.4"/>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 60" width="100" height="60" aria-hidden="true">
      {/* topic-word phi heatmap */}
      {Array.from({ length: 5 }, (_, k) =>
        Array.from({ length: 12 }, (_, b) => (
          <rect
            key={`${k}-${b}`}
            x={b * 8 + 2}
            y={k * 11 + 2}
            width="7"
            height="9"
            fill={`rgba(40,160,80,${0.15 + 0.7 * Math.abs(Math.sin(k * 1.4 + b * 0.6))})`}
          />
        )),
      )}
    </svg>
  );
}

/* =========================================================================
   7. Method coverage panel
   =======================================================================*/

