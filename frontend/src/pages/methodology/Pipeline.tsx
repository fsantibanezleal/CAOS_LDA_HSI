import { useTranslation } from "react-i18next";

import { PageShell } from "@/components/PageShell";
import { RebuildingNotice } from "@/components/RebuildingNotice";

export default function MethodologyPipeline() {
  const { t } = useTranslation(["pages"]);
  return (
    <PageShell title={t("pages:methodology_pipeline.title")}>
      <RebuildingNotice />
    </PageShell>
  );
}
