/**
 * RecentlyViewed (c234) tests — the chip strip + the useTrackRecentScene
 * hook persist (scene, rep) tuples through localStorage and exclude the
 * currently-active tuple from the chip list.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RecentlyViewed, type RecentEntry } from "./RecentlyViewed";

const sample: RecentEntry[] = [
  { scene: "indian-pines-corrected", rep: "lda", ts: 1 },
  { scene: "salinas-corrected", rep: "lda", ts: 2 },
  { scene: "kennedy-space-center", rep: "lda", ts: 3 },
];

beforeEach(() => {
  window.localStorage.clear();
});

describe("RecentlyViewed", () => {
  it("renders chips for entries other than the active tuple", () => {
    render(
      <MemoryRouter>
        <RecentlyViewed
          currentScene="indian-pines-corrected"
          currentRep="lda"
          history={sample}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Salinas/i)).toBeInTheDocument();
    expect(screen.getByText(/KSC/i)).toBeInTheDocument();
    // Active tuple should NOT appear
    expect(screen.queryByText(/Indian Pines/i)).not.toBeInTheDocument();
  });

  it("returns null when only the active tuple is in history", () => {
    const { container } = render(
      <MemoryRouter>
        <RecentlyViewed
          currentScene="indian-pines-corrected"
          currentRep="lda"
          history={[{ scene: "indian-pines-corrected", rep: "lda", ts: 1 }]}
        />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when history is empty", () => {
    const { container } = render(
      <MemoryRouter>
        <RecentlyViewed
          currentScene={null}
          currentRep={null}
          history={[]}
        />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("labels the strip as 'Recently viewed'", () => {
    render(
      <MemoryRouter>
        <RecentlyViewed
          currentScene={null}
          currentRep={null}
          history={sample}
        />
      </MemoryRouter>
    );
    expect(screen.getByText(/Recently viewed/i)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /recently viewed scenes/i }),
    ).toBeInTheDocument();
  });
});
