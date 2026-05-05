import { useTranslation } from "react-i18next";

import { Figure } from "@/components/Figure";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

type Stage = {
  id: string;
  name: string;
  command: string;
  produces: string;
  notes: string;
};

const STAGES: Stage[] = [
  {
    id: "fetch",
    name: "Adquisición",
    command: "scripts/local fetch-all",
    produces: "data/raw/{upv_ehu, micasense, usgs_splib07, hidsag, ecostress, unmixing}/",
    notes:
      "Descarga UPV/EHU HSI scenes, MicaSense MSI, USGS spectral library, HIDSAG zips (opt-in), ECOSTRESS metadata, Borsoi Samson/Jasper/Urban ROIs. Una sola vez por máquina.",
  },
  {
    id: "preprocess-real",
    name: "Compactación de escenas",
    command: "scripts/local build-real",
    produces: "data/derived/real/real_samples.json + previews/*.png",
    notes:
      "Reduce los cubos crudos a un payload publicable (sub-muestreo estratificado + previews RGB / labels).",
  },
  {
    id: "wordifications",
    name: "Wordifications V1..V12",
    command:
      "scripts/local build-wordifications && build-wordifications-v4plus && build-wordifications-v6plus && build-wordifications-v7v11",
    produces: "data/derived/wordifications/<scene>_<recipe>_<scheme>_Q<q>.json (≈486 configs)",
    notes:
      "Las 12 recetas × 3 schemes × 3 Q por escena. Cada config es una matriz documento-término distinta. Todas se exponen en /api/wordifications.",
  },
  {
    id: "topic-views",
    name: "Vistas tópicas + theta",
    command: "scripts/local build-topic-views build-topic-to-data",
    produces: "data/derived/topic_views/<scene>.json + topic_to_data/<scene>.json + data/local/lda_fits/<scene>/",
    notes:
      "LDA fit canónico (V1, K=12 o n_classes), JS-MDS para intertopic, theta por documento, dominant_topic_map.",
  },
  {
    id: "spectral-browser",
    name: "Browser espectral",
    command: "scripts/local build-spectral-browser build-spectral-density",
    produces: "data/derived/spectral_browser/<scene>/spectra.bin + spectral_density/<scene>/density_*.bin",
    notes:
      "Float32 binarios servibles directo a la app web sin parseo JSON. Densidad banda × reflectancia precalculada por grupo.",
  },
  {
    id: "groupings",
    name: "Agrupadores documentales",
    command: "scripts/local build-groupings build-cross-method-agreement",
    produces:
      "data/derived/groupings/{slic_500, slic_2000, patch_7, patch_15, felzenszwalb}/<scene>.json + cross_method_agreement/<scene>.json",
    notes:
      "Cuatro construcciones documentales × ARI/NMI/V cross-pair. Métrica: off-diagonal ~0.15 — los constructores son distintos, no equivalentes.",
  },
  {
    id: "addendum-b",
    name: "Addendum B — batería multi-eje",
    command:
      "scripts/local build-linear-probe-panel build-rate-distortion-curve build-topic-routed-classifier build-mutual-information build-embedded-baseline build-topic-stability build-topic-to-usgs-v7 build-cross-scene-transfer build-topic-anomaly build-topic-spatial-continuous build-topic-spatial-full build-endmember-baseline",
    produces:
      "data/derived/{linear_probe_panel, rate_distortion_curve, topic_routed_classifier, mutual_information, embedded_baseline, topic_stability, topic_to_usgs_v7, cross_scene_transfer, topic_anomaly, topic_spatial_continuous, topic_spatial_full, endmember_baseline}/<scene>.json",
    notes:
      "Once axes B-1..B-11 + cross-scene transfer. Cada uno es un downstream readout o un test de robustez. La página de Aplicación los relaciona con el marco PTM.",
  },
  {
    id: "bayesian",
    name: "Posterior bayesiana",
    command: "scripts/local build-bayesian-method-comparison build-bayesian-classification-labelled",
    produces: "data/derived/bayesian/{regression, classification_labelled}.json + data/local/bayesian_traces/",
    notes:
      "PyMC NUTS sobre los downstream readouts. Reporta HDI94 + P(μ_a > μ_b) pairwise.",
  },
  {
    id: "validation-blocks",
    name: "Validation blocks v0.4",
    command: "scripts/local build-validation-blocks",
    produces: "data/derived/validation_blocks/<scene>.json",
    notes:
      "Seis bloques por escena: corpus-integrity, topic-stability, supervision-association, quantization-sensitivity, document-definition-sensitivity, spectral-library-alignment. Los tres últimos se conectan a builders dedicados.",
  },
  {
    id: "super-topics",
    name: "Super-tópicos",
    command: "scripts/local build-hierarchical-super-topics",
    produces: "data/derived/super_topics/super_topics.json",
    notes:
      "Cluster jerárquico sobre los 63 tópicos (todas las escenas) en grilla común 224 bandas 400-2500 nm. Cortes en K_super ∈ {4, 6, 8, 10, 12}.",
  },
  {
    id: "curate",
    name: "Curado del manifest",
    command: "scripts/local curate-for-web",
    produces: "data/derived/manifests/index.json",
    notes:
      "Empaca todo lo anterior en el contrato que la app web lee. 1118 artifacts, 35 builders, 60 claims_allowed, ~74 MB.",
  },
  {
    id: "audit",
    name: "Auditoría del manifest",
    command: "scripts/local audit-manifest",
    produces: "stdout: drift y huérfanos, exit 0/1",
    notes:
      "Verifica que cada artefacto declarado existe, que los bytes coinciden, que cada claim tiene al menos un artefacto, y reporta archivos derivados que no están en el manifest.",
  },
];

export default function MethodologyPipeline() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology_pipeline.title")}
      lead="La app web sirve material precalculado. La generación corre localmente — descarga, preprocesa, fittea LDA, computa downstream readouts, empaca el manifest. El código fuente vive en el repo del proyecto; aquí mostramos sólo cómo ejecutarlo y qué produce."
    >
      <Section
        id="overview"
        title="Vista general"
        lead="Doce etapas encadenadas. Cada una es un script de comando único. La salida de cada etapa es la entrada de las siguientes."
      >
        <Figure caption="Las doce etapas del pipeline local. Las flechas indican dependencia de datos entre etapas. La adquisición es one-time; las wordifications, validation-blocks y super-topics se re-ejecutan cuando cambia algún parámetro upstream.">
          <PipelineDagSVG />
        </Figure>
      </Section>

      <Section
        id="stages"
        title="Las etapas, comando por comando"
        lead="Los comandos asumen que estás en la raíz del repo y tienes los dos venvs creados (scripts/local setup-all)."
      >
        <div className="space-y-4 mt-2">
          {STAGES.map((s, idx) => (
            <div
              key={s.id}
              className="rounded-md border p-4 text-[14px] leading-relaxed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <div className="flex items-baseline gap-3 mb-2">
                <span
                  className="inline-block rounded-md px-2 py-0.5 text-[11px] font-mono"
                  style={{
                    backgroundColor: "var(--color-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <h3
                  className="text-lg font-semibold"
                  style={{ color: "var(--color-fg)" }}
                >
                  {s.name}
                </h3>
              </div>
              <pre
                className="whitespace-pre-wrap break-words font-mono text-[12.5px] rounded-md p-3 mt-2 mb-3"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-fg)",
                }}
              >
                {`$ ${s.command}`}
              </pre>
              <p
                className="mb-2"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <strong style={{ color: "var(--color-fg)" }}>
                  Produce:
                </strong>{" "}
                <code className="font-mono text-[12.5px]">{s.produces}</code>
              </p>
              <p style={{ color: "var(--color-fg-subtle)" }}>{s.notes}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="reproduce" title="Cómo reproducir el corpus completo">
        <p>
          La forma corta — ejecutar todo en orden, una sola sesión:
        </p>
        <pre
          className="font-mono text-[12.5px] rounded-md p-3 my-3"
          style={{
            backgroundColor: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-fg)",
          }}
        >{`$ scripts/local setup-all          # crea .venv + .venv-pipeline + frontend deps
$ scripts/local fetch-all          # ~30 min de descargas
$ scripts/local build-precompute-all
$ scripts/local run-core
$ scripts/local build-validation-blocks
$ scripts/local build-hierarchical-super-topics
$ scripts/local curate-for-web
$ scripts/local audit-manifest     # debe terminar 0; los huérfanos legacy se reportan pero no fallan`}</pre>
        <p>
          Para una escena concreta, los flags `CAOS_VARIANT_FILTER` y
          equivalentes permiten re-ejecutar un único variant sin re-correr
          toda la grilla. Ver{" "}
          <a
            href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/blob/main/scripts/local.sh"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-accent)" }}
          >
            scripts/local.sh
          </a>{" "}
          y{" "}
          <a
            href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/blob/main/scripts/local.ps1"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-accent)" }}
          >
            scripts/local.ps1
          </a>{" "}
          para los comandos individuales.
        </p>
      </Section>

      <Section id="boundary" title="Lo que la app web NO hace">
        <ul
          className="mt-2 space-y-2 list-disc pl-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>No fittea modelos. Todos los θ y φ vienen del pipeline local.</li>
          <li>
            No descarga datasets crudos. Sólo lee los artefactos derivados que
            el pipeline empaca.
          </li>
          <li>
            No expone los scripts de pipeline. Para inspeccionarlos, el repo
            del proyecto es el lugar.
          </li>
          <li>
            No hace cuantización ni wordification on-the-fly. La grilla de
            configuraciones está pre-empaquetada.
          </li>
        </ul>
      </Section>
    </PageShell>
  );
}

function PipelineDagSVG() {
  // 12-stage DAG laid out in 4 rows × 3 cols, with curved arrows for the
  // few cross-row dependencies. Pure visual; no live data.
  type Node = { id: string; row: number; col: number; label: string };
  const nodes: Node[] = [
    { id: "fetch", row: 0, col: 0, label: "1. Adquisición" },
    { id: "preprocess", row: 0, col: 1, label: "2. Compactación" },
    { id: "wordif", row: 0, col: 2, label: "3. Wordifications" },
    { id: "topic-views", row: 1, col: 0, label: "4. Topic views" },
    { id: "spectral", row: 1, col: 1, label: "5. Spectral browser" },
    { id: "groupings", row: 1, col: 2, label: "6. Groupings" },
    { id: "addendum", row: 2, col: 0, label: "7. Addendum B" },
    { id: "bayes", row: 2, col: 1, label: "8. Bayesian" },
    { id: "validation", row: 2, col: 2, label: "9. Validation blocks" },
    { id: "super", row: 3, col: 0, label: "10. Super-topics" },
    { id: "curate", row: 3, col: 1, label: "11. Curate" },
    { id: "audit", row: 3, col: 2, label: "12. Audit" },
  ];
  const w = 160;
  const h = 50;
  const gapX = 30;
  const gapY = 36;
  const x = (col: number) => 20 + col * (w + gapX);
  const y = (row: number) => 20 + row * (h + gapY);
  const id2node = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const edges: [string, string][] = [
    ["fetch", "preprocess"],
    ["fetch", "wordif"],
    ["preprocess", "topic-views"],
    ["preprocess", "spectral"],
    ["wordif", "topic-views"],
    ["wordif", "groupings"],
    ["topic-views", "addendum"],
    ["spectral", "addendum"],
    ["groupings", "validation"],
    ["addendum", "bayes"],
    ["addendum", "validation"],
    ["topic-views", "super"],
    ["bayes", "curate"],
    ["validation", "curate"],
    ["super", "curate"],
    ["curate", "audit"],
  ];
  return (
    <svg
      width={x(2) + w + 20}
      height={y(3) + h + 20}
      viewBox={`0 0 ${x(2) + w + 20} ${y(3) + h + 20}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Pipeline DAG"
      style={{ color: "var(--color-fg)" }}
    >
      <defs>
        <marker
          id="arrowDag"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="12.5"
      >
        {/* edges first so they render under nodes */}
        {edges.map(([a, b], i) => {
          const na = id2node[a]!;
          const nb = id2node[b]!;
          const x1 = x(na.col) + w / 2;
          const y1 = y(na.row) + h;
          const x2 = x(nb.col) + w / 2;
          const y2 = y(nb.row);
          // curved bezier
          const midY = (y1 + y2) / 2;
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              opacity="0.45"
              markerEnd="url(#arrowDag)"
            />
          );
        })}
        {/* nodes */}
        {nodes.map((n) => (
          <g key={n.id} transform={`translate(${x(n.col)}, ${y(n.row)})`}>
            <rect
              width={w}
              height={h}
              rx="8"
              fill="var(--color-panel)"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <text
              x={w / 2}
              y={h / 2 + 4}
              textAnchor="middle"
              fill="currentColor"
              fontWeight="600"
            >
              {n.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
