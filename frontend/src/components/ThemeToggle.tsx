import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";

import { useThemeStore } from "@/state/useThemeStore";

export function ThemeToggle() {
  const { t } = useTranslation();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  // Apply current theme to <html data-theme=...> in case the inline
  // pre-paint script and the React store ever drift.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("common:actions.toggle_theme")}
      title={t("common:actions.toggle_theme")}
      className="p-2 rounded-md hover:opacity-100 opacity-70 transition-opacity"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
