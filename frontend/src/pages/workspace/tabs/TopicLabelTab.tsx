import { useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TopicToData } from "@/api/client";
import { TopicLabelHeatmap } from "@/components/plots/TopicLabelHeatmap";
import { InverseLabelHeatmap } from "@/components/plots/InverseLabelHeatmap";
import { TabEmpty, TabError, TabLoading } from "../components/TabStates";
import { DocsPerTopicBar } from "../components/DocsPerTopicBar";

export function TopicLabelTab({
  isLoading,
  error,
  data,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const [direction, setDirection] = useState<"forward" | "inverse">(
    "forward",
  );

  const inverse = useMemo(() => {
    if (!data) return null;
    const fwd = data.p_label_given_topic_dominant;
    const counts = data.docs_per_topic_dominant;
    const K = fwd.length;
    const L = fwd[0]?.length ?? 0;
    if (K === 0 || L === 0) return null;
    const rows: number[][] = [];
    const labelMeta: { label_id: number; name: string; color: string }[] = [];
    for (let l = 0; l < L; l++) {
      const cell0 = fwd[0]![l]!;
      labelMeta.push({
        label_id: cell0.label_id,
        name: cell0.name,
        color: cell0.color,
      });
      const row = new Array<number>(K).fill(0);
      let denom = 0;
      for (let k = 0; k < K; k++) {
        const p = fwd[k]?.[l]?.p ?? 0;
        const n = counts[k] ?? 0;
        const joint = n * p;
        row[k] = joint;
        denom += joint;
      }
      if (denom > 0) {
        for (let k = 0; k < K; k++) row[k] = row[k]! / denom;
      }
      rows.push(row);
    }
    return { matrix: rows, labels: labelMeta, K };
  }, [data]);

  if (isLoading)
    return (
      <TabLoading message={t("pages:workspace.tabs.TopicLabelTab.loading")} />
    );
  if (error)
    return (
      <TabError
        message={t("pages:workspace.tabs.TopicLabelTab.error")}
        detail={error.message}
      />
    );
  if (!data) return <TabEmpty />;

  const matrix = data.p_label_given_topic_dominant;

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-5"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <div className="flex items-start justify-between gap-4 mb-2">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            {direction === "forward"
              ? t("pages:workspace.tabs.TopicLabelTab.title_forward")
              : t("pages:workspace.tabs.TopicLabelTab.title_inverse")}
          </h4>
          <div
            role="tablist"
            aria-label={t("pages:workspace.tabs.TopicLabelTab.aria_direction")}
            className="inline-flex rounded-md border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={direction === "forward"}
              onClick={() => setDirection("forward")}
              className="px-2.5 py-1 text-[12px] rounded-l-md"
              style={{
                backgroundColor:
                  direction === "forward"
                    ? "var(--color-accent-soft)"
                    : "transparent",
                color:
                  direction === "forward"
                    ? "var(--color-accent)"
                    : "var(--color-fg-subtle)",
              }}
            >
              P(label | topic)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={direction === "inverse"}
              onClick={() => setDirection("inverse")}
              className="px-2.5 py-1 text-[12px] rounded-r-md"
              style={{
                backgroundColor:
                  direction === "inverse"
                    ? "var(--color-accent-soft)"
                    : "transparent",
                color:
                  direction === "inverse"
                    ? "var(--color-accent)"
                    : "var(--color-fg-subtle)",
                borderLeft: "1px solid var(--color-border)",
              }}
            >
              P(topic | label)
            </button>
          </div>
        </div>
        <p
          className="text-sm mb-2"
          style={{ color: "var(--color-fg-faint)" }}
        >
          <Trans
            i18nKey="pages:workspace.tabs.TopicLabelTab.dominant_help"
            components={{
              em: <em />,
              code: <code />,
              subk: <sub />,
              subdk: <sub />,
            }}
          />
        </p>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {direction === "forward"
            ? t("pages:workspace.tabs.TopicLabelTab.forward_help")
            : t("pages:workspace.tabs.TopicLabelTab.inverse_help")}
        </p>
        <div className="overflow-x-auto">
          {direction === "forward" ? (
            <TopicLabelHeatmap
              matrix={matrix}
              selectedTopic={selectedTopic}
              onSelectTopic={(k) =>
                setSelectedTopic(k === selectedTopic ? null : k)
              }
            />
          ) : inverse ? (
            <InverseLabelHeatmap
              matrix={inverse.matrix}
              labels={inverse.labels}
              topicCount={inverse.K}
              selectedTopic={selectedTopic}
              onSelectTopic={(k) =>
                setSelectedTopic(k === selectedTopic ? null : k)
              }
            />
          ) : (
            <p style={{ color: "var(--color-fg-faint)" }}>
              {t("pages:workspace.tabs.TopicLabelTab.no_inverse_matrix")}
            </p>
          )}
        </div>
      </div>

      <div
        className="grid md:grid-cols-2 gap-5"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <div
          className="rounded-lg border p-5"
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
            {t("pages:workspace.tabs.TopicLabelTab.docs_per_topic_title")}
          </h4>
          <p
            className="text-[12.5px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.TopicLabelTab.docs_per_topic_help")}
          </p>
          <DocsPerTopicBar
            counts={data.docs_per_topic_dominant}
            selected={selectedTopic}
            onSelect={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
          />
        </div>
        <div
          className="rounded-lg border p-5"
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
            KL(P(label | topic) ‖ P(label))
          </h4>
          <p
            className="text-[12.5px] mb-3"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace.tabs.TopicLabelTab.kl_help")}
          </p>
          <DocsPerTopicBar
            counts={data.kl_to_label_prior_per_topic}
            selected={selectedTopic}
            onSelect={(k) =>
              setSelectedTopic(k === selectedTopic ? null : k)
            }
            isFloat
          />
        </div>
      </div>

      {selectedTopic !== null && matrix[selectedTopic] && (
        <div
          className="rounded-lg border p-5"
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
            {t("pages:workspace.tabs.TopicLabelTab.topic_detail", {
              n: selectedTopic + 1,
            })}
          </h4>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            {[...matrix[selectedTopic]!]
              .sort((a, b) => b.p - a.p)
              .map((c) => (
                <li
                  key={c.label_id}
                  className="flex items-center gap-2"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span
                    className="font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    {(c.p * 100).toFixed(1)}%
                  </span>
                  <span
                    className="font-mono text-[12px]"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    ({c.count})
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
