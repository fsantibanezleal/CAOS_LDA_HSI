import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

import { UnmixingStat } from "../components/StatCard";
import { TabError, TabLoading } from "../components/TabStates";

/**
 * Apply-to-document tab (cycle 101) — Step 7 of web-app-spec.md.
 *
 * Picks one of the K sampled documents, shows its full θ vector vs the
 * scene's marginal θ, and overlays the per-topic empirical P(label | t)
 * for the doc's dominant topic. Cross-tab `selectedTopic` is honoured.
 */
export function ApplyToDocumentTab({
  isLoading,
  error,
  docs,
  topicViews,
  topicToData,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  docs: import("@/api/client").DocumentCardsFile | null;
  topicViews: import("@/api/client").TopicViews | null;
  topicToData: import("@/api/client").TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const [pickedIdx, setPickedIdx] = useState<number | null>(null);
  const docCards = docs?.document_cards ?? [];
  const K = topicViews?.topic_count ?? 12;
  const marginalTheta = useMemoMarginal(docCards, K);

  if (isLoading)
    return (
      <TabLoading
        message={t("pages:workspace.tabs.ApplyToDocumentTab.loading")}
      />
    );
  if (error) {
    return (
      <TabError
        message={t("pages:workspace.tabs.ApplyToDocumentTab.error")}
        detail={error.message}
      />
    );
  }
  if (!docs || !topicViews) return null;

  const picked = pickedIdx != null ? docCards[pickedIdx] : null;

  return (
    <div className="space-y-6">
      <div
        className="rounded-xl border p-5 relative overflow-hidden"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, rgba(170,60,200,1) 0%, rgba(56,189,248,1) 100%)" }}
        />
        <h3 className="text-lg font-semibold tracking-tight mt-1 mb-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:workspace.tabs.ApplyToDocumentTab.title")}
        </h3>
        <p className="text-[12.5px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.ApplyToDocumentTab.lead", {
            count: docCards.length,
            k: K,
          })}
        </p>

        <DocPicker
          docCards={docCards}
          pickedIdx={pickedIdx}
          onPick={setPickedIdx}
          K={K}
        />
      </div>

      {picked ? (
        <DocDetailPanel
          doc={picked}
          marginalTheta={marginalTheta}
          topicViews={topicViews}
          topicToData={topicToData}
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
        />
      ) : (
        <div
          className="rounded-lg border p-6 text-center text-[13px]"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", color: "var(--color-fg-subtle)" }}
        >
          {t("pages:workspace.tabs.ApplyToDocumentTab.empty_pick")}
        </div>
      )}
    </div>
  );
}

function useMemoMarginal(
  docCards: import("@/api/client").DocumentCard[],
  K: number,
): number[] {
  return useMemo(() => {
    const sum = new Array(K).fill(0);
    let count = 0;
    for (const d of docCards) {
      if (!d.theta_full) continue;
      for (let k = 0; k < K; k++) sum[k] += d.theta_full[k] ?? 0;
      count++;
    }
    if (count === 0) return sum;
    return sum.map((v) => v / count);
  }, [docCards, K]);
}

function DocPicker({
  docCards,
  pickedIdx,
  onPick,
  K,
}: {
  docCards: import("@/api/client").DocumentCard[];
  pickedIdx: number | null;
  onPick: (i: number) => void;
  K: number;
}) {
  const { t } = useTranslation(["pages"]);
  const [filterTopic, setFilterTopic] = useState<number | null>(null);
  const [filterLabel, setFilterLabel] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return docCards
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => {
        if (filterTopic !== null && d.topic_k_dominant !== filterTopic) return false;
        if (filterLabel !== null && d.label_id !== filterLabel) return false;
        return true;
      });
  }, [docCards, filterTopic, filterLabel]);

  const topicSet = useMemo(() => {
    return Array.from(new Set(docCards.map((d) => d.topic_k_dominant))).sort((a, b) => a - b);
  }, [docCards]);
  const labelSet = useMemo(() => {
    const seen = new Map<number, string>();
    for (const d of docCards) if (!seen.has(d.label_id)) seen.set(d.label_id, d.label_name);
    return Array.from(seen.entries()).sort((a, b) => a[0] - b[0]);
  }, [docCards]);

  return (
    <div className="space-y-3 mt-3">
      <div className="flex items-baseline flex-wrap gap-3 text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
        <span className="uppercase tracking-widest font-semibold text-[10.5px]">{t("pages:workspace.tabs.ApplyToDocumentTab.filter")}</span>
        <span>{t("pages:workspace.tabs.ApplyToDocumentTab.by_topic")}</span>
        <button
          type="button"
          onClick={() => setFilterTopic(null)}
          className="rounded border px-1.5 py-0.5 text-[11px] font-mono"
          style={{
            borderColor: filterTopic === null ? "var(--color-accent)" : "var(--color-border)",
            color: filterTopic === null ? "var(--color-accent)" : "var(--color-fg-faint)",
            backgroundColor: filterTopic === null ? "var(--color-accent-soft)" : "transparent",
          }}
        >
          {t("pages:workspace.tabs.ApplyToDocumentTab.filter_all")}
        </button>
        {topicSet.slice(0, 12).map((k) => (
          <button
            key={`tk-${k}`}
            type="button"
            onClick={() => setFilterTopic(filterTopic === k ? null : k)}
            className="rounded border px-1.5 py-0.5 text-[11px] font-mono"
            style={{
              borderColor: filterTopic === k ? TOPIC_COLORS[k % TOPIC_COLORS.length] : "var(--color-border)",
              color: filterTopic === k ? TOPIC_COLORS[k % TOPIC_COLORS.length] : "var(--color-fg-faint)",
              backgroundColor: filterTopic === k ? "var(--color-accent-soft)" : "transparent",
            }}
          >
            t{k}
          </button>
        ))}
        <span className="ml-3">{t("pages:workspace.tabs.ApplyToDocumentTab.by_label")}</span>
        <button
          type="button"
          onClick={() => setFilterLabel(null)}
          className="rounded border px-1.5 py-0.5 text-[11px] font-mono"
          style={{
            borderColor: filterLabel === null ? "var(--color-accent)" : "var(--color-border)",
            color: filterLabel === null ? "var(--color-accent)" : "var(--color-fg-faint)",
            backgroundColor: filterLabel === null ? "var(--color-accent-soft)" : "transparent",
          }}
        >
          {t("pages:workspace.tabs.ApplyToDocumentTab.filter_all")}
        </button>
        {labelSet.slice(0, 16).map(([lid, lname]) => (
          <button
            key={`lab-${lid}`}
            type="button"
            onClick={() => setFilterLabel(filterLabel === lid ? null : lid)}
            className="rounded border px-1.5 py-0.5 text-[10.5px] font-mono"
            style={{
              borderColor: filterLabel === lid ? "var(--color-accent)" : "var(--color-border)",
              color: filterLabel === lid ? "var(--color-accent)" : "var(--color-fg-faint)",
              backgroundColor: filterLabel === lid ? "var(--color-accent-soft)" : "transparent",
            }}
            title={lname}
          >
            {lid}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto" style={{ maxHeight: 280 }}>
        <table className="w-full text-[12px]" style={{ color: "var(--color-fg)" }}>
          <thead className="sticky top-0" style={{ backgroundColor: "var(--color-panel)" }}>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">doc_id</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_label")}</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_dominant")}</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_theta_stack", { k: K })}</th>
              <th className="text-right font-mono text-[11px] pb-1">θ_dominant</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ d, i }) => {
              const isPicked = pickedIdx === i;
              let acc = 0;
              return (
                <tr
                  key={d.doc_id}
                  onClick={() => onPick(i)}
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    backgroundColor: isPicked ? "var(--color-accent-soft)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td className="py-1 pr-3 font-mono">{d.doc_id}</td>
                  <td className="py-1 pr-3 font-mono truncate" style={{ maxWidth: 100 }} title={d.label_name}>
                    {d.label_name}
                  </td>
                  <td className="py-1 pr-3 font-mono">
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: TOPIC_COLORS[d.topic_k_dominant % TOPIC_COLORS.length] }} />
                    t{d.topic_k_dominant}
                  </td>
                  <td className="py-1 pr-3 w-[260px]">
                    <div className="h-3 rounded overflow-hidden flex" style={{ backgroundColor: "var(--color-border)" }}>
                      {d.theta_full?.map((p, kk) => {
                        const w = p * 100;
                        acc += w;
                        return (
                          <span
                            key={`${d.doc_id}-${kk}`}
                            style={{ width: `${w}%`, backgroundColor: TOPIC_COLORS[kk % TOPIC_COLORS.length] }}
                            title={t("pages:workspace.tabs.ApplyToDocumentTab.theta_cell_title", { topic: kk, pct: (p * 100).toFixed(1) })}
                          />
                        );
                      })}
                      {acc < 99.9 ? <span style={{ width: `${100 - acc}%` }} /> : null}
                    </div>
                  </td>
                  <td className="py-1 text-right font-mono">{(d.theta_k_at_dominant * 100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px]" style={{ color: "var(--color-fg-faint)" }}>
        {t("pages:workspace.tabs.ApplyToDocumentTab.docs_shown", {
          shown: filtered.length,
          total: docCards.length,
        })}
      </p>
    </div>
  );
}

function DocDetailPanel({
  doc,
  marginalTheta,
  topicViews,
  topicToData,
  selectedTopic,
  setSelectedTopic,
}: {
  doc: import("@/api/client").DocumentCard;
  marginalTheta: number[];
  topicViews: import("@/api/client").TopicViews;
  topicToData: import("@/api/client").TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const ranked = useMemo(() => {
    return (doc.theta_full ?? [])
      .map((p, k) => ({ k, p, marginal: marginalTheta[k] ?? 0 }))
      .sort((a, b) => b.p - a.p);
  }, [doc.theta_full, marginalTheta]);

  const topicWords = topicViews.top_words_per_topic["lambda_0.5"] ?? [];

  return (
    <div className="space-y-5">
      <div
        className="rounded-lg border p-5"
        style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
      >
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-3">
          <UnmixingStat label="doc_id" value={doc.doc_id} />
          <UnmixingStat label={t("pages:workspace.tabs.ApplyToDocumentTab.stat_label")} value={doc.label_name} />
          <UnmixingStat label={t("pages:workspace.tabs.ApplyToDocumentTab.stat_dominant_topic")} value={`t${doc.topic_k_dominant}`} />
          <UnmixingStat label={t("pages:workspace.tabs.ApplyToDocumentTab.stat_theta_at_dominant")} value={`${(doc.theta_k_at_dominant * 100).toFixed(1)}%`} />
        </div>

        <h5 className="text-[11px] uppercase tracking-widest font-semibold mb-2" style={{ color: "var(--color-fg-faint)" }}>
          {t("pages:workspace.tabs.ApplyToDocumentTab.theta_ranked_help")}
        </h5>
        <table className="w-full text-[12px]" style={{ color: "var(--color-fg)" }}>
          <thead>
            <tr style={{ color: "var(--color-fg-faint)" }}>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_topic")}</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_doc_theta")}</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_marginal_theta")}</th>
              <th className="text-right font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_ratio")}</th>
              <th className="text-left font-mono text-[11px] pb-1 pr-3">{t("pages:workspace.tabs.ApplyToDocumentTab.col_doc_bar")}</th>
              <th className="text-left font-mono text-[11px] pb-1">{t("pages:workspace.tabs.ApplyToDocumentTab.col_top_words")}</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((row) => {
              const colour = TOPIC_COLORS[row.k % TOPIC_COLORS.length];
              const ratio = row.marginal > 0 ? row.p / row.marginal : 0;
              const isSel = selectedTopic === row.k;
              const words = topicWords?.[row.k] ?? [];
              return (
                <tr
                  key={`r-${row.k}`}
                  onClick={() => setSelectedTopic(isSel ? null : row.k)}
                  style={{
                    borderTop: "1px solid var(--color-border)",
                    backgroundColor: isSel ? "var(--color-accent-soft)" : "transparent",
                    cursor: "pointer",
                  }}
                >
                  <td className="py-1 pr-3 font-mono">
                    <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: colour }} />
                    t{row.k}
                  </td>
                  <td className="py-1 pr-3 text-right font-mono">{(row.p * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3 text-right font-mono">{(row.marginal * 100).toFixed(1)}%</td>
                  <td className="py-1 pr-3 text-right font-mono" style={{ color: ratio >= 2 ? "rgba(40,160,80,1)" : ratio <= 0.5 ? "rgba(214,39,40,1)" : "var(--color-fg-faint)" }}>
                    {row.marginal > 0 ? ratio.toFixed(2) : "—"}×
                  </td>
                  <td className="py-1 pr-3 w-[140px]">
                    <div className="h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
                      <div className="h-2 rounded" style={{ width: `${row.p * 100}%`, backgroundColor: colour }} />
                    </div>
                  </td>
                  <td className="py-1 text-[11px] font-mono truncate" style={{ maxWidth: 220, color: "var(--color-fg-subtle)" }} title={words.slice(0, 8).map((w) => w.token).join(", ")}>
                    {words.slice(0, 4).map((w) => w.token).join(", ")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {topicToData ? (
        <div
          className="rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-panel)", boxShadow: "var(--color-shadow)" }}
        >
          <h4 className="text-base font-semibold mb-1" style={{ color: "var(--color-fg)" }}>
            {t("pages:workspace.tabs.ApplyToDocumentTab.plabel_title")}
          </h4>
          <p className="text-[12px] mb-3" style={{ color: "var(--color-fg-faint)" }}>
            {t("pages:workspace.tabs.ApplyToDocumentTab.plabel_help_pre")}{" "}
            <code>t{doc.topic_k_dominant}</code>
            {t("pages:workspace.tabs.ApplyToDocumentTab.plabel_help_mid")}{" "}
            <strong>{doc.label_name}</strong>
            {t("pages:workspace.tabs.ApplyToDocumentTab.plabel_help_post")}
          </p>
          <PerTopicLabelBars
            row={topicToData.p_label_given_topic_dominant[doc.topic_k_dominant] ?? []}
            highlightLabelId={doc.label_id}
          />
        </div>
      ) : null}
    </div>
  );
}

function PerTopicLabelBars({
  row,
  highlightLabelId,
}: {
  row: import("@/api/client").LabelCell[];
  highlightLabelId: number;
}) {
  const sorted = [...row].sort((a, b) => b.p - a.p).slice(0, 12);
  const max = sorted[0]?.p ?? 1;
  return (
    <div className="space-y-1">
      {sorted.map((cell) => {
        const isHi = cell.label_id === highlightLabelId;
        const width = max > 0 ? (cell.p / max) * 100 : 0;
        return (
          <div key={`pl-${cell.label_id}`} className="flex items-baseline gap-2 text-[12px]">
            <span className="font-mono w-32 truncate" style={{ color: isHi ? "var(--color-accent)" : "var(--color-fg)", fontWeight: isHi ? 600 : 400 }} title={cell.name}>
              {isHi ? "★ " : ""}{cell.name}
            </span>
            <span className="font-mono text-[11px] w-12 text-right" style={{ color: "var(--color-fg-faint)" }}>
              {(cell.p * 100).toFixed(1)}%
            </span>
            <div className="flex-1 h-2 rounded" style={{ backgroundColor: "var(--color-border)" }}>
              <div className="h-2 rounded" style={{ width: `${width}%`, backgroundColor: isHi ? "var(--color-accent)" : "var(--color-fg-subtle)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
