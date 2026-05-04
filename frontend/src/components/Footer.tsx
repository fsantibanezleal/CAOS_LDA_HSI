import { useTranslation } from "react-i18next";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer
      className="border-t mt-12"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div
        className="mx-auto max-w-screen-2xl px-6 py-6 text-sm flex flex-wrap items-center gap-4"
        style={{ color: "var(--color-fg-faint)" }}
      >
        <span>{t("common:site_title")}</span>
        <span>·</span>
        <span>{t("common:site_tagline")}</span>
      </div>
    </footer>
  );
}
