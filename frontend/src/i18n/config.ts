import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import esCommon from "@/i18n/locales/es/common.json";
import esNav from "@/i18n/locales/es/nav.json";
import esPages from "@/i18n/locales/es/pages.json";
import enCommon from "@/i18n/locales/en/common.json";
import enNav from "@/i18n/locales/en/nav.json";
import enPages from "@/i18n/locales/en/pages.json";

export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: esCommon, nav: esNav, pages: esPages },
      en: { common: enCommon, nav: enNav, pages: enPages },
    },
    // Hard default: English. The site is research / methodology in
    // English by intent; users opt into Spanish via the LanguageToggle
    // and the choice persists in localStorage. We do NOT auto-detect
    // navigator.language so the first-visit experience is deterministic.
    lng: "en",
    fallbackLng: "en",
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: "common",
    ns: ["common", "nav", "pages"],
    interpolation: { escapeValue: false },
    detection: {
      // Only check localStorage — no navigator fallback so first-visit
      // always starts in English regardless of browser locale.
      order: ["localStorage"],
      lookupLocalStorage: "caos.lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
