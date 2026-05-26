import { useTranslation } from "react-i18next";

import { Equation } from "@/components/Equation";
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
    name: "Acquisition",
    command: "scripts/local fetch-all",
    produces: "data/raw/{upv_ehu, micasense, usgs_splib07, hidsag, ecostress, unmixing}/",
    notes:
      "Downloads UPV/EHU HSI scenes, MicaSense MSI, USGS spectral library, HIDSAG zips (opt-in), ECOSTRESS metadata, Borsoi Samson/Jasper/Urban ROIs. One-time per machine.",
  },
  {
    id: "preprocess-real",
    name: "Scene compaction",
    command: "scripts/local build-real",
    produces: "data/derived/real/real_samples.json + previews/*.png",
    notes:
      "Reduces the raw cubes to a publishable payload (stratified sub-sampling + RGB / label previews).",
  },
  {
    id: "wordifications",
    name: "Wordifications V1..V12",
    command:
      "scripts/local build-wordifications && build-wordifications-v4plus && build-wordifications-v6plus && build-wordifications-v7v11",
    produces: "data/derived/wordifications/<scene>_<recipe>_<scheme>_Q<q>.json (~486 configs)",
    notes:
      "The 12 recipes × 3 schemes × 3 Q per scene. Each config is a distinct document-term matrix. All exposed via /api/wordifications.",
  },
  {
    id: "topic-views",
    name: "Topic views + theta",
    command: "scripts/local build-topic-views build-topic-to-data",
    produces: "data/derived/topic_views/<scene>.json + topic_to_data/<scene>.json + data/local/lda_fits/<scene>/",
    notes:
      "Canonical LDA fit (V1, K=12 or n_classes), JS-MDS for intertopic, per-document theta, dominant_topic_map.",
  },
  {
    id: "spectral-browser",
    name: "Spectral browser",
    command: "scripts/local build-spectral-browser build-spectral-density",
    produces: "data/derived/spectral_browser/<scene>/spectra.bin + spectral_density/<scene>/density_*.bin",
    notes:
      "Float32 binaries served directly to the web app without JSON parsing. Band × reflectance density pre-computed per group.",
  },
  {
    id: "groupings",
    name: "Document groupings",
    command: "scripts/local build-groupings build-cross-method-agreement",
    produces:
      "data/derived/groupings/{slic_500, slic_2000, patch_7, patch_15, felzenszwalb}/<scene>.json + cross_method_agreement/<scene>.json",
    notes:
      "Four document constructions × ARI/NMI/V cross-pair. Metric: off-diagonal ~0.15 — the constructors are genuinely different, not equivalent.",
  },
  {
    id: "addendum-b",
    name: "Addendum B — multi-axis battery",
    command:
      "scripts/local build-linear-probe-panel build-rate-distortion-curve build-topic-routed-classifier build-mutual-information build-embedded-baseline build-topic-stability build-topic-to-usgs-v7 build-cross-scene-transfer build-topic-anomaly build-topic-spatial-continuous build-topic-spatial-full build-endmember-baseline",
    produces:
      "data/derived/{linear_probe_panel, rate_distortion_curve, topic_routed_classifier, mutual_information, embedded_baseline, topic_stability, topic_to_usgs_v7, cross_scene_transfer, topic_anomaly, topic_spatial_continuous, topic_spatial_full, endmember_baseline}/<scene>.json",
    notes:
      "Eleven axes B-1..B-11 + cross-scene transfer. Each one is a downstream readout or a robustness test. The Application page relates them to the PTM framework.",
  },
  {
    id: "bayesian",
    name: "Bayesian posterior",
    command: "scripts/local build-bayesian-method-comparison build-bayesian-classification-labelled",
    produces: "data/derived/bayesian/{regression, classification_labelled}.json + data/local/bayesian_traces/",
    notes:
      "PyMC NUTS over the downstream readouts. Reports HDI94 + pairwise P(μ_a > μ_b).",
  },
  {
    id: "validation-blocks",
    name: "Validation blocks v0.4",
    command: "scripts/local build-validation-blocks",
    produces: "data/derived/validation_blocks/<scene>.json",
    notes:
      "Six blocks per scene: corpus-integrity, topic-stability, supervision-association, quantization-sensitivity, document-definition-sensitivity, spectral-library-alignment. The last three connect to dedicated builders.",
  },
  {
    id: "super-topics",
    name: "Super-topics",
    command: "scripts/local build-hierarchical-super-topics",
    produces: "data/derived/super_topics/super_topics.json",
    notes:
      "Hierarchical clustering over the 63 topics (all scenes) on a common 224-band 400-2500 nm grid. Cuts at K_super ∈ {4, 6, 8, 10, 12}.",
  },
  {
    id: "curate",
    name: "Manifest curation",
    command: "scripts/local curate-for-web",
    produces: "data/derived/manifests/index.json",
    notes:
      "Packs everything above into the contract the web app reads. 1732 manifest-tracked artefacts (1734 on disk minus README.md and the manifest itself), 69 builder source files, 82 routes, 444 MB. Numbers verified 2026-05-25 — the manifest IS the contract, so when these counts change, rebuild it via `python data-pipeline/curate_for_web.py` and update the HeadlineNumbers card.",
  },
  {
    id: "audit",
    name: "Manifest audit",
    command: "scripts/local audit-manifest",
    produces: "stdout: drift and orphans, exit 0/1",
    notes:
      "Verifies that every declared artifact exists, that byte sums match, that every claim has at least one artifact, and reports derived files not in the manifest.",
  },
];

export default function MethodologyPipeline() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology_pipeline.title")}
      lead="The web app serves pre-computed material. Generation runs locally — fetches, preprocesses, fits LDA, computes downstream readouts, packs the manifest. Source code lives in the project repo; here we show only how to run it and what it produces."
    >
      <Section id="overview" title={t("pages:methodology_pipeline.sections.overview.title")} lead={t("pages:methodology_pipeline.sections.overview.lead")}>
        <Figure caption="The twelve stages of the local pipeline. Arrows indicate data dependencies between stages. Acquisition is one-time; wordifications, validation-blocks and super-topics are re-run when an upstream parameter changes.">
          <PipelineDagSVG />
        </Figure>
      </Section>

      <Section id="stages" title={t("pages:methodology_pipeline.sections.stages.title")} lead={t("pages:methodology_pipeline.sections.stages.lead")}>
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
                  Produces:
                </strong>{" "}
                <code className="font-mono text-[12.5px]">{s.produces}</code>
              </p>
              <p style={{ color: "var(--color-fg-subtle)" }}>{s.notes}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="spatial-coherence" title={t("pages:methodology_pipeline.sections.spatial-coherence.title")} lead={t("pages:methodology_pipeline.sections.spatial-coherence.lead")}>
        <p>
          Three diagnostics are computed by the groupings + spatial-validation
          builders and surfaced in the Workspace <em>Spatial structure</em>{" "}
          tab. They are independent of LDA — they describe the document
          construction itself.
        </p>

        <p className="mt-3">
          <strong>1. SLIC compactness</strong> (Achanta et al. 2012). For
          each SLIC superpixel <Equation tex="R_i" />, define the colour
          distance from its centroid <Equation tex="\mu_i^{\mathrm{c}}" /> and
          the spatial distance from its centroid{" "}
          <Equation tex="\mu_i^{\mathrm{xy}}" />; the compactness parameter{" "}
          <Equation tex="m" /> trades them off in the per-pixel cost
        </p>
        <Equation
          block
          tex="D_i(p) = d_{\mathrm{c}}(p, \mu_i^{\mathrm{c}}) + \frac{m}{S} \, d_{\mathrm{xy}}(p, \mu_i^{\mathrm{xy}}), \quad S = \sqrt{N / K}."
        />
        <p>
          Smaller compactness gives spatially tight regions; larger
          compactness lets colour drive the boundaries. This project ships
          two SLIC budgets — 500 and 2000 regions — both with the
          scikit-image default <Equation tex="m = 10" /> for visual
          reproducibility against the published Achanta et al. examples.
        </p>

        <p className="mt-3">
          <strong>2. Felzenszwalb internal-vs-external energy</strong>{" "}
          (Felzenszwalb &amp; Huttenlocher 2004). The graph-segmentation
          baseline merges two adjacent regions{" "}
          <Equation tex="C_1, C_2" /> whenever the minimum edge weight
          crossing them is small relative to their internal differences
          plus a size-penalised threshold{" "}
          <Equation tex="\tau(C) = k / |C|" />:
        </p>
        <Equation
          block
          tex="\mathrm{Diff}(C_1, C_2) < \min\{\mathrm{Int}(C_1) + \tau(C_1), \, \mathrm{Int}(C_2) + \tau(C_2)\}."
        />
        <p>
          The parameter <Equation tex="k" /> controls average region size
          (larger <Equation tex="k" /> → larger regions). The builder fixes
          <Equation tex="k = 100" /> for the SLIC-comparable budget; the
          resulting regions are reported alongside SLIC and patch in the
          cross-method-agreement table.
        </p>

        <p className="mt-3">
          <strong>3. Moran's I — spatial autocorrelation of θ</strong>{" "}
          (Moran 1950). For each topic <Equation tex="k" /> and a row-standardised
          spatial weight matrix <Equation tex="W" /> (4-connectivity on the
          image grid), the topic's spatial concentration is
        </p>
        <Equation
          block
          tex="I_k = \frac{N}{S_0} \cdot \frac{\sum_{i} \sum_{j} W_{ij} (\theta_{i,k} - \bar{\theta}_k)(\theta_{j,k} - \bar{\theta}_k)}{\sum_{i} (\theta_{i,k} - \bar{\theta}_k)^2}, \quad S_0 = \sum_{i,j} W_{ij}."
        />
        <p>
          <Equation tex="I_k \in [-1, 1]" /> measures how strongly the
          per-pixel topic weight is spatially clustered. A topic that
          captures a contiguous mineral assemblage shows{" "}
          <Equation tex="I_k \approx 0.6\text{–}0.9" /> on HIDSAG MINERAL1;
          a noisy / over-fragmented topic falls below 0.2. The Workspace{" "}
          <em>Spatial structure</em> tab reports the per-topic Moran's I
          alongside its significance under a permutation null.
        </p>
      </Section>

      <Section id="reproduce" title={t("pages:methodology_pipeline.sections.reproduce.title")}>
        <p>
          The short form — run everything in order, single session:
        </p>
        <pre
          className="font-mono text-[12.5px] rounded-md p-3 my-3"
          style={{
            backgroundColor: "var(--color-bg)",
            border: "1px solid var(--color-border)",
            color: "var(--color-fg)",
          }}
        >{`$ scripts/local setup-all          # create .venv + .venv-pipeline + frontend deps
$ scripts/local fetch-all          # ~30 min of downloads
$ scripts/local build-precompute-all
$ scripts/local run-core
$ scripts/local build-validation-blocks
$ scripts/local build-hierarchical-super-topics
$ scripts/local curate-for-web
$ scripts/local audit-manifest     # must end with 0; legacy orphans are reported but do not fail`}</pre>
        <p>
          For a specific scene, the `CAOS_VARIANT_FILTER` flag and equivalents
          allow re-running a single variant without re-running the full grid.
          See{" "}
          <a
            href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/blob/main/scripts/local.sh"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-accent)" }}
          >
            scripts/local.sh
          </a>{" "}
          and{" "}
          <a
            href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/blob/main/scripts/local.ps1"
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--color-accent)" }}
          >
            scripts/local.ps1
          </a>{" "}
          for the individual commands.
        </p>
      </Section>

      <Section id="boundary" title={t("pages:methodology_pipeline.sections.boundary.title")}>
        <ul
          className="mt-2 space-y-2 list-disc pl-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>It does not fit models. Every θ and φ comes from the local pipeline.</li>
          <li>
            It does not download raw datasets. It only reads the derived artifacts that
            the pipeline packs.
          </li>
          <li>
            It does not expose the pipeline scripts. To inspect them, the project repo is the place.
          </li>
          <li>
            No on-the-fly quantisation or wordification. The configuration grid is pre-packaged.
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
    { id: "fetch", row: 0, col: 0, label: "1. Acquisition" },
    { id: "preprocess", row: 0, col: 1, label: "2. Compaction" },
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
