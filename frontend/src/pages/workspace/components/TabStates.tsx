/**
 * Shared placeholders for the three "non-content" states every
 * Workspace tab can be in: loading, empty, and error. Replaces the
 * 14+ ad-hoc `<p>Loading…</p>` / `if (!data) return null` / inline
 * error strings scattered across Workspace.tsx (issue #442 P2).
 *
 * Each component is intentionally lightweight: a single rounded
 * border card with a centred message, no spinner, no animation —
 * matches the surrounding tab visual language without introducing
 * new design system tokens. A `Retry` button is rendered on the
 * error variant when `onRetry` is supplied.
 */

import type { ReactNode } from "react";

const CARD_STYLE = {
  borderColor: "var(--color-border)",
  backgroundColor: "var(--color-panel)",
  boxShadow: "var(--color-shadow)",
} as const;

type CommonProps = {
  /** Optional override of the message shown to the user. */
  message?: string;
  /** Optional secondary detail (e.g. endpoint path on error). */
  detail?: string;
  /** Optional content (e.g. retry button). */
  children?: ReactNode;
};

export function TabLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div
      className="rounded-lg border p-8 flex items-center justify-center"
      style={CARD_STYLE}
      role="status"
      aria-live="polite"
    >
      <p
        className="text-sm"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {message}
      </p>
    </div>
  );
}

export function TabEmpty({
  message = "No data available for this scene / representation.",
  detail,
}: CommonProps) {
  return (
    <div
      className="rounded-lg border p-8 flex flex-col items-center justify-center gap-2"
      style={CARD_STYLE}
    >
      <p className="text-sm" style={{ color: "var(--color-fg-subtle)" }}>
        {message}
      </p>
      {detail && (
        <p
          className="text-[11.5px] font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {detail}
        </p>
      )}
    </div>
  );
}

export function TabError({
  message = "Could not load this tab's data.",
  detail,
  onRetry,
  children,
}: CommonProps & { onRetry?: () => void }) {
  return (
    <div
      className="rounded-lg border p-6 flex flex-col items-start gap-3"
      style={{
        ...CARD_STYLE,
        borderColor: "var(--color-warn, var(--color-border))",
      }}
      role="alert"
    >
      <p className="text-sm" style={{ color: "var(--color-fg)" }}>
        {message}
      </p>
      {detail && (
        <p
          className="text-[11.5px] font-mono"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {detail}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-3 py-1.5 text-sm transition-opacity hover:opacity-90"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-panel)",
            color: "var(--color-fg)",
          }}
        >
          Retry
        </button>
      )}
      {children}
    </div>
  );
}
