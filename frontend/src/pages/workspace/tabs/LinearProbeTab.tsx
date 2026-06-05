/**
 * Linear probe panel tab (extracted from Workspace.tsx in c263 as part
 * of #441 P1 2.1).
 *
 * Renders the method-by-method linear-probe ranking with macro F1 +
 * accuracy + balanced accuracy + a side-by-side bar chart. Source data:
 * `/api/linear-probe-panel/{scene}`.
 */
import { useTranslation } from "react-i18next";

import type { LinearProbePanel } from "@/api/client";

import { TabEmpty, TabError, TabLoading } from "../components/TabStates";

export function LinearProbeTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: LinearProbePanel | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <TabLoading
        message={t("pages:workspace.tabs.LinearProbeTab.loading")}
      />
    );
  if (error) {
    return (
      <TabError
        message={t("pages:workspace.tabs.LinearProbeTab.error")}
        detail={error.message}
      />
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
          {t("pages:workspace.tabs.LinearProbeTab.title", {
            nClasses: data.n_classes ?? "?",
          })}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.LinearProbeTab.lead", {
            K: data.K ?? "?",
          })}
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
          {t("pages:workspace.tabs.LinearProbeTab.ranking_title")}
        </h4>
        <div className="overflow-x-auto">
          <table
            className="w-full text-[12.5px]"
            style={{ color: "var(--color-fg)" }}
          >
            <thead>
              <tr style={{ color: "var(--color-fg-faint)" }}>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {t("pages:workspace.tabs.LinearProbeTab.col_rank")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {t("pages:workspace.tabs.LinearProbeTab.col_method")}
                </th>
                <th className="text-right font-mono text-[11px] pb-1 pr-3">
                  {t("pages:workspace.tabs.LinearProbeTab.col_macro_f1")}
                </th>
                <th className="text-right font-mono text-[11px] pb-1 pr-3">
                  {t("pages:workspace.tabs.LinearProbeTab.col_accuracy")}
                </th>
                <th className="text-right font-mono text-[11px] pb-1 pr-3">
                  {t("pages:workspace.tabs.LinearProbeTab.col_balanced_acc")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1">
                  {t("pages:workspace.tabs.LinearProbeTab.col_bar")}
                </th>
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
