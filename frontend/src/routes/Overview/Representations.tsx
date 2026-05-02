interface RecipeRow {
  id: string;
  word: string;
  document: string;
  vocab: string;
  preserves_wavelength: string;
  preserves_shape: string;
  notes: string;
  status: string;
}

const RECIPES: RecipeRow[] = [
  {
    id: "V1",
    word: "wavelength index w ∈ {1,…,L}",
    document: "[ ΣI(w₁), …, ΣI(w_L) ]",
    vocab: "L",
    preserves_wavelength: "yes",
    preserves_shape: "aggregated across spectra",
    notes: "Best A39 result on RECCU; interpretable; topics readable as wavelength regimes.",
    status: "active"
  },
  {
    id: "V2",
    word: "intensity bin i ∈ {0,…,Q-1}",
    document: "[ ΣW(i₀), …, ΣW(i_{Q-1}) ]",
    vocab: "Q",
    preserves_wavelength: "no",
    preserves_shape: "histogram only",
    notes: "Worst of the three on DB1; useful as a control recipe for sensitivity studies.",
    status: "active"
  },
  {
    id: "V3",
    word: "wavelength index w ∈ {1,…,L}",
    document: "concat( I₁(w₁), …, I_P(w_L) )",
    vocab: "L",
    preserves_wavelength: "yes",
    preserves_shape: "per-spectrum",
    notes: "Tied with V1 on DB1; preserves both wavelength and per-spectrum variability.",
    status: "active"
  },
  {
    id: "V4",
    word: "joint band×intensity (e.g. b042_q07)",
    document: "bag of joint tokens",
    vocab: "L · Q",
    preserves_wavelength: "yes",
    preserves_shape: "per-spectrum",
    notes: "Most direct classical LDA encoding; vocabulary growth is the main risk.",
    status: "prototype"
  },
  {
    id: "V5",
    word: "(absorption_center, depth, width)",
    document: "bag of triplets after continuum removal",
    vocab: "calibration-driven",
    preserves_wavelength: "centered absorptions",
    preserves_shape: "feature-level",
    notes: "Necessary for serious mineral / clay interpretation; needs calibrated bad-band masks.",
    status: "planned"
  },
  {
    id: "V6",
    word: "slope / curvature tokens",
    document: "bag of shape signatures",
    vocab: "moderate",
    preserves_wavelength: "regional",
    preserves_shape: "yes",
    notes: "Vegetation red-edge, soil moisture, agricultural MSI workflows.",
    status: "planned"
  },
  {
    id: "V7",
    word: "patch-aggregated wordification (V1 / V3 / V4 inside a patch)",
    document: "patch / SLIC superpixel / class region / sample",
    vocab: "inherits inner recipe",
    preserves_wavelength: "inherits",
    preserves_shape: "inherits",
    notes: "Implemented for HIDSAG region documents and SLIC superpixels on UPV/EHU.",
    status: "active"
  },
  {
    id: "V8",
    word: "hierarchical wordification",
    document: "sample → region → spectrum",
    vocab: "inherits",
    preserves_wavelength: "inherits",
    preserves_shape: "inherits",
    notes: "Research-only; tracked as the Family D extension.",
    status: "research"
  }
];

export function Representations() {
  return (
    <article className="overview-article">
      <h3>The three A39 recipes (V1, V2, V3)</h3>
      <p>
        The 2022 A39 paper proposes three concrete corpus recipes. They
        translate a hyperspectral group of P spectra and L bands
        quantised to Q levels into LDA-ready documents. The notebook in{" "}
        <code>legacy/notebooks/</code> implements all three.
      </p>

      <svg viewBox="0 0 760 280" className="overview-svg" role="img" aria-label="Three A39 recipes side by side">
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
          <g transform="translate(10,10)">
            <rect x={0} y={0} width={240} height={22} fill="rgba(180,196,224,0.30)" stroke="currentColor" strokeWidth={1.2} />
            <text x={120} y={16} textAnchor="middle" fontSize={13} fontWeight={600}>V1 — wavelength-as-word</text>
            <rect x={0} y={22} width={240} height={240} fill="rgba(180,196,224,0.10)" stroke="currentColor" strokeWidth={1.2} />
            <text x={10} y={42} fontSize={11}>word: wavelength index w ∈ {"{1..L}"}</text>
            <text x={10} y={58} fontSize={11}>document: [ ΣI(w₁), …, ΣI(w_L) ]</text>
            <text x={10} y={74} fontSize={11}>document length: L</text>
            <text x={10} y={90} fontSize={11}>vocabulary: L</text>
            <text x={10} y={106} fontSize={11}>preserves wavelength: yes</text>
            <text x={10} y={122} fontSize={11}>preserves shape: aggregated</text>
            <g transform="translate(20,150)">
              {[60, 40, 48, 20, 34, 56, 68, 44, 28, 52, 64, 46].map((h, i) => (
                <rect key={i} x={6 + i * 18} y={80 - h} width={6} height={h} fill="currentColor" opacity={0.7} />
              ))}
              <text x={100} y={106} textAnchor="middle" fontSize={11}>d : sum across P spectra</text>
            </g>
          </g>
          <g transform="translate(260,10)">
            <rect x={0} y={0} width={240} height={22} fill="rgba(180,196,224,0.30)" stroke="currentColor" strokeWidth={1.2} />
            <text x={120} y={16} textAnchor="middle" fontSize={13} fontWeight={600}>V2 — intensity-as-word</text>
            <rect x={0} y={22} width={240} height={240} fill="rgba(180,196,224,0.10)" stroke="currentColor" strokeWidth={1.2} />
            <text x={10} y={42} fontSize={11}>word: bin i ∈ {"{0..Q-1}"}</text>
            <text x={10} y={58} fontSize={11}>document: [ ΣW(i₀), …, ΣW(i_Q-1) ]</text>
            <text x={10} y={74} fontSize={11}>document length: Q</text>
            <text x={10} y={90} fontSize={11}>vocabulary: Q</text>
            <text x={10} y={106} fontSize={11}>preserves wavelength: no</text>
            <text x={10} y={122} fontSize={11}>preserves shape: histogram only</text>
            <g transform="translate(20,150)">
              {[4, 16, 34, 58, 74, 66, 48, 30, 18, 10, 6, 2].map((h, i) => (
                <rect key={i} x={6 + i * 16} y={80 - h} width={14} height={h} fill="currentColor" opacity={0.7} />
              ))}
              <text x={100} y={106} textAnchor="middle" fontSize={11}>d : histogram of P×L cells</text>
            </g>
          </g>
          <g transform="translate(510,10)">
            <rect x={0} y={0} width={240} height={22} fill="rgba(180,196,224,0.30)" stroke="currentColor" strokeWidth={1.2} />
            <text x={120} y={16} textAnchor="middle" fontSize={13} fontWeight={600}>V3 — concatenated spectra</text>
            <rect x={0} y={22} width={240} height={240} fill="rgba(180,196,224,0.10)" stroke="currentColor" strokeWidth={1.2} />
            <text x={10} y={42} fontSize={11}>word: wavelength index w ∈ {"{1..L}"}</text>
            <text x={10} y={58} fontSize={11}>document: concat I_1..I_P</text>
            <text x={10} y={74} fontSize={11}>document length: P · L</text>
            <text x={10} y={90} fontSize={11}>vocabulary: L</text>
            <text x={10} y={106} fontSize={11}>preserves wavelength: yes</text>
            <text x={10} y={122} fontSize={11}>preserves shape: per-spectrum</text>
            <g transform="translate(20,150)" stroke="currentColor" fill="none" strokeWidth={1}>
              {[14, 34, 54, 74].map((y, idx) => (
                <path
                  key={idx}
                  d={`M 0 ${y} L 12 ${y - 4} L 24 ${y + 2} L 36 ${y - 4} L 48 ${y + 4} L 60 ${y} L 72 ${y - 2} L 84 ${y + 4} L 96 ${y} L 108 ${y - 4} L 120 ${y} L 132 ${y - 2} L 144 ${y + 4} L 156 ${y - 2} L 168 ${y} L 180 ${y - 4} L 192 ${y + 4} L 200 ${y - 2}`}
                />
              ))}
              <text x={100} y={106} textAnchor="middle" fontSize={11} stroke="none" fill="currentColor">d : keeps per-spectrum order</text>
            </g>
          </g>
        </g>
      </svg>

      <h3>Recipe registry</h3>
      <p>
        V1, V2, V3 are the historical baseline. V4 onward are tracked
        as research extensions. The registry below mirrors{" "}
        <code>data/manifests/corpus_recipes.json</code> conceptually.
      </p>
      <table className="overview-table">
        <thead>
          <tr>
            <th>Recipe</th>
            <th>Word</th>
            <th>Document</th>
            <th>Vocab</th>
            <th>Wavelength</th>
            <th>Shape</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {RECIPES.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.id}</strong></td>
              <td>{r.word}</td>
              <td><code>{r.document}</code></td>
              <td>{r.vocab}</td>
              <td>{r.preserves_wavelength}</td>
              <td>{r.preserves_shape}</td>
              <td>
                <span className={`overview-status overview-status-${r.status}`}>{r.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="overview-note">
        The deeper recipe specification, including normalisation,
        quantisation, and document granularity choices, is in the wiki
        page{" "}
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Corpus-Construction-and-Spectral-Wordification"
          target="_blank"
          rel="noreferrer"
        >
          Corpus Construction and Spectral Wordification
        </a>.
      </p>
    </article>
  );
}
