export function Concept() {
  return (
    <article className="overview-article">
      <h3>The hypothesis in one sentence</h3>
      <p>
        Spectral variability inside a sample, region, or scene is not
        noise — it is the most informative signal about the sample. The
        full distribution of spectra is a richer object than any single
        summary statistic.
      </p>

      <h3>The NLP ↔ HSI analogy</h3>
      <p>
        Once we accept that a spectral object emits many spectra and
        that intensities can be quantised into a finite alphabet, the
        mapping to topic modelling is direct.
      </p>
      <table className="overview-table">
        <thead>
          <tr>
            <th>Natural language</th>
            <th>Hyperspectral</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Letter / character</td><td>Quantised reflectance level</td></tr>
          <tr><td>Vocabulary</td><td>Set of possible quantised tokens</td></tr>
          <tr><td>Word</td><td>One emitted spectral token (band, intensity bin, joint)</td></tr>
          <tr><td>Document</td><td>One sampled object — spectrum, patch, sample, ROI, region, sample cube</td></tr>
          <tr><td>Corpus</td><td>All comparable documents under one recipe</td></tr>
          <tr><td>Topic</td><td>Probability distribution over spectral tokens</td></tr>
          <tr><td>Topic mixture θ</td><td>Probability distribution over topics for one document</td></tr>
          <tr><td>Topic-routed model</td><td>Specialised classifier or regressor per dominant topic</td></tr>
        </tbody>
      </table>

      <h3>The four dataset families</h3>
      <p>
        Every dataset is classified into one of four families before
        any topic chart is shown. The family controls which recipes,
        baselines and inference modes are valid; it also controls what
        claims the public app may show.
      </p>
      <svg viewBox="0 0 760 220" className="overview-svg" role="img" aria-label="Four-family dataset taxonomy">
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
          {[
            { x: 10, code: "Family A", title: "Individual labelled spectra", info: ["e.g. USGS, ECOSTRESS", "doc = one spectrum", "supervision = material label", "recipes V1 V2 V3 V4 V5"] },
            { x: 200, code: "Family B", title: "Labelled HSI / MSI scenes", info: ["e.g. Indian Pines, Salinas, Pavia", "doc = pixel / patch / class region / SLIC", "supervision = pixel labels", "topic vs SLIC vs KMeans"] },
            { x: 390, code: "Family C", title: "Unlabelled HSI / MSI scenes", info: ["e.g. Cuprite, Samson, Urban", "doc = pixel / patch / ROI", "supervision = none", "exploratory + library alignment"] },
            { x: 580, code: "Family D", title: "Regions with measurements", info: ["e.g. HIDSAG (this project)", "doc = sample / patch / region", "supervision = lab measurements", "hierarchical topic-routed regression"] }
          ].map((f, idx) => (
            <g key={idx} transform={`translate(${f.x},20)`}>
              <rect width={170} height={170} rx={8}
                fill="rgba(180,196,224,0.18)"
                stroke="currentColor" strokeWidth={1.4} />
              <text x={10} y={24} fontSize={14} fontWeight={600}>{f.code}</text>
              <text x={10} y={42} fontSize={11.5}>{f.title}</text>
              {f.info.map((line, i) => (
                <text key={i} x={10} y={62 + i * 18} fontSize={11.5}>{line}</text>
              ))}
            </g>
          ))}
        </g>
      </svg>

      <p className="overview-note">
        The same recipe can be applied to multiple families, but the
        claims that can be drawn are family-dependent. Only Family B and
        Family D permit supervised inference. Only Family A and Family
        D permit material or measurement-anchored interpretation.
      </p>
    </article>
  );
}
