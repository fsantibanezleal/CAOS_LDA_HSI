import { useTranslation } from "react-i18next";

import { APP_BRANCH, APP_BUILD_TIME, APP_COMMIT_SHA, APP_VERSION } from "@/lib/version";

function formatBuildTime(iso: string): string {
  if (!iso || iso === "dev") return "dev";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}Z`;
}

export function Footer() {
  const { t } = useTranslation();
  const built = formatBuildTime(APP_BUILD_TIME);
  return (
    <footer
      className="border-t mt-12"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="mx-auto max-w-screen-2xl px-6 py-6 text-sm flex flex-wrap items-center gap-x-4 gap-y-2"
        style={{ color: "var(--color-fg-faint)" }}
      >
        <span>{t("common:site_title")}</span>
        <span>·</span>
        <span>{t("common:site_tagline")}</span>
        <span className="ml-auto inline-flex items-baseline gap-x-3 font-mono text-[11.5px]">
          <span title="App version (manual, bumped per cycle)">
            <span style={{ color: "var(--color-fg-faint)" }}>v</span>
            <span style={{ color: "var(--color-fg-subtle)" }}>{APP_VERSION}</span>
          </span>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <span title="Git commit SHA at build time">
            <span style={{ color: "var(--color-fg-faint)" }}>sha </span>
            <span style={{ color: "var(--color-fg-subtle)" }}>{APP_COMMIT_SHA}</span>
          </span>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <span title="Git branch at build time">
            <span style={{ color: "var(--color-fg-faint)" }}>br </span>
            <span style={{ color: "var(--color-fg-subtle)" }}>{APP_BRANCH}</span>
          </span>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <span title="Build timestamp (UTC) — when the bundle was produced">
            <span style={{ color: "var(--color-fg-faint)" }}>built </span>
            <span style={{ color: "var(--color-fg-subtle)" }}>{built}</span>
          </span>
        </span>
      </div>
    </footer>
  );
}
