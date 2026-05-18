/**
 * Super-topics tab (extracted from Workspace.tsx in c278 as part of
 * #441 P1 2.1).
 *
 * Renders the hierarchical-clustering super-topic view from
 * `/api/super-topics`: a cut-level selector (4 / 6 / 8 / 10 / 12),
 * a "this scene's topics" table mapping each topic of the current
 * scene to the cluster it falls into (and which OTHER scenes share
 * that cluster), and a grid of every cluster at the current cut
 * with the current scene highlighted.
 */
import { useState } from "react";
import type { SuperTopics } from "@/api/client";
import { TOPIC_COLORS } from "@/components/plots/IntertopicMap";
import { TabEmpty } from "../components/TabStates";

export function SuperTopicsTab({
  sceneId,
  isLoading,
  error,
  data,
}: {
  sceneId: string;
  isLoading: boolean;
  error: Error | null;
  data: SuperTopics | null;
}) {
  const [cutLevel, setCutLevel] = useState<number>(8);

  if (isLoading)
    return (
      <p style={{ color: "var(--color-fg-faint)" }}>Loading super-topics…</p>
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
          Could not load super-topics.
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

  const cuts = data.cuts ?? [];
  const availableCuts = cuts.map((c) => c.cut_level);
  const selectedCut = cuts.find((c) => c.cut_level === cutLevel) ?? cuts[0];
  const sceneTopics = data.members
    .filter((m) => m.scene_id === sceneId)
    .sort((a, b) => a.topic_k - b.topic_k);

  // Build a map: topic_k -> cluster_id at selected cut
  const topicToCluster = new Map<
    number,
    { clusterId: number; sceneSet: string[]; nMembers: number }
  >();
  if (selectedCut) {
    for (const cluster of selectedCut.clusters) {
      for (const member of cluster.members) {
        if (member.scene_id === sceneId) {
          topicToCluster.set(member.topic_k, {
            clusterId: cluster.cluster_id,
            sceneSet: cluster.scene_set,
            nMembers: cluster.n_members,
          });
        }
      }
    }
  }

  return (
    <div className="space-y-6">
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
              "linear-gradient(90deg, rgba(56,189,248,1) 0%, rgba(170,60,200,1) 100%)",
          }}
        />
        <h3
          className="text-lg font-semibold tracking-tight mt-1 mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          Super-topics · cross-scene clustering of all {data.n_topics_total}{" "}
          topics
        </h3>
        <p
          className="text-[12.5px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Hierarchical clustering ({data.linkage_method} linkage,{" "}
          {data.distance}) over the {data.n_topics_total} topics across{" "}
          {data.n_scenes} scenes on the common {data.common_grid.low_nm}–
          {data.common_grid.high_nm} nm grid ({data.common_grid.n_bands}{" "}
          bands). Shows how this scene's topics relate to topics from the
          other {data.n_scenes - 1} scenes at the selected cut level.
        </p>
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className="text-[11px] uppercase tracking-widest font-semibold mr-2"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Cut level (n clusters)
          </span>
          {availableCuts.map((k) => (
            <button
              key={`cut-${k}`}
              type="button"
              onClick={() => setCutLevel(k)}
              className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
              style={{
                borderColor:
                  cutLevel === k
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                color:
                  cutLevel === k
                    ? "var(--color-accent)"
                    : "var(--color-fg-faint)",
                backgroundColor:
                  cutLevel === k
                    ? "var(--color-accent-soft)"
                    : "transparent",
              }}
            >
              K_super = {k}
            </button>
          ))}
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
          This scene&apos;s topics at K_super = {cutLevel}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          For each topic of {sceneId}, the cluster it falls into and the
          other scenes whose topics share that cluster. A cluster shared
          across many scenes = a generic spectral pattern (vegetation,
          soil, water); a singleton cluster = scene-specific signature.
        </p>
        <div className="overflow-x-auto">
          <table
            className="w-full text-[12.5px]"
            style={{ color: "var(--color-fg)" }}
          >
            <thead>
              <tr style={{ color: "var(--color-fg-faint)" }}>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  topic
                </th>
                <th className="text-left font-mono text-[11px] pb-1 pr-3">
                  cluster
                </th>
                <th className="text-right font-mono text-[11px] pb-1 pr-3">
                  cluster size
                </th>
                <th className="text-left font-mono text-[11px] pb-1">
                  shared with scenes
                </th>
              </tr>
            </thead>
            <tbody>
              {sceneTopics.map((m) => {
                const info = topicToCluster.get(m.topic_k);
                const colour =
                  TOPIC_COLORS[(m.topic_k - 1) % TOPIC_COLORS.length];
                const otherScenes = (info?.sceneSet ?? []).filter(
                  (s) => s !== sceneId,
                );
                return (
                  <tr
                    key={`mt-${m.topic_k}`}
                    style={{ borderTop: "1px solid var(--color-border)" }}
                  >
                    <td className="py-1 pr-3 font-mono">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                        style={{ backgroundColor: colour }}
                      />
                      t{m.topic_k}
                    </td>
                    <td className="py-1 pr-3 font-mono">
                      {info ? `#${info.clusterId}` : "—"}
                    </td>
                    <td className="py-1 pr-3 text-right font-mono">
                      {info ? info.nMembers : "—"}
                    </td>
                    <td className="py-1">
                      {otherScenes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {otherScenes.map((sc) => (
                            <span
                              key={`os-${m.topic_k}-${sc}`}
                              className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-mono"
                              style={{
                                backgroundColor: "var(--color-accent-soft)",
                                color: "var(--color-fg-subtle)",
                              }}
                            >
                              {sc}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span
                          className="text-[11px] italic"
                          style={{ color: "var(--color-fg-faint)" }}
                        >
                          singleton (no cross-scene match)
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
          All clusters at K_super = {cutLevel}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Overview of every cluster at this cut level. Highlighted clusters
          contain at least one topic from {sceneId}.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(selectedCut?.clusters ?? []).map((cluster) => {
            const hasCurrent = cluster.scene_set.includes(sceneId);
            return (
              <div
                key={`cluster-${cluster.cluster_id}`}
                className="rounded-lg border p-3"
                style={{
                  borderColor: hasCurrent
                    ? "var(--color-accent)"
                    : "var(--color-border)",
                  backgroundColor: hasCurrent
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                }}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span
                    className="text-[13px] font-semibold font-mono"
                    style={{ color: "var(--color-fg)" }}
                  >
                    cluster #{cluster.cluster_id}
                  </span>
                  <span
                    className="text-[10.5px] font-mono"
                    style={{ color: "var(--color-fg-faint)" }}
                  >
                    n = {cluster.n_members}
                  </span>
                </div>
                <div
                  className="text-[10.5px] uppercase tracking-widest font-semibold mb-1"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  scenes ({cluster.scene_set.length})
                </div>
                <div className="flex flex-wrap gap-1 mb-1">
                  {cluster.scene_set.map((sc) => (
                    <span
                      key={`cl-${cluster.cluster_id}-${sc}`}
                      className="inline-block rounded px-1.5 py-0.5 text-[10.5px] font-mono"
                      style={{
                        backgroundColor:
                          sc === sceneId
                            ? "var(--color-accent)"
                            : "var(--color-bg)",
                        color:
                          sc === sceneId ? "white" : "var(--color-fg-subtle)",
                        border:
                          sc === sceneId
                            ? "1px solid var(--color-accent)"
                            : "1px solid var(--color-border)",
                      }}
                    >
                      {sc}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
