import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";
import { RebuildingNotice } from "@/components/RebuildingNotice";

export default function MethodologyApplication() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell title={t("pages:methodology_application.title")}>
      <RebuildingNotice />
    </PageShell>
  );
}
