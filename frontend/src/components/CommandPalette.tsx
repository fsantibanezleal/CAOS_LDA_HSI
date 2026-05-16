/**
 * Global Ctrl+K (⌘K on macOS) command palette over the app surface.
 *
 * Indexes:
 *   - the 5 top-level pages (Overview, Methodology, Databases,
 *     Workspace, Benchmarks)
 *   - the 4 Methodology sub-pages
 *   - the 28 Workspace tabs via EXPLORE_PHASES
 *   - the 6 labelled scenes (jump straight to /workspace?scene=…)
 *
 * The palette is overlay-modal (z-50, fixed inset, dimmed backdrop)
 * with a fuzzy substring filter and keyboard navigation
 * (Arrow Up/Down, Enter, Esc). Closing on backdrop click and on
 * navigation. Accessibility: role=dialog with aria-modal,
 * aria-labelledby; the input is autofocused.
 *
 * Source of truth for the tab list is `pages/workspace/state/tabs.ts`
 * so the palette stays in sync with the navigation source.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";

import { EXPLORE_PHASES } from "@/pages/workspace/state/tabs";

type CommandItem = {
  /** Stable id, used as React key. */
  id: string;
  /** Short label shown in the list. */
  label: string;
  /** Secondary line (e.g. parent page / phase). */
  group: string;
  /** Route to push when this item is selected. */
  href: string;
};

const LABELLED_SCENES: { id: string; label: string }[] = [
  { id: "indian-pines-corrected", label: "Indian Pines" },
  { id: "salinas-corrected", label: "Salinas" },
  { id: "salinas-a-corrected", label: "Salinas-A" },
  { id: "pavia-university", label: "Pavia U" },
  { id: "kennedy-space-center", label: "Kennedy Space Center" },
  { id: "botswana", label: "Botswana" },
];

const STATIC_ITEMS: CommandItem[] = [
  { id: "page-overview", label: "Overview", group: "Page", href: "/" },
  { id: "page-methodology", label: "Methodology", group: "Page",
    href: "/methodology" },
  { id: "page-databases", label: "Databases", group: "Page",
    href: "/databases" },
  { id: "page-workspace", label: "Workspace", group: "Page",
    href: "/workspace" },
  { id: "page-benchmarks", label: "Benchmarks", group: "Page",
    href: "/benchmarks" },
  // Methodology sub-pages (paths inferred from the route tree)
  { id: "method-theory", label: "Theory", group: "Methodology",
    href: "/methodology/theory" },
  { id: "method-representations", label: "Representations",
    group: "Methodology", href: "/methodology/representations" },
  { id: "method-pipeline", label: "Pipeline", group: "Methodology",
    href: "/methodology/pipeline" },
  { id: "method-application", label: "Application", group: "Methodology",
    href: "/methodology/application" },
];

function buildIndex(): CommandItem[] {
  const items: CommandItem[] = [...STATIC_ITEMS];
  // Workspace tabs
  for (const phase of EXPLORE_PHASES) {
    for (const tab of phase.tabs) {
      items.push({
        id: `tab-${tab.id}`,
        label: tab.labelKey,
        group: `Workspace › ${phase.label}`,
        href: `/workspace?tab=${tab.id}`,
      });
    }
  }
  // Direct scene shortcuts
  for (const scene of LABELLED_SCENES) {
    items.push({
      id: `scene-${scene.id}`,
      label: `Open ${scene.label}`,
      group: "Scene",
      href: `/workspace?scene=${scene.id}`,
    });
  }
  return items;
}

function fuzzyMatch(item: CommandItem, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    item.group.toLowerCase().includes(q) ||
    item.href.toLowerCase().includes(q)
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const index = useMemo(() => buildIndex(), []);
  const results = useMemo(
    () => index.filter((i) => fuzzyMatch(i, query)),
    [index, query],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIdx(0);
  }, []);

  const choose = useCallback(
    (item: CommandItem | undefined) => {
      if (!item) return;
      close();
      navigate(item.href);
    },
    [close, navigate],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tgt = e.target as HTMLElement | null;
      const inField =
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.tagName === "SELECT" ||
          tgt.isContentEditable);
      // Ctrl+K / Cmd+K opens the palette
      if (
        (e.key === "k" || e.key === "K") &&
        (e.ctrlKey || e.metaKey)
      ) {
        // Only open when not already in a field — the user pressing
        // Ctrl+K inside a textarea is editing.
        if (!inField || open) {
          e.preventDefault();
          setOpen((v) => !v);
        }
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        choose(results[activeIdx]);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, activeIdx, choose, close]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      // micro-defer so the modal mounts before focus
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cmdk-title"
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4"
      onClick={close}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-bg) 70%, transparent)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        className="relative rounded-xl border w-full max-w-[640px] overflow-hidden"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="cmdk-title" className="sr-only">
          Command palette
        </h2>
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Jump to page, tab, or scene…  (Ctrl+K to toggle)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent outline-none text-sm"
            style={{ color: "var(--color-fg)" }}
            aria-label="Search commands"
          />
        </div>
        <ul
          role="listbox"
          aria-label="Command results"
          className="max-h-[360px] overflow-y-auto"
        >
          {results.length === 0 && (
            <li
              className="px-4 py-3 text-sm"
              style={{ color: "var(--color-fg-faint)" }}
            >
              No matches.
            </li>
          )}
          {results.map((item, idx) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => choose(item)}
                className="w-full text-left px-4 py-2 text-sm flex items-baseline gap-3 transition-colors"
                style={{
                  backgroundColor:
                    idx === activeIdx
                      ? "var(--color-accent-soft)"
                      : "transparent",
                  color: "var(--color-fg)",
                }}
              >
                <span className="font-medium">{item.label}</span>
                <span
                  className="text-[11px]"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  {item.group}
                </span>
                <span
                  className="ml-auto text-[10.5px] font-mono"
                  style={{ color: "var(--color-fg-faint)" }}
                >
                  {item.href}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div
          className="px-4 py-2 border-t text-[10.5px] flex gap-3"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg-faint)",
          }}
        >
          <span>↑ ↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
          <span className="ml-auto">{results.length} item{results.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}
