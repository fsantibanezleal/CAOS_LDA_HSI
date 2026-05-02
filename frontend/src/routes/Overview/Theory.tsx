export function Theory() {
  return (
    <article className="overview-article">
      <h3>Latent Dirichlet Allocation — generative model</h3>
      <p>
        LDA (Blei, Ng, Jordan 2003) is the simplest probabilistic topic
        model and the baseline this project uses. The plate notation:
      </p>

      <svg viewBox="0 0 760 220" className="overview-svg" role="img" aria-label="LDA plate notation">
        <defs>
          <marker id="arrTheory" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>
        <g fontFamily="ui-serif, Georgia, serif" fontStyle="italic" fontSize="18" fill="currentColor">
          <circle cx={60} cy={110} r={22} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={60} y={115} textAnchor="middle">α</text>
          <circle cx={170} cy={110} r={24} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={170} y={115} textAnchor="middle">θ_d</text>
          <circle cx={320} cy={110} r={22} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={320} y={115} textAnchor="middle">z_dn</text>
          <circle cx={450} cy={110} r={22} fill="rgba(180,196,224,0.45)" stroke="currentColor" strokeWidth={1.6} />
          <text x={450} y={115} textAnchor="middle">w_dn</text>
          <circle cx={600} cy={110} r={22} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={600} y={115} textAnchor="middle">φ_k</text>
          <circle cx={700} cy={110} r={22} fill="none" stroke="currentColor" strokeWidth={1.6} />
          <text x={700} y={115} textAnchor="middle">β</text>
        </g>
        <g stroke="currentColor" strokeWidth={1.4} fill="none" markerEnd="url(#arrTheory)">
          <line x1={84} y1={110} x2={146} y2={110} />
          <line x1={194} y1={110} x2={296} y2={110} />
          <line x1={344} y1={110} x2={426} y2={110} />
          <line x1={676} y1={110} x2={478} y2={110} />
          <line x1={700} y1={88} x2={600} y2={88} />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth={1.2} strokeDasharray="4 4">
          <rect x={278} y={60} width={200} height={120} rx={8} />
          <rect x={138} y={40} width={350} height={160} rx={10} />
          <rect x={568} y={60} width={64} height={120} rx={8} />
        </g>
        <g fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize={13} fill="currentColor">
          <text x={468} y={170} textAnchor="end">N (words in d)</text>
          <text x={478} y={194} textAnchor="end">D (documents)</text>
          <text x={600} y={194} textAnchor="middle">K (topics)</text>
        </g>
      </svg>

      <h3>Generative process</h3>
      <ol className="overview-ordered">
        <li>For each topic k, draw a word distribution
          φ<sub>k</sub> ~ Dirichlet(β).
        </li>
        <li>For each document d:
          <ul>
            <li>Draw θ<sub>d</sub> ~ Dirichlet(α).</li>
            <li>For each token n: draw z<sub>d,n</sub> ~ Categorical(θ<sub>d</sub>) and w<sub>d,n</sub> ~ Categorical(φ<sub>z<sub>d,n</sub></sub>).</li>
          </ul>
        </li>
      </ol>

      <h3>Joint distribution</h3>
      <pre className="overview-formula">
        p(w, z, θ, φ | α, β) = ∏_k p(φ_k | β) · ∏_d p(θ_d | α) · ∏_n p(z_dn | θ_d) · p(w_dn | φ_zdn)
      </pre>

      <h3>What the hyperparameters control</h3>
      <ul>
        <li>
          <strong>α</strong> (prior on θ). α &lt; 1 produces sparse
          topic mixtures (each document dominated by a few topics).
          α &gt; 1 produces nearly uniform mixtures.
        </li>
        <li>
          <strong>β</strong> (prior on φ). Small β concentrates
          topics on a few words. Sparse topics are preferred for
          spectral data because each "regime" should select a few
          characteristic bands or intensity levels.
        </li>
        <li>
          <strong>K</strong> (number of topics). Selected by
          coherence-score sweeps in the A39 paper; the public app
          registers per-dataset choices.
        </li>
      </ul>

      <h3>Inference engines</h3>
      <p>
        The project uses two engines: collapsed Gibbs sampling
        (Heinrich 2005, the engine of <code>gensim.LdaModel</code>) and
        online variational Bayes (Hoffman, Blei, Bach 2010, the engine
        of <code>scikit-learn.LatentDirichletAllocation</code>). Both
        converge to the same posterior in the limit; the topic-stability
        validation block compares them across seeds.
      </p>

      <p className="overview-note">
        The deeper math — Dirichlet behaviour, ELBO, Hungarian matching
        for stability, hierarchical inference, PM-LDA, HDP-LDA — is in
        the wiki page{" "}
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki/Mathematical-Background"
          target="_blank"
          rel="noreferrer"
        >
          Mathematical Background
        </a>.
      </p>
    </article>
  );
}
