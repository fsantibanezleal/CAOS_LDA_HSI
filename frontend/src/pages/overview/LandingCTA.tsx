import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function LandingCTA() {
  const { t } = useTranslation(["pages"]);
  return (
    <div
      className="rounded-xl border px-6 py-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <p
        className="text-base lg:text-lg leading-snug max-w-3xl"
        style={{ color: "var(--color-fg)" }}
      >
        {t("pages:overview.landing_cta.lead")}
      </p>
      <div
        className="flex gap-2 flex-wrap"
        role="group"
        aria-label={t("pages:overview.landing_cta.primary_actions")}
      >
        <Link
          to="/workspace"
          className="rounded-md px-4 py-2 text-sm font-semibold transition-opacity"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-on-accent, white)",
          }}
        >
          {t("pages:overview.landing_cta.open_workspace")}
        </Link>
        <Link
          to="/methodology"
          className="rounded-md px-4 py-2 text-sm font-semibold border transition-opacity"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
            backgroundColor: "transparent",
          }}
        >
          {t("pages:overview.landing_cta.read_methodology")}
        </Link>
      </div>
    </div>
  );
}
