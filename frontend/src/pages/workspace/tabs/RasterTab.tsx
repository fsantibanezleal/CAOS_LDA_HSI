import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/api/client";
import type { LabelCell, TopDocumentForTopic, TopicToData } from "@/api/client";
import { DominantTopicRaster, type PickInfo } from "@/components/plots/DominantTopicRaster";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import {
  type RoutedPrediction,
  computeRoutedPrediction,
} from "../helpers/routedPrediction";

export function RasterTab({
  isLoading,
  error,
  meta,
  selectedTopic,
  setSelectedTopic,
}: {
  isLoading: boolean;
  error: Error | null;
  meta: TopicToData | null;
  selectedTopic: number | null;
  setSelectedTopic: (k: number | null) => void;
}) {
  const { t } = useTranslation(["pages"]);
  const [pick, setPick] = useState<PickInfo | null>(null);
  const [compareTopic, setCompareTopic] = useState<number | null>(null);

  // Derive served path from the JSON metadata. The pipeline writes a
  // companion .bin in data/derived/topic_to_data/ so the frontend can
  // request it via /generated/topic_to_data/<scene>_dominant_topic_map.bin.
  const buf = useQuery({
    queryKey: ["raster-bin", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/topic_to_data/${meta!.scene_id}_dominant_topic_map.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null,
    retry: false,
  });

  // Cycle 121 per-pixel theta sidecar. Loaded **only when the user
  // first clicks a pixel** so users who never click pay zero bandwidth.
  // Sizes range from 168 KB (Salinas-A) to 18 MB (Botswana); the fetch
  // is a single round-trip per scene per session, cached for 30 min.
  // (Cycle 131: gate on pick !== null instead of mount-time so the
  // bandwidth bill is opt-in.)
  const thetaGrid = useQuery({
    queryKey: ["theta-grid", meta?.scene_id],
    queryFn: () => {
      const path = `/generated/topic_to_data/${meta!.scene_id}_theta_grid.bin`;
      return api.buffer(path);
    },
    enabled: meta !== null && !!meta?.theta_grid && pick !== null,
    retry: false,
    staleTime: 30 * 60_000,
  });

  const overlapStats = useMemo(() => {
    if (!buf.data || !meta) return null;
    if (selectedTopic === null || compareTopic === null) return null;
    if (selectedTopic === compareTopic) return null;
    const grid = new Uint8Array(buf.data);
    const [h, w] = meta.spatial_shape;
    const SENT = 255;
    let countA = 0;
    let countB = 0;
    let labelled = 0;
    let adjacent = 0;
    for (let i = 0; i < grid.length; i++) {
      const t = grid[i]!;
      if (t === SENT || t >= meta.topic_count) continue;
      labelled++;
      if (t === selectedTopic) countA++;
      else if (t === compareTopic) countB++;
    }
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const t = grid[r * w + c]!;
        if (t !== selectedTopic) continue;
        if (c + 1 < w) {
          const tr = grid[r * w + c + 1]!;
          if (tr === compareTopic) adjacent++;
        }
        if (r + 1 < h) {
          const td = grid[(r + 1) * w + c]!;
          if (td === compareTopic) adjacent++;
        }
        if (c > 0) {
          const tl = grid[r * w + c - 1]!;
          if (tl === compareTopic) adjacent++;
        }
        if (r > 0) {
          const tu = grid[(r - 1) * w + c]!;
          if (tu === compareTopic) adjacent++;
        }
      }
    }
    return { countA, countB, labelled, adjacent };
  }, [buf.data, meta, selectedTopic, compareTopic]);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading raster metadata…</p>
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
          Could not load topic_to_data.
        </p>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {error.message}
        </p>
      </div>
    );
  if (!meta) return null;

  const labels =
    selectedTopic !== null
      ? meta.p_label_given_topic_dominant[selectedTopic]
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
            Mapa espacial — topic dominante por pixel
          </h4>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cada pixel labelled se coloured por su topic dominante
            (arg-max θ_d). Mueve el cursor sobre el raster para inspeccionar
            row/col + topic; click para fijar la lectura. Select un
            topic abajo para aislar su huella espacial.
          </p>
        </header>

        <div className="grid lg:grid-cols-[auto_1fr] gap-6 items-start">
          {buf.isLoading && (
            <p style={{ color: "var(--color-fg-faint)" }}>
              Descargando raster ({meta.spatial_shape[0]}×
              {meta.spatial_shape[1]} pixels)…
            </p>
          )}
          {buf.error && (
            <p style={{ color: "var(--color-warn)" }}>
              Could not load the raster: {String(buf.error)}
            </p>
          )}
          {buf.data && (
            <DominantTopicRaster
              buffer={buf.data}
              shape={meta.spatial_shape}
              sentinelUnlabelled={255}
              topicCount={meta.topic_count}
              selectedTopic={selectedTopic}
              compareTopic={compareTopic}
              onPick={(p) => setPick(p)}
            />
          )}

          <div className="space-y-3">
            <div
              className="rounded-md border p-3 text-[13px] leading-relaxed"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg)",
                color: "var(--color-fg-subtle)",
              }}
            >
              <div
                className="text-[11px] uppercase tracking-wider mb-1"
                style={{ color: "var(--color-fg-faint)" }}
              >
                Pinned pixel
              </div>
              {pick ? (
                <div className="font-mono">
                  ({pick.row}, {pick.col}) → topic{" "}
                  {pick.topic === null ? "—" : pick.topic + 1}
                </div>
              ) : (
                <span style={{ color: "var(--color-fg-faint)" }}>
                  Click any pixel on the raster.
                </span>
              )}
            </div>

            {pick && meta.theta_grid && (
              <PixelDetailCard
                pick={pick}
                meta={meta}
                thetaGridBuffer={thetaGrid.data ?? null}
                isLoading={thetaGrid.isLoading}
                onSelectTopic={(k) =>
                  setSelectedTopic(k === selectedTopic ? null : k)
                }
              />
            )}

            <div>
              <div
                className="text-[11px] uppercase tracking-wider mb-2"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {t("pages:workspace.raster_isolate_topic")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedTopic(null)}
                  className="rounded-md border px-2.5 py-1 text-[12px]"
                  style={{
                    borderColor:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    backgroundColor:
                      selectedTopic === null
                        ? "var(--color-accent-soft)"
                        : "var(--color-panel)",
                    color:
                      selectedTopic === null
                        ? "var(--color-accent)"
                        : "var(--color-fg-subtle)",
                  }}
                >
                  Todos
                </button>
                {Array.from({ length: meta.topic_count }, (_, k) => {
                  const isSel = selectedTopic === k;
                  const color =
                    TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setSelectedTopic(isSel ? null : k)
                      }
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
                      topic {k + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedTopic !== null && (
              <div>
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Compare with
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCompareTopic(null)}
                    className="rounded-md border px-2.5 py-1 text-[12px]"
                    style={{
                      borderColor:
                        compareTopic === null
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                      backgroundColor:
                        compareTopic === null
                          ? "var(--color-accent-soft)"
                          : "var(--color-panel)",
                      color:
                        compareTopic === null
                          ? "var(--color-accent)"
                          : "var(--color-fg-subtle)",
                    }}
                  >
                    none
                  </button>
                  {Array.from({ length: meta.topic_count }, (_, k) => {
                    const isCmp = compareTopic === k;
                    const isPrimary = selectedTopic === k;
                    const color =
                      TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
                    return (
                      <button
                        key={k}
                        type="button"
                        disabled={isPrimary}
                        onClick={() =>
                          setCompareTopic(isCmp ? null : k)
                        }
                        className="rounded-md border px-2.5 py-1 text-[12px] inline-flex items-center gap-1.5"
                        style={{
                          borderColor: isCmp
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                          backgroundColor: isCmp
                            ? "var(--color-accent-soft)"
                            : "var(--color-panel)",
                          color: isPrimary
                            ? "var(--color-fg-faint)"
                            : isCmp
                              ? "var(--color-fg)"
                              : "var(--color-fg-subtle)",
                          opacity: isPrimary ? 0.4 : 1,
                          cursor: isPrimary ? "not-allowed" : "pointer",
                        }}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        topic {k + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {overlapStats && selectedTopic !== null && compareTopic !== null && (
              <div
                className="rounded-md border p-3 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Pairwise overlap — topic {selectedTopic + 1} vs topic{" "}
                  {compareTopic + 1}
                </div>
                <ul className="space-y-1.5">
                  <li
                    className="flex items-center gap-2"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[
                            selectedTopic % TOPIC_COLORS.length
                          ] ?? "#0ea5e9",
                      }}
                    />
                    <span className="flex-1">
                      topic {selectedTopic + 1} dominant
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.countA}{" "}
                      <span
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        (
                        {overlapStats.labelled > 0
                          ? (
                              (overlapStats.countA /
                                overlapStats.labelled) *
                              100
                            ).toFixed(1)
                          : "0.0"}
                        %)
                      </span>
                    </span>
                  </li>
                  <li
                    className="flex items-center gap-2"
                    style={{ color: "var(--color-fg-subtle)" }}
                  >
                    <span
                      aria-hidden
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{
                        backgroundColor:
                          TOPIC_COLORS[
                            compareTopic % TOPIC_COLORS.length
                          ] ?? "#0ea5e9",
                      }}
                    />
                    <span className="flex-1">
                      topic {compareTopic + 1} dominant
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.countB}{" "}
                      <span
                        style={{ color: "var(--color-fg-faint)" }}
                      >
                        (
                        {overlapStats.labelled > 0
                          ? (
                              (overlapStats.countB /
                                overlapStats.labelled) *
                              100
                            ).toFixed(1)
                          : "0.0"}
                        %)
                      </span>
                    </span>
                  </li>
                  <li
                    className="flex items-center gap-2 pt-1.5"
                    style={{
                      color: "var(--color-fg-subtle)",
                      borderTop: "1px dashed var(--color-border)",
                    }}
                  >
                    <span className="flex-1">
                      4-neighbor adjacency
                    </span>
                    <span
                      className="font-mono"
                      style={{ color: "var(--color-fg)" }}
                    >
                      {overlapStats.adjacent}
                    </span>
                  </li>
                </ul>
                <p
                  className="text-[11px] mt-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Adjacency proxies spatial confusability. Higher = topics
                  share long borders.
                </p>
              </div>
            )}

            {labels && (
              <div
                className="rounded-md border p-3 text-[13px]"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                <div
                  className="text-[11px] uppercase tracking-wider mb-2"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  Label mixture — topic {selectedTopic! + 1}
                </div>
                <ul className="space-y-1">
                  {[...labels]
                    .sort((a, b) => b.p - a.p)
                    .slice(0, 5)
                    .map((l) => (
                      <li
                        key={l.label_id}
                        className="flex items-center gap-2"
                        style={{ color: "var(--color-fg-subtle)" }}
                      >
                        <span
                          aria-hidden
                          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: l.color }}
                        />
                        <span className="flex-1 truncate">{l.name}</span>
                        <span
                          className="font-mono"
                          style={{ color: "var(--color-fg)" }}
                        >
                          {(l.p * 100).toFixed(1)}%
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {selectedTopic !== null &&
          meta.top_documents_per_topic &&
          meta.top_documents_per_topic[selectedTopic] && (
            <TopDocumentsPreview
              topic={selectedTopic}
              docs={meta.top_documents_per_topic[selectedTopic]!}
              labels={
                meta.p_label_given_topic_dominant[selectedTopic] ?? []
              }
              perTopicLabel={meta.p_label_given_topic_dominant}
            />
          )}
      </div>
    </div>
  );
}

// RoutedPrediction + computeRoutedPrediction moved to
// ./workspace/helpers/routedPrediction.ts (cycle 133). Re-export the
// type name as an alias so the existing usages here compile unchanged.

function TopDocumentsPreview({
  topic,
  docs,
  labels,
  perTopicLabel,
}: {
  topic: number;
  docs: TopDocumentForTopic[];
  labels: LabelCell[];
  perTopicLabel: LabelCell[][];
}) {
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  if (docs.length === 0) return null;
  const labelColor = (id: number) =>
    labels.find((l) => l.label_id === id)?.color ?? "var(--color-fg-faint)";
  const top = docs.slice(0, 8);
  const openDoc = openDocId ? top.find((d) => d.doc_id === openDocId) : null;
  return (
    <div
      className="mt-5 rounded-md border p-3 text-[12.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div
        className="text-[11px] uppercase tracking-wider mb-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Top documents — topic {topic + 1}
      </div>
      <p
        className="text-[11.5px] mb-2 leading-snug"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Documents (labelled pixels) ranked by θ at this topic.
        Click a row to see the per-doc topic-routed-soft prediction
        (computed as <span className="font-mono">Σ θ_d[k]·P(L|k)</span>
        with no extra fetch). Δ badge = top-1 prediction disagrees with
        ground truth.
      </p>
      <ul className="space-y-1.5">
        {top.map((d) => {
          const w = Math.min(100, d.theta_k * 100);
          const pred = computeRoutedPrediction(d.theta_full, perTopicLabel);
          const sortedPred = [...pred].sort((a, b) => b.p - a.p);
          const top1 = sortedPred[0];
          const disagree =
            top1 !== undefined && top1.label_id !== d.label_id && top1.p > 0;
          const isOpen = openDocId === d.doc_id;
          return (
            <li key={d.doc_id} className="space-y-1">
              <button
                type="button"
                onClick={() => setOpenDocId(isOpen ? null : d.doc_id)}
                className="w-full grid grid-cols-[110px_1fr_auto_18px] gap-2 items-center text-left"
                style={{ color: "var(--color-fg-subtle)" }}
              >
                <span
                  className="font-mono text-[11.5px]"
                  style={{ color: "var(--color-fg)" }}
                  title={d.doc_id}
                >
                  ({d.xy[0]}, {d.xy[1]})
                </span>
                <div
                  className="h-2 rounded-sm relative"
                  style={{
                    backgroundColor: "var(--color-panel)",
                    border: "1px solid var(--color-border)",
                  }}
                  title={`θ at topic ${topic + 1} = ${d.theta_k.toFixed(3)}`}
                >
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${w}%`,
                      backgroundColor: "var(--color-accent)",
                      opacity: 0.85,
                    }}
                  />
                </div>
                <span
                  className="inline-flex items-center gap-1.5 font-mono text-[11px]"
                  style={{ color: "var(--color-fg)" }}
                >
                  <span
                    aria-hidden
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ backgroundColor: labelColor(d.label_id) }}
                  />
                  <span className="truncate max-w-[120px]" title={d.label_name}>
                    {d.label_name}
                  </span>
                  <span style={{ color: "var(--color-fg-faint)" }}>
                    {d.theta_k.toFixed(2)}
                  </span>
                </span>
                <span
                  className="inline-flex items-center justify-center font-mono text-[11px] font-semibold"
                  style={{
                    color: disagree
                      ? "var(--color-warn)"
                      : "var(--color-fg-faint)",
                  }}
                  title={
                    disagree
                      ? `top-1 prediction (${top1!.name}) ≠ ground truth (${d.label_name})`
                      : `top-1 prediction agrees with ground truth`
                  }
                >
                  {disagree ? "Δ" : "✓"}
                </span>
              </button>
              {isOpen && openDoc?.doc_id === d.doc_id && (
                <DocPredictionPanel doc={d} pred={sortedPred} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DocPredictionPanel({
  doc,
  pred,
}: {
  doc: TopDocumentForTopic;
  pred: RoutedPrediction[];
}) {
  const top5 = pred.slice(0, 5);
  return (
    <div
      className="ml-[120px] mt-1 mb-2 rounded-md border p-2.5 text-[11.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
      }}
    >
      <div
        className="text-[10.5px] uppercase tracking-wider mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Topic-routed-soft prediction · doc {doc.doc_id}
      </div>
      <p
        className="text-[11px] mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        <span className="font-mono">P(L|d) = Σ_k θ_d[k] · P(L|k)</span>
        {" — "}computed from doc&apos;s θ and per-topic label distribution
        (already in the topic_to_data payload).
      </p>
      <ul className="space-y-1">
        {top5.map((p, idx) => {
          const w = Math.min(100, p.p * 100);
          const isGround = p.label_id === doc.label_id;
          const isPred1 = idx === 0;
          return (
            <li
              key={p.label_id}
              className="grid grid-cols-[140px_1fr_56px] gap-2 items-center"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-flex items-center gap-1.5 truncate"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                {isPred1 && (
                  <span
                    className="text-[9.5px] font-mono ml-0.5"
                    style={{ color: "var(--color-accent)" }}
                    title="top-1 routed prediction"
                  >
                    ★
                  </span>
                )}
                {isGround && (
                  <span
                    className="text-[9.5px] font-mono ml-0.5"
                    style={{ color: "var(--color-warn)" }}
                    title="ground-truth label"
                  >
                    ●
                  </span>
                )}
              </span>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
                title={`${(p.p * 100).toFixed(2)}%`}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${w}%`,
                    backgroundColor: isPred1
                      ? "var(--color-accent)"
                      : "var(--color-fg-faint)",
                    opacity: isPred1 ? 0.9 : 0.55,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {(p.p * 100).toFixed(2)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p
        className="text-[10.5px] mt-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        ★ = top-1 routed prediction · ● = ground-truth label · disagreement
        between the two is the "Δ" badge in the row above.
      </p>
    </div>
  );
}

function PixelDetailCard({
  pick,
  meta,
  thetaGridBuffer,
  isLoading,
  onSelectTopic,
}: {
  pick: PickInfo;
  meta: TopicToData;
  thetaGridBuffer: ArrayBuffer | null;
  isLoading: boolean;
  onSelectTopic: (k: number) => void;
}) {
  const K = meta.topic_count;
  const [, w] = meta.spatial_shape;
  const theta = useMemo(() => {
    if (!thetaGridBuffer) return null;
    const view = new Float32Array(thetaGridBuffer);
    const offset = (pick.row * w + pick.col) * K;
    if (offset + K > view.length) return null;
    return Array.from(view.slice(offset, offset + K));
  }, [thetaGridBuffer, pick.row, pick.col, w, K]);

  const sum = theta ? theta.reduce((s, v) => s + v, 0) : 0;
  const hasFit = theta !== null && sum > 1e-6;

  const pred = useMemo(() => {
    if (!hasFit || !theta) return [];
    const p = computeRoutedPrediction(theta, meta.p_label_given_topic_dominant);
    return [...p].sort((a, b) => b.p - a.p).slice(0, 3);
  }, [hasFit, theta, meta.p_label_given_topic_dominant]);

  const orderedThetas = useMemo(() => {
    if (!hasFit || !theta) return [];
    return theta
      .map((v, k) => ({ k, v }))
      .sort((a, b) => b.v - a.v);
  }, [hasFit, theta]);

  if (isLoading) {
    return (
      <div
        className="rounded-md border p-3 text-[12px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-fg-faint)",
        }}
      >
        Loading per-pixel θ sidecar…
      </div>
    );
  }
  if (!hasFit) {
    return (
      <div
        className="rounded-md border p-3 text-[12px]"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-bg)",
          color: "var(--color-fg-faint)",
        }}
      >
        No LDA fit at pixel ({pick.row}, {pick.col}). This pixel was not
        in the labelled sample used to fit LDA (sentinel all-zero θ).
      </div>
    );
  }
  const topK = orderedThetas[0]?.k ?? 0;
  return (
    <div
      className="rounded-md border p-3 text-[12.5px]"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div
          className="text-[11px] uppercase tracking-wider"
          style={{ color: "var(--color-fg-faint)" }}
        >
          θ at ({pick.row}, {pick.col}) · dominant t{topK + 1}
        </div>
        <span
          className="font-mono text-[11px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Σ = {sum.toFixed(3)}
        </span>
      </div>
      <ul className="space-y-1 mb-3">
        {orderedThetas.slice(0, 6).map(({ k, v }) => {
          const wPct = Math.min(100, v * 100);
          const color = TOPIC_COLORS[k % TOPIC_COLORS.length] ?? "#0ea5e9";
          return (
            <li
              key={k}
              className="grid grid-cols-[58px_1fr_44px] gap-2 items-center"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <button
                type="button"
                onClick={() => onSelectTopic(k)}
                className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-left"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                t{k + 1}
              </button>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-panel)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${wPct}%`,
                    backgroundColor: color,
                    opacity: 0.85,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {v.toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
      <div
        className="text-[11px] uppercase tracking-wider mb-1.5"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Routed-soft prediction (top-3)
      </div>
      {pred.length === 0 ? (
        <span
          className="text-[11.5px]"
          style={{ color: "var(--color-fg-faint)" }}
        >
          No per-label distribution at this pixel.
        </span>
      ) : (
        <ul className="space-y-0.5">
          {pred.slice(0, 3).map((p, i) => (
            <li
              key={p.label_id}
              className="grid grid-cols-[150px_1fr_44px] gap-2 items-center text-[11.5px]"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              <span
                className="inline-flex items-center gap-1.5 truncate"
                style={{ color: "var(--color-fg)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: p.color }}
                />
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                {i === 0 && (
                  <span
                    className="text-[9.5px] font-mono"
                    style={{ color: "var(--color-accent)" }}
                  >
                    ★
                  </span>
                )}
              </span>
              <div
                className="h-1.5 rounded-sm relative"
                style={{
                  backgroundColor: "var(--color-panel)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${Math.min(100, p.p * 100)}%`,
                    backgroundColor:
                      i === 0 ? "var(--color-accent)" : "var(--color-fg-faint)",
                    opacity: i === 0 ? 0.9 : 0.5,
                  }}
                />
              </div>
              <span
                className="font-mono text-[11px] text-right"
                style={{ color: "var(--color-fg)" }}
              >
                {(p.p * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <p
        className="text-[10.5px] mt-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Per-pixel θ from <span className="font-mono">theta_grid.bin</span>
        {" "}(cycle 121). Click a topic bar to isolate it on the raster.
      </p>
    </div>
  );
}
