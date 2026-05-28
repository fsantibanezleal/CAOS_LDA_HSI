import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

// Bundle EN statically so the first paint never blocks on a fetch
// (English is the default and the most common locale).
import enCommon from "@/i18n/locales/en/common.json";
import enNav from "@/i18n/locales/en/nav.json";
import enPages from "@/i18n/locales/en/pages.json";

export const SUPPORTED_LANGUAGES = ["es", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// Audit fix (#592 Tier 1 item 2): the ES locale (~28 KB across the
// three namespaces) was statically imported, so every English visitor
// paid the cost of the Spanish locale on first paint. Now ES is
// loaded lazily, only when the user actually selects Spanish via the
// LanguageToggle. We expose `ensureLanguageLoaded()` so consumers can
// preload the next-most-likely locale during idle time.
let esLoaded = false;
async function loadEs() {
  if (esLoaded) return;
  const [common, nav, pages] = await Promise.all([
    import("@/i18n/locales/es/common.json"),
    import("@/i18n/locales/es/nav.json"),
    import("@/i18n/locales/es/pages.json"),
  ]);
  i18n.addResourceBundle("es", "common", common.default, true, true);
  i18n.addResourceBundle("es", "nav", nav.default, true, true);
  i18n.addResourceBundle("es", "pages", pages.default, true, true);
  esLoaded = true;
}

export async function ensureLanguageLoaded(lng: Language): Promise<void> {
  if (lng === "es") {
    await loadEs();
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon, nav: enNav, pages: enPages },
      // es: loaded lazily via ensureLanguageLoaded("es").
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
  })
  .then(() => {
    // If the persisted preference is Spanish, kick off the lazy load
    // immediately (still off the critical path because the en bundle
    // has already rendered the shell).
    const persisted = i18n.language as Language | undefined;
    if (persisted === "es") {
      void loadEs();
    }
  });

export default i18n;
