/**
 * Routed-gating tab (extracted from Workspace.tsx in c278 as part of
 * #441 P1 2.1).
 *
 * Renders two stacked cards:
 *   1. EmbeddedBaselineCard — does θ add signal over PCA-K at the same K?
 *      Trains a logistic head on raw / pca_K / theta / theta⊕pca_K
 *      feature blocks and ranks them by macro F1.
 *   2. DeepGateCard — does a deep latent (CAE-1D / β-VAE / PCA) beat
 *      θ as the routing key in the topic-routed classifier?
 *
 * Both helper cards are module-local since only GatingTab consumes them.
 */
import type { EmbeddedBaseline, TopicRoutedDeepGate } from "@/api/client";

export function GatingTab({
  isLoading,
  error,
  embedded,
  deepGate,
}: {
  isLoading: boolean;
  error: Error | null;
  embedded: EmbeddedBaseline | null;
  deepGate: TopicRoutedDeepGate | null;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading gating panels…
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
          Could not load gating data.
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
  return (
    <div className="space-y-6">
      {embedded ? <EmbeddedBaselineCard embedded={embedded} /> : null}
      {deepGate ? <DeepGateCard deepGate={deepGate} /> : null}
    </div>
  );
}

function EmbeddedBaselineCard({ embedded }: { embedded: EmbeddedBaseline }) {
  const methods = Object.entries(embedded.method_metrics);
  const sorted = embedded.ranking_by_macro_f1_mean
    ? embedded.ranking_by_macro_f1_mean
        .map(
          (r) => [r.method, embedded.method_metrics[r.method]] as const,
        )
        .filter(([, m]) => !!m)
    : methods.sort((a, b) => b[1].macro_f1.mean - a[1].macro_f1.mean);
  const maxF1 = sorted[0]?.[1]?.macro_f1.mean ?? 1;

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
            "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(170,60,200,1) 100%)",
        }}
      />
      <h3
        className="text-lg font-semibold tracking-tight mt-1 mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        Embedded baseline · {embedded.K}-dim concat with theta
      </h3>
      <p
        className="text-[12.5px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Does theta add signal beyond PCA at the same K? Trains a{" "}
        {embedded.head} on (raw / pca_K / theta / theta⊕pca_K) features.{" "}
        {embedded.split} on {embedded.n_documents.toLocaleString()} documents
        × {embedded.n_classes} classes. Honest headline (cycles 53-54): the
        concat <em>theta_concat_pca_K_logistic</em> beats pca_K alone only
        on Indian Pines (Δ F1 = +0.018, small effect); ties on the other 5
        scenes.
      </p>
      {embedded.framework_axis ? (
        <p
          className="text-[11.5px] italic mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {embedded.framework_axis}
        </p>
      ) : null}
      <div className="overflow-x-auto">
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
                macro F1
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                accuracy
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                balanced acc
              </th>
              <th className="text-left font-mono text-[11px] pb-1">bar</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(([m, mm], i) => {
              if (!mm) return null;
              const f1 = mm.macro_f1;
              const norm = f1.mean / Math.max(1e-9, maxF1);
              return (
                <tr
                  key={m}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td className="py-1 pr-3 font-mono">{i + 1}</td>
                  <td className="py-1 pr-3 font-mono">{m}</td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {f1.mean.toFixed(3)}
                    {f1.ci95_lo != null && f1.ci95_hi != null ? (
                      <span className="opacity-70 ml-1 text-[10.5px]">
                        [{f1.ci95_lo.toFixed(3)}, {f1.ci95_hi.toFixed(3)}]
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {mm.accuracy.mean.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {mm.balanced_accuracy
                      ? mm.balanced_accuracy.mean.toFixed(3)
                      : "—"}
                  </td>
                  <td className="py-1 w-[180px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${norm * 100}%`,
                          backgroundColor: m.includes("concat")
                            ? "rgba(170,60,200,0.9)"
                            : "var(--color-accent)",
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
    </div>
  );
}

function DeepGateCard({ deepGate }: { deepGate: TopicRoutedDeepGate }) {
  const ranking = deepGate.ranked_by_macro_f1_mean ?? [];
  const max = ranking[0]?.macro_f1_mean ?? 1;
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
        Routed gating · theta vs deep-encoder gates (axis B-3)
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        The routed classifier conditions on a gate vector. We compare four
        gates:{" "}
        <span className="font-mono">{deepGate.gate_methods.join(" · ")}</span>.
        The question is whether a deep latent (CAE-1D / β-VAE / PCA at the
        same K) outperforms theta when used as the routing key.{" "}
        {deepGate.n_documents.toLocaleString()} documents ×{" "}
        {deepGate.n_classes} classes.
      </p>
      <div className="overflow-x-auto">
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
                macro F1
              </th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">
                CI95
              </th>
              <th className="text-left font-mono text-[11px] pb-1">bar</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => {
              const norm = r.macro_f1_mean / Math.max(1e-9, max);
              const isRaw = r.method === "raw_logistic";
              return (
                <tr
                  key={r.method}
                  style={{ borderTop: "1px solid var(--color-border)" }}
                >
                  <td className="py-1 pr-3 font-mono">{i + 1}</td>
                  <td className="py-1 pr-3 font-mono">
                    {r.method}
                    {isRaw ? (
                      <span
                        className="ml-1 text-[10px] uppercase tracking-widest"
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        baseline
                      </span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">
                    {r.macro_f1_mean.toFixed(3)}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono text-[10.5px] opacity-80">
                    [{r.macro_f1_ci95[0].toFixed(3)},{" "}
                    {r.macro_f1_ci95[1].toFixed(3)}]
                  </td>
                  <td className="py-1 w-[180px]">
                    <div
                      className="w-full h-2 rounded"
                      style={{ backgroundColor: "var(--color-border)" }}
                    >
                      <div
                        className="h-2 rounded"
                        style={{
                          width: `${norm * 100}%`,
                          backgroundColor: isRaw
                            ? "rgba(214,140,40,0.85)"
                            : "var(--color-accent)",
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
      {deepGate.framework_axis ? (
        <p
          className="mt-3 text-[11.5px] italic"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {deepGate.framework_axis}
        </p>
      ) : null}
    </div>
  );
}
