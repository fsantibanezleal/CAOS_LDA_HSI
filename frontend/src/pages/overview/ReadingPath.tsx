import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export function ReadingPath() {
  const { t } = useTranslation(["pages"]);
  const steps = [
    { tag: t("pages:overview.reading_path.step1_tag"), title: t("pages:overview.reading_path.step1_title"), body: t("pages:overview.reading_path.step1_body"), href: "/methodology/theory" },
    { tag: t("pages:overview.reading_path.step2_tag"), title: t("pages:overview.reading_path.step2_title"), body: t("pages:overview.reading_path.step2_body"), href: "/methodology/representations" },
    { tag: t("pages:overview.reading_path.step3_tag"), title: t("pages:overview.reading_path.step3_title"), body: t("pages:overview.reading_path.step3_body"), href: "/methodology/pipeline" },
    { tag: t("pages:overview.reading_path.step4_tag"), title: t("pages:overview.reading_path.step4_title"), body: t("pages:overview.reading_path.step4_body"), href: "/methodology/application" },
    { tag: t("pages:overview.reading_path.step5_tag"), title: t("pages:overview.reading_path.step5_title"), body: t("pages:overview.reading_path.step5_body"), href: "/databases" },
    { tag: t("pages:overview.reading_path.step6_tag"), title: t("pages:overview.reading_path.step6_title"), body: t("pages:overview.reading_path.step6_body"), href: "/workspace" },
    { tag: t("pages:overview.reading_path.step7_tag"), title: t("pages:overview.reading_path.step7_title"), body: t("pages:overview.reading_path.step7_body"), href: "/benchmarks" },
  ];
  return (
    <section className="mt-12 mb-8">
      <div className="mb-4">
        <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--color-accent)" }}>
          {t("pages:overview.reading_path.tag")}
        </span>
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight mt-1" style={{ color: "var(--color-fg)" }}>
          {t("pages:overview.reading_path.title")}
        </h2>
      </div>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Link
              to={s.href}
              className="block h-full rounded-lg border p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
                boxShadow: "var(--color-shadow)",
              }}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[10.5px] uppercase tracking-widest font-medium" style={{ color: "var(--color-fg-faint)" }}>
                  {s.tag}
                </span>
                <span
                  aria-hidden
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                >
                  {i + 1}
                </span>
              </div>
              <h3 className="text-[14.5px] font-semibold mt-2" style={{ color: "var(--color-fg)" }}>
                {s.title}
              </h3>
              <p className="text-[12.5px] leading-relaxed mt-1" style={{ color: "var(--color-fg-subtle)" }}>
                {s.body}
              </p>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
