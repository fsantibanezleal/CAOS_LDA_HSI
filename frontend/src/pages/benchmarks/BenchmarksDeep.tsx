import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { LABELLED_SCENES } from "./shared";

export function BenchmarksDeep() {
  return (
    <div className="space-y-8">
      <DeepKCurveSection />
      <Cae3dAnchorVsFullSection />
      <BetaVaeCollapseSection />
      <AnomalyComparisonSection />
    </div>
  );
}

function AnomalyComparisonSection() {
  const ldaQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["topic-anomaly", sc],
      queryFn: () => api.topicAnomaly(sc),
      retry: false,
    })),
  });
  const deepQs = useQueries({
    queries: LABELLED_SCENES.map((sc) => ({
      queryKey: ["deep-anomaly", sc],
      queryFn: () => api.deepAnomaly(sc),
      retry: false,
    })),
  });
  const ready =
    ldaQs.every((q) => q.data || q.error) &&
    deepQs.every((q) => q.data || q.error);

  if (!ready) {
    return (
      <Section
        title="B-9 anomaly indicators — LDA vs deep ρ comparison"
        lead="Loading anomaly correlations…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }

  const rows = LABELLED_SCENES.map((sc, i) => {
    const lda = ldaQs[i]!.data;
    const deep = deepQs[i]!.data;
    return {
      scene: sc,
      lda_nll: lda?.anomaly_to_misclassification_correlation?.spearman_rho_nll ?? null,
      lda_softmax: lda?.anomaly_to_misclassification_correlation?.spearman_rho_softmax ?? null,
      cae: deep?.cae_1d_8?.spearman_rho_vs_misclass ?? null,
      bv_rmse: deep?.beta_vae_8?.spearman_rho_rmse_vs_misclass ?? null,
      bv_kl: deep?.beta_vae_8?.spearman_rho_kl_vs_misclass ?? null,
    };
  });

  const renderCell = (v: number | null) => {
    if (v == null) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
    const positive = v > 0;
    return (
      <span style={{ color: positive ? "var(--color-accent)" : "rgba(214,39,40,1)" }}>
        {(v >= 0 ? "+" : "") + v.toFixed(3)}
      </span>
    );
  };

  return (
    <Section
      title="B-9 anomaly indicators — LDA vs deep ρ comparison"
      lead="Spearman ρ between per-document anomaly score and theta-logistic misclassification. Positive ρ (green) = the indicator flags hard examples (works as anomaly); negative (red) = the indicator anti-correlates (deep encoders concentrate capacity on rare informative spectra). LDA's recon NLL works as anomaly; deep methods invert the heuristic."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">LDA recon NLL ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">LDA softmax ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">CAE-1D recon RMSE ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">β-VAE recon RMSE ρ</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">β-VAE KL ρ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{r.scene}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.lda_nll)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.lda_softmax)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.cae)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.bv_rmse)}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{renderCell(r.bv_kl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[12.5px]"
        style={{ color: "var(--color-text-muted)" }}
      >
        Headline: LDA recon NLL is positive ρ on every scene (Pavia U +0.306,
        Salinas-A +0.298, KSC +0.226, IP +0.214) — it works as an anomaly indicator.
        Deep methods produce mostly negative ρ — the "high recon = unfamiliar" heuristic
        does NOT transfer to deep nonlinear encoders. Deep encoders concentrate capacity
        on rare informative spectra, which the latent then discriminates well.
      </p>
    </Section>
  );
}

const CAE_1D_KS = [4, 6, 8, 10, 12, 16, 32];

function DeepKCurveSection() {
  // For each scene × K, fetch the CAE-1D representation and read ARI
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      CAE_1D_KS.map((k) => ({
        queryKey: ["repr", `cae_1d_${k}`, sc],
        queryFn: () => api.representation(`cae_1d_${k}`, sc),
        retry: false,
      })),
    ),
  });

  const ready = queries.every((q) => q.data !== undefined || q.error);

  if (!ready) {
    return (
      <Section
        title="CAE-1D capacity-driven scaling — ARI vs K"
        lead="Per-scene CAE-1D K-curve (K∈{4,6,8,10,12,16,32}). Each line is one labelled scene; each point is the K-means(latent) ARI vs ground-truth label."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading deep K-curve payloads (42 cells)…
        </p>
      </Section>
    );
  }

  const sceneCurves: { scene: string; points: { K: number; ari: number }[] }[] =
    LABELLED_SCENES.map((sc, si) => {
      const points = CAE_1D_KS.map((k, ki) => {
        const idx = si * CAE_1D_KS.length + ki;
        const data = queries[idx]?.data;
        return {
          K: k,
          ari: data?.downstream_kmeans_vs_label?.ari ?? NaN,
        };
      }).filter((p) => Number.isFinite(p.ari));
      return { scene: sc, points };
    });

  const W = 540;
  const H = 240;
  const xMin = 4;
  const xMax = 32;
  const xOf = (k: number) =>
    ((Math.log2(k) - Math.log2(xMin)) / (Math.log2(xMax) - Math.log2(xMin))) *
    W;
  const yOf = (a: number) => H - a * H;
  const colors = [
    "rgba(31,119,180,1)",
    "rgba(255,127,14,1)",
    "rgba(44,160,44,1)",
    "rgba(214,39,40,1)",
    "rgba(148,103,189,1)",
    "rgba(140,86,75,1)",
  ];

  return (
    <Section
      title="CAE-1D capacity-driven scaling — ARI vs K"
      lead="K-means(latent) ARI vs ground-truth label, per scene. Almost-monotonic on every scene (Salinas 0.547 → 0.561, KSC 0.250 → 0.314 from K=4 to K=32). x-axis is log K."
    >
      <svg viewBox={`0 0 ${W + 60} ${H + 40}`} role="img" aria-label="CAE-1D K curve">
        <line x1={40} y1={H} x2={40 + W} y2={H} stroke="currentColor" strokeWidth="1" />
        <line x1={40} y1={0} x2={40} y2={H} stroke="currentColor" strokeWidth="1" />
        {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((y) => (
          <g key={y}>
            <line
              x1={40}
              y1={yOf(y)}
              x2={40 + W}
              y2={yOf(y)}
              stroke="currentColor"
              strokeOpacity="0.15"
              strokeWidth="0.5"
            />
            <text
              x={36}
              y={yOf(y) + 3}
              fontSize="10"
              textAnchor="end"
              fill="currentColor"
              opacity="0.7"
            >
              {y.toFixed(1)}
            </text>
          </g>
        ))}
        {CAE_1D_KS.map((k) => (
          <text
            key={k}
            x={40 + xOf(k)}
            y={H + 15}
            fontSize="10"
            textAnchor="middle"
            fill="currentColor"
            opacity="0.7"
          >
            K={k}
          </text>
        ))}
        {sceneCurves.map((c, i) => {
          const path = c.points
            .map(
              (p, j) =>
                `${j === 0 ? "M" : "L"} ${40 + xOf(p.K)} ${yOf(p.ari)}`,
            )
            .join(" ");
          return (
            <g key={c.scene}>
              <path
                d={path}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="1.5"
              />
              {c.points.map((p) => (
                <circle
                  key={p.K}
                  cx={40 + xOf(p.K)}
                  cy={yOf(p.ari)}
                  r="3"
                  fill={colors[i % colors.length]}
                />
              ))}
              <text
                x={40 + xOf(c.points[c.points.length - 1]!.K) + 5}
                y={yOf(c.points[c.points.length - 1]!.ari) + 4}
                fontSize="9.5"
                fill={colors[i % colors.length]}
                fontFamily="ui-monospace, monospace"
              >
                {c.scene.split("-")[0]}
              </text>
            </g>
          );
        })}
        <text x={40 + W / 2} y={H + 32} fontSize="11" textAnchor="middle" fill="currentColor" opacity="0.7">
          latent dimension K (log scale)
        </text>
        <text
          x={10}
          y={H / 2}
          fontSize="11"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.7"
          transform={`rotate(-90, 10, ${H / 2})`}
        >
          K-means(latent) ARI vs label
        </text>
      </svg>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Capacity-driven scaling: every scene improves with K; no overfitting at K=32. KSC's
        canonical fit (LDA θ-logistic F1=0.021 on B-3) recovers to F1=0.710 at CAE-1D K=32 on
        the linear-probe panel, a 33× gain attributable to deep encoder capacity.
      </p>
    </Section>
  );
}

function Cae3dAnchorVsFullSection() {
  const KS = [4, 8] as const;
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      KS.flatMap((k) => [
        { queryKey: ["repr", `cae_3d_${k}`, sc], queryFn: () => api.representation(`cae_3d_${k}`, sc), retry: false },
        { queryKey: ["repr", `cae_3d_full_${k}`, sc], queryFn: () => api.representation(`cae_3d_full_${k}`, sc), retry: false },
      ]),
    ),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="CAE-3D — anchor decoder vs full-patch decoder (K-curve {4, 8})"
        lead="Loading anchor + full-patch payloads at K∈{4, 8} across 6 labelled scenes…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading…</p>
      </Section>
    );
  }
  type Cell = { full: number; anchor: number; delta: number };
  const grid: { scene: string; cells: Record<number, Cell> }[] = LABELLED_SCENES.map((sc, si) => {
    const cells: Record<number, Cell> = {};
    KS.forEach((k, ki) => {
      const idx = (si * KS.length + ki) * 2;
      const anchor = queries[idx]?.data?.downstream_kmeans_vs_label?.ari ?? NaN;
      const full = queries[idx + 1]?.data?.downstream_kmeans_vs_label?.ari ?? NaN;
      cells[k] = { full, anchor, delta: full - anchor };
    });
    return { scene: sc, cells };
  });
  const meanDelta: Record<number, number> = {};
  KS.forEach((k) => {
    const deltas = grid.map((g) => g.cells[k]!.delta).filter(Number.isFinite);
    meanDelta[k] = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  });
  return (
    <Section
      title="CAE-3D — anchor decoder vs full-patch decoder (K-curve {4, 8})"
      lead="Two decoders share the same 3-D conv encoder. Anchor reconstructs only the centre-pixel spectrum (Linear K→B); full-patch reconstructs the entire P×P patch (Linear K→B·P·P). Cycle 52 ran K=8; cycle 55 added K=4. The decoder target is itself a hyperparameter — direction is broadly stable across capacity, with one inversion (Pavia U)."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ color: "var(--color-text)" }}>
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2 pr-3">scene</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full K=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">anchor K=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">ΔK=4</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">full K=8</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">anchor K=8</th>
              <th className="text-right font-mono text-[12px] pb-2 pr-3">ΔK=8</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((g) => (
              <tr key={g.scene} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td className="py-1.5 pr-3 font-mono">{g.scene}</td>
                {KS.flatMap((k) => {
                  const c = g.cells[k]!;
                  const dColor =
                    c.delta > 0 ? "var(--color-accent)" : c.delta < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)";
                  return [
                    <td key={`f${k}`} className="py-1.5 pr-3 text-right font-mono">
                      {Number.isFinite(c.full) ? c.full.toFixed(3) : "—"}
                    </td>,
                    <td key={`a${k}`} className="py-1.5 pr-3 text-right font-mono">
                      {Number.isFinite(c.anchor) ? c.anchor.toFixed(3) : "—"}
                    </td>,
                    <td key={`d${k}`} className="py-1.5 pr-3 text-right font-mono" style={{ color: dColor, fontWeight: 600 }}>
                      {Number.isFinite(c.delta) ? (c.delta >= 0 ? "+" : "") + c.delta.toFixed(3) : "—"}
                    </td>,
                  ];
                })}
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid var(--color-border)" }}>
              <td className="py-1.5 pr-3 font-mono text-[11px]" style={{ color: "var(--color-text-muted)" }}>net mean ΔARI</td>
              <td className="py-1.5 pr-3" />
              <td className="py-1.5 pr-3" />
              <td
                className="py-1.5 pr-3 text-right font-mono text-[11px]"
                style={{
                  color: meanDelta[4]! > 0 ? "var(--color-accent)" : meanDelta[4]! < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)",
                  fontWeight: 600,
                }}
              >
                {(meanDelta[4]! >= 0 ? "+" : "") + meanDelta[4]!.toFixed(3)}
              </td>
              <td className="py-1.5 pr-3" />
              <td className="py-1.5 pr-3" />
              <td
                className="py-1.5 pr-3 text-right font-mono text-[11px]"
                style={{
                  color: meanDelta[8]! > 0 ? "var(--color-accent)" : meanDelta[8]! < 0 ? "rgba(214,39,40,1)" : "var(--color-text-muted)",
                  fontWeight: 600,
                }}
              >
                {(meanDelta[8]! >= 0 ? "+" : "") + meanDelta[8]!.toFixed(3)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Honest read: net mean ΔARI is essentially neutral at both K (+0.011 K=4, +0.003 K=8). Direction matches across K on
        5/6 scenes — IP and Botswana persistently benefit; Salinas family persistently harmed (magnitude grows with K). Pavia U
        is the single capacity-dependent inversion: full-patch helps at K=4 (+0.026), hurts at K=8 (-0.023). The decoder target
        is itself a hyperparameter worth surfacing per scene, not a default to flip globally.
      </p>
    </Section>
  );
}

const BETA_VAE_BS = [
  { suffix: "beta_vae_b1_8", label: "β=1" },
  { suffix: "beta_vae_b2_8", label: "β=2" },
  { suffix: "beta_vae_8", label: "β=4" },
  { suffix: "beta_vae_b8_8", label: "β=8" },
  { suffix: "beta_vae_b16_8", label: "β=16" },
];

function BetaVaeCollapseSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.flatMap((sc) =>
      BETA_VAE_BS.map((b) => ({
        queryKey: ["repr", b.suffix, sc],
        queryFn: () => api.representation(b.suffix, sc),
        retry: false,
      })),
    ),
  });
  const ready = queries.every((q) => q.data !== undefined || q.error);
  if (!ready) {
    return (
      <Section
        title="β-VAE β-sweep — disentanglement vs posterior collapse"
        lead="Loading β-sweep payloads…"
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }

  const grid: { scene: string; row: { label: string; ari: number }[] }[] =
    LABELLED_SCENES.map((sc, si) => ({
      scene: sc,
      row: BETA_VAE_BS.map((b, bi) => {
        const idx = si * BETA_VAE_BS.length + bi;
        const data = queries[idx]?.data;
        return {
          label: b.label,
          ari: data?.downstream_kmeans_vs_label?.ari ?? NaN,
        };
      }),
    }));

  const cell = 56;
  const headerH = 28;
  const rowH = 28;

  return (
    <Section
      title="β-VAE β-sweep — disentanglement vs posterior collapse"
      lead="K-means(latent) ARI per scene at K=8 across β∈{1, 2, 4, 8, 16}. Bright = high ARI; black cells = posterior collapse (β-VAE encoder converges to q(z|x)≈p(z), latent is uninformative)."
    >
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${BETA_VAE_BS.length * cell + 200} ${LABELLED_SCENES.length * rowH + headerH + 30}`}
          role="img"
          aria-label="β-VAE β-sweep ARI grid"
          style={{ maxWidth: "640px" }}
        >
          {BETA_VAE_BS.map((b, j) => (
            <text
              key={b.label}
              x={195 + j * cell + cell / 2}
              y={20}
              fontSize="11"
              textAnchor="middle"
              fill="currentColor"
              fontFamily="ui-monospace, monospace"
            >
              {b.label}
            </text>
          ))}
          {grid.map((g, i) => (
            <g key={g.scene}>
              <text
                x={188}
                y={headerH + i * rowH + rowH / 2 + 4}
                fontSize="11"
                textAnchor="end"
                fill="currentColor"
                fontFamily="ui-monospace, monospace"
              >
                {g.scene}
              </text>
              {g.row.map((c, j) => {
                const ari = Number.isFinite(c.ari) ? c.ari : 0;
                const collapsed = ari < 0.05;
                const t = Math.max(0, Math.min(1, ari));
                const r = collapsed ? 30 : Math.round(50 + (1 - t) * 200);
                const gC = collapsed ? 30 : Math.round(50 + t * 130);
                const bC = collapsed ? 30 : Math.round(80 + t * 100);
                return (
                  <g key={c.label}>
                    <title>{`${g.scene} · ${c.label} · ARI=${ari.toFixed(3)}`}</title>
                    <rect
                      x={195 + j * cell}
                      y={headerH + i * rowH}
                      width={cell - 2}
                      height={rowH - 2}
                      fill={`rgb(${r},${gC},${bC})`}
                    />
                    <text
                      x={195 + j * cell + (cell - 2) / 2}
                      y={headerH + i * rowH + rowH / 2 + 3}
                      fontSize="10"
                      textAnchor="middle"
                      fill={t > 0.4 || collapsed ? "white" : "currentColor"}
                      fontFamily="ui-monospace, monospace"
                    >
                      {Number.isFinite(c.ari) ? c.ari.toFixed(2) : "—"}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
      </div>
      <p className="mt-3 text-[12px]" style={{ color: "var(--color-text-muted)" }}>
        Salinas posterior collapse at β≥8 (ARI=0.000 — KL term overwhelms the reconstruction
        signal; encoder maps every input to N(0, I)). Salinas-A resists collapse and even gains
        with β (compact 6-class signal dominates the regulariser). Pavia U degrades monotonically
        with β. The β=4 default sits at the inflection point.
      </p>
    </Section>
  );
}
