import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";
import { RebuildingNotice } from "@/components/RebuildingNotice";

export default function Databases() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell title={t("pages:databases.title")}>
      <RebuildingNotice />
    </PageShell>
  );
}
