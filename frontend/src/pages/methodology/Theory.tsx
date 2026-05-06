import { useTranslation } from "react-i18next";

import { Figure } from "@/components/Figure";
import { Equation } from "@/components/Equation";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

export default function MethodologyTheory() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology_theory.title")}
      lead="Modelos probabilísticos de tópicos sobre imágenes hiperespectrales — qué son, cómo funcionan y por qué un píxel puede ser tratado como un documento."
    >
      <Section
        id="why-ptm"
        title="¿Qué es un modelo probabilístico de tópicos?"
        lead="Un modelo probabilístico de tópicos (PTM) describe cada documento como una mezcla latente sobre un puñado de distribuciones de palabras llamadas tópicos. La gracia es que esa estructura latente se aprende sin supervisión a partir de las co-ocurrencias de palabras."
      >
        <p>
          Bajo el modelo más popular — Latent Dirichlet Allocation (Blei, Ng &amp;
          Jordan, 2003) — un corpus de <em>D</em> documentos sobre un vocabulario
          de tamaño <em>V</em> se explica con dos colecciones de distribuciones:{" "}
          <Equation tex="\theta_d \in \Delta^{K-1}" /> es la mezcla de tópicos del
          documento <em>d</em>, y <Equation tex="\phi_k \in \Delta^{V-1}" /> es la
          distribución de palabras del tópico <em>k</em>. Cada palabra observada
          se genera tirando primero un tópico desde <Equation tex="\theta_d" /> y
          luego una palabra desde el <Equation tex="\phi_k" /> correspondiente.
        </p>
        <p className="mt-3">
          La inferencia recupera <Equation tex="\theta" />, <Equation tex="\phi" /> y la
          asignación tópico-por-palabra <Equation tex="z" />. El resultado es una
          descomposición compacta, interpretable y mixta del corpus: cada
          documento es una mezcla de tópicos en lugar de pertenecer a una sola
          categoría dura.
        </p>
      </Section>

      <Section
        id="lda-plate"
        title="LDA — notación de placas y proceso generativo"
        lead="Las placas externas se repiten sobre documentos y palabras; las distribuciones latentes (theta y phi) son los objetos que el modelo aprende."
      >
        <Figure caption="LDA en notación de placas. La placa exterior recorre los D documentos; la interior, las N_d palabras de cada documento. Theta_d es la mezcla por documento sobre los K tópicos; phi_k es la distribución del tópico k sobre las V palabras del vocabulario.">
          <PlateNotationSVG />
        </Figure>

        <p>
          La distribución conjunta del modelo factoriza así (con priors
          Dirichlet sobre <Equation tex="\theta_d" /> y <Equation tex="\phi_k" />):
        </p>

        <Equation
          block
          tex="p(\theta, \phi, z, w \mid \alpha, \eta) = \prod_{k=1}^{K} p(\phi_k \mid \eta) \, \prod_{d=1}^{D} p(\theta_d \mid \alpha) \prod_{n=1}^{N_d} p(z_{d,n} \mid \theta_d) \, p(w_{d,n} \mid z_{d,n}, \phi_{1:K})"
        />

        <p>
          La verosimilitud marginal del corpus se obtiene integrando los
          latentes continuos y sumando sobre las asignaciones discretas:
        </p>
        <Equation
          block
          tex="p(w \mid \alpha, \eta) = \int \int \, \prod_{k} p(\phi_k \mid \eta) \, \prod_{d} p(\theta_d \mid \alpha) \prod_{n} \sum_{k=1}^{K} \theta_{d,k} \, \phi_{k, w_{d,n}} \, d\theta \, d\phi"
        />
        <p>
          Esa integral es intratable en forma cerrada. La inferencia se hace por
          variational Bayes (Blei et al. 2003), Gibbs colapsado (Griffiths &amp;
          Steyvers 2004) o stochastic VI (Hoffman et al. 2013); todas son
          aproximaciones a la misma posterior.
        </p>
      </Section>

      <Section
        id="hsi-as-document"
        title="HSI como corpus — ¿por qué un píxel puede ser un documento?"
        lead="Cada píxel de una imagen hiperespectral es un vector de reflectancia. Para que LDA lo procese hay que cuantizar el espectro y transformarlo en una secuencia discreta de tokens."
      >
        <p>
          Una imagen hiperespectral (HSI) es un cubo{" "}
          <Equation tex="X \in \mathbb{R}^{H \times W \times B}" />, donde cada
          píxel <Equation tex="(i, j)" /> tiene un espectro{" "}
          <Equation tex="x_{ij} = (x_{ij,1}, \dots, x_{ij,B})" /> con la reflectancia
          observada en cada una de las <em>B</em> bandas espectrales. Bandas
          típicas: 200 (Indian Pines AVIRIS-Classic) a 224 (Salinas) a más de
          2000 (HIDSAG).
        </p>
        <p className="mt-3">
          La conversión espectro → documento se llama{" "}
          <strong>wordification</strong>. Una receta de wordification declara
          (i) cómo se normaliza el espectro, (ii) cómo se cuantizan las
          intensidades, (iii) qué constituye un token (banda, intensidad,
          derivada, coeficiente wavelet, código VQ, etc.) y (iv) qué constituye
          un documento (un píxel, una región SLIC, un parche, una muestra
          completa). El resultado es una matriz documento-término{" "}
          <Equation tex="C \in \mathbb{N}^{D \times V}" /> sobre la cual LDA puede
          inferir.
        </p>

        <Figure caption="Pipeline de wordification: espectro continuo → normalización → cuantización a Q niveles → emisión de tokens → documento. El alfabeto y la receta de tokens se eligen para preservar la propiedad de interés (banda, forma, absorción, abundancia de endmember, código VQ).">
          <WordificationFlowSVG />
        </Figure>

        <p>
          El proyecto ofrece doce recetas (V1 wavelength-as-word a V12 GMM
          token), tres esquemas de cuantización (uniforme, cuantil, Lloyd-Max) y
          tres niveles <em>Q</em> ∈ {`{8, 16, 32}`}. Cada combinación produce un
          corpus distinto y, por lo tanto, una solución LDA distinta.
        </p>
      </Section>

      <Section
        id="why-mixed-membership"
        title="Membresía mixta — ¿por qué no clasificación dura?"
        lead="El espectro de un píxel mineral no proviene de una única especie. Mezclas, vegetación intercalada, sombra y dispersión atmosférica producen mediciones que reflejan varias firmas a la vez."
      >
        <p>
          La asunción de membresía dura — un píxel pertenece a una y solo una
          clase — falla en HSI porque cada espectro es por construcción una
          mezcla. La descomposición mixta de LDA captura esa realidad
          directamente:{" "}
          <Equation tex="\theta_d" /> es la composición topical del píxel{" "}
          <em>d</em>, y la suma <Equation tex="\sum_{k} \theta_{d,k} \phi_k" /> es
          la firma reconstruida que el modelo cree que produjo las palabras
          observadas.
        </p>
        <p className="mt-3">
          Compárese con un baseline lineal (PCA, NMF, ICA) sobre el mismo cubo:
          esos métodos también producen una representación de baja dimensión,
          pero sin un modelo generativo de cuentas discretas y, sobre todo, sin
          la interpretabilidad de "tópico = distribución sobre palabras
          espectrales". La página de Aplicación profundiza en cuándo conviene
          una u otra.
        </p>

        <Figure caption="Memoria mixta: cada píxel del mapa hiperespectral se descompone en una proporción θ_d sobre los K tópicos. La suma ponderada de las firmas tópicas reconstruye una versión suavizada del espectro original.">
          <MixedMembershipSVG />
        </Figure>
      </Section>

      <Section id="readings" title="Lecturas mínimas">
        <ul
          className="mt-2 space-y-2 list-disc pl-5"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          <li>
            Blei, Ng &amp; Jordan (2003) — <em>Latent Dirichlet Allocation</em>.
            JMLR. El paper canónico.
          </li>
          <li>
            Griffiths &amp; Steyvers (2004) —{" "}
            <em>Finding scientific topics</em>. PNAS. Gibbs colapsado.
          </li>
          <li>
            Sievert &amp; Shirley (2014) —{" "}
            <em>LDAvis: A method for visualizing and interpreting topics</em>.
            Define la fórmula de relevancia λ que se usa en la página de
            Workspace.
          </li>
          <li>
            Stammbach et al. (2024) — <em>Re-visiting word intrusion</em>. TACL.
            Marco moderno para validar tópicos vía oráculos LLM.
          </li>
        </ul>
      </Section>
    </PageShell>
  );
}

function PlateNotationSVG() {
  return (
    <svg
      width="560"
      height="260"
      viewBox="0 0 560 260"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="LDA plate notation"
      style={{ color: "var(--color-fg)" }}
    >
      <defs>
        <marker
          id="arrowTheory"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0 L10 5 L0 10 z" fill="currentColor" />
        </marker>
      </defs>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="13"
      >
        <rect x="20" y="40" width="380" height="190" rx="8" />
        <text x="380" y="220" fill="currentColor" textAnchor="end">
          D
        </text>
        <rect x="100" y="100" width="280" height="110" rx="8" />
        <text x="360" y="200" fill="currentColor" textAnchor="end">
          N_d
        </text>
        <rect x="430" y="40" width="110" height="80" rx="8" />
        <text x="525" y="110" fill="currentColor" textAnchor="end">
          K
        </text>

        <circle cx="40" cy="70" r="14" fill="var(--color-bg)" />
        <text x="40" y="74" textAnchor="middle" fill="currentColor">
          α
        </text>
        <circle cx="450" cy="70" r="14" fill="var(--color-bg)" />
        <text x="450" y="74" textAnchor="middle" fill="currentColor">
          η
        </text>

        <circle cx="80" cy="140" r="18" fill="var(--color-accent-soft)" />
        <text x="80" y="144" textAnchor="middle" fill="currentColor">
          θ_d
        </text>

        <circle cx="190" cy="155" r="18" fill="var(--color-accent-soft)" />
        <text x="190" y="159" textAnchor="middle" fill="currentColor">
          z
        </text>

        <circle cx="300" cy="155" r="18" fill="var(--color-accent)" />
        <text x="300" y="159" textAnchor="middle" fill="var(--color-accent-fg)">
          w
        </text>

        <circle cx="490" cy="80" r="18" fill="var(--color-accent-soft)" />
        <text x="490" y="84" textAnchor="middle" fill="currentColor">
          φ_k
        </text>

        <line x1="56" y1="70" x2="62" y2="125" markerEnd="url(#arrowTheory)" />
        <line
          x1="100"
          y1="145"
          x2="170"
          y2="153"
          markerEnd="url(#arrowTheory)"
        />
        <line
          x1="210"
          y1="155"
          x2="280"
          y2="155"
          markerEnd="url(#arrowTheory)"
        />
        <line
          x1="478"
          y1="92"
          x2="320"
          y2="148"
          markerEnd="url(#arrowTheory)"
        />
        <line
          x1="450"
          y1="84"
          x2="475"
          y2="73"
          markerEnd="url(#arrowTheory)"
        />
      </g>
    </svg>
  );
}

function WordificationFlowSVG() {
  return (
    <svg
      width="640"
      height="220"
      viewBox="0 0 640 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Wordification pipeline"
      style={{ color: "var(--color-fg)" }}
    >
      <defs>
        <marker
          id="arrowWord"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
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
        <rect
          x="20"
          y="60"
          width="120"
          height="100"
          rx="8"
          fill="var(--color-panel)"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <text x="80" y="80" textAnchor="middle" fontWeight="600">
          Espectro
        </text>
        <path
          d="M 30 130 C 50 100, 70 160, 90 110 S 130 90, 130 130"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="1.6"
        />
        <text x="80" y="155" textAnchor="middle" opacity="0.7">
          x ∈ ℝ^B
        </text>

        <rect
          x="170"
          y="60"
          width="120"
          height="100"
          rx="8"
          fill="var(--color-panel)"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <text x="230" y="80" textAnchor="middle" fontWeight="600">
          Normalización
        </text>
        <text x="230" y="115" textAnchor="middle" opacity="0.85">
          per-spectrum,
        </text>
        <text x="230" y="132" textAnchor="middle" opacity="0.85">
          per-band o
        </text>
        <text x="230" y="149" textAnchor="middle" opacity="0.85">
          reflectancia
        </text>

        <rect
          x="320"
          y="60"
          width="120"
          height="100"
          rx="8"
          fill="var(--color-panel)"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <text x="380" y="80" textAnchor="middle" fontWeight="600">
          Cuantización
        </text>
        <g stroke="var(--color-accent)" strokeWidth="1.6" fill="none">
          <line x1="335" y1="100" x2="425" y2="100" />
          <line x1="335" y1="115" x2="425" y2="115" />
          <line x1="335" y1="130" x2="425" y2="130" />
          <line x1="335" y1="145" x2="425" y2="145" />
        </g>
        <text x="380" y="158" textAnchor="middle" opacity="0.7">
          uniform / quantile / Lloyd-Max
        </text>

        <rect
          x="470"
          y="60"
          width="150"
          height="100"
          rx="8"
          fill="var(--color-panel)"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <text x="545" y="80" textAnchor="middle" fontWeight="600">
          Tokens
        </text>
        <text x="545" y="105" textAnchor="middle" opacity="0.85">
          V1, V2, … V12
        </text>
        <text x="545" y="125" textAnchor="middle" opacity="0.7">
          (band, q) | (k, α_k)
        </text>
        <text x="545" y="143" textAnchor="middle" opacity="0.7">
          (centroid, depth, area)
        </text>

        <g
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          markerEnd="url(#arrowWord)"
        >
          <line x1="142" y1="110" x2="166" y2="110" />
          <line x1="292" y1="110" x2="316" y2="110" />
          <line x1="442" y1="110" x2="466" y2="110" />
        </g>
      </g>
    </svg>
  );
}

function MixedMembershipSVG() {
  return (
    <svg
      width="560"
      height="240"
      viewBox="0 0 560 240"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Mixed-membership reconstruction"
      style={{ color: "var(--color-fg)" }}
    >
      <defs>
        <linearGradient id="gradT1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="gradT2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="gradT3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="12"
        fill="currentColor"
      >
        <rect
          x="20"
          y="80"
          width="80"
          height="80"
          fill="var(--color-accent)"
          opacity="0.85"
        />
        <text x="60" y="180" textAnchor="middle" fontWeight="600">
          píxel d
        </text>

        <text x="160" y="62" fontWeight="600">
          θ_d (mezcla)
        </text>
        <g>
          <rect x="160" y="80" width="200" height="20" fill="#0ea5e9" />
          <rect x="360" y="80" width="120" height="20" fill="#f97316" />
          <rect x="480" y="80" width="50" height="20" fill="#22c55e" />
          <text x="260" y="95" textAnchor="middle" fill="#fff" fontSize="11">
            tópico 1 — 0.59
          </text>
          <text x="420" y="95" textAnchor="middle" fill="#fff" fontSize="11">
            tópico 2 — 0.27
          </text>
          <text x="505" y="95" textAnchor="middle" fill="#fff" fontSize="11">
            t3
          </text>
        </g>

        <text x="160" y="130" fontWeight="600">
          φ_k (firmas tópicas)
        </text>
        <g transform="translate(160, 140)">
          <path
            d="M 0 60 C 30 40, 60 70, 90 30 S 150 50, 200 35"
            stroke="#0ea5e9"
            strokeWidth="1.8"
            fill="url(#gradT1)"
          />
        </g>
        <g transform="translate(160, 165)">
          <path
            d="M 0 50 C 30 30, 70 60, 110 25 S 170 50, 200 45"
            stroke="#f97316"
            strokeWidth="1.8"
            fill="url(#gradT2)"
          />
        </g>
        <g transform="translate(160, 190)">
          <path
            d="M 0 40 C 40 25, 80 45, 120 15 S 180 30, 200 28"
            stroke="#22c55e"
            strokeWidth="1.8"
            fill="url(#gradT3)"
          />
        </g>

        <text x="400" y="130" fontWeight="600">
          Reconstrucción
        </text>
        <text x="400" y="148" opacity="0.85">
          Σ θ_dk · φ_k
        </text>
        <g transform="translate(400, 160)">
          <path
            d="M 0 50 C 25 25, 60 65, 95 20 S 145 40, 150 35"
            stroke="currentColor"
            strokeWidth="1.8"
            fill="none"
          />
        </g>
      </g>
    </svg>
  );
}
