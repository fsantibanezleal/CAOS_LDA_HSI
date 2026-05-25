/**
 * Papers section — direct PDF downloads + repo links.
 *
 * PDFs are shipped from `frontend/public/papers/` and served at
 * `/papers/*` by the same nginx/static layer as the rest of `dist/`.
 * Both manuscripts are **preprints** — not yet submitted to a
 * peer-reviewed venue. Don't add venue/journal claims here until
 * acceptance.
 *
 * All card copy + section headings + link labels live under
 * `pages:overview.papers.*`. Only file paths and numeric facts
 * (size, build stamp) stay here.
 */

import { Trans, useTranslation } from "react-i18next";

type PaperVariant = "journal" | "conference";

type PaperCard = {
  variant: PaperVariant;
  pdfHref: string;
  pdfSizeKb: number;
  buildStamp: string;
};

const PAPERS: PaperCard[] = [
  {
    variant: "journal",
    pdfHref: "/papers/caos-lda-hsi-journal.pdf",
    pdfSizeKb: 510,
    buildStamp: "2026-05-24",
  },
  {
    variant: "conference",
    pdfHref: "/papers/caos-lda-hsi-conference.pdf",
    pdfSizeKb: 333,
    buildStamp: "2026-05-24",
  },
];

export function Papers() {
  const { t } = useTranslation(["pages"]);
  return (
    <section
      className="rounded-xl border p-6 mt-6"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
        boxShadow: "var(--color-shadow)",
      }}
    >
      <header className="mb-4">
        <div
          className="text-[10.5px] uppercase tracking-widest font-semibold mb-1"
          style={{ color: "var(--color-accent)" }}
        >
          {t("pages:overview.papers.section_kicker")}
        </div>
        <h3
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:overview.papers.section_title")}
        </h3>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-fg-faint)" }}
        >
          <Trans
            i18nKey="pages:overview.papers.section_lead"
            components={{ strong: <strong /> }}
          />
        </p>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {PAPERS.map((p) => (
          <a
            key={p.variant}
            href={p.pdfHref}
            className="rounded-lg border p-4 flex flex-col gap-2 transition-all hover:-translate-y-0.5 hover:border-current"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg)",
              color: "var(--color-fg)",
            }}
            download
          >
            <div
              className="text-[10.5px] uppercase tracking-widest font-semibold"
              style={{ color: "var(--color-accent)" }}
            >
              {t(`pages:overview.papers.cards.${p.variant}.badge`)}
            </div>
            <div
              className="text-base font-semibold leading-snug"
              style={{ color: "var(--color-fg)" }}
            >
              {t(`pages:overview.papers.cards.${p.variant}.title`)}
            </div>
            <div
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {t(`pages:overview.papers.cards.${p.variant}.blurb`)}
            </div>
            <div
              className="text-[11.5px] italic"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t(`pages:overview.papers.cards.${p.variant}.note`)}
            </div>
            <div
              className="mt-2 flex items-baseline justify-between text-[12px] font-mono"
              style={{ color: "var(--color-fg-faint)" }}
            >
              <span>{p.pdfHref.split("/").pop()}</span>
              <span>
                {p.pdfSizeKb} {t("pages:overview.papers.size_suffix")}
              </span>
            </div>
            <div
              className="text-[11px] font-mono"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t("pages:overview.papers.build_prefix")} {p.buildStamp}
            </div>
          </a>
        ))}
      </div>

      <div
        className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[13px]"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI"
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          {t("pages:overview.papers.links.app_source")}
        </a>
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI_Paper"
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          {t("pages:overview.papers.links.paper_source")}
        </a>
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki"
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          {t("pages:overview.papers.links.wiki")}
        </a>
      </div>
    </section>
  );
}
