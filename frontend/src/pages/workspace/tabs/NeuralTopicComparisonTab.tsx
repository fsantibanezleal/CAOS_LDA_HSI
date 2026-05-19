/**
 * Neural topic-model comparison tab (extracted from Workspace.tsx in
 * c290 as part of #441 P1 2.1).
 *
 * Four stacked cards on head-to-head LDA vs ProdLDA vs ETM:
 *   1. NeuralHeaderCard — context: corpus size, classes, K, framework axis.
 *   2. NeuralComparisonGrid — per-method ARI/NMI/silhouette + coherence
 *      + θ-entropy in 3 cards.
 *   3. NeuralRankingBar — sorted ARI ranking with normalised bars.
 *   4. NeuralSeedStabilityCard — N-seed ARI mean±std table per method.
 *
 * NEURAL_METHOD_COLOR is module-local — only the cards in this file
 * use it.
 */
import type {
  NeuralTopicComparison,
  NeuralTopicSeedStability,
} from "@/api/client";

const NEURAL_METHOD_COLOR: Record<string, string> = {
  lda: "rgba(40, 160, 80, 1)",
  prodlda: "rgba(34, 197, 94, 1)",
  etm: "rgba(170, 60, 200, 1)",
};

export function NeuralTopicComparisonTab({
  isLoading,
  error,
  comparison,
  seedStability,
}: {
  isLoading: boolean;
  error: Error | null;
  comparison: NeuralTopicComparison | null;
  seedStability: NeuralTopicSeedStability | null;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading neural topic comparison…
      </p>
    );
  if (error) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load neural topic comparison.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  }
  if (!comparison) return null;

  return (
    <div className="space-y-6">
      <NeuralHeaderCard comparison={comparison} />
      <NeuralComparisonGrid comparison={comparison} />
      <NeuralRankingBar comparison={comparison} />
      {seedStability ? (
        <NeuralSeedStabilityCard seedStability={seedStability} />
      ) : null}
    </div>
  );
}

function NeuralHeaderCard({
  comparison,
}: {
  comparison: NeuralTopicComparison;
}) {
  return (
    <div
      className="rounded-xl border p-5 relative overflow-hidden"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background:
            "linear-gradient(90deg, rgba(40,160,80,1) 0%, rgba(34,197,94,1) 50%, rgba(170,60,200,1) 100%)",
        }}
      />
      <h3
        className="text-lg font-semibold tracking-tight mt-1 mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        Head-to-head · LDA vs ProdLDA vs ETM
      </h3>
      <p
        className="text-[12.5px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Three topic models on the same canonical band-frequency corpus (
        {comparison.n_documents.toLocaleString()} documents ·{" "}
        {comparison.n_classes} classes · K ={" "}
        {Object.values(comparison.methods)[0]?.K ?? "?"}). Compares
        clustering quality (KMeans-vs-label ARI/NMI/silhouette), document
        θ entropy, and topic coherence (c_v, c_npmi, u_mass).
      </p>
      {comparison.framework_axis ? (
        <p
          className="text-[11.5px] italic"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {comparison.framework_axis}
        </p>
      ) : null}
    </div>
  );
}

function NeuralComparisonGrid({
  comparison,
}: {
  comparison: NeuralTopicComparison;
}) {
  const methods = Object.entries(comparison.methods);
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      {methods.map(([name, m]) => {
        const colour = NEURAL_METHOD_COLOR[name] ?? "var(--color-accent)";
        return (
          <div
            key={name}
            className="rounded-lg border p-4 relative overflow-hidden"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              aria-hidden
              className="absolute top-0 left-0 right-0 h-0.5"
              style={{ backgroundColor: colour }}
            />
            <div className="flex items-baseline gap-2 mt-1 mb-3">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: colour }}
              />
              <h4
                className="text-base font-semibold font-mono tracking-tight"
                style={{ color: "var(--color-fg)" }}
              >
                {name}
              </h4>
              <span
                className="text-[11px] font-mono ml-auto"
                style={{ color: "var(--color-fg-faint)" }}
              >
                K={m.K}
              </span>
            </div>
            {m.error ? (
              <p
                className="text-[12px]"
                style={{ color: "var(--color-warn)" }}
              >
                {m.error}
              </p>
            ) : (
              <div className="space-y-2.5">
                <div>
                  <div
                    className="text-[10.5px] uppercase tracking-widest font-semibold mb-0.5"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    KMeans vs label
                  </div>
                  <div
                    className="flex items-baseline gap-3 text-[12.5px] font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    <span>
                      ARI{" "}
                      <strong>
                        {m.downstream_kmeans_vs_label.ari.toFixed(3)}
                      </strong>
                    </span>
                    <span style={{ color: "var(--color-fg-faint)" }}>·</span>
                    <span>
                      NMI {m.downstream_kmeans_vs_label.nmi.toFixed(3)}
                    </span>
                    <span style={{ color: "var(--color-fg-faint)" }}>·</span>
                    <span>
                      sil{" "}
                      {m.downstream_kmeans_vs_label.silhouette.toFixed(3)}
                    </span>
                  </div>
                </div>
                {m.coherence ? (
                  <div>
                    <div
                      className="text-[10.5px] uppercase tracking-widest font-semibold mb-0.5"
                      style={{ color: "var(--color-fg-faint)" }}
                    >
                      Topic coherence (top-{m.coherence.top_n})
                    </div>
                    <div
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12.5px] font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {m.coherence.c_v != null ? (
                        <span>
                          c_v <strong>{m.coherence.c_v.toFixed(3)}</strong>
                        </span>
                      ) : null}
                      {m.coherence.c_npmi != null ? (
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          c_npmi {m.coherence.c_npmi.toFixed(3)}
                        </span>
                      ) : null}
                      {m.coherence.u_mass != null ? (
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          u_mass {m.coherence.u_mass.toFixed(3)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div>
                  <div
                    className="text-[10.5px] uppercase tracking-widest font-semibold mb-0.5"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    Document θ entropy
                  </div>
                  <div
                    className="flex items-baseline gap-3 text-[12.5px] font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    <span>
                      mean {m.theta_entropy.doc_entropy_mean.toFixed(3)}
                    </span>
                    <span style={{ color: "var(--color-fg-faint)" }}>
                      ±{m.theta_entropy.doc_entropy_std.toFixed(3)}
                    </span>
                    <span
                      style={{ color: "var(--color-fg-faint)" }}
                      title={`relative to log(K)=${m.theta_entropy.max_entropy_uniform.toFixed(3)}`}
                    >
                      norm{" "}
                      {(
                        m.theta_entropy.doc_entropy_normalised_mean * 100
                      ).toFixed(1)}
                      %
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NeuralRankingBar({
  comparison,
}: {
  comparison: NeuralTopicComparison;
}) {
  const ranking = comparison.ranking_by_ari ?? [];
  const max = ranking[0]?.ari ?? 1;
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4
        className="text-base font-semibold mb-2"
        style={{ color: "var(--color-fg)" }}
      >
        ARI ranking on this scene
      </h4>
      <table
        className="w-full text-[12.5px]"
        style={{ color: "var(--color-fg)" }}
      >
        <thead>
          <tr style={{ color: "var(--color-fg-faint)" }}>
            <th className="text-left font-mono text-[11px] pb-1 pr-3">
              rank
            </th>
            <th className="text-left font-mono text-[11px] pb-1 pr-3">
              method
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              ARI
            </th>
            <th className="text-left font-mono text-[11px] pb-1">bar</th>
          </tr>
        </thead>
        <tbody>
          {ranking.map((r, i) => {
            const colour =
              NEURAL_METHOD_COLOR[r.method] ?? "var(--color-accent)";
            const norm = max > 0 ? r.ari / max : 0;
            return (
              <tr
                key={r.method}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1 pr-3 font-mono">{i + 1}</td>
                <td className="py-1 pr-3 font-mono">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: colour }}
                  />
                  {r.method}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {r.ari.toFixed(3)}
                </td>
                <td className="py-1 w-[200px]">
                  <div
                    className="w-full h-2 rounded"
                    style={{ backgroundColor: "var(--color-border)" }}
                  >
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${norm * 100}%`,
                        backgroundColor: colour,
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NeuralSeedStabilityCard({
  seedStability,
}: {
  seedStability: NeuralTopicSeedStability;
}) {
  const methods = Object.entries(seedStability.methods);
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <h4
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        Seed stability · {seedStability.n_seeds}-seed ARI mean ± std
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Each method is re-fitted with {seedStability.n_seeds} different
        random seeds. The summary reports the mean and std of
        KMeans-vs-label ARI across seeds. Lower std ⇒ more stable method.
      </p>
      <table
        className="w-full text-[12.5px]"
        style={{ color: "var(--color-fg)" }}
      >
        <thead>
          <tr style={{ color: "var(--color-fg-faint)" }}>
            <th className="text-left font-mono text-[11px] pb-1 pr-3">
              method
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              ARI mean
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              ARI std
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              min
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              max
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              c_v mean
            </th>
            <th className="text-right font-mono text-[11px] pb-1">c_v std</th>
          </tr>
        </thead>
        <tbody>
          {methods.map(([name, s]) => {
            const colour =
              NEURAL_METHOD_COLOR[name] ?? "var(--color-accent)";
            return (
              <tr
                key={name}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1 pr-3 font-mono">
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                    style={{ backgroundColor: colour }}
                  />
                  {name}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {s.ari_mean != null ? s.ari_mean.toFixed(3) : "—"}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {s.ari_std != null ? s.ari_std.toFixed(3) : "—"}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {s.ari_min != null ? s.ari_min.toFixed(3) : "—"}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {s.ari_max != null ? s.ari_max.toFixed(3) : "—"}
                </td>
                <td className="py-1 pr-3 text-right font-mono">
                  {s.c_v_mean != null ? s.c_v_mean.toFixed(3) : "—"}
                </td>
                <td className="py-1 text-right font-mono">
                  {s.c_v_std != null ? s.c_v_std.toFixed(3) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
