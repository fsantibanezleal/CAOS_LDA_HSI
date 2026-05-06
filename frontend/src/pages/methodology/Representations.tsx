import { useTranslation } from "react-i18next";

import { Figure } from "@/components/Figure";
import { Equation } from "@/components/Equation";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";

type Recipe = {
  id: string;
  name: string;
  token: string;
  vocabSize: string;
  oneLine: string;
  bullets: string[];
};

const RECIPES: Recipe[] = [
  {
    id: "V1",
    name: "Wavelength-as-word",
    token: "(band l)",
    vocabSize: "B",
    oneLine: "La identidad de la banda es la palabra; la cantidad de tokens por banda es la intensidad cuantizada.",
    bullets: [
      "Más simple y la receta canónica del paper Procemin / A39.",
      "Preserva identidad de longitud de onda.",
      "Es densa: cada documento tiene B · ⟨q⟩ tokens.",
    ],
  },
  {
    id: "V2",
    name: "Intensity-as-word",
    token: "(intensity_bin q)",
    vocabSize: "Q",
    oneLine: "La identidad del bin de intensidad es la palabra. El espectro pierde su orientación en bandas.",
    bullets: [
      "Vocabulario diminuto.",
      "Robusta a permutaciones de bandas.",
      "Útil sólo como control de sensibilidad.",
    ],
  },
  {
    id: "V3",
    name: "Concatenated spectra",
    token: "(spectrum_id, band)",
    vocabSize: "S · B",
    oneLine: "Cada espectro mantiene identidad propia. Útil para corpus pequeños y reproducibles.",
    bullets: [
      "Preserva variabilidad inter-espectro.",
      "Vocabulario crece con el corpus.",
      "Receta fundacional del paper A39 (DB1).",
    ],
  },
  {
    id: "V4",
    name: "Derivative-bin",
    token: "(band, q(d))",
    vocabSize: "B · Q",
    oneLine: "La derivada banda-a-banda cuantizada captura dirección-de-cambio.",
    bullets: [
      "Robusta a deriva de brillo per-sample.",
      "Útil para red-edge, suelos, MSI mal calibrada.",
      "Implementada en build_wordifications_v4plus.py.",
    ],
  },
  {
    id: "V5",
    name: "Second-derivative bin",
    token: "(band, q(d²))",
    vocabSize: "B · Q",
    oneLine: "La segunda derivada resalta picos y valles independientemente de pendiente.",
    bullets: [
      "Buena para absorción estrecha.",
      "Pareja natural con V4.",
    ],
  },
  {
    id: "V6",
    name: "Wavelet-coefficient bin",
    token: "(coef_j, q(|c|))",
    vocabSize: "J · Q",
    oneLine: "Daubechies-4 nivel 4: descomposición multi-resolución cuantizada.",
    bullets: [
      "Captura envoltura ancha + absorción local simultáneamente.",
      "Buena para minerales con estructura mixta.",
    ],
  },
  {
    id: "V7",
    name: "Absorption-feature triplet",
    token: "(centroid_bucket, depth_bin, area_bin)",
    vocabSize: "8 · Q²",
    oneLine: "Hull cóncavo (Clark & Roush 1984) → tripletes (centroide, profundidad, área) por feature.",
    bullets: [
      "Físicamente interpretable.",
      "Convex-hull stack monotónico propio (pysptools.spectro es frágil).",
      "Ideal para identificación mineral.",
    ],
  },
  {
    id: "V8",
    name: "Endmember-fraction bin",
    token: "(endmember_k, q(α_k))",
    vocabSize: "K_em · Q",
    oneLine: "Base de K endmembers (NFINDR) + NNLS unmixing → abundancia por endmember cuantizada.",
    bullets: [
      "Receta más compacta del catálogo.",
      "Vocabulario fijo independiente de las bandas.",
      "Tópicos LDA expresados en la misma base que el unmixing.",
    ],
  },
  {
    id: "V9",
    name: "Region token (Felzenszwalb)",
    token: "(region_id, sam_bin)",
    vocabSize: "≈ #regions · Q",
    oneLine: "Felzenszwalb segmenta la escena; el token es (región, distancia SAM al centroide).",
    bullets: [
      "Documento = región (no píxel).",
      "Coherencia espacial nativa.",
    ],
  },
  {
    id: "V10",
    name: "Band-group VNIR / SWIR-1 / SWIR-2",
    token: "(group_id, q(mean))",
    vocabSize: "3 · Q",
    oneLine: "El espectro se reduce a tres regiones espectrales gruesas; receta deliberadamente coarse.",
    bullets: [
      "Útil como baseline / smoke test.",
      "Pavia U colapsa a un solo bucket porque su rango es 430–860 nm (sólo VNIR).",
    ],
  },
  {
    id: "V11",
    name: "Codebook VQ (nanopq)",
    token: "(subvector_j, code)",
    vocabSize: "M · Q",
    oneLine: "Product Quantisation (Jegou-Douze-Schmid 2011): k-means por sub-vector.",
    bullets: [
      "Representación discreta aprendida.",
      "Adapta el alfabeto al manifold del corpus.",
    ],
  },
  {
    id: "V12",
    name: "GMM token",
    token: "(band, gmm_component)",
    vocabSize: "B · Q",
    oneLine: "GaussianMixture(Q) por banda; soft binning de intensidades.",
    bullets: [
      "Alternativa data-driven a uniform / quantile / Lloyd-Max.",
      "Vocabulario denso comparable a V1.",
    ],
  },
];

const QUANT_SCHEMES = [
  {
    id: "uniform",
    name: "Uniform",
    desc: "Bins equiespaciados sobre el rango [min, max] del espectro normalizado.",
  },
  {
    id: "quantile",
    name: "Quantile",
    desc: "Bins equiprobables: cada bin contiene el mismo número de muestras.",
  },
  {
    id: "lloyd_max",
    name: "Lloyd-Max",
    desc: "Bins óptimos en MSE para la distribución empírica del espectro.",
  },
];

export default function MethodologyRepresentations() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:methodology_representations.title")}
      lead="Cómo un cubo hiperespectral se convierte en una matriz documento-término. Hay doce recetas implementadas (V1..V12), tres esquemas de cuantización y tres niveles Q ∈ {8, 16, 32}."
    >
      <Section
        id="grid"
        title="El espacio de configuraciones"
        lead="Cada celda de la grilla siguiente es un corpus distinto y, por lo tanto, una solución LDA distinta. Total: 12 recetas × 3 esquemas × 3 Q = 108 configs por escena."
      >
        <Figure caption="El alfabeto (token) y la longitud del documento dependen de la receta. La cuantización controla cuántos niveles distintos puede emitir el espectro. Q ∈ {8, 16, 32} balancea resolución y entropía.">
          <RecipeGridSVG />
        </Figure>
      </Section>

      <Section
        id="quantisation"
        title="Esquemas de cuantización"
        lead="Toda receta que cuantiza intensidades elige uno de tres esquemas. La diferencia ocurre en los extremos de la distribución."
      >
        <div
          className="grid sm:grid-cols-3 gap-3 mt-2"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {QUANT_SCHEMES.map((s) => (
            <div
              key={s.id}
              className="rounded-md border p-4 text-sm leading-relaxed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <h3
                className="font-semibold mb-2"
                style={{ color: "var(--color-fg)" }}
              >
                {s.name}
              </h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="recipes"
        title="Las doce recetas"
        lead="Cada receta declara qué constituye un token y un documento. La columna 'Vocabulario' indica el tamaño aproximado de V."
      >
        <div className="overflow-x-auto mt-2">
          <table
            className="min-w-full text-[14px] leading-relaxed border-collapse"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  color: "var(--color-fg)",
                }}
              >
                <th className="text-left py-2 pr-4 font-semibold">Receta</th>
                <th className="text-left py-2 pr-4 font-semibold">Token</th>
                <th className="text-left py-2 pr-4 font-semibold">Vocab</th>
                <th className="text-left py-2 font-semibold">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {RECIPES.map((r) => (
                <tr
                  key={r.id}
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <td className="py-3 pr-4 align-top whitespace-nowrap">
                    <span
                      className="inline-block rounded-md px-2 py-0.5 text-xs font-mono mr-2"
                      style={{
                        backgroundColor: "var(--color-accent-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {r.id}
                    </span>
                    <span style={{ color: "var(--color-fg)" }}>{r.name}</span>
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-[13px]">
                    {r.token}
                  </td>
                  <td className="py-3 pr-4 align-top font-mono text-[13px]">
                    {r.vocabSize}
                  </td>
                  <td className="py-3 align-top">
                    <p className="mb-2">{r.oneLine}</p>
                    <ul className="list-disc pl-5 space-y-1 text-[13px]">
                      {r.bullets.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="document"
        title="¿Qué cuenta como un documento?"
        lead="El documento es la unidad sobre la que LDA estima theta. Una receta decide implícitamente el tamaño y la coherencia espacial de cada documento."
      >
        <p>
          Para una receta fija, la elección de granularidad documental es la
          segunda decisión más importante. El proyecto materializa cuatro
          alternativas vía <code>build_groupings.py</code>:
        </p>
        <Figure caption="Cuatro granularidades documentales: píxel, parche fijo (5×5 / 7×7 / 15×15), región SLIC, y región Felzenszwalb. La página de Workspace permite elegir entre ellas y ver cómo cambia la estructura tópica resultante.">
          <DocumentGranularitySVG />
        </Figure>
        <p>
          La métrica <Equation tex="\text{ARI}_{\text{off-diag}}" /> entre las ocho
          opciones (4 granularidades × 2 etiquetados) cuantifica la sensibilidad
          de los tópicos a esta elección. En todas las escenas etiquetadas
          observadas el valor es ~0.15: las cuatro granularidades producen
          estructuras tópicas genuinamente distintas, no equivalentes con ruido.
        </p>
      </Section>

      <Section
        id="see-also"
        title="Cómo seguir"
      >
        <p>
          Cada combinación{" "}
          <Equation tex="(\text{escena}, \text{receta}, \text{esquema}, Q)" /> está
          servida en el endpoint{" "}
          <code>/api/wordifications/{`{scene}/{recipe}/{scheme}/{q}`}</code>. El
          Workspace expone esa elección como un selector explícito y muestra el
          ajuste LDA correspondiente sin re-fittear nada en el cliente: todos
          los <Equation tex="\theta" /> y <Equation tex="\phi" /> están precalculados.
        </p>
      </Section>
    </PageShell>
  );
}

function RecipeGridSVG() {
  // 12 recipes × 3 schemes × 3 Q = 108 cells. Render as 12 rows × 9 columns.
  const recipeIds = RECIPES.map((r) => r.id);
  const cols = ["U/8", "U/16", "U/32", "Q/8", "Q/16", "Q/32", "L/8", "L/16", "L/32"];
  const cellW = 32;
  const cellH = 22;
  const x0 = 90;
  const y0 = 28;
  return (
    <svg
      width="430"
      height={y0 + recipeIds.length * cellH + 14}
      viewBox={`0 0 430 ${y0 + recipeIds.length * cellH + 14}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Recipe × scheme × Q grid"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="10"
        fill="currentColor"
      >
        {/* Column headers */}
        {cols.map((c, i) => (
          <text
            key={c}
            x={x0 + i * cellW + cellW / 2}
            y={y0 - 8}
            textAnchor="middle"
            opacity="0.7"
          >
            {c}
          </text>
        ))}
        {/* Recipe rows */}
        {recipeIds.map((rid, ri) => (
          <g key={rid}>
            <text
              x={x0 - 10}
              y={y0 + ri * cellH + cellH * 0.65}
              textAnchor="end"
              fontFamily="ui-monospace, monospace"
              fontSize="10.5"
            >
              {rid} {RECIPES[ri]?.name}
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

function DocumentGranularitySVG() {
  return (
    <svg
      width="640"
      height="220"
      viewBox="0 0 640 220"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Document granularity options"
      style={{ color: "var(--color-fg)" }}
    >
      <g
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="12"
        fill="currentColor"
      >
        {/* Pixel grid */}
        <g transform="translate(20, 30)">
          <text x="60" y="-8" textAnchor="middle" fontWeight="600">
            píxel
          </text>
          {Array.from({ length: 36 }).map((_, i) => {
            const r = Math.floor(i / 6);
            const c = i % 6;
            return (
              <rect
                key={i}
                x={c * 20}
                y={r * 20}
                width={18}
                height={18}
                fill="var(--color-accent)"
                opacity={0.3 + ((r * 7 + c) % 5) * 0.08}
              />
            );
          })}
        </g>

        {/* Patch */}
        <g transform="translate(180, 30)">
          <text x="60" y="-8" textAnchor="middle" fontWeight="600">
            parche fijo (5×5)
          </text>
          {Array.from({ length: 36 }).map((_, i) => {
            const r = Math.floor(i / 6);
            const c = i % 6;
            // Group into 2x2 patches
            const pr = Math.floor(r / 2);
            const pc = Math.floor(c / 2);
            const opacity = 0.25 + ((pr * 3 + pc) % 4) * 0.12;
            return (
              <rect
                key={i}
                x={c * 20}
                y={r * 20}
                width={18}
                height={18}
                fill="var(--color-accent)"
                opacity={opacity}
              />
            );
          })}
        </g>

        {/* SLIC */}
        <g transform="translate(340, 30)">
          <text x="60" y="-8" textAnchor="middle" fontWeight="600">
            SLIC superpíxel
          </text>
          {/* irregular blobs */}
          <path
            d="M 0 30 C 20 0, 60 0, 90 20 C 120 40, 110 80, 80 70 C 50 60, 30 80, 10 60 Z"
            fill="var(--color-accent)"
            opacity="0.45"
          />
          <path
            d="M 90 70 C 120 50, 130 100, 110 120 C 90 140, 60 130, 60 110 C 60 90, 70 80, 90 70 Z"
            fill="var(--color-accent)"
            opacity="0.32"
          />
          <path
            d="M 10 70 C 0 100, 30 130, 60 130 C 50 110, 30 100, 10 70 Z"
            fill="var(--color-accent)"
            opacity="0.55"
          />
          <rect x="0" y="0" width="120" height="120" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        </g>

        {/* Felzenszwalb */}
        <g transform="translate(500, 30)">
          <text x="60" y="-8" textAnchor="middle" fontWeight="600">
            Felzenszwalb
          </text>
          <path d="M 0 0 L 60 0 L 80 30 L 50 60 L 0 50 Z" fill="var(--color-accent)" opacity="0.5" />
          <path d="M 60 0 L 120 0 L 120 50 L 80 30 Z" fill="var(--color-accent)" opacity="0.32" />
          <path d="M 0 50 L 50 60 L 30 110 L 0 90 Z" fill="var(--color-accent)" opacity="0.4" />
          <path d="M 50 60 L 80 30 L 120 50 L 120 120 L 80 120 Z" fill="var(--color-accent)" opacity="0.25" />
          <path d="M 30 110 L 80 120 L 80 120 L 0 120 L 0 90 Z" fill="var(--color-accent)" opacity="0.55" />
          <rect x="0" y="0" width="120" height="120" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        </g>
      </g>
    </svg>
  );
}
