import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";

const SUBPAGES = [
  { path: "/methodology/theory", tagKey: "theory_tag", titleKey: "theory_title", bodyKey: "theory_body", color: "rgba(56, 189, 248, 1)", icon: "theory" as const },
  { path: "/methodology/representations", tagKey: "repr_tag", titleKey: "repr_title", bodyKey: "repr_body", color: "rgba(170, 60, 200, 1)", icon: "repr" as const },
  { path: "/methodology/pipeline", tagKey: "pipe_tag", titleKey: "pipe_title", bodyKey: "pipe_body", color: "rgba(40, 160, 80, 1)", icon: "pipe" as const },
  { path: "/methodology/application", tagKey: "app_tag", titleKey: "app_title", bodyKey: "app_body", color: "rgba(214, 140, 40, 1)", icon: "app" as const },
];

export default function MethodologyIndex() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology.title")}
      lead={t("pages:methodology.index.lead")}
    >
      <div className="grid sm:grid-cols-2 gap-4 mt-2">
        {SUBPAGES.map((p) => (
          <Link
            key={p.path}
            to={p.path}
            className="rounded-xl border p-5 transition-all hover:shadow-lg hover:-translate-y-0.5 relative overflow-hidden"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ backgroundColor: p.color }}
            />
            <div className="flex items-baseline justify-between mb-3 mt-1.5">
              <span
                className="text-[11px] uppercase tracking-widest font-semibold"
                style={{ color: p.color }}
              >
                {t(`pages:methodology.index.${p.tagKey}`)}
              </span>
              <span aria-hidden className="text-[14px]" style={{ color: p.color, opacity: 0.4 }}>→</span>
            </div>
            <SubpageIcon kind={p.icon} color={p.color} />
            <h2
              className="mt-3 text-lg font-semibold tracking-tight"
              style={{ color: "var(--color-fg)" }}
            >
              {t(`pages:methodology.index.${p.titleKey}`)}
            </h2>
            <p
              className="mt-2 text-[13.5px] leading-relaxed"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {t(`pages:methodology.index.${p.bodyKey}`)}
            </p>
          </Link>
        ))}
      </div>

      <div
        className="mt-6 rounded-lg border p-4 text-[13px] leading-relaxed"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
          color: "var(--color-fg-subtle)",
        }}
      >
        {t("pages:methodology.index.reading")}
      </div>
    </PageShell>
  );
}

function SubpageIcon({ kind, color }: { kind: "theory" | "repr" | "pipe" | "app"; color: string }) {
  if (kind === "theory") {
    return (
      <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
        <rect x="14" y="10" width="290" height="60" fill="none" stroke={color} strokeWidth="1.4" rx="6"/>
        <text x="294" y="64" fontSize="10" textAnchor="end" fill={color} fontFamily="ui-monospace, monospace" opacity="0.75">D</text>
        <rect x="100" y="22" width="190" height="38" fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.2" rx="6"/>
        <text x="282" y="55" fontSize="10" textAnchor="end" fill={color} fontFamily="ui-monospace, monospace" opacity="0.55">N_d</text>
        <circle cx="40" cy="40" r="11" fill="none" stroke={color} strokeWidth="1.4"/>
        <text x="40" y="44" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace">α</text>
        <circle cx="80" cy="40" r="11" fill="none" stroke={color} strokeWidth="1.4"/>
        <text x="80" y="44" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace">θ</text>
        <circle cx="135" cy="40" r="11" fill="none" stroke={color} strokeWidth="1.4"/>
        <text x="135" y="44" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace">z</text>
        <circle cx="200" cy="40" r="11" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.4"/>
        <text x="200" y="44" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace">w</text>
        <circle cx="260" cy="40" r="11" fill="none" stroke={color} strokeWidth="1.4"/>
        <text x="260" y="44" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace">φ</text>
        <line x1="51" y1="40" x2="69" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="91" y1="40" x2="124" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="146" y1="40" x2="189" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="249" y1="40" x2="211" y2="40" stroke={color} strokeWidth="1.2"/>
      </svg>
    );
  }
  if (kind === "repr") {
    return (
      <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={i * 22 + 4} y="14" width="18" height="22" rx="3" fill={color} fillOpacity={0.15 + 0.5 * (i % 3) / 3} stroke={color} strokeWidth="0.7"/>
            <text x={i * 22 + 13} y="29" fontSize="8.5" textAnchor="middle" fill="currentColor" opacity="0.85" fontFamily="ui-monospace, monospace">V{i + 1}</text>
          </g>
        ))}
        <rect x="4" y="46" width="110" height="22" rx="6" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.1"/>
        <text x="59" y="61" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace" fontWeight="600">CAE-1D · 2D · 3D</text>
        <rect x="120" y="46" width="80" height="22" rx="6" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.1"/>
        <text x="160" y="61" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace" fontWeight="600">β-VAE</text>
        <rect x="206" y="46" width="105" height="22" rx="6" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.1"/>
        <text x="258" y="61" fontSize="10" textAnchor="middle" fill={color} fontFamily="ui-monospace, monospace" fontWeight="600">ProdLDA · ETM</text>
      </svg>
    );
  }
  if (kind === "pipe") {
    return (
      <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
        {[0, 60, 120, 180, 240].map((x, i) => (
          <g key={i}>
            <rect x={x + 6} y="28" width="50" height="22" rx="4" fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.2"/>
            <text x={x + 31} y="43" fontSize="9" textAnchor="middle" fill="currentColor" opacity="0.85" fontFamily="ui-monospace, monospace">
              {["fetch", "core", "build", "curate", "API"][i]}
            </text>
            {i < 4 ? <line x1={x + 56} y1="39" x2={x + 66} y2="39" stroke={color} strokeWidth="1.2" markerEnd="url(#mi-arr)"/> : null}
          </g>
        ))}
        <defs>
          <marker id="mi-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={color}/>
          </marker>
        </defs>
        <text x="160" y="68" fontSize="9.5" textAnchor="middle" fill="currentColor" opacity="0.55">57 builders · GPU when available</text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
      {[
        { label: "direct", desc: "θ flat → logistic", x: 4 },
        { label: "routed", desc: "P_k(y|x) gated by θ_k", x: 110 },
        { label: "embedded", desc: "[θ | PCA_K] → logistic", x: 216 },
      ].map((b, i) => (
        <g key={b.label}>
          <rect x={b.x} y="10" width="100" height="56" rx="6" fill={color} fillOpacity={0.12 + 0.1 * i} stroke={color} strokeWidth={i === 1 ? 2 : 1.1}/>
          <text x={b.x + 50} y="32" fontSize="11" textAnchor="middle" fill={color} fontWeight="600">{b.label}</text>
          <text x={b.x + 50} y="50" fontSize="8.5" textAnchor="middle" fill="currentColor" opacity="0.7" fontFamily="ui-monospace, monospace">{b.desc}</text>
        </g>
      ))}
      <text x="160" y="76" fontSize="9.5" textAnchor="middle" fill={color} opacity="0.85" fontWeight="600">routed wins B-3</text>
    </svg>
  );
}
