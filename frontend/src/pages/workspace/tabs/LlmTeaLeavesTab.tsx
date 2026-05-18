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
import type { LlmTeaLeaves } from "@/api/client";

import { TabEmpty } from "../components/TabStates";
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
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading LLM tea-leaves evaluation…
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
          Could not load LLM tea-leaves.
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
          LLM tea leaves · word-intrusion test
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          For each topic, top-N words by relevance λ get one intruder word
          inserted. An LLM ({data.model}) is asked to pick the odd word out.
          Correct picks ⇒ topic is coherent enough to make the intruder
          obvious. Higher accuracy ⇒ more interpretable topics.
        </p>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
          <UnmixingStat label="model" value={data.model} />
          <UnmixingStat label="λ relevance" value={data.lambda_used} />
          <UnmixingStat
            label="top-N per topic"
            value={String(data.top_n_per_topic)}
          />
          <UnmixingStat
            label="intrusion accuracy"
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
          Per-topic intrusion results · {attempted.length} attempted of{" "}
          {data.topic_count}
        </h4>
        <div className="overflow-x-auto">
          <table
            className="w-full text-[12px]"
            style={{ color: "var(--color-fg)" }}
          >
            <thead>
              <tr style={{ color: "var(--color-fg-faint)" }}>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  topic
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  top words
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  intruder
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  LLM picked
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  verdict
                </th>
                <th className="text-left font-mono text-[11px] pb-1">
                  LLM label
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
                          skipped ({t.reason})
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
                          ✓ correct
                        </span>
                      ) : correct === false ? (
                        <span style={{ color: "rgba(214,39,40,1)" }}>
                          ✗ wrong
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
