import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

const PILLARS = [
  {
    title: "Documentos",
    body: "Cómo construir un documento: por píxel, por región SLIC / Felzenszwalb, por parche, por muestra completa. Cuatro alternativas materializadas en build_groupings.",
  },
  {
    title: "Discretización",
    body: "Cómo el espectro continuo se vuelve token discreto: doce recetas (V1..V12), tres esquemas de cuantización, tres niveles Q ∈ {8, 16, 32}.",
  },
  {
    title: "Modelo de tópicos",
    body: "LDA canónico (collapsed Gibbs, variational Bayes), HDP, CTM, ProdLDA, NMF, PCA y autoencoders como baselines de la misma dimensión K.",
  },
];

const HEADLINES = [
  {
    label: "Datasets",
    value: "21",
    sub: "across 4 families",
    href: "/databases",
  },
  {
    label: "Wordification recipes",
    value: "12",
    sub: "V1 (band) → V12 (GMM)",
    href: "/methodology/representations",
  },
  {
    label: "Builders",
    value: "51",
    sub: "data-pipeline modules",
    href: "/methodology/pipeline",
  },
  {
    label: "Validation blocks",
    value: "6 × 6",
    sub: "scenes × ready blocks",
    href: "/benchmarks",
  },
];

export default function Overview() {
  const { t } = useTranslation(["pages"]);

  const { data: manifest } = useQuery({
    queryKey: ["manifest"],
    queryFn: api.manifest,
    retry: false,
  });

  return (
    <PageShell
      title={t("pages:overview.title")}
      lead={t("pages:overview.lead")}
    >
      <div className="flex flex-wrap gap-3">
        <Link
          to="/workspace"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-accent-fg)",
          }}
        >
          {t("pages:overview.cta_workspace")}
        </Link>
        <Link
          to="/methodology"
          className="rounded-md px-4 py-2 text-sm font-medium border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
          }}
        >
          {t("pages:overview.cta_methodology")}
        </Link>
        <Link
          to="/databases"
          className="rounded-md px-4 py-2 text-sm font-medium border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
          }}
        >
          Bases de datos
        </Link>
        <Link
          to="/benchmarks"
          className="rounded-md px-4 py-2 text-sm font-medium border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
          }}
        >
          Benchmarks
        </Link>
      </div>

      <Section
        id="headlines"
        title="En cifras"
        lead="Lo que el corpus público sirve hoy."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          {HEADLINES.map((h) => (
            <Link
              key={h.label}
              to={h.href}
              className="rounded-md border p-4 transition-shadow hover:shadow-md"
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
                {h.label}
              </div>
              <div
                className="mt-1 text-2xl font-semibold tracking-tight"
                style={{ color: "var(--color-fg)" }}
              >
                {h.value}
              </div>
              <div
                className="text-xs"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                {h.sub}
              </div>
            </Link>
          ))}
        </div>
        <p
          className="mt-3 text-[12.5px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {manifest
            ? "Capa de datos viva — manifest cargado correctamente."
            : "Las cifras son del manifest del repo — la app sirve material precalculado, no realiza fitting en el navegador."}
        </p>
      </Section>

      <Section
        id="pillars"
        title="Tres pilares metodológicos"
        lead="Cualquier resultado tópico se puede atribuir a (i) cómo se definió el documento, (ii) cómo se discretizó el espectro, (iii) qué modelo se ajustó. La variabilidad real proviene de las tres palancas combinadas."
      >
        <div className="grid sm:grid-cols-3 gap-4 mt-2">
          {PILLARS.map((p) => (
            <div
              key={p.title}
              className="rounded-md border p-5"
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
                {p.title}
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="how-to-read" title="Cómo leer este sitio">
        <ol
          className="list-decimal pl-5 space-y-2 text-[14px] leading-relaxed mt-2"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>
            <strong>Metodología → Teoría</strong> — el modelo PTM/LDA y por
            qué un píxel HSI puede tratarse como documento.
          </li>
          <li>
            <strong>Metodología → Representaciones</strong> — la grilla de
            recetas V1..V12 × esquemas × Q.
          </li>
          <li>
            <strong>Metodología → Pipeline</strong> — qué scripts corren
            localmente para producir el material que esta app sirve.
          </li>
          <li>
            <strong>Metodología → Aplicación</strong> — cómo se aplican los
            tópicos a clasificación y regresión (directo / routed /
            embedded).
          </li>
          <li>
            <strong>Bases de datos</strong> — los 21 datasets con su acceso,
            raíz local y archivos fuente.
          </li>
          <li>
            <strong>Laboratorio</strong> — flujo guiado familia → conjunto →
            representación → explorar (en construcción progresiva).
          </li>
          <li>
            <strong>Benchmarks</strong> — forest plots con CI95 +
            comparaciones pareadas para los modelos directos; deep dive por
            método en próximas entregas.
          </li>
        </ol>
      </Section>
    </PageShell>
  );
}
