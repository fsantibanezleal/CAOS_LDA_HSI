import { useTranslation } from "react-i18next";

import { SubTabBar } from "../../components/chrome/SubTabBar";
import { type OverviewSubTab, useStore } from "../../store/useStore";
import { Concept } from "./Concept";
import { Methodology } from "./Methodology";
import { References } from "./References";
import { Representations } from "./Representations";
import { Theory } from "./Theory";

const SUB_LABEL_KEY: Record<OverviewSubTab, string> = {
  concept: "subtabConcept",
  theory: "subtabTheory",
  representations: "subtabRepresentations",
  methodology: "subtabMethodology",
  references: "subtabReferences"
};

export function Overview() {
  const { t } = useTranslation();
  const active = useStore((s) => s.overviewSubTab);
  const setActive = useStore((s) => s.setOverviewSubTab);

  const tabs: { id: OverviewSubTab; label: string }[] = (
    ["concept", "theory", "representations", "methodology", "references"] as OverviewSubTab[]
  ).map((id) => ({ id, label: t(SUB_LABEL_KEY[id]) }));

  return (
    <section className="overview section">
      <div>
        <h2 className="section-title">{t("overviewIntroTitle")}</h2>
        <p className="section-lead">{t("overviewIntroLead")}</p>
      </div>
      <SubTabBar<OverviewSubTab> tabs={tabs} active={active} onChange={setActive} />
      <div className="overview-body">
        {active === "concept" && <Concept />}
        {active === "theory" && <Theory />}
        {active === "representations" && <Representations />}
        {active === "methodology" && <Methodology />}
        {active === "references" && <References />}
      </div>
    </section>
  );
}
