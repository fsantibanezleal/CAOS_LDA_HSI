import { Link } from "react-router-dom";

import { PageShell } from "@/components/PageShell";

const SUBPAGES = [
  {
    path: "/methodology/theory",
    title: "Teoría",
    tag: "PTM · LDA",
    body: "El modelo probabilístico de tópicos (PTM) y por qué un píxel hiperespectral puede tratarse como un documento. LDA en notación de placas, inferencia variacional, generalización a HDP y CTM. Equations: \\theta \\sim \\mathrm{Dir}(\\alpha), \\phi \\sim \\mathrm{Dir}(\\eta), z \\sim \\mathrm{Cat}(\\theta), w \\sim \\mathrm{Cat}(\\phi_z).",
    color: "rgba(56, 189, 248, 1)",
    icon: "theory" as const,
  },
  {
    path: "/methodology/representations",
    title: "Representaciones",
    tag: "V1..V12 + Deep",
    body: "Doce recetas de wordificación (V1 banda → V12 GMM-token), tres esquemas (uniform/quantile/equalised), Q ∈ {8, 16, 32}. Más cinco encoders profundos: CAE-1D / CAE-2D / CAE-3D anchor & full-patch / β-VAE. PCA, NMF, ICA como baselines K-dim de comparación justa.",
    color: "rgba(170, 60, 200, 1)",
    icon: "repr" as const,
  },
  {
    path: "/methodology/pipeline",
    title: "Pipeline",
    tag: "57 builders",
    body: "Diagrama de las 12 etapas del data-pipeline: fetch_* (acquire) → research_core (paths/loaders) → build_* (offline compute) → curate_for_web → manifest. Cinco builders torch (cae_1d, cae_2d, cae_3d, beta_vae, prodlda) detectan GPU automáticamente con fallback CPU.",
    color: "rgba(40, 160, 80, 1)",
    icon: "pipe" as const,
  },
  {
    path: "/methodology/application",
    title: "Aplicación",
    tag: "directo · routed · embedded",
    body: "Cómo se aplican los tópicos a tareas downstream: feature plano (theta_logistic, dominado por raw), gating (topic_routed_soft = soft mixture de especialistas por tópico, gana o iguala raw en 6/6), embedded (concat [θ | pca_K], pequeño efecto en IP). El B-3 follow-up cierra: el simplex Dirichlet importa, no la compresión K-dim.",
    color: "rgba(214, 140, 40, 1)",
    icon: "app" as const,
  },
];

export default function MethodologyIndex() {
  return (
    <PageShell
      title="Metodología"
      lead="Cuatro entradas: la teoría detrás del modelo, las representaciones que el corpus acepta, el pipeline que produce los datos, y cómo los tópicos se aplican a tareas downstream."
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
                {p.tag}
              </span>
              <span aria-hidden className="text-[14px]" style={{ color: p.color, opacity: 0.4 }}>→</span>
            </div>
            <SubpageIcon kind={p.icon} color={p.color} />
            <h2
              className="mt-3 text-lg font-semibold tracking-tight"
              style={{ color: "var(--color-fg)" }}
            >
              {p.title}
            </h2>
            <p
              className="mt-2 text-[13.5px] leading-relaxed"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {p.body}
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
        <strong style={{ color: "var(--color-fg)" }}>Lectura sugerida</strong>:
        Teoría → Representaciones → Pipeline → Aplicación. La hoja de
        Bayesian Method Comparison y la página Multi-Axis Addendum B
        de la wiki cierran el ciclo metodológico.
      </div>
    </PageShell>
  );
}

function SubpageIcon({ kind, color }: { kind: "theory" | "repr" | "pipe" | "app"; color: string }) {
  if (kind === "theory") {
    // plate notation simplified
    return (
      <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
        {/* outer plate */}
        <rect x="14" y="10" width="290" height="60" fill="none" stroke={color} strokeWidth="1.4" rx="6"/>
        <text x="294" y="64" fontSize="10" textAnchor="end" fill={color} fontFamily="ui-monospace, monospace" opacity="0.75">D</text>
        {/* inner plate */}
        <rect x="100" y="22" width="190" height="38" fill="none" stroke={color} strokeOpacity="0.6" strokeWidth="1.2" rx="6"/>
        <text x="282" y="55" fontSize="10" textAnchor="end" fill={color} fontFamily="ui-monospace, monospace" opacity="0.55">N_d</text>
        {/* nodes */}
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
        {/* arrows */}
        <line x1="51" y1="40" x2="69" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="91" y1="40" x2="124" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="146" y1="40" x2="189" y2="40" stroke={color} strokeWidth="1.2"/>
        <line x1="249" y1="40" x2="211" y2="40" stroke={color} strokeWidth="1.2"/>
      </svg>
    );
  }
  if (kind === "repr") {
    // 12 recipes grid + deep encoder badge
    return (
      <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <g key={i}>
            <rect x={i * 22 + 4} y="14" width="18" height="22" rx="3" fill={color} fillOpacity={0.15 + 0.5 * (i % 3) / 3} stroke={color} strokeWidth="0.7"/>
            <text x={i * 22 + 13} y="29" fontSize="8.5" textAnchor="middle" fill="currentColor" opacity="0.85" fontFamily="ui-monospace, monospace">V{i + 1}</text>
          </g>
        ))}
        {/* deep encoder badge */}
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
    // 12-stage pipeline DAG
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
  // app
  return (
    <svg viewBox="0 0 320 80" width="100%" height="76" aria-hidden="true">
      {/* three flow rectangles: directo, routed, embedded */}
      {[
        { label: "directo", desc: "θ flat → logistic", x: 4 },
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
