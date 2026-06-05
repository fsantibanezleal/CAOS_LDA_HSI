/**
 * LLM tea-leaves word-intrusion tab (extracted from Workspace.tsx
 * in c263 as part of #441 P1 2.1).
 *
 * Renders the per-topic word-intrusion test result from
 * `/api/llm-tea-leaves/{scene}` — headline accuracy + per-topic table
 * with intruder / LLM-picked / verdict / LLM label.
 *
 * No behavioural change versus the inline version; cut and paste +
 * external imports converted.
 */
import { useTranslation } from "react-i18next";

import type { LlmTeaLeaves } from "@/api/client";

import { TabEmpty, TabError, TabLoading } from "../components/TabStates";
import { UnmixingStat } from "../components/StatCard";

export function LlmTeaLeavesTab({
  isLoading,
  error,
  data,
}: {
  isLoading: boolean;
  error: Error | null;
  data: LlmTeaLeaves | null;
}) {
  const { t: tt } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <TabLoading
        message={tt("pages:workspace.tabs.LlmTeaLeavesTab.loading")}
      />
    );
  if (error) {
    return (
      <TabError
        message={tt("pages:workspace.tabs.LlmTeaLeavesTab.error")}
        detail={error.message}
      />
    );
  }
  if (!data) return <TabEmpty />;

  const attempted = data.per_topic.filter((t) => !t.skipped);
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
              "linear-gradient(90deg, rgba(240, 228, 66, 1) 0%, rgba(214, 140, 40, 1) 100%)",
          }}
        />
        <h4
          className="text-base font-semibold mt-1 mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          {tt("pages:workspace.tabs.LlmTeaLeavesTab.title")}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {tt("pages:workspace.tabs.LlmTeaLeavesTab.lead", {
            model: data.model,
          })}
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <UnmixingStat
            label={tt("pages:workspace.tabs.LlmTeaLeavesTab.stat_model")}
            value={data.model}
          />
          <UnmixingStat
            label={tt("pages:workspace.tabs.LlmTeaLeavesTab.stat_lambda")}
            value={data.lambda_used}
          />
          <UnmixingStat
            label={tt("pages:workspace.tabs.LlmTeaLeavesTab.stat_top_n")}
            value={String(data.top_n_per_topic)}
          />
          <UnmixingStat
            label={tt("pages:workspace.tabs.LlmTeaLeavesTab.stat_accuracy")}
            value={`${(data.intrusion_accuracy * 100).toFixed(1)}% · ${data.n_correct_intrusion}/${data.n_attempted}`}
          />
        </div>
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
          {tt("pages:workspace.tabs.LlmTeaLeavesTab.table_title", {
            attempted: attempted.length,
            total: data.topic_count,
          })}
        </h4>
        <div className="overflow-x-auto">
          <table
            className="w-full text-[12px]"
            style={{ color: "var(--color-fg)" }}
          >
            <thead>
              <tr style={{ color: "var(--color-fg-faint)" }}>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_topic")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_top_words")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_intruder")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_llm_picked")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_verdict")}
                </th>
                <th className="text-left font-mono text-[11px] pb-1">
                  {tt("pages:workspace.tabs.LlmTeaLeavesTab.col_llm_label")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.per_topic.map((t) => {
                const correct = t.intrusion_correct;
                return (
                  <tr
                    key={t.topic_id}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <td className="py-1 pr-3 font-mono">t{t.topic_id}</td>
                    <td className="py-1 pr-3 font-mono text-[11px]">
                      {t.skipped ? (
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          {tt("pages:workspace.tabs.LlmTeaLeavesTab.skipped", {
                            reason: t.reason,
                          })}
                        </span>
                      ) : (
                        t.top_words?.slice(0, 5).join(", ")
                      )}
                      {(t.top_words?.length ?? 0) > 5 ? (
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          , …
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      <span
                        style={{
                          backgroundColor: "var(--color-accent-soft)",
                          padding: "1px 4px",
                          borderRadius: 3,
                        }}
                      >
                        {t.intruder ?? "—"}
                      </span>
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {t.llm_chose ?? "—"}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {correct === true ? (
                        <span style={{ color: "rgba(40,160,80,1)" }}>
                          {tt("pages:workspace.tabs.LlmTeaLeavesTab.verdict_correct")}
                        </span>
                      ) : correct === false ? (
                        <span style={{ color: "rgba(214,39,40,1)" }}>
                          {tt("pages:workspace.tabs.LlmTeaLeavesTab.verdict_wrong")}
                        </span>
                      ) : (
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          —
                        </span>
                      )}
                    </td>
                    <td
                      className="py-1 truncate text-[11px]"
                      style={{ maxWidth: 240 }}
                      title={t.llm_label}
                    >
                      {t.llm_label ?? "—"}
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
