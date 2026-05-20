import { useQueries } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Section } from "@/components/Section";
import { LABELLED_SCENES } from "./shared";

export function BenchmarksLlm() {
  return (
    <div className="space-y-8">
      <LlmTeaLeavesSection />
    </div>
  );
}

function LlmTeaLeavesSection() {
  const queries = useQueries({
    queries: LABELLED_SCENES.map((sceneId) => ({
      queryKey: ["llm-tea-leaves", sceneId],
      queryFn: () => api.llmTeaLeaves(sceneId),
      retry: false,
    })),
  });
  const ready = queries
    .map((q, i) => ({ sceneId: LABELLED_SCENES[i]!, data: q.data }))
    .filter((row) => row.data);

  if (ready.length === 0) {
    return (
      <Section
        title="B-12 — LLM tea-leaves (Stammbach et al. TACL 2024)"
        lead="Word-intrusion + coherent-label probes via Anthropic Claude. Builder is gated by ANTHROPIC_API_KEY; outputs land in data/derived/llm_tea_leaves once the env var is set and the builder is run."
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          No scenes evaluated yet. Set <code className="font-mono">ANTHROPIC_API_KEY</code>{" "}
          and run <code className="font-mono">build-b12-llm-tea-leaves</code> to populate.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="B-12 — LLM tea-leaves (Stammbach et al. TACL 2024)"
      lead="Per-scene word-intrusion accuracy + per-topic LLM labels. Higher intrusion accuracy means the LLM correctly identifies the foreign word slipped into each topic's top-10 — a coherence signal that correlates with NPMI in prior work."
    >
      <div className="space-y-6">
        <table
          className="w-full text-sm"
          style={{ color: "var(--color-text)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2">scene</th>
              <th className="text-left font-mono text-[12px] pb-2">topics</th>
              <th className="text-left font-mono text-[12px] pb-2">
                intrusion accuracy
              </th>
              <th className="text-left font-mono text-[12px] pb-2">model</th>
            </tr>
          </thead>
          <tbody>
            {ready.map(({ sceneId, data }) => (
              <tr
                key={sceneId}
                style={{ borderTop: "1px solid var(--color-border)" }}
              >
                <td className="py-1.5 font-mono">{sceneId}</td>
                <td className="py-1.5">{data!.topic_count}</td>
                <td className="py-1.5">
                  <span style={{ color: "var(--color-accent)" }}>
                    {(data!.intrusion_accuracy * 100).toFixed(1)}%
                  </span>{" "}
                  ({data!.n_correct_intrusion}/{data!.n_attempted})
                </td>
                <td className="py-1.5 font-mono text-[12px]">{data!.model}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {ready.map(({ sceneId, data }) => (
          <details
            key={sceneId}
            className="rounded-md border p-3"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
            }}
          >
            <summary className="cursor-pointer font-mono text-[13px]">
              {sceneId} — per-topic LLM labels
            </summary>
            <ul className="mt-2 space-y-1 text-sm">
              {data!.per_topic.map((tt) => (
                <li key={tt.topic_id} className="font-mono text-[12.5px]">
                  <span style={{ color: "var(--color-text-muted)" }}>
                    topic {tt.topic_id}
                  </span>{" "}
                  {tt.skipped ? (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      — skipped ({tt.reason})
                    </span>
                  ) : (
                    <>
                      <span
                        style={{
                          color: tt.intrusion_correct
                            ? "var(--color-accent)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        [{tt.intrusion_correct ? "✓" : "✗"}]
                      </span>{" "}
                      {tt.llm_label || "(no label)"}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </Section>
  );
}
