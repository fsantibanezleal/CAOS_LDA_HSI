/**
 * Papers section — direct PDF downloads + repo links.
 *
 * PDFs are shipped from `frontend/public/papers/` and served at
 * `/papers/*` by the same nginx/static layer as the rest of `dist/`.
 * Both manuscripts are **preprints** — not yet submitted to a
 * peer-reviewed venue. Don't add venue/journal claims here until
 * acceptance.
 */

type PaperCard = {
  variant: "journal" | "conference";
  badge: string;
  title: string;
  blurb: string;
  pdfHref: string;
  pdfSizeKb: number;
  note: string;
};

const PAPERS: PaperCard[] = [
  {
    variant: "journal",
    badge: "Journal preprint",
    title: "Probabilistic topic models on hyperspectral imagery",
    blurb:
      "Long-form treatment: 12-axis Framework, hierarchical Bayesian benchmarks, deep-encoder ablations, HIDSAG cross-preprocessing stability.",
    pdfHref: "/papers/caos-lda-hsi-journal.pdf",
    pdfSizeKb: 476,
    note: "Preprint; target venue redacted while it circulates.",
  },
  {
    variant: "conference",
    badge: "Conference preprint",
    title: "Topic-routed classifiers for hyperspectral scene labelling",
    blurb:
      "Short companion: theta-as-gate vs theta-as-feature, the B-3 result, and the multi-axis battery summary.",
    pdfHref: "/papers/caos-lda-hsi-conference.pdf",
    pdfSizeKb: 332,
    note: "Preprint; target venue redacted while it circulates.",
  },
];

export function Papers() {
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
          Papers
        </div>
        <h3
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          Manuscripts in preparation
        </h3>
        <p
          className="text-sm mt-1"
          style={{ color: "var(--color-fg-faint)" }}
        >
          Both PDFs below are <strong>preprints</strong> — current build of the
          manuscripts as of the most recent deploy. They have not been submitted
          to a peer-reviewed venue yet; treat them as work-in-progress.
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
              {p.badge}
            </div>
            <div
              className="text-base font-semibold leading-snug"
              style={{ color: "var(--color-fg)" }}
            >
              {p.title}
            </div>
            <div
              className="text-[13px] leading-relaxed"
              style={{ color: "var(--color-fg-subtle)" }}
            >
              {p.blurb}
            </div>
            <div
              className="text-[11.5px] italic"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {p.note}
            </div>
            <div
              className="mt-2 flex items-baseline justify-between text-[12px] font-mono"
              style={{ color: "var(--color-fg-faint)" }}
            >
              <span>{p.pdfHref.split("/").pop()}</span>
              <span>{p.pdfSizeKb} KB · PDF</span>
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
          App source (GitHub)
        </a>
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI_Paper"
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          Paper source (GitHub)
        </a>
        <a
          href="https://github.com/fsantibanezleal/CAOS_LDA_HSI/wiki"
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          Project wiki
        </a>
      </div>
    </section>
  );
}
