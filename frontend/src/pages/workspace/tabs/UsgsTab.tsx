import { useTranslation } from "react-i18next";
import type { TopicToUsgsV7 } from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { TabEmpty, TabError, TabLoading } from "../components/TabStates";

const USGS_CHAPTER_COLOR: Record<string, string> = {
  artificial: "#a855f7",
  coatings: "#ec4899",
  liquids: "#06b6d4",
  minerals: "#f59e0b",
  organics: "#22c55e",
  soils: "#84cc16",
  vegetation: "#10b981",
};

export function UsgsTab({
  isLoading,
  error,
  data,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  data: TopicToUsgsV7 | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return <TabLoading message={t("pages:workspace.tabs.UsgsTab.loading")} />;
  if (error)
    return (
      <TabError
        message={t("pages:workspace.tabs.UsgsTab.error")}
        detail={error.message}
      />
    );
  if (!data) return <TabEmpty />;

  const top =
    selectedTopic !== null ? data.top_n_per_topic[selectedTopic] : null;
  const chapterHist =
    selectedTopic !== null
      ? data.chapter_histogram_top50_per_topic[selectedTopic]
      : null;

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
        <header className="mb-3">
          <h4
            className="text-base font-semibold"
            style={{ color: "var(--color-fg)" }}
          >
            {t("pages:workspace.tabs.UsgsTab.title")}
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {data.library_subset} ·{" "}
            {t("pages:workspace.tabs.UsgsTab.lead", {
              count: data.library_sample_count,
            })}
          </p>
        </header>

        <div className="flex flex-wrap gap-1.5 mb-5">
          {Array.from({ length: data.topic_count }, (_, k) => {
            const isSel = selectedTopic === k;
            const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedTopic(k)}
                className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                style={{
                  borderColor: isSel
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: isSel
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isSel
                    ? "var(--color-fg)"
                    : "var(--color-fg-subtle)",
                }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                {t("pages:workspace.tabs.UsgsTab.topic_n", { n: k + 1 })}
              </button>
            );
          })}
        </div>

        {top && (
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <h5
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--color-fg)" }}
              >
                {t("pages:workspace.tabs.UsgsTab.top20_for_topic", {
                  n: selectedTopic! + 1,
                })}
              </h5>
              <ol
                className="text-[12.5px] space-y-1.5"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                {top.slice(0, 20).map((m) => {
                  const chapColor =
                    USGS_CHAPTER_COLOR[m.chapter] ?? "var(--color-fg-faint)";
                  return (
                    <li key={m.rank} className="flex items-center gap-2">
                      <span
                        className="shrink-0 w-6 text-right font-mono text-[11px]"
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        #{m.rank + 1}
                      </span>
                      <span
                        aria-hidden
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: chapColor }}
                        title={m.chapter}
                      />
                      <span className="flex-1 truncate font-mono text-[11.5px]">
                        {m.name}
                      </span>
                      <span
                        className="shrink-0 w-14 text-right font-mono"
                        style={{ color: "var(--color-fg)" }}
                      >
                        {m.cosine.toFixed(3)}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h5
                className="text-sm font-semibold mb-2"
                style={{ color: "var(--color-fg)" }}
              >
                {t("pages:workspace.tabs.UsgsTab.chapters_in_top50")}
              </h5>
              {chapterHist && Object.keys(chapterHist).length > 0 && (
                <div className="space-y-1.5">
                  {Object.entries(chapterHist)
                    .sort(([, a], [, b]) => b - a)
                    .map(([chap, count]) => {
                      const color =
                        USGS_CHAPTER_COLOR[chap] ?? "var(--color-fg-faint)";
                      return (
                        <div
                          key={chap}
                          className="flex items-center gap-2 text-[13px]"
                          style={{ color: "var(--color-fg-subtle)" }}
                        >
                          <span
                            className="shrink-0 w-24 font-mono text-[12px]"
                            style={{ color: "var(--color-fg)" }}
                          >
                            {chap}
                          </span>
                          <span
                            className="flex-1 h-4 rounded-sm"
                            style={{ backgroundColor: "var(--color-bg)" }}
                          >
                            <span
                              className="block h-full rounded-sm"
                              style={{
                                width: `${(count / 50) * 100}%`,
                                backgroundColor: color,
                                opacity: 0.85,
                              }}
                            />
                          </span>
                          <span
                            className="shrink-0 w-10 text-right font-mono text-[11.5px]"
                            style={{ color: "var(--color-fg)" }}
                          >
                            {count}
                          </span>
                        </div>
                      );
                    })}
                </div>
              )}
              <p
                className="mt-3 text-[12px]"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {t("pages:workspace.tabs.UsgsTab.chapter_count_help")}{" "}
                {t("pages:workspace.tabs.UsgsTab.library_distribution", {
                  subset: data.library_subset,
                  count: data.library_sample_count,
                  distribution: Object.entries(data.library_chapter_counts)
                    .map(([c, n]) => `${c} ${n}`)
                    .join(", "),
                })}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
