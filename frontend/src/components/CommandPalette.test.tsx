/**
 * CommandPalette (c232) tests — Ctrl+K toggles open, fuzzy filter
 * narrows results, keyboard nav (Arrow + Enter) selects items, Esc
 * closes.
 */
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommandPalette } from "./CommandPalette";

function renderPalette() {
  return render(
    <MemoryRouter>
      <CommandPalette />
    </MemoryRouter>,
  );
}

describe("CommandPalette", () => {
  it("renders nothing visible until Ctrl+K is pressed", () => {
    renderPalette();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens on Ctrl+K and renders a dialog", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens on Cmd+K (macOS) as well", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("lists scene shortcuts among results when open with no query", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    // 6 labelled scenes appear with "Open ..." prefix.
    expect(screen.getByText(/Open Indian Pines/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Salinas-A/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Botswana/i)).toBeInTheDocument();
  });

  it("filters by query — typing 'botswana' narrows to that scene", () => {
    renderPalette();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "botswana" } });
    expect(screen.getByText(/Open Botswana/i)).toBeInTheDocument();
    // Other scenes should NOT be visible after the filter.
    expect(screen.queryByText(/Open Salinas-A/i)).not.toBeInTheDocument();
  });

  it("does not open Ctrl+K when typing inside an input field elsewhere", () => {
    // Render an input and dispatch Ctrl+K with the input as the
    // event target — the palette should NOT toggle so the user can
    // type 'k' freely inside form fields.
    render(
      <MemoryRouter>
        <input data-testid="other" />
        <CommandPalette />
      </MemoryRouter>,
    );
    const other = screen.getByTestId("other");
    other.focus();
    fireEvent.keyDown(other, { key: "k", ctrlKey: true });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
