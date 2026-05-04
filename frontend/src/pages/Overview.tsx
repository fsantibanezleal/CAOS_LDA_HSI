import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { PageShell } from "@/components/PageShell";

export default function Overview() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell
      title={t("pages:overview.title")}
      lead={t("pages:overview.lead")}
    >
      <div className="flex flex-wrap gap-3">
        <Link
          to="/workspace"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-accent-fg)",
          }}
        >
          {t("pages:overview.cta_workspace")}
        </Link>
        <Link
          to="/methodology"
          className="rounded-md px-4 py-2 text-sm font-medium border"
          style={{
            borderColor: "var(--color-border)",
            color: "var(--color-fg)",
          }}
        >
          {t("pages:overview.cta_methodology")}
        </Link>
      </div>
    </PageShell>
  );
}
