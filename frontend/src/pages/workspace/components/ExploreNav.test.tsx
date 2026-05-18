/**
 * ExploreNav (c132 + c246) tests. Pin the two-tier tablist a11y
 * structure: outer phase-tabs with id + aria-controls; inner
 * tabpanel labelled by the active phase tab; non-color "contains
 * active tab" signal (WCAG 1.4.1).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { TFunction } from "i18next";
import { ExploreNav } from "./ExploreNav";
import { EXPLORE_PHASES } from "../state/tabs";

// Minimal i18n shim — the component reads pages:workspace.tabs.* labels.
const t = ((key: string) => {
  const fallback = key.split(".").pop() ?? key;
  return fallback;
}) as unknown as TFunction<["pages"]>;

describe("ExploreNav", () => {
  it("renders one tablist per phase row + one panel wrapping the sub-tablist", () => {
    render(<ExploreNav tab="raw" setTab={() => undefined} t={t} />);
    // Outer phase tablist
    expect(
      screen.getByRole("tablist", { name: /workspace phase/i }),
    ).toBeInTheDocument();
    // Phase panel for the active phase
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby");
  });

  it("phase tabs carry id + aria-controls + aria-selected", () => {
    render(<ExploreNav tab="raw" setTab={() => undefined} t={t} />);
    const phaseTablist = screen.getByRole("tablist", { name: /workspace phase/i });
    const tabs = within(phaseTablist).getAllByRole("tab");
    // Sanity: 6 phases (Data, Topics, Geometry, Drilldown, Manipulate, Stability)
    expect(tabs).toHaveLength(EXPLORE_PHASES.length);
    for (const t of tabs) {
      expect(t.id).toMatch(/^phase-tab-/);
      expect(t.getAttribute("aria-controls")).toMatch(/^phase-panel-/);
      expect(t.getAttribute("aria-selected")).toMatch(/^(true|false)$/);
    }
  });

  it("Exactly one phase tab is aria-selected", () => {
    render(<ExploreNav tab="raw" setTab={() => undefined} t={t} />);
    const phaseTablist = screen.getByRole("tablist", { name: /workspace phase/i });
    const tabs = within(phaseTablist).getAllByRole("tab");
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
  });

  it("non-active phase containing the active tab gets a textual '· active' marker", () => {
    // raw is in phase 'data'. Click 'topics' phase to make 'data' inactive
    // while still containing the active tab; the marker must be textual.
    render(<ExploreNav tab="raw" setTab={() => undefined} t={t} />);
    // Initially 'data' phase is active (raw is in it). Click 'topics':
    const phaseTablist = screen.getByRole("tablist", { name: /workspace phase/i });
    const tabs = within(phaseTablist).getAllByRole("tab");
    const topicsTab = tabs.find((b) =>
      /Topics/i.test(b.textContent ?? ""),
    );
    if (topicsTab) fireEvent.click(topicsTab);
    // 'data' phase should still mark itself as containing the active tab
    // via the textual '· active' suffix.
    expect(screen.getByText("· active")).toBeInTheDocument();
  });

  it("clicking a sub-tab invokes setTab with the tab id", () => {
    const setTab = vi.fn();
    render(<ExploreNav tab="raw" setTab={setTab} t={t} />);
    // sub-tablist for the active phase
    const subTablist = screen.getByRole("tablist", { name: /panels/i });
    const subTabs = within(subTablist).getAllByRole("tab");
    if (subTabs[0]) fireEvent.click(subTabs[0]);
    expect(setTab).toHaveBeenCalled();
  });
});
