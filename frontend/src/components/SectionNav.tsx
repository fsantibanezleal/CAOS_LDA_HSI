import { useTranslation } from "react-i18next";

import type { ProjectSection } from "../lib/api";
import { pickText } from "../lib/api";

interface SectionNavProps {
  sections: ProjectSection[];
  language: string;
}

export function SectionNav({ sections, language }: SectionNavProps) {
  const { t } = useTranslation();

  return (
    <nav className="section-nav" aria-label={t("jumpTo")}>
      <span>{t("jumpTo")}</span>
      {sections.map((section) => (
        <a key={section.id} href={`#${section.id}`}>
          {pickText(section.title, language)}
        </a>
      ))}
    </nav>
  );
}
