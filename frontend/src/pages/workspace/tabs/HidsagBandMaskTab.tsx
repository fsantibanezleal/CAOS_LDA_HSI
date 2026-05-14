import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  api,
  type BandMaskHidsagIndex,
  type BandMaskHidsagSummary,
} from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";

import { UnmixingStat } from "../components/StatCard";

/**
 * HIDSAG band-mask sweep tab (cycle 139, data from cycle 138).
 *
 * Mirrors `BandMaskTab.tsx` (which is for the 6 labelled VNIR+SWIR
 * scenes) but adapted for HIDSAG's per-document (not per-pixel)
 * structure and per-covariate (not per-label) ground-truth metadata:
 *
 *   - 4-card picker per (subset, mask) tuple with the same 4 masks as
 *     labelled scenes (vnir / swir / no_water / top_50_fisher; the
 *     last replaced with top-50 between-covariate variance for HIDSAG)
 *   - On selection: BandMaskHidsagDetailCard with top-words per topic
 *     + P(covariate | topic_dominant) tables
 *
 * No spatial overlay (HIDSAG has no H×W grid); the per-doc theta
 * matrix is shipped in the summary payload and rendered as a stacked
 * bar (one column per doc, K stripes per column).
 */
export function HidsagBandMaskTab({
  subsetCode,
  isLoading,
  error,
  index,
}: {
  subsetCode: string;
  isLoading: boolean;
  error: Error | null;
  index: BandMaskHidsagIndex | null;
}) {
  const [maskId, setMaskId] = useState<string | null>(null);
  const summaryQ = useQuery({
    queryKey: ["band-mask-hidsag-summary", subsetCode, maskId],
    queryFn: () => api.bandMasksHidsagSummary(subsetCode, maskId!),
    enabled: maskId !== null,
    staleTime: 30 * 60_000,
  });

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>
        Loading HIDSAG band-mask index…
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
          Could not load /api/band-masks-hidsag: {error.message}
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Run{" "}
          <span className="font-mono">
            scripts/local.* build-band-masked-topic-models-hidsag
          </span>{" "}
          to generate locally.
        </p>
      </div>
    );
  if (!index) return null;

  const subsetEntries = index.entries.filter(
    (e) => e.subset_code === subsetCode,
  );
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
          HIDSAG band-mask sweep · subset {subsetCode}
        </h4>
        <p
          className="text-sm mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Four band-restricted canonical-K LDA refits on the{" "}
          <span className="font-mono">{index.modality}</span> modality
          (cycle 138). Same masks as the labelled-scene sweep on{" "}
          <span className="font-mono">bandmask</span> tab, but with two
          HIDSAG-specific adaptations: (1) no spatial overlay — outputs
          are per-document (D = ~tens to hundreds), not per-pixel; (2){" "}
          <span className="font-mono">top_50_fisher</span> selects the
          50 bands with the largest{" "}
          <em>between-covariate variance share</em> rather than Fisher
          discriminant on labels (HIDSAG has no per-pixel label —{" "}
          covariates are sample-level tags like lithology / mineralogy).
        </p>
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(maskDefs).map(([id, def]) => {
            const entry = subsetEntries.find((e) => e.mask_id === id);
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
                          conf:{" "}
                        </span>
                        <span style={{ color: "var(--color-fg)" }}>
                          {entry.mean_confidence?.toFixed(3) ?? "—"}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div
                      className="text-[11px]"
                      style={{ color: "var(--color-fg-faint)" }}
                    >
                      not built for this subset
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {maskId && summaryQ.data && (
        <HidsagBandMaskDetailCard summary={summaryQ.data} />
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

function HidsagBandMaskDetailCard({
  summary,
}: {
  summary: BandMaskHidsagSummary;
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
        <UnmixingStat
          label="bands kept"
          value={`${summary.n_bands_kept}/${summary.n_bands_full}`}
        />
        <UnmixingStat label="K" value={String(K)} />
        <UnmixingStat
          label="D (docs)"
          value={summary.document_count.toLocaleString()}
        />
        <UnmixingStat
          label="V (vocab)"
          value={summary.vocabulary_size.toLocaleString()}
        />
        <UnmixingStat
          label="perplexity (train)"
          value={summary.perplexity_train.toFixed(3)}
        />
        <UnmixingStat
          label="mean confidence"
          value={summary.mean_confidence.toFixed(3)}
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
        Modality: <span className="font-mono">{summary.modality}</span>
        {" · "}
        wavelength range kept:{" "}
        {summary.wavelengths_nm_kept_first_last[0].toFixed(1)} –{" "}
        {summary.wavelengths_nm_kept_first_last[1].toFixed(1)} nm
        {" · "}
        first ten bands kept:{" "}
        <span className="font-mono">
          {summary.kept_band_indices.slice(0, 10).join(", ")}
        </span>
        {summary.kept_band_indices.length > 10 ? ", …" : ""}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
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
            P(covariate | topic dominant)
          </h5>
          <ul className="space-y-1.5 text-[12px]">
            {summary.p_covariate_given_topic_dominant.map((covs, k) => {
              const sorted = [...covs]
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
                    {sorted.length === 0
                      ? "(no docs dominant)"
                      : sorted
                          .map(
                            (c) =>
                              `${c.covariate} ${(c.p * 100).toFixed(0)}%`,
                          )
                          .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div>
        <h5
          className="text-[12px] uppercase tracking-widest font-semibold mb-2"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Per-document θ stack ({summary.document_count} docs · K = {K})
        </h5>
        <p
          className="text-[11px] mb-2"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Each column is one document; the vertical stripes show its
          θ_d simplex. Documents are ordered by dominant topic so blocks
          of the same colour cluster together.
        </p>
        <ThetaPerDocStack
          theta={summary.theta_per_doc}
          K={K}
          covariates={summary.covariates}
        />
      </div>
    </div>
  );
}

function ThetaPerDocStack({
  theta,
  K,
  covariates,
}: {
  theta: number[][];
  K: number;
  covariates: string[];
}) {
  // Order docs by argmax θ for visual grouping
  const ordered = theta
    .map((row, idx) => ({ row, idx, dom: row.indexOf(Math.max(...row)) }))
    .sort((a, b) => a.dom - b.dom || b.row[a.dom]! - a.row[b.dom]!);
  const D = ordered.length;
  const W = Math.min(600, Math.max(120, D * 4));
  const H = 120;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        backgroundColor: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 4,
        display: "block",
      }}
      aria-label="Per-document θ stack"
    >
      {ordered.map((o, x) => {
        let y = H;
        return (
          <g
            key={o.idx}
            transform={`translate(${(x * W) / D}, 0)`}
          >
            <title>
              doc {o.idx + 1} · {covariates[o.idx] ?? "?"} · dom t
              {o.dom + 1}
            </title>
            {Array.from({ length: K }, (_, k) => {
              const p = o.row[k] ?? 0;
              const h = p * H;
              y -= h;
              const color =
                TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
              return (
                <rect
                  key={k}
                  x={0}
                  y={y}
                  width={Math.max(1, W / D - 0.5)}
                  height={h}
                  fill={color}
                />
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
