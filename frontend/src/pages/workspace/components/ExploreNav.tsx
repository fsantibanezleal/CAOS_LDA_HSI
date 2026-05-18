import { useEffect, useState } from "react";
import type { TFunction } from "i18next";

import { cn } from "@/lib/cn";

import type { ExplorePhase, ExploreTab } from "../state/tabs";
import { EXPLORE_PHASES, findPhaseFor } from "../state/tabs";

/**
 * Two-tier tab navigation for the Workspace Explore step (cycle 132).
 *
 * Replaces the cycle-14 wall of 4 rows × N buttons (28 tabs visible at
 * once) with:
 *   1. A primary row of 6 narrative "phases" (Data → Topics → Geometry
 *      → Drilldown → Manipulate → Stability), each shown as a chip with
 *      its tab count.
 *   2. A secondary row of tabs scoped to the active phase.
 *
 * The phase containing the currently-active tab auto-opens on URL load
 * and re-syncs whenever the tab changes externally (SceneQuickSwitch,
 * `[` / `]` keyboard shortcuts).
 */
export function ExploreNav({
  tab,
  setTab,
  t,
}: {
  tab: ExploreTab;
  setTab: (id: ExploreTab) => void;
  t: TFunction<["pages"]>;
}) {
  const currentPhase = findPhaseFor(tab);
  const [activePhaseId, setActivePhaseId] = useState<ExplorePhase["id"]>(
    currentPhase.id,
  );
  useEffect(() => {
    setActivePhaseId(findPhaseFor(tab).id);
  }, [tab]);
  const activePhase =
    EXPLORE_PHASES.find((p) => p.id === activePhaseId) ?? currentPhase;
  return (
    <div className="space-y-2.5">
      <div
        role="tablist"
        aria-label="Workspace phase"
        className="flex flex-wrap gap-1.5"
      >
        {EXPLORE_PHASES.map((phase) => {
          const isActive = phase.id === activePhaseId;
          const isContainingCurrent = phase.id === currentPhase.id;
          const containsActiveSuffix = isContainingCurrent && !isActive ? " — contains active tab" : "";
          return (
            <button
              key={phase.id}
              type="button"
              role="tab"
              id={`phase-tab-${phase.id}`}
              aria-controls={`phase-panel-${phase.id}`}
              aria-selected={isActive}
              aria-label={`${phase.label} (${phase.tabs.length} tabs)${containsActiveSuffix}`}
              onClick={() => setActivePhaseId(phase.id)}
              title={phase.description + (isContainingCurrent && !isActive ? " (contains the active tab)" : "")}
              className={cn(
                "rounded-md border-l-4 border-y border-r px-3.5 py-2 text-[13px] font-semibold transition-all inline-flex items-center gap-2",
                isActive ? "shadow-sm" : "opacity-70 hover:opacity-100",
              )}
              style={{
                // Left-border in phase color gives a non-color-only signal
                // for phases that contain the active tab (WCAG 1.4.1).
                borderLeftColor: isContainingCurrent
                  ? phase.color
                  : isActive
                    ? phase.color
                    : "var(--color-border)",
                borderTopColor: isActive ? phase.color : "var(--color-border)",
                borderBottomColor: isActive ? phase.color : "var(--color-border)",
                borderRightColor: isActive ? phase.color : "var(--color-border)",
                backgroundColor: isActive
                  ? "var(--color-accent-soft)"
                  : "var(--color-panel)",
                color: isActive ? phase.color : "var(--color-fg)",
              }}
            >
              <span>{phase.label}</span>
              <span
                className="font-mono text-[10.5px] rounded-full px-1.5 py-0.5"
                style={{
                  backgroundColor: isActive
                    ? phase.color
                    : "var(--color-bg)",
                  color: isActive ? "#fff" : "var(--color-fg-faint)",
                  border: isActive ? "none" : "1px solid var(--color-border)",
                }}
              >
                {phase.tabs.length}
              </span>
              {isContainingCurrent && !isActive && (
                <span
                  className="text-[10.5px] font-normal italic"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  · active
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`phase-panel-${activePhase.id}`}
        aria-labelledby={`phase-tab-${activePhase.id}`}
      >
        <p
          className="text-[11.5px] italic mb-2.5"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {activePhase.description}
        </p>
        <div
          role="tablist"
          aria-label={`${activePhase.label} panels`}
          className="flex flex-wrap gap-1.5"
        >
          {activePhase.tabs.map((opt) => {
            const isActive = tab === opt.id;
            const label = t(
              `pages:workspace.tabs.${opt.labelKey}` as never,
            ) as string;
            return (
              <button
                key={opt.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setTab(opt.id)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-[13px] transition-all",
                  isActive
                    ? "font-semibold shadow-sm"
                    : "opacity-80 hover:opacity-100",
                )}
                style={{
                  borderColor: isActive
                    ? activePhase.color
                    : "var(--color-border)",
                  backgroundColor: isActive
                    ? "var(--color-accent-soft)"
                    : "var(--color-panel)",
                  color: isActive ? activePhase.color : "var(--color-fg)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
