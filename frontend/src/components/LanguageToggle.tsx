import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

import {
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/i18n/config";

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? "es") as Language;
  const next: Language = current === "es" ? "en" : "es";

  const swap = () => {
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    void i18n.changeLanguage(next);
  };

  return (
    <button
      type="button"
      onClick={swap}
      aria-label={t("common:actions.toggle_language")}
      title={t("common:actions.toggle_language")}
      className="p-2 rounded-md hover:opacity-100 opacity-70 transition-opacity inline-flex items-center gap-1"
    >
      <Languages size={18} />
      <span className="text-xs uppercase tracking-wider">{current}</span>
    </button>
  );
}
