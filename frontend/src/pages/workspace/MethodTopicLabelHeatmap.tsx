/**
 * Per-method topic-to-label probability heatmap. Surfaces F-7's
 * per-topic P(L | topic = k) distributions: each row is a topic,
 * each column a class, the colour is the probability. Hot cells
 * indicate topics aligned to a single class; cool / scattered rows
 * indicate topics that capture mixed-label structure.
 *
 * Fetches the per-method recipe report and reads scene.f7.per_topic
 * (which the backend exposes through /api/v-sweep/methods/:recipe).
 */
import { useEffect, useMemo, useState } from "react";

type PerTopicEntry = {
  topic: number;
  n_docs: number;
  p_topic?: number;
  label_distribution?: number[] | null;
  kl_vs_marginal?: number | null;
};

type F7Detailed = {
  scene_id: string;
  recipe: string;
  K: number;
  n_classes: number;
  classes: number[];
  per_topic?: PerTopicEntry[];
};

export function MethodTopicLabelHeatmap({ recipe }: { recipe: string }) {
  const [scenes, setScenes] = useState<F7Detailed[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    // The recipe report from /api/v-sweep/methods/:recipe carries only
    // the F-7 *summary*. For the per-topic detail we fetch each scene's
    // F-7 shard directly via the static-file path under /generated.
    const scenes6 = [
      "indian-pines-corrected",
      "salinas-corrected",
      "salinas-a-corrected",
      "pavia-university",
      "kennedy-space-center",
      "botswana",
    ];
    Promise.all(
      scenes6.map((scene) =>
        fetch(
          `/generated/v_sweep/f7_topic_to_label/${scene}_${recipe}_uniform_Q8.json`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((all) => {
      if (!alive) return;
      const ok = all.filter((x): x is F7Detailed => x !== null);
      setScenes(ok);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [recipe]);

  if (!loaded) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        Loading topic-label heatmaps...
      </p>
    );
  }
  if (scenes.length === 0) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        No topic-label heatmaps yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p
        className="text-[12.5px] leading-relaxed max-w-3xl"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        Each row of every heatmap is a topic; each column a labelled
        class. Colour = P(label | argmax topic = k). Vertical streaks
        mean the topic concentrates on a single class — good for label
        alignment.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {scenes.map((scene) => (
          <SceneHeatmap key={scene.scene_id} scene={scene} />
        ))}
      </div>
    </div>
  );
}

function SceneHeatmap({ scene }: { scene: F7Detailed }) {
  const K = scene.K;
  const C = scene.n_classes;
  const cellSize = 14;
  const grid = useMemo(() => {
    const rows = (scene.per_topic ?? []).filter((r) => r.label_distribution);
    return rows.map((r) => r.label_distribution as number[]);
  }, [scene]);
  const first = grid[0];
  if (grid.length === 0 || !first || first.length === 0) {
    return (
      <div
        className="rounded-md border p-3"
        style={{ borderColor: "var(--color-border)" }}
      >
        <h4 className="text-[12px] font-mono mb-1">{scene.scene_id}</h4>
        <p className="text-[11px]" style={{ color: "var(--color-fg-subtle)" }}>
          No per-topic data.
        </p>
      </div>
    );
  }

  const width = C * cellSize + 24;
  const height = K * cellSize + 24;

  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "var(--color-border)" }}
    >
      <h4
        className="text-[12px] font-mono mb-2"
        style={{ color: "var(--color-fg)" }}
      >
        {scene.scene_id} (K={K}, C={C})
      </h4>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Topic-label heatmap for ${scene.scene_id}`}
        style={{ display: "block" }}
      >
        {grid.map((row, k) =>
          row.map((p, c) => {
            const intensity = Math.max(0, Math.min(1, p));
            const r = Math.round(40 + 215 * intensity);
            const g = Math.round(50 + 120 * intensity);
            const b = Math.round(110 - 95 * intensity);
            return (
              <rect
                key={`${k}-${c}`}
                x={24 + c * cellSize}
                y={k * cellSize}
                width={cellSize - 1}
                height={cellSize - 1}
                fill={`rgb(${r},${g},${b})`}
              >
                <title>
                  topic {k}, class {scene.classes[c]}: P = {p.toFixed(3)}
                </title>
              </rect>
            );
          }),
        )}
        {Array.from({ length: K }, (_, k) => (
          <text
            key={`k-${k}`}
            x={20}
            y={k * cellSize + cellSize * 0.75}
            fontSize={10}
            textAnchor="end"
            fill="var(--color-fg-subtle)"
          >
            {k}
          </text>
        ))}
      </svg>
    </div>
  );
}
