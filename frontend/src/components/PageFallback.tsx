import { useTranslation } from "react-i18next";

export function PageFallback() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-12">
      <p style={{ color: "var(--color-fg-faint)" }}>
        {t("common:states.loading")}
      </p>
    </div>
  );
}
