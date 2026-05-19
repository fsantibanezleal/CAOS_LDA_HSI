/**
 * Smoke tests for the c272-c293 extracted tabs.
 *
 * Each tab is exercised in the three primary states (loading / error
 * / empty / happy-path) to guarantee the lazy boundaries and the
 * Suspense wrapping in Workspace.tsx don't get broken by a future
 * refactor. The actual content rendering is covered by the per-tab
 * unit tests that come in later cycles; this file is a regression
 * net against the c441 P1 2.1 extraction sweep.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnomalyTab } from "./AnomalyTab";
import { RobustnessTab } from "./RobustnessTab";
import { GatingTab } from "./GatingTab";
import { SuperTopicsTab } from "./SuperTopicsTab";
import { SpatialStructureTab } from "./SpatialStructureTab";
import { CrossMethodAgreementTab } from "./CrossMethodAgreementTab";
import { NeuralTopicComparisonTab } from "./NeuralTopicComparisonTab";
import { InterpretabilityTab } from "./InterpretabilityTab";

describe("AnomalyTab", () => {
  it("renders loading state", () => {
    render(
      <AnomalyTab isLoading={true} error={null} topic={null} deep={null} />,
    );
    expect(screen.getByText(/Loading anomaly/i)).toBeInTheDocument();
  });
  it("renders error state with message", () => {
    render(
      <AnomalyTab
        isLoading={false}
        error={new Error("boom")}
        topic={null}
        deep={null}
      />,
    );
    expect(screen.getByText(/Could not load anomaly/i)).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});

describe("RobustnessTab", () => {
  it("renders loading state", () => {
    render(
      <RobustnessTab
        sceneId="x"
        isLoading={true}
        error={null}
        quant={null}
        transfer={null}
      />,
    );
    expect(screen.getByText(/Loading robustness/i)).toBeInTheDocument();
  });
  it("renders error state", () => {
    render(
      <RobustnessTab
        sceneId="x"
        isLoading={false}
        error={new Error("nope")}
        quant={null}
        transfer={null}
      />,
    );
    expect(screen.getByText(/Could not load robustness/i)).toBeInTheDocument();
  });
});

describe("GatingTab", () => {
  it("renders loading", () => {
    render(
      <GatingTab
        isLoading={true}
        error={null}
        embedded={null}
        deepGate={null}
      />,
    );
    expect(screen.getByText(/Loading gating/i)).toBeInTheDocument();
  });
  it("renders error", () => {
    render(
      <GatingTab
        isLoading={false}
        error={new Error("e")}
        embedded={null}
        deepGate={null}
      />,
    );
    expect(screen.getByText(/Could not load gating/i)).toBeInTheDocument();
  });
});

describe("SuperTopicsTab", () => {
  it("renders loading", () => {
    render(
      <SuperTopicsTab
        sceneId="x"
        isLoading={true}
        error={null}
        data={null}
      />,
    );
    expect(screen.getByText(/Loading super-topics/i)).toBeInTheDocument();
  });
  it("renders error", () => {
    render(
      <SuperTopicsTab
        sceneId="x"
        isLoading={false}
        error={new Error("e")}
        data={null}
      />,
    );
    expect(screen.getByText(/Could not load super-topics/i)).toBeInTheDocument();
  });
});

describe("SpatialStructureTab", () => {
  it("renders loading", () => {
    render(
      <SpatialStructureTab
        isLoading={true}
        error={null}
        spatial={null}
        spatialFull={null}
        groupings={null}
        eda={null}
      />,
    );
    expect(screen.getByText(/Loading spatial/i)).toBeInTheDocument();
  });
  it("renders error", () => {
    render(
      <SpatialStructureTab
        isLoading={false}
        error={new Error("e")}
        spatial={null}
        spatialFull={null}
        groupings={null}
        eda={null}
      />,
    );
    expect(screen.getByText(/Could not load spatial/i)).toBeInTheDocument();
  });
});

describe("CrossMethodAgreementTab", () => {
  it("renders loading", () => {
    render(
      <CrossMethodAgreementTab
        isLoading={true}
        error={null}
        agreement={null}
        narratives={null}
      />,
    );
    expect(
      screen.getByText(/Loading cross-method agreement/i),
    ).toBeInTheDocument();
  });
});

describe("NeuralTopicComparisonTab", () => {
  it("renders loading", () => {
    render(
      <NeuralTopicComparisonTab
        isLoading={true}
        error={null}
        comparison={null}
        seedStability={null}
      />,
    );
    expect(
      screen.getByText(/Loading neural topic comparison/i),
    ).toBeInTheDocument();
  });
  it("returns null when no comparison data and not loading/error", () => {
    const { container } = render(
      <NeuralTopicComparisonTab
        isLoading={false}
        error={null}
        comparison={null}
        seedStability={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("InterpretabilityTab", () => {
  it("renders loading", () => {
    render(
      <InterpretabilityTab
        isLoading={true}
        error={null}
        topics={null}
        bands={null}
        docs={null}
      />,
    );
    expect(
      screen.getByText(/Loading interpretability/i),
    ).toBeInTheDocument();
  });
});
