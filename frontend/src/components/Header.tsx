import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Github, Globe, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { to: "/", key: "overview" as const, end: true },
  { to: "/methodology", key: "methodology" as const, end: false },
  { to: "/databases", key: "databases" as const, end: false },
  { to: "/workspace", key: "workspace" as const, end: false },
  { to: "/benchmarks", key: "benchmarks" as const, end: false },
];

const EXTERNAL = {
  orcid: "https://orcid.org/0000-0002-3614-2087",
  github: "https://github.com/fsantibanezleal/CAOS_LDA_HSI",
  site: "https://fasl-work.com",
};

export function Header() {
  const { t } = useTranslation(["common", "nav"]);
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md border-b"
      style={{
        backgroundColor: "color-mix(in oklab, var(--color-bg) 80%, transparent)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="mx-auto max-w-screen-2xl flex items-center gap-4 px-6 h-14">
        <NavLink
          to="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          <Sparkles size={18} aria-hidden style={{ color: "var(--color-accent)" }} />
          <span>{t("common:site_title")}</span>
        </NavLink>

        <nav className="hidden md:flex items-center gap-1 ml-4">
          {NAV_ITEMS.map(({ to, key, end }) => (
            <NavLink
              key={key}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  isActive ? "font-medium" : "opacity-75 hover:opacity-100",
                )
              }
              style={({ isActive }) => ({
                backgroundColor: isActive
                  ? "var(--color-accent-soft)"
                  : "transparent",
                color: isActive ? "var(--color-accent)" : "var(--color-fg)",
              })}
            >
              {t(`nav:${key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <a
            href={EXTERNAL.orcid}
            target="_blank"
            rel="noreferrer"
            aria-label={t("common:external.orcid")}
            title={t("common:external.orcid")}
            className="p-2 rounded-md hover:opacity-100 opacity-70 transition-opacity"
          >
            <OrcidIcon />
          </a>
          <a
            href={EXTERNAL.github}
            target="_blank"
            rel="noreferrer"
            aria-label={t("common:external.github")}
            title={t("common:external.github")}
            className="p-2 rounded-md hover:opacity-100 opacity-70 transition-opacity"
          >
            <Github size={18} />
          </a>
          <a
            href={EXTERNAL.site}
            target="_blank"
            rel="noreferrer"
            aria-label={t("common:external.site")}
            title={t("common:external.site")}
            className="p-2 rounded-md hover:opacity-100 opacity-70 transition-opacity"
          >
            <Globe size={18} />
          </a>
          <span
            className="mx-1 h-5 w-px"
            style={{ backgroundColor: "var(--color-border)" }}
            aria-hidden
          />
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function OrcidIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width="18"
      height="18"
      aria-hidden
      role="img"
    >
      <path
        d="M256 128c0 70.7-57.3 128-128 128S0 198.7 0 128 57.3 0 128 0s128 57.3 128 128z"
        fill="#a6ce39"
      />
      <g fill="#fff">
        <path d="M86.3 186.2H70.9V79.1h15.4v107.1zm-7.7-118c-5.4 0-9.8 4.4-9.8 9.7 0 5.4 4.4 9.8 9.8 9.8s9.8-4.4 9.8-9.8c0-5.3-4.4-9.7-9.8-9.7zm32.7 11h41.6c39.5 0 56.9 28.2 56.9 53.6 0 27.6-21.6 53.5-56.7 53.5h-41.8V79.2zm15.4 93.3h24.5c34.9 0 42.9-26.5 42.9-39.7 0-21.5-13.7-39.7-43.7-39.7h-23.7v79.4z" />
      </g>
    </svg>
  );
}
