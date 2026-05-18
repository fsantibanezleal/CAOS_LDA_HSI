/**
 * Linear probe panel tab (extracted from Workspace.tsx in c263 as part
 * of #441 P1 2.1).
 *
 * Renders the method-by-method linear-probe ranking with macro F1 +
 * accuracy + balanced accuracy + a side-by-side bar chart. Source data:
 * `/api/linear-probe-panel/{scene}`.
 */
import type { LinearProbePanel } from "@/api/client";

import { TabEmpty } from "../components/TabStates";

export function LinearProbeTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: LinearProbePanel | null;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading linear probe panel…
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
          Could not load linear probe panel.
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
  if (!data) return <TabEmpty />;

  const methods = Object.entries(data.method_metrics);
  const sorted = data.ranking_by_macro_f1_mean
    ? data.ranking_by_macro_f1_mean
        .map((r) => [r.method, data.method_metrics[r.method]] as const)
        .filter(([, m]) => !!m)
    : methods.sort(
        (a, b) => b[1].macro_f1.mean - a[1].macro_f1.mean,
      );

  const maxF1 = sorted[0]?.[1]?.macro_f1.mean ?? 1;

  return (
    <div className="space-y-5">
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
              "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(40,160,80,1) 100%)",
          }}
        />
        <h4
          className="text-base font-semibold mt-1 mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          Linear probe panel · {data.n_classes ?? "?"}-class macro F1
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Trains a linear classifier on each method&apos;s latent (K ={" "}
          {data.K ?? "?"}) and reports macro-F1, accuracy, and balanced
          accuracy with 95% CI. Linear probing isolates the
          representation&apos;s separability — a strong probe means the latent
          already arranges classes in linear half-spaces.
        </p>
      </div>

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
          Method ranking · macro F1
        </h4>
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
                      {f1.ci95 ? (
                        <span className="opacity-70 ml-1 text-[10.5px]">
                          [{f1.ci95[0].toFixed(3)}, {f1.ci95[1].toFixed(3)}]
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
                            backgroundColor: "var(--color-accent)",
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
    </div>
  );
}
