export function Methodology() {
  return (
    <article className="overview-article">
      <h3>The hierarchical inference pipeline (A39 / 2020 Minerals)</h3>
      <p>
        The 2020 Minerals paper introduced a hierarchical pipeline:
        cluster mineral samples first, then train a separate regressor
        per cluster, and predict by combining cluster-conditional
        models. The 2022 A39 paper replaced the clustering stage by an
        LDA topic model. The result on private mineral data was a ~10×
        reduction of mean absolute error on copper recovery (RECCU)
        relative to the naive per-spectrum regressor.
      </p>

      <svg viewBox="0 0 760 240" className="overview-svg" role="img" aria-label="Hierarchical topic-routed inference">
        <defs>
          <marker id="arrM" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
          <rect x={10} y={20} width={150} height={60} rx={6} fill="rgba(180,196,224,0.18)" stroke="currentColor" strokeWidth={1.3} />
          <text x={20} y={42} fontSize={12} fontWeight={600}>New document d</text>
          <text x={20} y={60} fontSize={11}>spectra → tokens</text>
          <text x={20} y={74} fontSize={11}>via recipe R</text>

          <rect x={200} y={20} width={170} height={60} rx={6} fill="rgba(180,196,224,0.18)" stroke="currentColor" strokeWidth={1.3} />
          <text x={210} y={42} fontSize={12} fontWeight={600}>LDA inference</text>
          <text x={210} y={60} fontSize={11}>θ_d ∈ Δ^K</text>
          <text x={210} y={74} fontSize={11}>topic mixture</text>
          <line x1={160} y1={50} x2={196} y2={50} stroke="currentColor" strokeWidth={1.3} markerEnd="url(#arrM)" />

          {[
            { y: 20, label: "f_1 (topic 1 model)" },
            { y: 80, label: "f_2 (topic 2 model)" },
            { y: 140, label: "f_… (further models)" },
            { y: 200, label: "f_K (topic K model)" }
          ].map((m, idx) => (
            <g key={idx}>
              <rect x={410} y={m.y} width={160} height={40} rx={6} fill="rgba(180,196,224,0.18)" stroke="currentColor" strokeWidth={1.3} />
              <text x={420} y={m.y + 24} fontSize={12} fontWeight={600}>{m.label}</text>
              <line x1={370} y1={50 + idx * 8} x2={406} y2={m.y + 20} stroke="currentColor" strokeWidth={1.3} markerEnd="url(#arrM)" />
            </g>
          ))}

          <rect x={610} y={100} width={140} height={60} rx={6} fill="rgba(180,196,224,0.18)" stroke="currentColor" strokeWidth={1.3} />
          <text x={620} y={124} fontSize={12} fontWeight={600}>ŷ = Σ θ_dk f_k(x_d)</text>
          <text x={620} y={142} fontSize={11}>soft topic routing</text>
          {[40, 100, 160, 220].map((y, idx) => (
            <line key={idx} x1={572} y1={y} x2={608} y2={130} stroke="currentColor" strokeWidth={1.3} markerEnd="url(#arrM)" />
          ))}
        </g>
      </svg>

      <h3>Three inference modes</h3>
      <ul>
        <li>
          <strong>Topic-mixture features.</strong> Use θ_d as a
          K-dimensional feature vector for any classifier or regressor.
          The local-core benchmarks compare raw spectra, PCA features,
          and topic mixtures under the same downstream models.
        </li>
        <li>
          <strong>Topic-routed models (hierarchical inference).</strong>
          Each document gets a dominant topic. A separate model is
          trained per dominant topic. Hard routing predicts via the
          dominant model; soft routing returns a weighted combination.
          This is the central A39 contribution.
        </li>
        <li>
          <strong>Topic-library alignment.</strong> Project topic-word
          distributions back to a spectrum-like signal and compare
          against external libraries (USGS, ECOSTRESS, HIDSAG). The
          overlap is a calibrated proximity statement, not material
          identification.
        </li>
      </ul>

      <h3>Validation discipline</h3>
      <p>
        Every visible chart in the public app must declare which of the
        nine validation blocks have been satisfied for its underlying
        data. Each subset card lists block status with concrete metrics
        when available.
      </p>
      <ol className="overview-ordered">
        <li>Corpus integrity</li>
        <li>Topic stability</li>
        <li>Quantisation sensitivity</li>
        <li>Document-definition sensitivity</li>
        <li>Spectral-library alignment</li>
        <li>Spatial coherence and segmentation</li>
        <li>Supervised downstream value</li>
        <li>Preprocessing and bad-band sensitivity</li>
        <li>Cross-scene transfer</li>
      </ol>

      <p className="overview-note">
        Full per-block definitions live on the wiki page{" "}
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Offline-Validation-and-Benchmarks"
          target="_blank"
          rel="noreferrer"
        >
          Offline Validation and Benchmarks
        </a>.
      </p>
    </article>
  );
}
