import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Q_TRAJECTORY_AXES,
  vSweepQTrajectory,
  type QTrajectoryAxis,
  type VSweepQTrajectory,
} from "@/api/v-sweep";

/**
 * Q-trajectory tab (id "qtraj") — Step / Manipulate.
 *
 * Pick a wordification recipe (V1..V20) and an evaluation axis, and see
 * how *refining the quantisation Q* (Q ∈ {8, 16, 32}) moves that
 * representation's score. Reads GET /api/v-sweep/q-trajectory and
 * renders a hand-rolled multi-line SVG: one faint line per labelled
 * scene plus the bold cross-scene mean. The point of the tab is that
 * the representation (recipe × Q) is the independent variable here —
 * e.g. V20 F-7 climbs 0.52 → 0.53 → 0.56 across Q, while V8 F-18 stays
 * flat at ~0.96. Live refit is not supported; all cells are precomputed
 * sweep shards.
 */

// The 19 built recipes the v-sweep evaluates (V16 = foundation-model
// scaffold, no artefacts — matches app/routers/content.py _V_SWEEP_RECIPES).
const RECIPE_IDS = [
  "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10",
  "V11", "V12", "V13", "V14", "V15", "V17", "V18", "V19", "V20",
];

const Q_LEVELS = [8, 16, 32] as const;

// Stable palette for per-scene lines (hand-rolled, no chart lib).
const SCENE_COLORS = [
  "rgba(56, 189, 248, 1)",
  "rgba(40, 160, 80, 1)",
  "rgba(234, 179, 8, 1)",
  "rgba(170, 60, 200, 1)",
  "rgba(244, 63, 94, 1)",
  "rgba(214, 100, 60, 1)",
  "rgba(20, 184, 166, 1)",
];

const AXIS_HELP: Record<QTrajectoryAxis, string> = {
  "F-1": "classification macro-F1 (topic-routed soft, per-fold mean) — higher is better",
  "F-2": "topic-word coherence c_v — higher is better",
  "F-7": "topic-to-label normalised mutual information — higher is better",
  "F-14": "mean pairwise top-token Jaccard (repetitiveness) — lower is better",
  "F-18": "mean seed-matched topic cosine (reliability) — higher is better",
  "F-22": "counterfactual median L1 to flip argmax topic (robustness) — higher is better",
};

function shortScene(sceneId: string): string {
  return sceneId.replace(/-corrected$/, "").replace(/-/g, " ");
}

export function QTrajectoryTab() {
  const [recipe, setRecipe] = useState<string>("V20");
  const [axis, setAxis] = useState<QTrajectoryAxis>("F-7");

  const traj = useQuery({
    queryKey: ["v-sweep-q-trajectory", recipe, axis],
    queryFn: () => vSweepQTrajectory(recipe, axis),
    staleTime: 30 * 60_000,
  });

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
              "linear-gradient(90deg, rgba(234,179,8,1) 0%, rgba(170,60,200,1) 100%)",
          }}
        />
        <h3
          className="text-lg font-semibold tracking-tight mt-1 mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          Q-trajectory · how quantisation refines a representation
        </h3>
        <p
          className="text-[12.5px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Hold the wordification recipe fixed and refine the quantisation
          granularity Q ∈ {"{8, 16, 32}"}. The chart shows how this
          representation's score on the chosen axis moves — the bold line
          is the mean across the six labelled scenes, faint lines are
          per-scene. This makes <em>the representation</em> the independent
          variable: e.g. V20 / F-7 climbs across Q, while V8 / F-18 stays
          flat. All cells are precomputed sweep shards (no live refit).
        </p>

        <AxisPicker
          label="recipe"
          options={RECIPE_IDS}
          value={recipe}
          onChange={setRecipe}
        />
        <AxisPicker
          label="axis"
          options={Q_TRAJECTORY_AXES as unknown as string[]}
          value={axis}
          onChange={(v) => setAxis(v as QTrajectoryAxis)}
        />
        <p
          className="mt-2 text-[11.5px] italic"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {axis}: {AXIS_HELP[axis]}
        </p>
      </div>

      {traj.isLoading ? (
        <p style={{ color: "var(--color-fg-faint)" }}>
          Loading {recipe} · {axis} trajectory…
        </p>
      ) : traj.error ? (
        <div
          className="rounded-lg border p-6"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
          }}
        >
          <p style={{ color: "var(--color-warn)" }}>
            Could not load the Q-trajectory.
          </p>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {(traj.error as Error).message}
          </p>
        </div>
      ) : traj.data ? (
        <QTrajectoryChartCard data={traj.data} recipe={recipe} axis={axis} />
      ) : null}
    </div>
  );
}

function AxisPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap mb-1">
      <span
        className="text-[10.5px] uppercase tracking-widest font-semibold w-12"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const isActive = o === value;
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className="rounded border px-2 py-0.5 text-[11.5px] font-mono"
              style={{
                borderColor: isActive
                  ? "var(--color-accent)"
                  : "var(--color-border)",
                color: isActive
                  ? "var(--color-accent)"
                  : "var(--color-fg-subtle)",
                backgroundColor: isActive
                  ? "var(--color-accent-soft)"
                  : "transparent",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type ScenePoint = { q: number; value: number };
type SceneSeries = { sceneId: string; color: string; points: ScenePoint[] };

function QTrajectoryChartCard({
  data,
  recipe,
  axis,
}: {
  data: VSweepQTrajectory;
  recipe: string;
  axis: QTrajectoryAxis;
}) {
  // Levels actually present, in Q order.
  const levels = useMemo(
    () =>
      Q_LEVELS.filter((q) => data.trajectory[`Q=${q}`] !== undefined).map(
        (q) => ({ q, level: data.trajectory[`Q=${q}`]! }),
      ),
    [data],
  );

  // All scene ids seen across any level, stable colour assignment.
  const sceneIds = useMemo(() => {
    const seen: string[] = [];
    for (const { level } of levels) {
      for (const sc of Object.keys(level.per_scene)) {
        if (!seen.includes(sc)) seen.push(sc);
      }
    }
    return seen.sort();
  }, [levels]);

  const sceneSeries = useMemo<SceneSeries[]>(
    () =>
      sceneIds.map((sceneId, i) => ({
        sceneId,
        color: SCENE_COLORS[i % SCENE_COLORS.length]!,
        points: levels
          .filter(({ level }) => level.per_scene[sceneId] !== undefined)
          .map(({ q, level }) => ({ q, value: level.per_scene[sceneId]! })),
      })),
    [sceneIds, levels],
  );

  const meanPoints = useMemo<ScenePoint[]>(
    () => levels.map(({ q, level }) => ({ q, value: level.mean })),
    [levels],
  );

  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{
    label: string;
    q: number;
    value: number;
  } | null>(null);

  if (levels.length === 0) {
    return (
      <div
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <p style={{ color: "var(--color-fg-faint)" }}>
          No Q-trajectory shards exist for {recipe} on {axis} yet. Try
          another recipe or axis.
        </p>
      </div>
    );
  }

  // Chart geometry.
  const W = 560;
  const H = 300;
  const PAD_L = 52;
  const PAD_R = 130;
  const PAD_T = 18;
  const PAD_B = 40;

  const allValues: number[] = [
    ...meanPoints.map((p) => p.value),
    ...sceneSeries.flatMap((s) =>
      hidden.has(s.sceneId) ? [] : s.points.map((p) => p.value),
    ),
  ];
  const vLo = Math.min(...allValues);
  const vHi = Math.max(...allValues);
  const pad = (vHi - vLo) * 0.12 || 0.02;
  const yMin = vLo - pad;
  const yMax = vHi + pad;

  const qVals = levels.map((l) => l.q);
  const qMin = Math.min(...qVals);
  const qMax = Math.max(...qVals);

  const px = (q: number) =>
    qMin === qMax
      ? PAD_L + (W - PAD_L - PAD_R) / 2
      : PAD_L + ((q - qMin) / (qMax - qMin)) * (W - PAD_L - PAD_R);
  const py = (v: number) =>
    yMax === yMin
      ? PAD_T + (H - PAD_T - PAD_B) / 2
      : H - PAD_B - ((v - yMin) / (yMax - yMin)) * (H - PAD_T - PAD_B);

  const polyline = (pts: ScenePoint[]) =>
    pts.map((p) => `${px(p.q).toFixed(1)},${py(p.value).toFixed(1)}`).join(" ");

  const toggle = (sceneId: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });

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
        className="text-base font-semibold mb-1"
        style={{ color: "var(--color-fg)" }}
      >
        {recipe} · {axis}
        {data.lower_is_better ? " (lower is better)" : " (higher is better)"}
      </h4>
      <p
        className="text-[12px] mb-3"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Shows how refining quantisation Q changes this representation's
        score. {hover ? (
          <span className="font-mono" style={{ color: "var(--color-fg)" }}>
            {hover.label} @ Q={hover.q}: {hover.value.toFixed(4)}
          </span>
        ) : (
          <span>Hover a point to read its value; click a legend entry to toggle a scene.</span>
        )}
      </p>

      <div className="flex flex-col lg:flex-row gap-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`${recipe} ${axis} Q-trajectory`}
          style={{ color: "var(--color-fg)", maxWidth: W }}
        >
          {/* axes */}
          <line
            x1={PAD_L}
            y1={H - PAD_B}
            x2={W - PAD_R}
            y2={H - PAD_B}
            stroke="var(--color-border)"
          />
          <line
            x1={PAD_L}
            y1={PAD_T}
            x2={PAD_L}
            y2={H - PAD_B}
            stroke="var(--color-border)"
          />
          {/* y ticks */}
          {[yMin, (yMin + yMax) / 2, yMax].map((v, i) => (
            <g key={`y-${i}`}>
              <line
                x1={PAD_L}
                y1={py(v)}
                x2={W - PAD_R}
                y2={py(v)}
                stroke="var(--color-border)"
                strokeDasharray="2 3"
                opacity={i === 0 ? 0 : 0.4}
              />
              <text
                x={PAD_L - 6}
                y={py(v) + 3}
                textAnchor="end"
                fontSize="10"
                fontFamily="ui-monospace, monospace"
                fill="var(--color-fg-faint)"
              >
                {v.toFixed(3)}
              </text>
            </g>
          ))}
          {/* x ticks (Q levels) */}
          {levels.map(({ q }) => (
            <text
              key={`x-${q}`}
              x={px(q)}
              y={H - PAD_B + 16}
              textAnchor="middle"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
              fill="var(--color-fg-faint)"
            >
              Q={q}
            </text>
          ))}
          <text
            x={(PAD_L + (W - PAD_R)) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-fg-faint)"
          >
            quantisation level
          </text>

          {/* faint per-scene lines */}
          {sceneSeries.map((s) =>
            hidden.has(s.sceneId) || s.points.length === 0 ? null : (
              <g key={s.sceneId}>
                <polyline
                  points={polyline(s.points)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="1.2"
                  opacity="0.45"
                />
                {s.points.map((p) => (
                  <circle
                    key={`${s.sceneId}-${p.q}`}
                    cx={px(p.q)}
                    cy={py(p.value)}
                    r="2.5"
                    fill={s.color}
                    opacity="0.6"
                    onMouseEnter={() =>
                      setHover({
                        label: shortScene(s.sceneId),
                        q: p.q,
                        value: p.value,
                      })
                    }
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: "pointer" }}
                  />
                ))}
              </g>
            ),
          )}

          {/* bold mean line */}
          <polyline
            points={polyline(meanPoints)}
            fill="none"
            stroke="var(--color-fg)"
            strokeWidth="2.6"
          />
          {meanPoints.map((p) => (
            <circle
              key={`mean-${p.q}`}
              cx={px(p.q)}
              cy={py(p.value)}
              r="4.5"
              fill="var(--color-fg)"
              stroke="var(--color-bg)"
              strokeWidth="1.5"
              onMouseEnter={() =>
                setHover({ label: "mean", q: p.q, value: p.value })
              }
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            />
          ))}
          {meanPoints.map((p) => (
            <text
              key={`meanlbl-${p.q}`}
              x={px(p.q)}
              y={py(p.value) - 9}
              textAnchor="middle"
              fontSize="10"
              fontFamily="ui-monospace, monospace"
              fontWeight="700"
              fill="var(--color-fg)"
            >
              {p.value.toFixed(3)}
            </text>
          ))}
        </svg>

        {/* legend (toggles) */}
        <div className="flex flex-col gap-1.5 text-[12px]">
          <div
            className="flex items-center gap-2"
            style={{ color: "var(--color-fg)" }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 18,
                height: 3,
                backgroundColor: "var(--color-fg)",
              }}
            />
            <span className="font-semibold">mean ({meanPoints.length} Q)</span>
          </div>
          {sceneSeries.map((s) => {
            const off = hidden.has(s.sceneId);
            return (
              <button
                key={s.sceneId}
                type="button"
                onClick={() => toggle(s.sceneId)}
                className="flex items-center gap-2 text-left"
                style={{
                  color: off ? "var(--color-fg-faint)" : "var(--color-fg)",
                  opacity: off ? 0.5 : 1,
                  textDecoration: off ? "line-through" : "none",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 18,
                    height: 3,
                    backgroundColor: s.color,
                  }}
                />
                <span className="font-mono">{shortScene(s.sceneId)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <table
        className="w-full text-[12.5px] mt-4"
        style={{ color: "var(--color-fg)" }}
      >
        <thead>
          <tr style={{ color: "var(--color-fg-faint)" }}>
            <th className="text-left font-mono text-[11px] pb-1 pr-3">Q</th>
            <th className="text-right font-mono text-[11px] pb-1 pr-3">
              mean
            </th>
            <th className="text-right font-mono text-[11px] pb-1">scenes</th>
          </tr>
        </thead>
        <tbody>
          {levels.map(({ q, level }) => (
            <tr key={q} style={{ borderTop: "1px solid var(--color-border)" }}>
              <td className="py-1 pr-3 font-mono">Q={q}</td>
              <td className="py-1 pr-3 text-right font-mono">
                {level.mean.toFixed(4)}
              </td>
              <td
                className="py-1 text-right font-mono text-[11px]"
                style={{ color: "var(--color-fg-faint)" }}
              >
                {level.n_scenes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
