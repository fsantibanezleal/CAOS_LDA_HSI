import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Equation } from "@/components/Equation";
import { Figure } from "@/components/Figure";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
import { cn } from "@/lib/cn";

type MethodFamily = "topic" | "neural-topic" | "compression" | "deep" | "unmixing";

type MethodEntry = {
  id: string;
  family: MethodFamily;
  label: string;
  tag: string;
  theory: { equations: string[]; body: string };
  principles: string[];
  hypothesis: string;
  findings: string;
};

const FAMILY_LABEL: Record<MethodFamily, string> = {
  topic: "Topic models · classical",
  "neural-topic": "Topic models · neural",
  compression: "K-dim compression baselines",
  deep: "Deep representations",
  unmixing: "Linear unmixing",
};

const FAMILY_COLOR: Record<MethodFamily, string> = {
  topic: "rgba(40, 160, 80, 1)",
  "neural-topic": "rgba(34, 197, 94, 1)",
  compression: "rgba(56, 189, 248, 1)",
  deep: "rgba(170, 60, 200, 1)",
  unmixing: "rgba(214, 140, 40, 1)",
};

const METHODS: MethodEntry[] = [
  {
    id: "lda",
    family: "topic",
    label: "LDA · online VB",
    tag: "Blei-Ng-Jordan 2003 · sklearn online",
    theory: {
      equations: [
        "\\theta_d \\sim \\text{Dir}(\\alpha)",
        "z_{d,n} \\sim \\text{Mult}(\\theta_d)",
        "w_{d,n} \\sim \\text{Mult}(\\phi_{z_{d,n}})",
      ],
      body: "Latent Dirichlet Allocation modela cada documento como una mezcla θ_d de K tópicos. Cada token w_{d,n} se genera eligiendo primero un tópico z_{d,n} con probabilidad θ_d, luego una palabra con probabilidad φ_{z_{d,n}}. La inferencia variacional online (Hoffman-Blei-Bach 2010) usa mini-batches y stochastic VI.",
    },
    principles: [
      "K se elige a priori (K = n_classes por convención en este proyecto).",
      "Priors canónicos del paper original Procemin/A39: α = 0.45, η = 0.2.",
      "Recipe canónica V1 (band-frequency, banda como palabra) con Q ∈ {8, 16, 32}.",
    ],
    hypothesis: "Si una imagen hiperespectral es un corpus de píxeles-como-documentos, los tópicos discretos descubiertos deberían alinearse con las clases agronómicas/minerales etiquetadas.",
    findings: "Wins ARI 4/6 escenas (Indian Pines, Salinas, Salinas-A, Pavia U) vs ProdLDA y ETM head-to-head; pierde 1/6 en KSC donde colapsa a ARI≈0; pierde 1/6 en Botswana vs ETM. Coherencia c_v 0/6 (siempre worst). σ ≤ 0.03 ARI sobre N=5 seeds — extremadamente estable.",
  },
  {
    id: "lda_tomo",
    family: "topic",
    label: "LDA · tomotopy (collapsed Gibbs)",
    tag: "Griffiths-Steyvers 2004 · C++ Gibbs",
    theory: {
      equations: [
        "p(z_i = k \\mid z_{-i}, w) \\propto \\frac{n^{(d)}_{k,-i} + \\alpha}{\\sum_{k'} n^{(d)}_{k',-i} + K\\alpha} \\cdot \\frac{n^{(w)}_{k,-i} + \\eta}{\\sum_{w'} n^{(w')}_{k,-i} + V\\eta}",
      ],
      body: "Colapsado: integra φ y θ analíticamente, deja sólo las asignaciones discretas z como variables de Gibbs. Iteración i: re-muestrea z_i condicional al resto. Más lento (10× online VB) pero suele encontrar mejores máximos.",
    },
    principles: [
      "Sin variational gap — la distribución del sampler converge a la posterior real.",
      "Burn-in + N iteraciones efectivas; per-document log-likelihood como diagnóstico.",
      "Implementación C++ vía tomotopy → 50× más rápido que pgmpy puro.",
    ],
    hypothesis: "Mejor estimador de φ debería traducirse a tópicos más semánticamente coherentes (c_v más alto).",
    findings: "Wins coherencia c_v en 4/6 escenas vs LDA-online. Tradeoff coherencia-vs-ARI: tomotopy es bueno c_v, pero ARI vs label se mantiene similar. Útil cuando la prioridad es interpretabilidad.",
  },
  {
    id: "lda_sparse",
    family: "topic",
    label: "LDA · sparse VB",
    tag: "α = 0.05 (vs canonical 0.45)",
    theory: {
      equations: [
        "\\theta_d \\sim \\text{Dir}(\\alpha)\\quad \\text{con } \\alpha \\ll 1",
      ],
      body: "Igual a LDA online pero con α = 0.05 (modo de la Dirichlet hacia vertices del simplex). θ_d resulta peaked: cada documento se concentra en pocos tópicos.",
    },
    principles: [
      "Sparsity prior estricto: documentos con sólo 1-3 tópicos activos.",
      "Útil cuando las clases son disjuntas (las clases agronómicas no se mezclan dentro de un píxel).",
      "Perplexity típicamente peor — pero mejor coincidencia con etiquetas categóricas.",
    ],
    hypothesis: "Sparsity más alta debería mejorar ARI vs label (cada documento → un tópico dominante claro).",
    findings: "Perplexity peor que LDA canonical, ARI marginalmente peor en la mayoría de escenas. Confirma que para datos HSI los píxeles no son mono-tópico.",
  },
  {
    id: "hdp",
    family: "topic",
    label: "HDP · tomotopy",
    tag: "Hierarchical Dirichlet Process · K aprendido",
    theory: {
      equations: [
        "G_0 \\sim \\text{DP}(\\gamma, H)",
        "G_d \\sim \\text{DP}(\\alpha_0, G_0)",
        "\\theta_{d,n} \\sim G_d, \\quad w_{d,n} \\sim F(\\theta_{d,n})",
      ],
      body: "HDP (Teh-Jordan-Beal-Blei 2006) es la extensión no-paramétrica de LDA: el número de tópicos K se aprende del corpus vía stick-breaking. Cada tópico se comparte (cómpartmente) entre documentos vía un proceso de Dirichlet jerárquico.",
    },
    principles: [
      "K no se fija a priori — el modelo decide cuántos tópicos activos hay.",
      "Truncación T (cap superior) para inferencia tractable; T = 50 típico.",
      "Útil cuando no hay prior sobre n_classes (escenas no etiquetadas).",
    ],
    hypothesis: "Para escenas con número de clases desconocido, HDP debería identificar automáticamente el K efectivo y converger a tópicos coherentes.",
    findings: "Sobre las 6 escenas etiquetadas, HDP típicamente activa entre 8-15 tópicos efectivos (n_classes ∈ {9, 13, 16}). c_v comparable a LDA. ARI vs label competitivo con LDA cuando el K aprendido se acerca al verdadero.",
  },
  {
    id: "ctm",
    family: "topic",
    label: "CTM · tomotopy",
    tag: "Correlated Topic Model · logistic-normal",
    theory: {
      equations: [
        "\\eta_d \\sim \\mathcal{N}(\\mu, \\Sigma)",
        "\\theta_d = \\text{softmax}(\\eta_d)",
        "w_{d,n} \\sim \\text{Mult}(\\phi_{z_{d,n}}),\\ z_{d,n} \\sim \\text{Mult}(\\theta_d)",
      ],
      body: "Blei-Lafferty 2007. Reemplaza el prior Dirichlet por una logistic-normal: η_d ∈ ℝ^{K-1} con covarianza Σ no diagonal. La softmax convierte η a θ. Σ codifica correlaciones entre tópicos.",
    },
    principles: [
      "Relaja la independencia entre tópicos que LDA impone vía Dirichlet.",
      "Inferencia más cara (logistic-normal no es conjugada con multinomial).",
      "Σ es un parámetro libre adicional con K(K-1)/2 entradas.",
    ],
    hypothesis: "Para HSI, tópicos espectralmente vecinos pueden correlacionarse (e.g. vegetación temprana y madura comparten bandas). CTM debería capturarlo.",
    findings: "Tiempo de cómputo 5-10× LDA. ARI ganancia marginal (<0.02). Σ off-diagonal no es estructuralmente informativa en los corpus testeados.",
  },
  {
    id: "prodlda",
    family: "neural-topic",
    label: "ProdLDA · Pyro",
    tag: "Srivastava-Sutton 2017 · amortizado",
    theory: {
      equations: [
        "q_\\phi(z \\mid w) = \\text{softmax}(\\text{MLP}_\\phi(w))",
        "p_\\theta(w \\mid z) = \\text{softmax}(\\beta^\\top z)",
        "\\mathcal{L} = \\mathbb{E}_q[\\log p_\\theta(w \\mid z)] - \\text{KL}(q_\\phi \\| p)",
      ],
      body: "Neural topic model: encoder MLP amortiza la inferencia de z, decoder es la multinomial softmax sobre β = K×V. ELBO con KL Dirichlet vía Laplace approximation.",
    },
    principles: [
      "Encoder + decoder neurales — entrenamiento por gradiente sobre todo el corpus.",
      "Topic Coherence c_v mejor que LDA típicamente (decoder aprende relaciones banda).",
      "Sensible a init: σ(ARI) ≈ 0.03 a través de N=5 seeds.",
    ],
    hypothesis: "Encoder amortizado debería igualar LDA en ARI y mejorar c_v gracias al decoder neural.",
    findings: "Wins c_v 6/6 escenas vs LDA y ETM. Pierde ARI 4/6 vs LDA (5/6 vs ETM). Confirma tradeoff explícito: coherence vs discriminability. Operational rule: ProdLDA para interpretabilidad, LDA para clustering.",
  },
  {
    id: "etm",
    family: "neural-topic",
    label: "ETM · Embedded Topic Model",
    tag: "Dieng-Ruiz-Blei 2020 · low-rank decoder",
    theory: {
      equations: [
        "\\beta_k = \\rho \\cdot \\alpha_k^\\top \\in \\mathbb{R}^V",
        "q_\\phi(\\theta \\mid w) = \\mathcal{N}(\\mu_\\phi(w), \\Sigma_\\phi(w))",
        "p(w \\mid \\theta, \\rho, \\alpha) = \\text{softmax}(\\theta^\\top \\beta)",
      ],
      body: "Decoder factorizado: β = ρα^T donde ρ ∈ ℝ^{V×E} son word embeddings y α ∈ ℝ^{K×E} son topic embeddings. E ≪ V acelera y regulariza. Variational gaussian sobre θ.",
    },
    principles: [
      "Decoder low-rank E ≤ 256 — captura similitud semántica entre palabras (bandas vecinas).",
      "Word embeddings ρ son aprendidos junto con tópicos.",
      "Mejor para vocabularios grandes; HSI tiene V ≈ 200 bandas.",
    ],
    hypothesis: "Embedding compartido entre palabras debería ayudar cuando hay redundancia espectral (bandas correlacionadas).",
    findings: "ETM > ProdLDA en ARI 5/6 escenas (ProdLDA wins solo en KSC). Coherencia c_v middle: ProdLDA > ETM > LDA. ETM es el mejor compromiso ARI+c_v.",
  },
  {
    id: "nmf",
    family: "compression",
    label: "NMF · K=8",
    tag: "Lee-Seung 1999 · KL divergence",
    theory: {
      equations: [
        "X \\approx W H, \\quad W \\geq 0,\\ H \\geq 0",
        "D_{KL}(X \\| WH) = \\sum_{ij} X_{ij} \\log\\frac{X_{ij}}{(WH)_{ij}} - X_{ij} + (WH)_{ij}",
      ],
      body: "Non-negative matrix factorization. β-divergence = KL. W ∈ ℝ_+^{N×K} son scores por documento, H ∈ ℝ_+^{K×V} son basis spectra. Multiplicative update rules.",
    },
    principles: [
      "Parts-based: cada espectro es suma no-negativa de K basis spectra.",
      "Sin priors estocásticos — solución determinista (init-dependent).",
      "Baseline K-dim directo contra LDA / PCA / AE en la misma K.",
    ],
    hypothesis: "Si la mezcla espectral es físicamente lineal, NMF debería recuperar endmembers comparables a NFINDR.",
    findings: "Reconstrucción RMSE comparable a PCA en K=8. Silhouette y ARI vs label peor que PCA en 4/6 escenas — los componentes NMF son más interpretables que separables.",
  },
  {
    id: "pca",
    family: "compression",
    label: "PCA · K=8",
    tag: "Linear, L2-optimal",
    theory: {
      equations: [
        "C = \\frac{1}{N} X^\\top X",
        "C v_k = \\lambda_k v_k,\\quad v_k \\in \\mathbb{R}^V",
        "z_d = V_{:K}^\\top x_d",
      ],
      body: "Descomposición espectral de la covarianza C ∈ ℝ^{V×V}. Los K eigenvectores top forman la base V_{:K}. La proyección z_d = V_{:K}^T x_d es L2-óptima en reconstrucción (Eckart-Young).",
    },
    principles: [
      "Compresión lineal — preserva varianza máxima en K direcciones.",
      "Reconstruction RMSE mínima en cada K (esto es su único título garantizado).",
      "Componentes pueden ser negativos — sin interpretación física directa.",
    ],
    hypothesis: "Para datos HSI dominados por una sola dirección de varianza (brillo), PCA debería ser una baseline difícil de batir en MSE pero pobre en separabilidad.",
    findings: "Wins reconstruction RMSE en TODAS las K testeadas (4, 8, 12, 16, 32). Silhouette intermedio. ARI vs label moderado. Es el L2-baseline canónico contra el cual todo deep encoder debe justificarse.",
  },
  {
    id: "ica",
    family: "compression",
    label: "ICA · K=8 (FastICA)",
    tag: "Hyvärinen 1999 · non-Gaussian",
    theory: {
      equations: [
        "x = A s,\\quad s \\sim \\text{non-Gaussian, independent}",
        "\\max_W |\\mathbb{E}[G(W^\\top x)] - \\mathbb{E}[G(\\nu)]|",
      ],
      body: "Independent Component Analysis. Asume x = As con fuentes s estadísticamente independientes (no Gaussianas). FastICA usa kurtosis / negentropy. ν ~ N(0,1) es la referencia Gaussiana.",
    },
    principles: [
      "Independencia estadística > decorrelación (PCA).",
      "Útil cuando hay fuentes físicas distinguibles (e.g. agua, vegetación, suelo).",
      "Convergencia más lenta que PCA pero comparable en costo.",
    ],
    hypothesis: "Si la HSI es una mezcla de pocas fuentes físicas independientes, ICA debería recuperar dichas fuentes mejor que PCA en silhouette.",
    findings: "Latentes comparables a PCA en ARI/NMI. Silhouette ligeramente menor en 3/6 escenas — los componentes ICA capturan estructura distinta pero no necesariamente más separable.",
  },
  {
    id: "dense_ae",
    family: "compression",
    label: "Dense AE · K=8",
    tag: "MLP encoder → bottleneck K → decoder",
    theory: {
      equations: [
        "z = \\sigma(W_2 \\sigma(W_1 x + b_1) + b_2)",
        "\\hat x = \\sigma(W_4 \\sigma(W_3 z + b_3) + b_4)",
        "\\mathcal{L} = \\|x - \\hat x\\|_2^2",
      ],
      body: "Baseline neural lineal. Encoder MLP → bottleneck K, decoder MLP simétrico. Loss MSE. Sin convolución, sin recurrencia. Equivalente a una PCA no-lineal.",
    },
    principles: [
      "Generalización no-lineal de PCA con la misma K.",
      "Trained on GPU (cycles 59+ del proyecto).",
      "Sin regularización adicional (sin KL, sin dropout) — comparable a PCA en degenerados.",
    ],
    hypothesis: "Para K bajo (4, 8), las relaciones no-lineales entre bandas deberían dar mejor reconstrucción que PCA.",
    findings: "Reconstruction RMSE comparable a PCA (no mejor en K=8 promedio 6 escenas). Silhouette y ARI ligeramente peores que PCA — el modelo aprende lo mismo que PCA pero con más varianza de seed.",
  },
  {
    id: "cae_1d",
    family: "deep",
    label: "CAE-1D · K=8",
    tag: "Conv1D encoder over spectrum",
    theory: {
      equations: [
        "z = \\text{Conv1D}_{\\text{enc}}(x) \\in \\mathbb{R}^K",
        "\\hat x = \\text{ConvTranspose1D}_{\\text{dec}}(z)",
        "\\mathcal{L} = \\|x - \\hat x\\|_2^2",
      ],
      body: "Convolutional AE 1D sobre el espectro. Kernel = 7 bandas adyacentes. Encoder = 3 capas Conv1D + 2 dense, bottleneck K = 8.",
    },
    principles: [
      "Asume estructura local en el espectro (bandas vecinas correlacionadas).",
      "Receptive field aumenta exponencialmente con la profundidad — captura features amplios.",
      "Stride 2 entre capas reduce dimensión espectral progresivamente.",
    ],
    hypothesis: "El espectro hiperespectral tiene autocorrelación banda-a-banda. CAE-1D debe capturar features locales (bordes, picos) mejor que PCA/AE denso.",
    findings: "Mejor estabilidad de seeds (ARI std 15-20% menor que LDA en 5/6 escenas). Silhouette igualada a PCA pero σ menor. Es la opción default de compresión deep cuando se busca estabilidad.",
  },
  {
    id: "cae_2d",
    family: "deep",
    label: "CAE-2D · K=8 (anchor)",
    tag: "Conv2D over spatial-spectral patches",
    theory: {
      equations: [
        "x_p \\in \\mathbb{R}^{B \\times P \\times P},\\ P = 7",
        "z = \\text{Conv2D}_{\\text{enc}}(x_p)[\\text{centre pixel}]",
      ],
      body: "CAE 2D sobre parches P×P×B (P=7 bandas adyacentes en 2D espacial). Encoder Conv2D + bottleneck K=8 sólo para el píxel central del parche.",
    },
    principles: [
      "Captura textura espacial (no sólo el perfil espectral).",
      "Modo anchor: solo el centro del parche contribuye al loss y al z.",
      "Spatial neighborhood = 3.5 pixels de radio efectivo.",
    ],
    hypothesis: "Spatial context debería mejorar separabilidad — un píxel agrícola rodeado de píxeles agrícolas es más clasificable.",
    findings: "A N=15 seeds: ARI vs label competitivo con CAE-1D. Mejor en escenas con texturas claras (Indian Pines), peor en mosaicos finos (Salinas-A).",
  },
  {
    id: "cae_3d",
    family: "deep",
    label: "CAE-3D anchor · K=8",
    tag: "Conv3D over (space × bands)",
    theory: {
      equations: [
        "x_p \\in \\mathbb{R}^{B \\times P \\times P},\\ P = 7",
        "z = \\text{Conv3D}_{\\text{enc}}(x_p)[\\text{centre}],",
      ],
      body: "Conv3D sobre cubos completos (dim espacial × dim espectral). Kernels 3D = (3 bandas × 3 px × 3 px). Anchor: sólo el píxel central define z.",
    },
    principles: [
      "Receptive field volumétrico — captura simultáneamente vecindad espacial y espectral.",
      "Más caro computacionalmente — entrenamiento GPU 50-120× con CUDA.",
      "Anchor mode reduce loss noise al concentrarse en el píxel objetivo.",
    ],
    hypothesis: "Conv3D debería ser estrictamente mejor que CAE-2D + CAE-1D combinados — más capacidad inductiva nativa.",
    findings: "K-curve {K=4, K=8} neutral: ΔARI K=4 = +0.011 (5/6 escenas confirman dirección); Pavia U invierte con capacidad. No es ganancia decisiva sobre CAE-1D — la capacidad volumétrica no es la palanca dominante.",
  },
  {
    id: "cae_3d_full",
    family: "deep",
    label: "CAE-3D full · K=8",
    tag: "Conv3D dense loss (full patch)",
    theory: {
      equations: [
        "z = \\text{Conv3D}_{\\text{enc}}(x_p)",
        "\\mathcal{L} = \\frac{1}{P^2}\\sum_{i,j} \\|x_p[:,i,j] - \\hat x_p[:,i,j]\\|_2^2",
      ],
      body: "Misma red que CAE-3D anchor, pero el loss penaliza todos los píxeles del parche P×P (no solo el centro). Aprovecha más señal del parche por gradiente.",
    },
    principles: [
      "Loss denso (P² veces más píxeles contribuyen) reduce noise de gradient.",
      "Embedding por píxel se calcula al rato y queda K-dim por píxel.",
      "Trained on GPU; misma arquitectura que anchor + loss diferente.",
    ],
    hypothesis: "Dense loss debería dar gradients más limpios y latents más estables.",
    findings: "Equivalente a anchor en ARI vs label en N=15 sobre 6 escenas. No es decisivamente mejor en ninguna escena. Cycle 58 confirmó K-curve idéntica entre anchor y full.",
  },
  {
    id: "beta_vae",
    family: "deep",
    label: "β-VAE · K=8",
    tag: "Higgins et al. 2017 · β KL term",
    theory: {
      equations: [
        "q_\\phi(z \\mid x) = \\mathcal{N}(\\mu_\\phi(x), \\sigma_\\phi^2(x))",
        "\\mathcal{L} = \\mathbb{E}_q[\\log p(x \\mid z)] - \\beta \\cdot \\text{KL}(q_\\phi \\| \\mathcal{N}(0, I))",
      ],
      body: "Variational AE con multiplicador β en el término KL. β = 1 ⇒ VAE estándar. β > 1 fuerza dimensiones de z a ser más independientes (desentrelazado).",
    },
    principles: [
      "Latente probabilístico — z es una distribución, no un punto.",
      "β controla el tradeoff reconstrucción vs disentanglement.",
      "Default canónico aquí: β = 2.",
    ],
    hypothesis: "Latente desentrelazado debería ayudar interpretabilidad sin sacrificar mucho reconstrucción.",
    findings: "A β = 2, comparable a CAE-1D en ARI/NMI. K-curve sweep β ∈ {1, 2, 8, 16} muestra collapse documentado a β ≥ 8 (KL → 0, sólo el prior queda). β = 2 es el sweet spot.",
  },
  {
    id: "endmember",
    family: "unmixing",
    label: "Endmembers · NFINDR + NNLS",
    tag: "Winter 1999 · Heinz-Chang 2001",
    theory: {
      equations: [
        "E^* = \\arg\\max_{\\{e_1,\\dots,e_K\\}} |\\det[e_1 - e_0, \\dots, e_K - e_0]|",
        "\\alpha_p = \\arg\\min_{\\alpha \\geq 0,\\ \\mathbf{1}^\\top \\alpha = 1} \\|x_p - E\\alpha\\|_2^2",
      ],
      body: "NFINDR (Winter 1999): K endmembers son los vértices del simplex de máximo volumen en el cubo HSI. NNLS con restricción suma-a-uno (delta = 100 penalty) infiere abundancia por píxel.",
    },
    principles: [
      "Modelo lineal de mezcla — cada píxel = suma convexa de K endmembers.",
      "Físicamente interpretable: cada endmember es un material puro candidato.",
      "Comparado contra LDA vía topic_endmember_match: K-K cosine matrix.",
    ],
    hypothesis: "Si los píxeles HSI son combinaciones lineales de pocos materiales puros, los tópicos LDA deberían alinearse con endmembers.",
    findings: "Best per-topic cosine vs endmember típicamente 0.7-0.9 (alta alineación) en escenas mineralógicas. En escenas agrícolas (no minerales), el alineamiento baja a 0.4-0.6 — confirma que LDA recupera estructura no-lineal adicional.",
  },
];

export default function MethodologyRepresentations() {
  const { t } = useTranslation(["pages"]);
  const [selectedId, setSelectedId] = useState<string>(METHODS[0]!.id);
  const selected = METHODS.find((m) => m.id === selectedId) ?? METHODS[0]!;

  return (
    <PageShell
      title={t("pages:methodology_representations.title")}
      lead="Cada método (16 totales — 6 topic family + 2 neural-topic + 4 K-dim baselines + 5 deep + 1 unmixing) tiene su propio perfil teórico, principios de diseño, hipótesis de partida, y hallazgos contra las 6 escenas etiquetadas. Pick a method to drill in."
    >
      <MethodNav methods={METHODS} selectedId={selectedId} onSelect={setSelectedId} />

      <MethodDetail entry={selected} />

      <Section id="recipes" title="Background · wordification recipes V1..V12">
        <p className="mb-3 text-[14px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
          Las representaciones topic-family operan sobre un alfabeto discreto de palabras. Hay 12
          recetas de wordification (V1..V12) × 3 esquemas de cuantización × Q ∈ {`{8, 16, 32}`} = 108
          configs por escena. La grilla siguiente muestra el espacio. La recipe canónica es V1
          (band-frequency, banda como palabra) con uniform Q=8.
        </p>
        <Figure caption="12 recipes × 9 (3 esquemas × 3 Q) = 108 configs por escena.">
          <RecipeGridSVG />
        </Figure>
      </Section>
    </PageShell>
  );
}

function MethodNav({
  methods,
  selectedId,
  onSelect,
}: {
  methods: MethodEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const families: MethodFamily[] = ["topic", "neural-topic", "compression", "deep", "unmixing"];
  return (
    <nav
      role="tablist"
      aria-label="Métodos"
      className="sticky top-14 z-20 -mx-6 px-6 py-3 mb-4 border-b"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-bg) 92%, transparent)",
        borderColor: "var(--color-border)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="space-y-1.5">
        {families.map((fam) => {
          const inFamily = methods.filter((m) => m.family === fam);
          if (inFamily.length === 0) return null;
          return (
            <div key={fam} className="flex items-baseline flex-wrap gap-2">
              <span
                className="text-[10px] uppercase tracking-widest font-semibold pr-2 w-44 shrink-0"
                style={{ color: FAMILY_COLOR[fam] }}
              >
                {FAMILY_LABEL[fam]}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {inFamily.map((m) => {
                  const isActive = selectedId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => onSelect(m.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[12px] transition-all",
                        isActive ? "font-semibold shadow-sm" : "opacity-80 hover:opacity-100",
                      )}
                      style={{
                        borderColor: isActive ? FAMILY_COLOR[fam] : "var(--color-border)",
                        backgroundColor: isActive ? "var(--color-accent-soft)" : "var(--color-panel)",
                        color: isActive ? FAMILY_COLOR[fam] : "var(--color-fg)",
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function MethodDetail({ entry }: { entry: MethodEntry }) {
  return (
    <article
      className="rounded-xl border p-6 mb-8 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div aria-hidden className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: FAMILY_COLOR[entry.family] }} />
      <header className="mb-4 mt-2">
        <div className="text-[10.5px] uppercase tracking-widest font-semibold mb-1" style={{ color: FAMILY_COLOR[entry.family] }}>
          {FAMILY_LABEL[entry.family]}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1" style={{ color: "var(--color-fg)" }}>
          {entry.label}
        </h2>
        <p className="text-[13px]" style={{ color: "var(--color-fg-faint)" }}>{entry.tag}</p>
      </header>

      <div className="grid lg:grid-cols-2 gap-6">
        <MethodSubsection title="Theoretical formulation" accent={FAMILY_COLOR[entry.family]}>
          {entry.theory.equations.map((eq, i) => (
            <Equation key={i} tex={eq} block />
          ))}
          <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {entry.theory.body}
          </p>
        </MethodSubsection>

        <MethodSubsection title="Principios de diseño" accent={FAMILY_COLOR[entry.family]}>
          <ul className="space-y-1.5 text-[13.5px] leading-relaxed list-disc pl-5" style={{ color: "var(--color-fg-subtle)" }}>
            {entry.principles.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </MethodSubsection>

        <MethodSubsection title="Hipótesis de partida" accent={FAMILY_COLOR[entry.family]}>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {entry.hypothesis}
          </p>
        </MethodSubsection>

        <MethodSubsection title="Hallazgos contra las 6 escenas etiquetadas" accent={FAMILY_COLOR[entry.family]}>
          <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--color-fg-subtle)" }}>
            {entry.findings}
          </p>
        </MethodSubsection>
      </div>
    </article>
  );
}

function MethodSubsection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-l-2 pl-4" style={{ borderColor: accent }}>
      <h3 className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: accent }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function RecipeGridSVG() {
  const RECIPES = [
    "V1 band-frequency", "V2 intensity-as-word", "V3 concat-spectra", "V4 derivative-bin",
    "V5 2nd-derivative", "V6 wavelet", "V7 absorption-triplet", "V8 endmember-fraction",
    "V9 region-token", "V10 band-group", "V11 codebook-VQ", "V12 GMM-token",
  ];
  const cols = ["U/8", "U/16", "U/32", "Q/8", "Q/16", "Q/32", "L/8", "L/16", "L/32"];
  const cellW = 32;
  const cellH = 22;
  const x0 = 200;
  const y0 = 28;
  return (
    <svg
      width="480"
      height={y0 + RECIPES.length * cellH + 14}
      viewBox={`0 0 480 ${y0 + RECIPES.length * cellH + 14}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Recipe × scheme × Q grid"
      style={{ color: "var(--color-fg)" }}
    >
      <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="10" fill="currentColor">
        {cols.map((c, i) => (
          <text key={c} x={x0 + i * cellW + cellW / 2} y={y0 - 8} textAnchor="middle" opacity="0.7">
            {c}
          </text>
        ))}
        {RECIPES.map((label, ri) => (
          <g key={ri}>
            <text x={x0 - 10} y={y0 + ri * cellH + cellH * 0.65} textAnchor="end" fontFamily="ui-monospace, monospace" fontSize="10.5">
              {label}
            </text>
            {cols.map((_, ci) => (
              <rect
                key={ci}
                x={x0 + ci * cellW}
                y={y0 + ri * cellH + 2}
                width={cellW - 3}
                height={cellH - 5}
                rx="2"
                fill="var(--color-accent)"
                opacity={0.15 + 0.06 * ((ri + ci) % 5)}
              />
            ))}
          </g>
        ))}
      </g>
    </svg>
  );
}
