/**
 * 404 surface — shows the requested-but-missing path and points the
 * visitor at the three most likely destinations.
 *
 * Replaces the prior silent `<Navigate to="/" replace />` catch-all,
 * which was flagged in the 2026-05-24 user-flow audit as a UX dead-end
 * (typos, stale paper-PDF links and wrong copy-pastes landed on
 * Overview with no indication anything had gone wrong).
 */
import { useLocation } from "react-router-dom";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";

export default function NotFound() {
  const { pathname, search, hash } = useLocation();
  const { t } = useTranslation(["pages"]);
  const k = (suffix: string) =>
    t(`pages:not_found.${suffix}` as never) as string;
  const requested = `${pathname}${search}${hash}`;
  return (
    <PageShell title={k("title")} lead={k("lead")}>
      <div
        className="rounded-lg border p-4 my-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
        }}
      >
        <div
          className="text-[11px] uppercase tracking-widest font-semibold mb-1"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {k("requested_label")}
        </div>
        <code
          className="text-[13px] font-mono break-all"
          style={{ color: "var(--color-fg)" }}
        >
          {requested}
        </code>
      </div>
      <p
        className="text-base mt-4"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {k("suggestions_lead")}
      </p>
      <ul className="mt-3 space-y-2 list-none">
        {[
          { to: "/", labelKey: "suggest_overview" },
          { to: "/methodology", labelKey: "suggest_methodology" },
          { to: "/workspace", labelKey: "suggest_workspace" },
        ].map((opt) => (
          <li key={opt.to}>
            <Link
              to={opt.to}
              className="inline-block underline-offset-4 hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              {k(opt.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
