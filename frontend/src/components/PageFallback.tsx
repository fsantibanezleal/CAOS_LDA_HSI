import { useTranslation } from "react-i18next";

/**
 * Suspense fallback for the lazy-loaded route components.
 *
 * Renders a minimal layout skeleton (header bar + 3 grey content
 * blocks) so the route transition does not collapse to zero height
 * and re-jump on load — the 2026-05-24 user-flow audit flagged the
 * prior bare \`<p>Loading…\` as visually jarring.
 */
export function PageFallback() {
  const { t } = useTranslation();
  return (
    <div
      className="mx-auto max-w-screen-2xl px-6 py-12 min-h-[60vh]"
      role="status"
      aria-live="polite"
      aria-label={t("common:states.loading")}
    >
      <div
        className="h-7 w-2/5 rounded-md mb-6 animate-pulse"
        style={{ backgroundColor: "var(--color-border)" }}
        aria-hidden="true"
      />
      <div className="space-y-3" aria-hidden="true">
        <div
          className="h-4 w-full rounded animate-pulse"
          style={{ backgroundColor: "var(--color-border)", opacity: 0.7 }}
        />
        <div
          className="h-4 w-11/12 rounded animate-pulse"
          style={{ backgroundColor: "var(--color-border)", opacity: 0.5 }}
        />
        <div
          className="h-4 w-9/12 rounded animate-pulse"
          style={{ backgroundColor: "var(--color-border)", opacity: 0.4 }}
        />
      </div>
      <span className="sr-only">{t("common:states.loading")}</span>
    </div>
  );
}
