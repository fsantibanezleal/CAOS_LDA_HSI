import { useQueries } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation(["pages"]);
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
        title={t("pages:benchmarks.llm.empty.title")}
        lead={t("pages:benchmarks.llm.empty.lead")}
      >
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          <Trans
            i18nKey="pages:benchmarks.llm.empty.note"
            components={{ code: <code className="font-mono" /> }}
          />
        </p>
      </Section>
    );
  }

  return (
    <Section
      title={t("pages:benchmarks.llm.section.title")}
      lead={t("pages:benchmarks.llm.section.lead")}
    >
      <div className="space-y-6">
        <table
          className="w-full text-sm"
          style={{ color: "var(--color-text)" }}
        >
          <thead>
            <tr style={{ color: "var(--color-text-muted)" }}>
              <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.llm.table.scene")}</th>
              <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.llm.table.topics")}</th>
              <th className="text-left font-mono text-[12px] pb-2">
                {t("pages:benchmarks.llm.table.intrusionAccuracy")}
              </th>
              <th className="text-left font-mono text-[12px] pb-2">{t("pages:benchmarks.llm.table.model")}</th>
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
              {t("pages:benchmarks.llm.detail.summary", { sceneId })}
            </summary>
            <ul className="mt-2 space-y-1 text-sm">
              {data!.per_topic.map((tt) => (
                <li key={tt.topic_id} className="font-mono text-[12.5px]">
                  <span style={{ color: "var(--color-text-muted)" }}>
                    {t("pages:benchmarks.llm.detail.topic", { topicId: tt.topic_id })}
                  </span>{" "}
                  {tt.skipped ? (
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {t("pages:benchmarks.llm.detail.skipped", { reason: tt.reason })}
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
                      {tt.llm_label || t("pages:benchmarks.llm.detail.noLabel")}
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
