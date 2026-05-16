import { useTranslation } from "react-i18next";

import { Equation } from "@/components/Equation";
import { Figure } from "@/components/Figure";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

export default function MethodologyApplication() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology_application.title")}
      lead="How topics are applied to classification and regression problems on HSI. Three families of models: direct (theta as feature), routed (one specialist per topic) and embedded (theta concatenated with baselines)."
    >
      <Section
        id="why"
        title="Why not classify directly?"
        lead="Reducing an HSI cube to hard classes throws away all the mixture information. If a pixel is 60% soil and 40% scrub, a hard label picks one and lies. Topics preserve the mixture."
      >
        <p>
          The classical HSI strategy — fit a random forest or an SVM on the raw
          spectrum — works on balanced, well-labelled scenes. It fails where it
          matters most: class boundaries, fractional mixtures, cover transitions.
          A topic representation sits between the spectrum and the classifier
          and captures the mixture as a dense vector{" "}
          <Equation tex="\theta_d \in \Delta^{K-1}" />.
        </p>
        <p className="mt-3">
          The empirical question is: <em>does theta as input beat a linear
          baseline on the raw spectrum?</em> The answer from the B-1..B-5
          battery (Benchmarks page) is: <strong>flat theta loses</strong> to
          ICA-10 / PCA-30 / dense-AE-8 on almost every labelled scene, which
          is both disappointing and informative.
        </p>
        <p className="mt-3">
          The honest way to exploit topics is not theta as a flat feature, but
          the <em>routed</em> and <em>embedded</em> models below.
        </p>
      </Section>

      <Section
        id="three-families"
        title="Three families of topic-based models"
        lead="Each family uses theta in a different way. The difference is methodological, not cosmetic."
      >
        <Figure caption="Left to right: direct (theta as feature vector), routed (one specialist per topic, mixed by theta), embedded (theta concatenated with a linear baseline). All three are implemented as separate builders in data-pipeline/ and compared head-to-head on the Benchmarks page.">
          <ThreeFamiliesSVG />
        </Figure>
      </Section>

      <Section
        id="direct"
        title="1. Direct — theta as feature"
        lead="The simplest, also the least informative."
      >
        <p>The predictor takes theta and produces the label:</p>
        <Equation block tex="\hat{y}_d = \arg\max_y \, p_\beta(y \mid \theta_d) = \arg\max_y \, \beta_y^\top \theta_d" />
        <p>
          Logistic regression over theta is the baseline case. Its performance
          is dominated by two things: (i) how much discriminative information
          lives in the mixture, and (ii) how well LDA recovered a useful basis
          for the task.
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_topic_routed_classifier.py</code> reports this as{" "}
          <code>theta_logistic</code>. <strong>Headline:</strong> flat theta
          loses against raw_logistic on every labelled scene. Useful only as a
          control.
        </p>
      </Section>

      <Section
        id="routed"
        title="2. Routed — one specialist per topic"
        lead="Each topic trains its own classifier on the raw spectrum, weighted by membership."
      >
        <p>
          The idea: for each topic <Equation tex="k" />, train a classifier{" "}
          <Equation tex="P_k(y \mid x)" /> on the raw spectrum{" "}
          <Equation tex="x" /> with per-sample weights{" "}
          <Equation tex="\theta_{d,k}" />. At inference time, mix according to
          the topical membership of the test document:
        </p>
        <Equation
          block
          tex="P(y \mid x_{\text{test}}) = \sum_{k=1}^{K} \theta_{\text{test}, k} \, P_k(y \mid x_{\text{test}})"
        />
        <p>
          Intuition: each topic captures a distinct spectral regime (dry soil,
          green vegetation, urban...), and a classifier specialised in that
          regime works better there than a single classifier forced to
          generalise over all.
        </p>
        <p className="mt-3">
          <strong>Variants:</strong>{" "}
          <code>topic_routed_soft</code> (mixes the sum),{" "}
          <code>topic_routed_hard</code> (forwards everything to the dominant
          topic's specialist).
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_topic_routed_classifier.py</code>.{" "}
          <strong>Headline:</strong> topic_routed_soft ties or beats
          raw_logistic on the 6 labelled scenes (Indian Pines 0.839 vs 0.833;
          Salinas 0.954 vs 0.951; KSC 0.921 vs 0.914; Botswana 0.962 vs 0.962;
          Pavia U 0.819 vs 0.805; Salinas-A 0.996 vs 0.997). The Bayesian
          posterior (HDI94) shows μ_routed_soft − μ_raw = +0.737 — robust
          support in favour of routed soft.
        </p>
      </Section>

      <Section
        id="embedded"
        title="3. Embedded — theta concatenated with baseline"
        lead="Concat is the least elegant but sometimes the healthiest: let the classifier decide how much theta weighs."
      >
        <p>
          The input feature is the concatenation{" "}
          <Equation tex="[\theta_d \; \| \; z_d]" /> where{" "}
          <Equation tex="z_d" /> is a baseline (PCA-K, NMF-K, dense-AE-K). The
          classifier is standard logistic regression over the combined feature.
        </p>
        <p className="mt-3">
          The hypothesis: theta contributes mixture information that neither PCA
          nor AE recovers; a classifier with access to both does better than
          either alone.
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_embedded_baseline.py</code>.{" "}
          <strong>Honest headline:</strong> only Indian Pines shows a gain
          (Δ F1 = +0.018, Cliff δ = +0.280, small effect). On the other 5
          scenes concat ties with pca_K alone. The signal that helps is the{" "}
          <em>gating</em> (routed family), not the flat concatenation.
        </p>
      </Section>

      <Section
        id="regression"
        title="Regression over measurements (HIDSAG)"
        lead="When the target is not a class but a continuous measurement (Cu %, Au g/t, mineral grade), the logic is the same with linear regressors."
      >
        <p>
          For the HIDSAG subsets (GEOMET, MINERAL1, MINERAL2, GEOCHEM, PORPHYRY)
          the Benchmarks page reports R² and bootstrap CI95 over each numeric
          target. The DMR-LDA family (Dirichlet-Multinomial Regression)
          integrates measurements as document meta-data, not as target — that
          is a distinct way of using the same apparatus.
        </p>
        <p className="mt-3">
          <strong>Builders:</strong>{" "}
          <code>build_dmr_lda_hidsag.py</code> +{" "}
          <code>build_method_statistics_hidsag.py</code>. The Benchmarks page
          exposes paired forest plots against the baseline methods.
        </p>
      </Section>

      <Section
        id="what-topics-capture"
        title='What does a topic "capture", in task terms?'
        lead="It is not text: the question is answered visually with distributions."
      >
        <p>
          For each topic <Equation tex="k" />, the Workspace shows:
        </p>
        <ul
          className="mt-2 space-y-2 list-disc pl-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>
            <strong>Labels</strong>:{" "}
            <Equation tex="P(y \mid k) = \frac{\sum_d \theta_{d,k} \, \mathbf{1}[y_d = y]}{\sum_d \theta_{d,k}}" />{" "}
            — conditional label distribution given the topic.
          </li>
          <li>
            <strong>Measurements</strong>: histogram or KDE of each continuous
            variable over documents weighted by <Equation tex="\theta_{d,k}" />.
          </li>
          <li>
            <strong>Spectrum</strong>: the profile <Equation tex="\phi_k" />{" "}
            re-mapped to wavelength — the topic's "signature".
          </li>
          <li>
            <strong>Spatial</strong>: the per-pixel map of{" "}
            <Equation tex="\theta_k" /> over the scene, with click-to-inspect
            on the pixel and its full vector.
          </li>
          <li>
            <strong>Library</strong>: top-N matches with the USGS spectral
            library v7 (2450 spectra, 7 chapters) by cosine on the
            AVIRIS-Classic grid.
          </li>
        </ul>
        <p className="mt-3">
          With those five panels, a question like "does this topic capture
          high-copper-grade documents?" is answered by looking at the Cu
          histogram conditioned on <Equation tex="\theta_k" />, not by parsing
          text.
        </p>
      </Section>

      <Section
        id="axis-crosswalk"
        title="F-axes (paper) ↔ B-axes (wiki / web app)"
        lead="The companion paper introduces a twelve-axis Framework (F-1..F-12). This site and the wiki use a different B-1..B-12 taxonomy that predates the paper. The two share three concepts under different ordinals; the crosswalk below makes the mapping explicit."
      >
        <p>
          Both taxonomies are kept on purpose: the wiki's B-axes are the
          empirical evaluation battery the project ran across ~150
          iterative cycles; the paper's F-axes are the formal twelve-axis
          framework that a journal reviewer reads. Pick the taxonomy that
          fits the audience.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table
            className="w-full text-sm border-collapse"
            style={{ borderColor: "var(--color-border)" }}
          >
            <thead>
              <tr style={{ backgroundColor: "var(--color-panel)" }}>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>F (paper)</th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>Paper axis name</th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>B (wiki)</th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>Wiki axis name</th>
                <th className="text-left px-3 py-2 border" style={{ borderColor: "var(--color-border)" }}>Workspace surface</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-1</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Classification (hierarchical Bayesian)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>B-1</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Linear probe panel</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › probe / Benchmarks</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-2</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Coherence (c_v, NPMI, U-Mass)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › topics (top-words panel)</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-3</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Seed stability</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>B-6</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Seed stability</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › stability / deep</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-4</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Capacity sensitivity (K-sweep)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › qkexplore</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-5</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Band-mask robustness</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › bandmask</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-6</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Cross-method agreement</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › agreement</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-7</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Topic–label coupling</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › topiclabel / interpret</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-8</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Per-topic Hungarian identity</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › bandmask (Hungarian panel)</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-9</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>HIDSAG preprocessing stability</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(not a B-axis)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Benchmarks (HIDSAG cross-prep)</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-10</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Cross-scene topic transfer</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>B-8</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Cross-scene transfer</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › robust</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-11</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Rate–distortion of θ</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>B-2</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Rate-distortion curve</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Workspace › metrics</td></tr>
              <tr><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-12</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>External baseline (literature OA)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>—</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>(deferred in paper Suppl F)</td><td className="px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>Benchmarks (literature panel)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm" style={{ color: "var(--color-fg-faint)" }}>
          Wiki-only B-axes not in the paper: B-3 topic-routed classifier, B-4 mutual information, B-5 embedded baseline, B-7 USGS spectral library alignment, B-9 anomaly detection, B-10 spatial coherence, B-11 endmember baseline, B-12 LLM tea-leaves. These remain part of the project's evaluation battery but were not included in the twelve-axis paper framework.
        </p>
      </Section>

      <Section id="see-also" title="How to continue">
        <p>
          The Workspace lets you <em>apply</em> a model to a specific document
          and see the five panels live (all precomputed, no re-fitting). The
          Benchmarks page compares models head-to-head with bootstrap CI95 +
          Wilcoxon-Holm + Cliff δ + Bayesian posterior (HDI94) per scene.
        </p>
      </Section>
    </PageShell>
  );
}

function ThreeFamiliesSVG() {
  return (
    <svg
      width="720"
      height="280"
      viewBox="0 0 720 280"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Three model families: direct, routed, embedded"
      style={{ color: "var(--color-fg)" }}
    >
      <defs>
        <marker
          id="arrowApp"
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
        fontSize="12"
        fill="currentColor"
      >
        {/* DIRECT */}
        <g transform="translate(20, 30)">
          <text
            x="100"
            y="-8"
            textAnchor="middle"
            fontWeight="600"
            fontSize="13.5"
          >
            Directo
          </text>
          <rect
            x="0"
            y="20"
            width="80"
            height="40"
            rx="6"
            fill="var(--color-accent-soft)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="40" y="44" textAnchor="middle">
            θ_d
          </text>
          <line
            x1="80"
            y1="40"
            x2="120"
            y2="40"
            stroke="currentColor"
            strokeWidth="1.4"
            markerEnd="url(#arrowApp)"
          />
          <rect
            x="120"
            y="20"
            width="80"
            height="40"
            rx="6"
            fill="var(--color-accent)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="160" y="44" textAnchor="middle" fill="var(--color-accent-fg)">
            ŷ
          </text>
          <text x="100" y="100" textAnchor="middle" opacity="0.7" fontSize="11">
            β · θ_d
          </text>
          <text
            x="100"
            y="118"
            textAnchor="middle"
            opacity="0.65"
            fontSize="11"
          >
            theta_logistic
          </text>
        </g>

        {/* ROUTED */}
        <g transform="translate(260, 30)">
          <text
            x="100"
            y="-8"
            textAnchor="middle"
            fontWeight="600"
            fontSize="13.5"
          >
            Routed
          </text>
          <rect
            x="0"
            y="20"
            width="60"
            height="40"
            rx="6"
            fill="var(--color-accent-soft)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="30" y="44" textAnchor="middle">
            x_test
          </text>

          {[0, 1, 2].map((k) => {
            const yMid = 8 + k * 50;
            return (
              <g key={k} transform="translate(80, 0)">
                <line
                  x1="0"
                  y1="40"
                  x2="40"
                  y2={yMid + 12}
                  stroke="currentColor"
                  strokeWidth="1.1"
                  opacity="0.7"
                />
                <rect
                  x="40"
                  y={yMid}
                  width="80"
                  height="24"
                  rx="4"
                  fill="var(--color-panel)"
                  stroke="currentColor"
                  strokeWidth="1.1"
                />
                <text x="80" y={yMid + 16} textAnchor="middle" fontSize="11">
                  P_{k + 1}(y|x)
                </text>
              </g>
            );
          })}

          <line
            x1="200"
            y1="20"
            x2="220"
            y2="40"
            stroke="currentColor"
            strokeWidth="1.1"
            opacity="0.7"
          />
          <line
            x1="200"
            y1="60"
            x2="220"
            y2="40"
            stroke="currentColor"
            strokeWidth="1.1"
            opacity="0.7"
          />
          <line
            x1="200"
            y1="100"
            x2="220"
            y2="40"
            stroke="currentColor"
            strokeWidth="1.1"
            opacity="0.7"
          />
          <rect
            x="220"
            y="20"
            width="80"
            height="40"
            rx="6"
            fill="var(--color-accent)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="260" y="44" textAnchor="middle" fill="var(--color-accent-fg)">
            ŷ
          </text>
          <text x="100" y="180" textAnchor="middle" opacity="0.7" fontSize="11">
            Σ_k θ_test[k] · P_k(y|x)
          </text>
          <text
            x="100"
            y="198"
            textAnchor="middle"
            opacity="0.65"
            fontSize="11"
          >
            topic_routed_soft
          </text>
        </g>

        {/* EMBEDDED */}
        <g transform="translate(560, 30)">
          <text
            x="80"
            y="-8"
            textAnchor="middle"
            fontWeight="600"
            fontSize="13.5"
          >
            Embedded
          </text>
          <rect
            x="0"
            y="0"
            width="60"
            height="30"
            rx="6"
            fill="var(--color-accent-soft)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="30" y="20" textAnchor="middle">
            θ_d
          </text>
          <rect
            x="0"
            y="42"
            width="60"
            height="30"
            rx="6"
            fill="var(--color-panel)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="30" y="62" textAnchor="middle">
            z_d
          </text>
          <text
            x="62"
            y="42"
            textAnchor="start"
            fontSize="14"
            fontWeight="600"
          >
            ‖
          </text>
          <line
            x1="80"
            y1="36"
            x2="100"
            y2="36"
            stroke="currentColor"
            strokeWidth="1.4"
            markerEnd="url(#arrowApp)"
          />
          <rect
            x="100"
            y="20"
            width="80"
            height="35"
            rx="6"
            fill="var(--color-accent)"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <text x="140" y="42" textAnchor="middle" fill="var(--color-accent-fg)">
            ŷ
          </text>
          <text x="80" y="120" textAnchor="middle" opacity="0.7" fontSize="11">
            β · [θ_d ‖ z_d]
          </text>
          <text
            x="80"
            y="138"
            textAnchor="middle"
            opacity="0.65"
            fontSize="11"
          >
            embedded_baseline
          </text>
        </g>
      </g>
    </svg>
  );
}
