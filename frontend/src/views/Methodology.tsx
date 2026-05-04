const T = {
  es: {
    title: "Metodología",
    lead: "El plan maestro y el Addendum B definen el contrato. Aquí queda el resumen ejecutable.",
    pillars: "Tres pilares",
    p1Title: "Construcción de documentos",
    p1: "Un documento es una unidad espacial: píxel, parche, segmento Felzenszwalb / SLIC, región de cubo HIDSAG. La elección cambia la varianza interna y la coherencia espacial de los tópicos.",
    p2Title: "Discretización (wordification)",
    p2: "12 recetas implementadas (V1..V12 master plan §7): banda-frecuencia, magnitude-phrase, banda-bin, derivada 1ª/2ª, wavelet, triplet de absorción, fracción endmembers, region-token SAM, band-group VNIR/SWIR, codebook-VQ (PQ), GMM-token. Cada una × {uniform, quantile, lloyd_max} × Q ∈ {8, 16, 32}.",
    p3Title: "Modelo de tópicos",
    p3: "8 variantes implementadas: sklearn online/sparse, NMF, gensim VB/multicore, tomotopy LDA/HDP/CTM, Pyro ProdLDA. Plus DMR-LDA (Mimno-McCallum 2008) en HIDSAG con covariables de medición.",
    addendum: "Addendum B — Marco de evaluación multi-eje",
    addLead: "Un modelo de tópicos no se valida con un solo número. Se valida en ocho ejes complementarios:",
    axes: [
      ["A — Coherencia interna", "C_v / C_NPMI / C_UMass · Topic diversity · Hungarian-matched cosine entre seeds"],
      ["B — Alineación externa", "USGS splib07 v7 (2450 espectros) · Felzenszwalb-region SAM · Moran's I + Geary's C continuos · BDE full-pixel"],
      ["C — Batería downstream", "Linear probe panel B-1 · Topic-routed soft B-3 · Embedded concat B-5 · Bayesian posterior labelled"],
      ["D — Information-theoretic", "MI(θ; label) y MI(otras compresiones K-dim; label) vía mutual_info_classif y mutual_info_regression"],
      ["E — Transferencia", "Cross-scene B-8: fit-on-A-infer-on-B sobre grilla AVIRIS-1997 común"],
      ["F — Interpretabilidad", "Topic / band / document cards con narrativas auto-generadas"],
      ["G — Reconstrucción", "Rate-distortion B-2: K → RMSE para LDA, NMF, PCA · NFINDR + NNLS B-11"],
      ["H — Robustez", "Topic stability B-6 (Hungarian 7 seeds) · Quantization-sensitivity (3 schemes × 3 Q) · LDA sweep K × seed grid"],
    ],
    finding: "El hallazgo metodológico clave",
    findingBody: "La pregunta correcta no es \"¿gana θ a los píxeles crudos?\" — la respuesta es \"no, una compresión 6/200 pierde por construcción\". La pregunta correcta es \"¿es el espacio de tópicos una representación intermedia útil?\" — y la respuesta exige una batería de ocho ejes contra otras compresiones K-dim (PCA-K, NMF-K, ICA-K, AE-K, codebook-VQ, NFINDR endmembers), no contra el espectro crudo.",
    refs: "Referencias clave",
  },
  en: {
    title: "Methodology",
    lead: "The master plan and Addendum B set the contract. Here is the executable summary.",
    pillars: "Three pillars",
    p1Title: "Document construction",
    p1: "A document is a spatial unit: pixel, patch, Felzenszwalb / SLIC segment, HIDSAG cube region. The choice changes within-document variance and the spatial coherence of topics.",
    p2Title: "Discretisation (wordification)",
    p2: "12 recipes implemented (V1..V12 master plan §7): band-frequency, magnitude-phrase, band-bin, 1st/2nd derivative, wavelet, absorption triplet, endmember fraction, region-token SAM, band-group VNIR/SWIR, codebook-VQ (PQ), GMM-token. Each × {uniform, quantile, lloyd_max} × Q ∈ {8, 16, 32}.",
    p3Title: "Topic model",
    p3: "8 variants implemented: sklearn online/sparse, NMF, gensim VB/multicore, tomotopy LDA/HDP/CTM, Pyro ProdLDA. Plus DMR-LDA (Mimno-McCallum 2008) on HIDSAG with measurement-tag covariates.",
    addendum: "Addendum B — Multi-axis evaluation framework",
    addLead: "A topic model is never validated by a single number. It is validated on eight complementary axes:",
    axes: [
      ["A — Internal coherence", "C_v / C_NPMI / C_UMass · Topic diversity · Hungarian-matched cosine across seeds"],
      ["B — External alignment", "USGS splib07 v7 (2450 spectra) · Felzenszwalb-region SAM · continuous Moran's I + Geary's C · full-pixel BDE"],
      ["C — Downstream battery", "Linear probe panel B-1 · Topic-routed soft B-3 · Embedded concat B-5 · Bayesian posterior labelled"],
      ["D — Information-theoretic", "MI(θ; label) and MI(other K-dim compressions; label) via mutual_info_classif and mutual_info_regression"],
      ["E — Transfer", "Cross-scene B-8: fit-on-A-infer-on-B over the common AVIRIS-1997 grid"],
      ["F — Interpretability", "Topic / band / document cards with auto-generated narratives"],
      ["G — Reconstruction", "Rate-distortion B-2: K → RMSE for LDA, NMF, PCA · NFINDR + NNLS B-11"],
      ["H — Robustness", "Topic stability B-6 (Hungarian 7 seeds) · Quantization sensitivity (3 schemes × 3 Q) · LDA sweep K × seed grid"],
    ],
    finding: "The key methodological finding",
    findingBody: "The right question isn't \"does θ beat the raw spectrum?\" — the answer is \"no, a 6/200 compression loses by construction\". The right question is \"is the topic space a useful intermediate representation?\" — and that demands an eight-axis battery against other K-dim compressions (PCA-K, NMF-K, ICA-K, AE-K, codebook-VQ, NFINDR endmembers), not against the raw spectrum.",
    refs: "Key references",
  },
};

const REFS = [
  ["Blei, Ng, Jordan", "Latent Dirichlet Allocation", "JMLR 2003"],
  ["Sievert & Shirley", "LDAvis: a method for visualizing and interpreting topics", "ILLVI 2014"],
  ["Röder, Both, Hinneburg", "Exploring the space of topic coherence measures", "WSDM 2015"],
  ["Greene, O'Callaghan, Cunningham", "How many topics? Stability analysis for topic models", "ECML 2014"],
  ["Mimno & McCallum", "Topic models conditioned on arbitrary features with DMR", "UAI 2008"],
  ["Srivastava & Sutton", "Autoencoding Variational Inference for Topic Models", "ICLR 2017 (ProdLDA)"],
  ["Alain & Bengio", "Understanding intermediate layers using linear classifier probes", "arXiv 1610.01644"],
  ["Wahabzada et al.", "Plant phenotyping using probabilistic topic models", "Sci. Reports 2016"],
  ["Borsoi et al.", "Probabilistic generative model for HSI unmixing", "IEEE TGRS 2022"],
  ["HIDSAG", "Hyperspectral Iron-Drillcore Sample Augmented Geometallurgy", "Sci. Data 2023"],
  ["Santibáñez-Leal et al.", "Geometallurgical estimation via HSI + topic modelling", "Procemin Geomet 2022"],
  ["USGS Spectral Library v7", "Kokaly et al.", "USGS DS-1035 2017"],
];

export function Methodology({ lang }: { lang: "en" | "es" }) {
  const t = T[lang];
  return (
    <div>
      <h1 style={{ fontSize: 24, marginTop: 8 }}>{t.title}</h1>
      <p className="lead" style={{ maxWidth: 760 }}>{t.lead}</p>

      <h2 style={{ fontSize: 17, marginTop: 24 }}>{t.pillars}</h2>
      <div className="col-3">
        <div className="card">
          <h3>{t.p1Title}</h3>
          <p>{t.p1}</p>
        </div>
        <div className="card">
          <h3>{t.p2Title}</h3>
          <p>{t.p2}</p>
        </div>
        <div className="card">
          <h3>{t.p3Title}</h3>
          <p>{t.p3}</p>
        </div>
      </div>

      <h2 style={{ fontSize: 17, marginTop: 32 }}>{t.addendum}</h2>
      <p className="lead" style={{ maxWidth: 760 }}>{t.addLead}</p>
      <ul className="list-clean card" style={{ padding: 0 }}>
        {t.axes.map(([a, b]) => (
          <li key={a}>
            <strong>{a}</strong> — <span style={{ color: "var(--text-secondary)" }}>{b}</span>
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 17, marginTop: 32 }}>{t.finding}</h2>
      <p className="card" style={{ maxWidth: 880 }}>{t.findingBody}</p>

      <h2 style={{ fontSize: 17, marginTop: 32 }}>{t.refs}</h2>
      <ul className="list-clean card" style={{ padding: 0 }}>
        {REFS.map(([a, ti, src]) => (
          <li key={ti}>
            <strong>{a}</strong> · {ti} · <span style={{ color: "var(--text-tertiary)" }}>{src}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
