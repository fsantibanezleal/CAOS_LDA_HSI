import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  type BandMaskCanonicalComparison,
  type BandMaskComparisonEntry,
  type BandMaskIndex,
  type BandMaskSummary,
} from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

/**
 * Step 8 band-mask sweep tab (cycles 126 + 127).
 *
 * Renders four band-restricted LDA refits per labelled scene as a
 * 4-card picker; on selection drills into a `BandMaskDetailCard` with
 * top-words + P(L|t) tables plus the cycle-127 canonical comparison
 * panel. Above the picker, a `BandMaskComparisonOverview` table shows
 * all 4 masks side-by-side for the current scene (paired ARI / swap
 * rate / KL on P(L|t)).
 */
export function BandMaskTab({
  sceneId,
  isLoading,
  error,
  index,
}: {
  sceneId: string;
  isLoading: boolean;
  error: Error | null;
  index: BandMaskIndex | null;
}) {
  const [maskId, setMaskId] = useState<string | null>(null);
  const summaryQ = useQuery({
    queryKey: ["band-mask-summary", sceneId, maskId],
    queryFn: () => api.bandMaskSummary(sceneId, maskId!),
    enabled: maskId !== null,
    staleTime: 30 * 60_000,
  });
  // The canonical-comparison fetch is intentionally eager once the user
  // lands on the bandmask tab: the BandMaskComparisonOverview table is
  // the first thing they see. sceneId in the queryKey ensures a
  // SceneQuickSwitch invalidates the cache rather than re-using a
  // stale dataset's table.
  const comparisonQ = useQuery({
    queryKey: ["band-masks-comparison", sceneId],
    queryFn: () => api.bandMasksCanonicalComparison(),
    enabled: !!sceneId,
    staleTime: 30 * 60_000,
  });

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading band-mask index…
      </p>
    );
  if (error)
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <p style={{ color: "var(--color-warn)" }}>
          Could not load /api/band-masks: {error.message}
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Run{" "}
          <span className="font-mono">
            scripts/local.* build-band-masked-topic-models
          </span>{" "}
          to generate the index locally.
        </p>
      </div>
    );
  if (!index) return null;

  const sceneEntries = index.entries.filter((e) => e.scene_id === sceneId);
  const maskDefs = index.mask_definitions;

  return (
    <div className="space-y-5">
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
          Step 8 · band-mask sweep
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Four band-restricted LDA fits per labelled scene, each one a
          fresh canonical-K refit on a band-restricted corpus. The user
          can ask: "what would the topics look like if we only saw the
          VNIR / SWIR / non-water-corrupted / top-50-discriminative
          bands?". Hyperparameters mirror the canonical fit (V1
          band-frequency, online VB, α=0.45, η=0.20, seed=42) so only
          the band-selection axis differs. The summary below ships
          precomputed; click any mask to drill into the per-topic detail.
        </p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(maskDefs).map(([id, def]) => {
            const entry = sceneEntries.find((e) => e.mask_id === id);
            const skipped = entry?.skipped ?? false;
            const isSel = maskId === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => !skipped && setMaskId(isSel ? null : id)}
                  disabled={skipped}
                  className="w-full text-left rounded-md border p-3 transition-all"
                  style={{
                    borderColor: isSel
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    backgroundColor: isSel
                      ? "var(--color-accent-soft)"
                      : "var(--color-bg)",
                    opacity: skipped ? 0.4 : 1,
                    cursor: skipped ? "not-allowed" : "pointer",
                  }}
                >
                  <div
                    className="font-mono text-[13px] font-semibold mb-0.5"
                    style={{
                      color: isSel
                        ? "var(--color-accent)"
                        : "var(--color-fg)",
                    }}
                  >
                    {def.label}
                  </div>
                  <div
                    className="text-[11.5px] leading-snug mb-1"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    {def.description}
                  </div>
                  {skipped ? (
                    <div
                      className="text-[11px] font-mono"
                      style={{ color: "var(--color-warn)" }}
                    >
                      skipped: {entry?.reason}
                    </div>
                  ) : entry ? (
                    <div
                      className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11.5px] font-mono mt-1.5"
                      style={{ color: "var(--color-fg-subtle)" }}
                    >
                      <span>
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          bands:{" "}
                        </span>
                        <span style={{ color: "var(--color-fg)" }}>
                          {entry.n_bands_kept}/{entry.n_bands_full}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          K:{" "}
                        </span>
                        <span style={{ color: "var(--color-fg)" }}>
                          {entry.topic_count}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          ppl:{" "}
                        </span>
                        <span style={{ color: "var(--color-fg)" }}>
                          {entry.perplexity_train?.toFixed(2) ?? "—"}
                        </span>
                      </span>
                      <span>
                        <span style={{ color: "var(--color-fg-faint)" }}>
                          ARI:{" "}
                        </span>
                        <span style={{ color: "var(--color-fg)" }}>
                          {entry.ari_dominant_vs_label?.toFixed(3) ?? "—"}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--color-fg-faint)" }}
                    >
                      not built for this scene
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p
          className="text-[11px] mt-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          ARI = adjusted-Rand-index of{" "}
          <span className="font-mono">argmax θ_d</span> vs ground-truth
          label. Lower perplexity is better; higher ARI is better.
          Compare to the canonical (no-mask) fit on the{" "}
          <span className="font-mono">topics</span> /{" "}
          <span className="font-mono">topiclabel</span> tabs.
        </p>
      </div>

      {comparisonQ.data && (
        <BandMaskComparisonOverview
          sceneId={sceneId}
          comparison={comparisonQ.data}
        />
      )}

      {maskId && summaryQ.data && (
        <BandMaskDetailCard
          summary={summaryQ.data}
          comparison={
            comparisonQ.data?.entries.find(
              (e) => e.scene_id === sceneId && e.mask_id === maskId,
            ) ?? null
          }
        />
      )}
      {maskId && summaryQ.isLoading && (
        <p style={{ color: "var(--color-fg-faint)" }}>
          Loading {maskId} summary…
        </p>
      )}
      {maskId && summaryQ.error && (
        <p style={{ color: "var(--color-warn)" }}>
          Could not load {maskId} summary:{" "}
          {(summaryQ.error as Error).message}
        </p>
      )}
    </div>
  );
}

function BandMaskDetailCard({
  summary,
  comparison,
}: {
  summary: BandMaskSummary;
  comparison: BandMaskComparisonEntry | null;
}) {
  const K = summary.topic_count;
  return (
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
          {summary.mask_label}
        </h4>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {summary.mask_description}
        </p>
      </header>
      <div className="grid sm:grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        <BandMaskStat
          label="bands kept"
          value={`${summary.n_bands_kept}/${summary.n_bands_full}`}
        />
        <BandMaskStat label="K" value={String(K)} />
        <BandMaskStat
          label="D"
          value={summary.document_count.toLocaleString()}
        />
        <BandMaskStat
          label="V"
          value={summary.vocabulary_size.toLocaleString()}
        />
        <BandMaskStat
          label="perplexity (train)"
          value={summary.perplexity_train.toFixed(3)}
        />
        <BandMaskStat
          label="ARI vs label"
          value={summary.ari_dominant_vs_label.toFixed(4)}
        />
      </div>
      <div
        className="rounded-md border p-3 text-[11.5px] mb-3"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-fg-faint)",
        }}
      >
        Wavelength range kept:{" "}
        {summary.wavelengths_nm_kept_first_last[0].toFixed(1)} –{" "}
        {summary.wavelengths_nm_kept_first_last[1].toFixed(1)} nm
        {" · "}
        first ten bands kept:{" "}
        <span className="font-mono">
          {summary.kept_band_indices.slice(0, 10).join(", ")}
        </span>
        {summary.kept_band_indices.length > 10 ? ", …" : ""}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <div>
          <h5
            className="text-[12px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Top words per topic (λ=0.5)
          </h5>
          <ul className="space-y-1.5 text-[12px]">
            {summary.top_words_per_topic_lambda_05.map((words, k) => {
              const color =
                TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
              return (
                <li
                  key={k}
                  className="grid grid-cols-[60px_1fr] gap-2 items-baseline"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  <span
                    className="inline-flex items-center gap-1.5 font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    t{k + 1}
                  </span>
                  <span className="font-mono text-[11.5px]">
                    {words.slice(0, 8).join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h5
            className="text-[12px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            P(label | topic dominant)
          </h5>
          <ul className="space-y-1.5 text-[12px]">
            {summary.p_label_given_topic_dominant.map((labels, k) => {
              const sorted = [...labels]
                .sort((a, b) => b.p - a.p)
                .slice(0, 3);
              const color =
                TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
              return (
                <li
                  key={k}
                  className="grid grid-cols-[60px_1fr] gap-2 items-baseline"
                  style={{ color: "var(--color-fg-subtle)" }}
                >
                  <span
                    className="inline-flex items-center gap-1.5 font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    t{k + 1}
                  </span>
                  <span className="font-mono text-[11.5px]">
                    {sorted
                      .map(
                        (l) =>
                          `${l.name} ${(l.p * 100).toFixed(0)}%`,
                      )
                      .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {comparison && !comparison.skipped && (
        <div
          className="mt-5 rounded-md border p-3"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-bg)",
          }}
        >
          <div
            className="text-[11px] uppercase tracking-wider mb-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            vs canonical fit (cycle 127 post-processor)
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <BandMaskStat
              label="paired ARI dominant"
              value={
                comparison.paired_ari_dominant_topics != null
                  ? comparison.paired_ari_dominant_topics.toFixed(4)
                  : "—"
              }
            />
            <BandMaskStat
              label="swap rate (Hungarian)"
              value={
                comparison.swap_rate_under_hungarian_alignment != null
                  ? `${(
                      comparison.swap_rate_under_hungarian_alignment *
                      100
                    ).toFixed(1)}%`
                  : "—"
              }
            />
            <BandMaskStat
              label="KL P(L|t) mean"
              value={
                comparison.kl_p_label_given_topic_mean != null
                  ? comparison.kl_p_label_given_topic_mean.toFixed(2)
                  : "—"
              }
            />
            <BandMaskStat
              label="KL P(L|t) max"
              value={
                comparison.kl_p_label_given_topic_max != null
                  ? comparison.kl_p_label_given_topic_max.toFixed(2)
                  : "—"
              }
            />
          </div>
          <p
            className="text-[11.5px] mb-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Paired ARI measures how much the dominant-topic assignments
            shift under the mask (1.0 = identical; 0.0 = unrelated).
            Swap rate counts, under a Hungarian alignment of topic ids,
            the fraction of pixels whose dominant topic changed. KL is
            the mean / max KL divergence between canonical P(L|t) and
            masked P(L|t) for the Hungarian-aligned topic pairs (higher
            = the masked fit assigns labels very differently to its
            matched topics).
          </p>
          {comparison.hungarian_assignment && (
            <div className="text-[11.5px]">
              <div
                className="text-[10.5px] uppercase tracking-wider mb-1"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Hungarian topic-id alignment (canonical → masked)
              </div>
              <div className="flex flex-wrap gap-2 font-mono">
                {Object.entries(comparison.hungarian_assignment)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([can, mas]) => (
                    <span
                      key={can}
                      className="rounded-sm border px-1.5 py-0.5"
                      style={{
                        borderColor: "var(--color-border)",
                        color: "var(--color-fg)",
                      }}
                    >
                      t{Number(can) + 1}→t{(mas as number) + 1}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BandMaskComparisonOverview({
  sceneId,
  comparison,
}: {
  sceneId: string;
  comparison: BandMaskCanonicalComparison;
}) {
  const sceneEntries = comparison.entries.filter(
    (e) => e.scene_id === sceneId && !e.skipped,
  );
  if (sceneEntries.length === 0) return null;
  return (
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
        Canonical-vs-masked comparison (all masks for this scene)
      </h4>
      <p
        className="text-[12.5px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Cycle-127 read-only post-processor. Paired ARI =
        adjusted-Rand-index of the dominant-topic map under the mask vs
        the canonical fit on pixels labelled in both. Swap rate =
        fraction of pixels whose Hungarian-aligned dominant topic
        differs. Lower paired ARI / higher swap rate ⇒ the masked fit
        yields a substantially different topic assignment than the
        canonical fit.
      </p>
      <table
        className="w-full text-[12px]"
        style={{ color: "var(--color-fg)" }}
      >
        <thead>
          <tr style={{ color: "var(--color-fg-faint)" }}>
            <th className="text-left font-mono text-[11px] pb-1 pr-3">
              mask
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              paired ARI
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              swap rate
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              KL mean
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              KL max
            </th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              ARI vs label
            </th>
            <th className="text-right font-mono text-[11px] pb-1">ppl</th>
          </tr>
        </thead>
        <tbody>
          {sceneEntries.map((e) => (
            <tr
              key={e.mask_id}
              style={{ borderTop: "1px solid var(--color-border)" }}
            >
              <td className="py-1 pr-3 font-mono">{e.mask_id}</td>
              <td className="py-1 pr-3 text-right font-mono">
                {e.paired_ari_dominant_topics != null
                  ? e.paired_ari_dominant_topics.toFixed(4)
                  : "—"}
              </td>
              <td className="py-1 pr-3 text-right font-mono">
                {e.swap_rate_under_hungarian_alignment != null
                  ? `${(
                      e.swap_rate_under_hungarian_alignment * 100
                    ).toFixed(1)}%`
                  : "—"}
              </td>
              <td className="py-1 pr-3 text-right font-mono">
                {e.kl_p_label_given_topic_mean != null
                  ? e.kl_p_label_given_topic_mean.toFixed(2)
                  : "—"}
              </td>
              <td className="py-1 pr-3 text-right font-mono">
                {e.kl_p_label_given_topic_max != null
                  ? e.kl_p_label_given_topic_max.toFixed(2)
                  : "—"}
              </td>
              <td className="py-1 pr-3 text-right font-mono">
                {e.ari_dominant_vs_label_masked != null
                  ? e.ari_dominant_vs_label_masked.toFixed(3)
                  : "—"}
              </td>
              <td className="py-1 text-right font-mono">
                {e.perplexity_train_masked != null
                  ? e.perplexity_train_masked.toFixed(2)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BandMaskStat({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md border p-2.5"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[10.5px] uppercase tracking-wider"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </div>
      <div
        className="text-[14px] font-mono mt-0.5"
        style={{ color: "var(--color-fg)" }}
      >
        {value}
      </div>
    </div>
  );
}
