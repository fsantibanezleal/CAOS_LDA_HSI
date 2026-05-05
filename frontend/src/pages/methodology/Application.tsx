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
      lead="Cómo se aplican los tópicos a problemas de clasificación y regresión sobre HSI. Tres familias de modelos: directo (theta como feature), routed (un especialista por tópico) y embedded (theta concatenado con baselines)."
    >
      <Section
        id="why"
        title="¿Por qué no clasificar directamente?"
        lead="Reducir un cubo HSI a clases duras descarta toda la información sobre mezcla. Si un píxel es 60% suelo y 40% maleza, una etiqueta dura escoge uno y miente. Los tópicos preservan la mezcla."
      >
        <p>
          La estrategia clásica en HSI — fittear un random forest o un SVM
          sobre el espectro crudo — funciona en escenas balanceadas y bien
          etiquetadas. Falla donde más importa: bordes de clase, mezclas
          fraccionales, transiciones de cobertura. Una representación tópica
          se sienta entre el espectro y el clasificador y captura la mezcla
          como un vector denso{" "}
          <Equation tex="\theta_d \in \Delta^{K-1}" />.
        </p>
        <p className="mt-3">
          La pregunta empírica es: <em>¿theta como input mejora a un
          baseline lineal sobre el espectro crudo?</em> La respuesta de la
          batería B-1..B-5 (página de Benchmarks) es: <strong>theta
          plano pierde</strong> contra ICA-10 / PCA-30 / dense-AE-8 en casi
          todas las escenas etiquetadas, lo que es a la vez decepcionante e
          informativo.
        </p>
        <p className="mt-3">
          La forma honesta de aprovechar los tópicos no es theta como
          feature plano, sino los modelos <em>routed</em> y <em>embedded</em>{" "}
          que vienen abajo.
        </p>
      </Section>

      <Section
        id="three-families"
        title="Tres familias de modelos basados en tópicos"
        lead="Cada familia usa theta de un modo distinto. La diferencia es metodológica, no cosmética."
      >
        <Figure caption="De izquierda a derecha: directo (theta como vector de features), routed (un especialista por tópico, mezclados por theta), embedded (theta concatenado con un baseline lineal). Los tres están implementados como builders separados en data-pipeline/ y se comparan en la página de Benchmarks.">
          <ThreeFamiliesSVG />
        </Figure>
      </Section>

      <Section
        id="direct"
        title="1. Directo — theta como feature"
        lead="El más simple, también el menos informativo."
      >
        <p>El predictor toma theta y produce la etiqueta:</p>
        <Equation block tex="\hat{y}_d = \arg\max_y \, p_\beta(y \mid \theta_d) = \arg\max_y \, \beta_y^\top \theta_d" />
        <p>
          La regresión logística sobre theta es el caso baseline. Su
          desempeño está dominado por dos cosas: (i) cuánta información
          discriminativa hay en la mezcla y (ii) qué tan bien LDA recuperó
          una basis útil para la tarea.
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_topic_routed_classifier.py</code> reporta este como{" "}
          <code>theta_logistic</code>. <strong>Headline:</strong> theta
          plano pierde contra raw_logistic en todas las escenas labelled.
          Útil sólo como control.
        </p>
      </Section>

      <Section
        id="routed"
        title="2. Routed — un especialista por tópico"
        lead="Cada tópico entrena su propio clasificador sobre el espectro crudo, ponderado por la pertenencia."
      >
        <p>
          La idea: para cada tópico <Equation tex="k" />, entrenar un
          clasificador <Equation tex="P_k(y \mid x)" /> sobre el espectro
          crudo <Equation tex="x" /> con pesos de muestra{" "}
          <Equation tex="\theta_{d,k}" />. En tiempo de inferencia, mezclar
          según la pertenencia tópica del documento de prueba:
        </p>
        <Equation
          block
          tex="P(y \mid x_{\text{test}}) = \sum_{k=1}^{K} \theta_{\text{test}, k} \, P_k(y \mid x_{\text{test}})"
        />
        <p>
          La intuición: cada tópico captura un régimen espectral distinto
          (suelo seco, vegetación verde, urbano…), y un clasificador
          especializado en ese régimen funciona mejor ahí que un
          clasificador único forzado a generalizar sobre todos.
        </p>
        <p className="mt-3">
          <strong>Variantes:</strong>{" "}
          <code>topic_routed_soft</code> (mezcla la suma),{" "}
          <code>topic_routed_hard</code> (pasa todo al especialista del
          tópico dominante).
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_topic_routed_classifier.py</code>.{" "}
          <strong>Headline:</strong> topic_routed_soft empata o supera a
          raw_logistic en las 6 escenas labelled (Indian Pines 0.839 vs
          0.833; Salinas 0.954 vs 0.951; KSC 0.921 vs 0.914; Botswana 0.962
          vs 0.962; Pavia U 0.819 vs 0.805; Salinas-A 0.996 vs 0.997). El
          posterior bayesiano (HDI94) muestra μ_routed_soft − μ_raw =
          +0.737 — soporte robusto a favor del routed soft.
        </p>
      </Section>

      <Section
        id="embedded"
        title="3. Embedded — theta concatenado con baseline"
        lead="El concat es el menos elegante, pero a veces el más sano: deja que el clasificador decida cuánto pesa theta."
      >
        <p>
          El feature de entrada es la concatenación{" "}
          <Equation tex="[\theta_d \; \| \; z_d]" /> donde{" "}
          <Equation tex="z_d" /> es un baseline (PCA-K, NMF-K,
          dense-AE-K). El clasificador es regresión logística estándar
          sobre el feature combinado.
        </p>
        <p className="mt-3">
          La hipótesis: theta aporta información de mezcla que ni PCA ni
          AE recuperan; un clasificador con acceso a ambos hace mejor
          trabajo que con uno solo.
        </p>
        <p className="mt-3">
          <strong>Builder:</strong>{" "}
          <code>build_embedded_baseline.py</code>.{" "}
          <strong>Headline honesto:</strong> sólo Indian Pines muestra una
          ganancia (Δ F1 = +0.018, Cliff δ = +0.280, efecto pequeño). En
          las otras 5 escenas el concat empata con pca_K solo. La señal
          que ayuda es el <em>gating</em> (familia routed), no el
          concatenamiento plano.
        </p>
      </Section>

      <Section
        id="regression"
        title="Regresión sobre mediciones (HIDSAG)"
        lead="Cuando el target no es una clase sino una medición continua (Cu %, Au g/t, leyes minerales), la lógica es la misma con regresores lineales."
      >
        <p>
          Para los subsets HIDSAG (GEOMET, MINERAL1, MINERAL2, GEOCHEM,
          PORPHYRY) la página de Benchmarks reporta R² y CI95 bootstrap
          sobre cada target numérico. La familia DMR-LDA (Dirichlet-
          Multinomial Regression) integra mediciones como meta-data de
          documento, no como target — esa es una manera distinta de usar
          el mismo aparato.
        </p>
        <p className="mt-3">
          <strong>Builders:</strong>{" "}
          <code>build_dmr_lda_hidsag.py</code> +{" "}
          <code>build_method_statistics_hidsag.py</code>. La página de
          Benchmarks expone forest plots paired contra los métodos
          baselines.
        </p>
      </Section>

      <Section
        id="what-topics-capture"
        title='¿Qué "captura" un tópico, en términos de la tarea?'
        lead="No es texto: la pregunta se contesta visualmente con distribuciones."
      >
        <p>
          Para cada tópico <Equation tex="k" />, el Workspace permite ver:
        </p>
        <ul
          className="mt-2 space-y-2 list-disc pl-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>
            <strong>Etiquetas</strong>:{" "}
            <Equation tex="P(y \mid k) = \frac{\sum_d \theta_{d,k} \, \mathbf{1}[y_d = y]}{\sum_d \theta_{d,k}}" />{" "}
            — distribución condicional de etiquetas dado el tópico.
          </li>
          <li>
            <strong>Mediciones</strong>: histograma o KDE de cada variable
            continua sobre los documentos pesados por{" "}
            <Equation tex="\theta_{d,k}" />.
          </li>
          <li>
            <strong>Espectro</strong>: el perfil <Equation tex="\phi_k" />{" "}
            re-mapeado a longitud de onda — la "firma" del tópico.
          </li>
          <li>
            <strong>Espacial</strong>: el mapa por píxel de{" "}
            <Equation tex="\theta_k" /> sobre la escena, con click-to-
            inspect del píxel y su vector completo.
          </li>
          <li>
            <strong>Biblioteca</strong>: top-N coincidencias con USGS
            spectral library v7 (2450 espectros, 7 capítulos) por cosine
            sobre el grid AVIRIS-Classic.
          </li>
        </ul>
        <p className="mt-3">
          Con esos cinco panels, una pregunta como "¿este tópico captura
          documentos de alta ley de cobre?" se contesta mirando el
          histograma de Cu condicionado a <Equation tex="\theta_k" />, no
          parseando texto.
        </p>
      </Section>

      <Section id="see-also" title="Cómo seguir">
        <p>
          La página de Workspace permite <em>aplicar</em> un modelo a un
          documento concreto y ver los cinco panels al vuelo (todo
          precalculado, sin re-fitting). La página de Benchmarks compara
          los modelos cabeza a cabeza con bootstrap CI95 + Wilcoxon-Holm
          + Cliff δ + posterior bayesiana (HDI94) por escena.
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
