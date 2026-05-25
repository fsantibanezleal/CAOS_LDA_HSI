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
 * so the palette stays in sync with the navigation source. All
 * visible strings are wired through i18n at
 * `pages:overview.command_palette.*`.
 *
 * Workspace deep-links emitted from the palette pre-fill a default
 * scene (Indian Pines) + representation (LDA) so the URL restores a
 * populated state instead of dropping the user on the FamilyPicker —
 * fixes the audit-flagged dead-end behaviour of `/workspace?tab=<id>`
 * with no `scene` parameter.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { EXPLORE_PHASES } from "@/pages/workspace/state/tabs";

const DEFAULT_PALETTE_SCENE = "indian-pines-corrected";
const DEFAULT_PALETTE_REP = "lda";

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

const LABELLED_SCENE_IDS = [
  "indian-pines-corrected",
  "salinas-corrected",
  "salinas-a-corrected",
  "pavia-university",
  "kennedy-space-center",
  "botswana",
] as const;

const STATIC_PAGES = [
  { id: "page-overview", key: "overview", href: "/" },
  { id: "page-methodology", key: "methodology", href: "/methodology" },
  { id: "page-databases", key: "databases", href: "/databases" },
  { id: "page-workspace", key: "workspace", href: "/workspace" },
  { id: "page-benchmarks", key: "benchmarks", href: "/benchmarks" },
] as const;

const METHODOLOGY_SUBPAGES = [
  { id: "method-theory", key: "theory", href: "/methodology/theory" },
  {
    id: "method-representations",
    key: "representations",
    href: "/methodology/representations",
  },
  { id: "method-pipeline", key: "pipeline", href: "/methodology/pipeline" },
  {
    id: "method-application",
    key: "application",
    href: "/methodology/application",
  },
] as const;

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
  const { t } = useTranslation(["pages"]);

  const k = (suffix: string) =>
    t(`pages:overview.command_palette.${suffix}` as never) as string;

  const index = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [];
    for (const p of STATIC_PAGES) {
      items.push({
        id: p.id,
        label: k(`pages.${p.key}`),
        group: k("groups.page"),
        href: p.href,
      });
    }
    for (const p of METHODOLOGY_SUBPAGES) {
      items.push({
        id: p.id,
        label: k(`pages.${p.key}`),
        group: k("groups.methodology"),
        href: p.href,
      });
    }
    for (const phase of EXPLORE_PHASES) {
      const phaseLabel = t(
        `pages:workspace.explore_phases.${phase.id}.label` as never,
      ) as string;
      const groupLabel = t(
        "pages:overview.command_palette.groups.workspace_phase",
        { phase: phaseLabel },
      ) as string;
      for (const tab of phase.tabs) {
        items.push({
          id: `tab-${tab.id}`,
          label: t(
            `pages:workspace.tabs.${tab.labelKey}` as never,
          ) as string,
          group: groupLabel,
          href: `/workspace?scene=${DEFAULT_PALETTE_SCENE}&rep=${DEFAULT_PALETTE_REP}&tab=${tab.id}`,
        });
      }
    }
    for (const sceneId of LABELLED_SCENE_IDS) {
      items.push({
        id: `scene-${sceneId}`,
        label: k(`scenes.${sceneId}`),
        group: k("groups.scene"),
        href: `/workspace?scene=${sceneId}`,
      });
    }
    return items;
    // i18n.language is the reactive trigger; t is stable across renders
    // but its return values vary by language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

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
  const itemsCount = t(
    "pages:overview.command_palette.items_other",
    {
      count: results.length,
      defaultValue: `${results.length} items`,
    },
  ) as string;
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
          {k("title")}
        </h2>
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={k("placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent outline-none text-sm"
            style={{ color: "var(--color-fg)" }}
            aria-label={k("search_aria")}
          />
        </div>
        <ul
          role="listbox"
          aria-label={k("results_aria")}
          className="max-h-[360px] overflow-y-auto"
        >
          {results.length === 0 && (
            <li
              className="px-4 py-3 text-sm"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {k("no_matches")}
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
          <span>{k("hint_navigate")}</span>
          <span>{k("hint_open")}</span>
          <span>{k("hint_close")}</span>
          <span className="ml-auto">{itemsCount}</span>
        </div>
      </div>
    </div>
  );
}
