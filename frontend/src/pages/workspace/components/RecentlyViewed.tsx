/**
 * Recently-viewed-scenes chip strip for the Workspace > Explore step.
 *
 * Persists the last 5 (scene, rep) tuples to localStorage and shows
 * them as small clickable chips below SceneQuickSwitch. Researchers
 * frequently want to flip back to "the last scene I had open with
 * topic 4 selected" — this affordance does not yet exist (#442 P1).
 *
 * The history is updated by `useTrackRecentScene` which the
 * ExploreStep wrapper calls with the current (scene, rep) tuple on
 * mount + on change. The chips render only when the persisted set
 * is non-empty and contains at least one entry other than the
 * currently-active scene.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "caos-lda-hsi.recent-scenes";
const MAX_ENTRIES = 5;

export type RecentEntry = {
  scene: string;
  rep: string;
  ts: number;
};

const SCENE_LABEL: Record<string, string> = {
  "indian-pines-corrected": "Indian Pines",
  "salinas-corrected": "Salinas",
  "salinas-a-corrected": "Salinas-A",
  "pavia-university": "Pavia U",
  "kennedy-space-center": "KSC",
  "botswana": "Botswana",
  GEOMET: "GEOMET",
  MINERAL1: "MINERAL1",
  MINERAL2: "MINERAL2",
  GEOCHEM: "GEOCHEM",
  PORPHYRY: "PORPHYRY",
};

function loadHistory(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is RecentEntry =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as RecentEntry).scene === "string" &&
        typeof (e as RecentEntry).rep === "string" &&
        typeof (e as RecentEntry).ts === "number",
    );
  } catch {
    return [];
  }
}

function saveHistory(history: RecentEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* quota exceeded; silently drop */
  }
}

/** Track the active (scene, rep) and push it to the localStorage
 *  history when it changes. Returns the current history (used by
 *  RecentlyViewed to render chips). */
export function useTrackRecentScene(
  scene: string | null,
  rep: string | null,
): RecentEntry[] {
  const [history, setHistory] = useState<RecentEntry[]>(() => loadHistory());

  useEffect(() => {
    if (!scene || !rep) return;
    setHistory((prev) => {
      const filtered = prev.filter((e) => !(e.scene === scene && e.rep === rep));
      const next: RecentEntry[] = [
        { scene, rep, ts: Date.now() },
        ...filtered,
      ].slice(0, MAX_ENTRIES);
      saveHistory(next);
      return next;
    });
  }, [scene, rep]);

  return history;
}

export function RecentlyViewed({
  currentScene,
  currentRep,
  history,
}: {
  currentScene: string | null;
  currentRep: string | null;
  history: RecentEntry[];
}) {
  const navigate = useNavigate();
  // Exclude the currently-active tuple — chip list is "things to
  // jump BACK to", not "you are here".
  const others = history.filter(
    (e) => !(e.scene === currentScene && e.rep === currentRep),
  );
  if (others.length === 0) return null;
  return (
    <div
      className="rounded-lg border p-2 mb-4 flex items-baseline gap-2 flex-wrap"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
      }}
      role="group"
      aria-label="Recently viewed scenes"
    >
      <span
        className="text-[10.5px] uppercase tracking-widest font-semibold pr-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        Recently viewed
      </span>
      {others.map((e) => {
        const label = SCENE_LABEL[e.scene] ?? e.scene;
        return (
          <button
            key={`${e.scene}|${e.rep}|${e.ts}`}
            type="button"
            onClick={() =>
              navigate(`/workspace?scene=${encodeURIComponent(e.scene)}&rep=${encodeURIComponent(e.rep)}`)
            }
            className="rounded border px-2.5 py-1 text-[12px] inline-flex items-baseline gap-1.5 transition-colors hover:opacity-90"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--color-fg-subtle)",
              backgroundColor: "transparent",
            }}
          >
            <span className="font-mono">{label}</span>
            <span
              className="text-[10.5px]"
              style={{ color: "var(--color-fg-faint)" }}
            >
              · {e.rep}
            </span>
          </button>
        );
      })}
    </div>
  );
}
