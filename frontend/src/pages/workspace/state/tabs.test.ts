/**
 * Single source-of-truth invariants for Explore tabs (cycle 132 split).
 *
 * These tests pin the relationship between the flat ExploreTab union,
 * the keyboard nav order, the 6-phase grouping, and the tab→wiki map.
 * Drift in any of these would silently break Workspace navigation.
 */
import { describe, expect, it } from "vitest";
import {
  EXPLORE_PHASES,
  EXPLORE_TAB_ORDER,
  TAB_WIKI_PAGE,
  findPhaseFor,
  type ExploreTab,
} from "./tabs";

describe("ExploreTab invariants", () => {
  it("EXPLORE_TAB_ORDER has no duplicates", () => {
    const set = new Set(EXPLORE_TAB_ORDER);
    expect(set.size).toBe(EXPLORE_TAB_ORDER.length);
  });

  it("Every tab in EXPLORE_PHASES appears in EXPLORE_TAB_ORDER", () => {
    for (const phase of EXPLORE_PHASES) {
      for (const tab of phase.tabs) {
        expect(EXPLORE_TAB_ORDER).toContain(tab.id);
      }
    }
  });

  it("Every tab in EXPLORE_TAB_ORDER appears in exactly one phase", () => {
    for (const id of EXPLORE_TAB_ORDER) {
      const hits = EXPLORE_PHASES.filter((p) =>
        p.tabs.some((t) => t.id === id),
      );
      expect(hits, `tab '${id}' must appear in exactly 1 phase`).toHaveLength(1);
    }
  });

  it("Every tab carries a wiki-page mapping", () => {
    for (const id of EXPLORE_TAB_ORDER) {
      expect(TAB_WIKI_PAGE[id]).toBeTruthy();
    }
  });

  it("findPhaseFor returns the phase actually containing each tab", () => {
    for (const id of EXPLORE_TAB_ORDER) {
      const phase = findPhaseFor(id);
      expect(phase.tabs.some((t) => t.id === id)).toBe(true);
    }
  });

  it("findPhaseFor falls back to the first phase for an unknown tab", () => {
    const fallback = findPhaseFor("definitely-not-a-tab" as ExploreTab);
    expect(fallback).toBe(EXPLORE_PHASES[0]);
  });

  it("Exactly 6 phases (Data, Topics, Geometry, Drilldown, Manipulate, Stability)", () => {
    expect(EXPLORE_PHASES).toHaveLength(6);
  });
});
