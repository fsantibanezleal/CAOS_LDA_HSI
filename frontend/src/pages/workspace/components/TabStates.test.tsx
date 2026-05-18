/**
 * TabLoading / TabEmpty / TabError (cycle 226) — shared placeholders
 * used across Workspace tabs. Tests cover defaults, custom messages,
 * the retry-button hook, and accessibility roles.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TabEmpty, TabError, TabLoading } from "./TabStates";

describe("TabLoading", () => {
  it("renders default 'Loading…' and has role=status", () => {
    render(<TabLoading />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Loading…/)).toBeInTheDocument();
  });

  it("honours custom message", () => {
    render(<TabLoading message="Cooking topics" />);
    expect(screen.getByText("Cooking topics")).toBeInTheDocument();
  });
});

describe("TabEmpty", () => {
  it("renders default empty state without 'detail'", () => {
    render(<TabEmpty />);
    expect(screen.getByText(/No data available/i)).toBeInTheDocument();
  });

  it("renders detail when provided", () => {
    render(<TabEmpty message="No labels" detail="/api/topic-views/foo" />);
    expect(screen.getByText("No labels")).toBeInTheDocument();
    expect(screen.getByText("/api/topic-views/foo")).toBeInTheDocument();
  });
});

describe("TabError", () => {
  it("renders role=alert", () => {
    render(<TabError />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders Retry button when onRetry is supplied and fires the callback", () => {
    const onRetry = vi.fn();
    render(<TabError onRetry={onRetry} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("omits Retry button when onRetry is undefined", () => {
    render(<TabError />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
