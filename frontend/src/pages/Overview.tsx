import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import { PageShell } from "@/components/PageShell";
import { LABELLED_SCENES, type ScenePeek } from "./overview/types";
import { LandingCTA } from "./overview/LandingCTA";
import { HeroSpectralViz } from "./overview/HeroSpectralViz";
import { HeadlineNumbers } from "./overview/HeadlineNumbers";
import { FindingsCarousel } from "./overview/FindingsCarousel";
import { HypercubeAnatomy } from "./overview/HypercubeAnatomy";
import { ScenesShowcase } from "./overview/ScenesShowcase";
import { PillarsTriptych } from "./overview/PillarsTriptych";
import { MethodCoverage } from "./overview/MethodCoverage";
import { Papers } from "./overview/Papers";
import { ReadingPath } from "./overview/ReadingPath";

export default function Overview() {
  const { t } = useTranslation(["pages"]);

  const heroScenes = useQuery({
    queryKey: ["overview-scene-peek"],
    queryFn: async () => {
      const data = await Promise.all(
        LABELLED_SCENES.map((s) =>
          api.edaPerScene(s.id).catch(() => null),
        ),
      );
      return data as (ScenePeek | null)[];
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  return (
    <PageShell title={t("pages:overview.title")} lead={t("pages:overview.lead")}>
      <LandingCTA />
      <HeroSpectralViz scenes={heroScenes.data ?? null} />
      <HeadlineNumbers />
      <FindingsCarousel />
      <HypercubeAnatomy />
      <ScenesShowcase scenes={heroScenes.data ?? null} />
      <PillarsTriptych />
      <MethodCoverage />
      <Papers />
      <ReadingPath />
    </PageShell>
  );
}
