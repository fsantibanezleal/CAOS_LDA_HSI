import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";
import { RebuildingNotice } from "@/components/RebuildingNotice";

export default function MethodologyTheory() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell title={t("pages:methodology_theory.title")}>
      <RebuildingNotice />
    </PageShell>
  );
}
