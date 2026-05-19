/**
 * Interpretability tab (extracted from Workspace.tsx in c293 as part
 * of #441 P1 2.1). Three stacked cards:
 *
 *   1. InterpretTopicCardsGrid — one card per topic: peak λ, FWHM,
 *      top-3 labels by P(label | topic) with mini bars.
 *   2. InterpretBandImportance — top-24 bands by Fisher ratio +
 *      Mutual Information vs label.
 *   3. InterpretDocumentSample — sample of N documents with their θ
 *      stacked bars + dominant topic + label.
 *
 * BandRankingList is a private rendering helper used twice by
 * InterpretBandImportance.
 */
import { useState } from "react";
import type {
  BandCardsFile,
  DocumentCardsFile,
  TopicCardsFile,
} from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

export function InterpretabilityTab({
  isLoading,
  error,
  topics,
  bands,
  docs,
}: {
  isLoading: boolean;
  error: Error | null;
  topics: TopicCardsFile | null;
  bands: BandCardsFile | null;
  docs: DocumentCardsFile | null;
}) {
  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading interpretability cards…
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
          Could not load interpretability cards.
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
      {topics ? <InterpretTopicCardsGrid topics={topics} /> : null}
      {bands ? <InterpretBandImportance bands={bands} /> : null}
      {docs ? (
        <InterpretDocumentSample docs={docs} K={topics?.K ?? 12} />
      ) : null}
    </div>
  );
}

function InterpretTopicCardsGrid({ topics }: { topics: TopicCardsFile }) {
  return (
    <div>
      <h4
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        Topic cards · K = {topics.K}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        One card per LDA topic. Peak wavelength = argmax of φ
        <sub>k</sub>; FWHM = full width at half-max (sharpness of the
        spectral signature). p(label | topic) shows the top-3 classes
        whose documents land on this topic dominantly.
      </p>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {topics.topic_cards.map((c) => {
          const swatch = TOPIC_COLORS[c.topic_k % TOPIC_COLORS.length];
          const topP = c.p_label_given_topic_top3?.[0]?.p ?? 0;
          return (
            <div
              key={c.topic_k}
              className="rounded-lg border p-3 relative overflow-hidden"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                aria-hidden
                style={{ backgroundColor: swatch }}
              />
              <div className="flex items-baseline justify-between mt-1 mb-1.5">
                <div className="flex items-baseline gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: swatch }}
                  />
                  <span
                    className="text-[13px] font-semibold font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    topic {c.topic_k}
                  </span>
                </div>
                <span
                  className="text-[10px] uppercase tracking-widest font-medium"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  λ = {c.peak_wavelength_nm.toFixed(0)} nm
                </span>
              </div>
              <div
                className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] font-mono mb-2"
                style={{ color: "var(--color-fg-faint)" }}
              >
                <span>peak φ = {c.peak_value.toFixed(3)}</span>
                <span>fwhm = {c.fwhm_nm.toFixed(0)} nm</span>
              </div>
              <div
                className="text-[10.5px] uppercase tracking-widest font-semibold mb-1"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Top labels
              </div>
              <div className="space-y-1">
                {c.p_label_given_topic_top3.map((lab) => {
                  const w = topP > 0 ? Math.max(2, (lab.p / topP) * 100) : 0;
                  return (
                    <div
                      key={lab.label_id}
                      className="flex items-baseline gap-2 text-[11.5px]"
                    >
                      <span
                        className="font-mono shrink-0"
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        {lab.label_id}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: "var(--color-fg)" }}
                        title={lab.name}
                      >
                        {lab.name}
                      </span>
                      <span
                        className="ml-auto font-mono text-[10.5px]"
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        {(lab.p * 100).toFixed(1)}%
                      </span>
                      <div
                        className="w-[60px] h-1.5 rounded ml-1 shrink-0"
                        style={{ backgroundColor: "var(--color-border)" }}
                      >
                        <div
                          className="h-1.5 rounded"
                          style={{
                            width: `${w}%`,
                            backgroundColor: swatch,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterpretBandImportance({ bands }: { bands: BandCardsFile }) {
  const TOP = 24;
  const sortedFisher = [...bands.band_cards]
    .sort((a, b) => b.fisher_ratio - a.fisher_ratio)
    .slice(0, TOP);
  const maxFisher = sortedFisher[0]?.fisher_ratio ?? 1;
  const sortedMI = [...bands.band_cards]
    .sort((a, b) => b.mutual_info_vs_label - a.mutual_info_vs_label)
    .slice(0, TOP);
  const maxMI = sortedMI[0]?.mutual_info_vs_label ?? 1;

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
        Band importance · top {TOP} of {bands.n_bands}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Fisher ratio (between-class / within-class variance) ranks bands by
        class separability. Mutual information against label is a
        non-parametric counterpart. Bands at 1100, 1400 and 1900 nm are
        usually water-absorption features.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <BandRankingList
          title="Fisher ratio"
          accent="rgba(40, 160, 80, 1)"
          rows={sortedFisher.map((b) => ({
            label: `band ${b.band_index} · ${b.wavelength_nm.toFixed(0)} nm`,
            value: b.fisher_ratio,
            max: maxFisher,
            p_value: b.p_value,
          }))}
        />
        <BandRankingList
          title="Mutual information"
          accent="rgba(170, 60, 200, 1)"
          rows={sortedMI.map((b) => ({
            label: `band ${b.band_index} · ${b.wavelength_nm.toFixed(0)} nm`,
            value: b.mutual_info_vs_label,
            max: maxMI,
          }))}
        />
      </div>
    </div>
  );
}

function BandRankingList({
  title,
  accent,
  rows,
}: {
  title: string;
  accent: string;
  rows: { label: string; value: number; max: number; p_value?: number }[];
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-widest font-semibold mb-1.5"
        style={{ color: accent }}
      >
        {title}
      </div>
      <div className="space-y-1">
        {rows.map((r, i) => {
          const w = r.max > 0 ? Math.max(2, (r.value / r.max) * 100) : 0;
          return (
            <div
              key={`${title}-${i}`}
              className="flex items-baseline gap-2 text-[11.5px]"
            >
              <span
                className="font-mono w-4 text-right shrink-0"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {i + 1}
              </span>
              <span
                className="font-mono truncate"
                style={{ color: "var(--color-fg)" }}
                title={r.label}
              >
                {r.label}
              </span>
              <span
                className="ml-auto font-mono text-[10.5px] shrink-0"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {r.value.toFixed(r.value >= 1 ? 2 : 3)}
                {r.p_value !== undefined
                  ? ` · p=${r.p_value < 0.0001 ? "<1e-4" : r.p_value.toFixed(3)}`
                  : ""}
              </span>
              <div
                className="w-[120px] h-1.5 rounded shrink-0"
                style={{ backgroundColor: "var(--color-border)" }}
              >
                <div
                  className="h-1.5 rounded"
                  style={{ width: `${w}%`, backgroundColor: accent }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InterpretDocumentSample({
  docs,
  K,
}: {
  docs: DocumentCardsFile;
  K: number;
}) {
  const [showN, setShowN] = useState(24);
  const sample = docs.document_cards.slice(0, showN);

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h4
          className="text-base font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          Document cards · {showN} of {docs.n_documents}
        </h4>
        <div className="flex items-baseline gap-1.5">
          {[12, 24, 48, docs.n_documents].map((n) => (
            <button
              key={`show-${n}`}
              type="button"
              onClick={() => setShowN(Math.min(n, docs.n_documents))}
              className="rounded border px-2 py-0.5 text-[11px] font-mono"
              style={{
                borderColor:
                  showN === n
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                color:
                  showN === n
                    ? "var(--color-accent)"
                    : "var(--color-fg-faint)",
                backgroundColor:
                  showN === n ? "var(--color-accent-soft)" : "transparent",
              }}
            >
              {n === docs.n_documents ? "all" : n}
            </button>
          ))}
        </div>
      </div>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Each row is one document (pixel-as-document). Bar shows θ stacked
        across K = {K} topics coloured by topic. Right columns = dominant
        topic and ground-truth label.
      </p>
      <div className="space-y-1">
        {sample.map((doc) => {
          let acc = 0;
          return (
            <div
              key={doc.doc_id}
              className="flex items-center gap-2 text-[11px]"
            >
              <span
                className="font-mono w-16 shrink-0"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {doc.doc_id}
              </span>
              <div
                className="flex-1 h-3 rounded overflow-hidden flex"
                style={{ backgroundColor: "var(--color-border)" }}
              >
                {doc.theta_full.map((p, k) => {
                  const w = p * 100;
                  acc += w;
                  return (
                    <span
                      key={`${doc.doc_id}-${k}`}
                      style={{
                        width: `${w}%`,
                        backgroundColor:
                          TOPIC_COLORS[k % TOPIC_COLORS.length],
                      }}
                      title={`topic ${k}: ${(p * 100).toFixed(1)}%`}
                    />
                  );
                })}
                {acc < 99.9 ? (
                  <span
                    style={{
                      width: `${100 - acc}%`,
                      backgroundColor: "transparent",
                    }}
                  />
                ) : null}
              </div>
              <span
                className="font-mono text-[10.5px] w-10 text-right shrink-0"
                style={{ color: "var(--color-fg-faint)" }}
              >
                t{doc.topic_k_dominant}
              </span>
              <span
                className="font-mono text-[10.5px] truncate shrink-0 w-32"
                style={{ color: "var(--color-fg)" }}
                title={doc.label_name}
              >
                {doc.label_name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
