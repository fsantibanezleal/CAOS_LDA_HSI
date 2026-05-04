import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";

const SUBROUTES = [
  { path: "theory", key: "theory" as const },
  { path: "representations", key: "representations" as const },
  { path: "pipeline", key: "pipeline" as const },
  { path: "application", key: "application" as const },
];

export default function Methodology() {
  const { t } = useTranslation(["pages", "nav"]);
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-10 md:py-12 grid gap-8 md:grid-cols-[220px_1fr]">
      <aside>
        <h1
          className="mb-4 text-lg font-semibold"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:methodology.title")}
        </h1>
        <nav className="flex md:flex-col gap-1">
          {SUBROUTES.map(({ path, key }) => (
            <NavLink
              key={key}
              to={path}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm transition-colors",
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
              {t(`nav:methodology_sub.${key}`)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div>
        <Outlet />
      </div>
    </div>
  );
}
