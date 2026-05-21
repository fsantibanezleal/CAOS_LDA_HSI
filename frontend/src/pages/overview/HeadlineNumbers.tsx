import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const HEADLINE_DEFS = [
  { keyLabel: "datasets_label", keySub: "datasets_sub", value: "21", href: "/databases" },
  { keyLabel: "recipes_label", keySub: "recipes_sub", value: "12", href: "/methodology/representations" },
  { keyLabel: "builders_label", keySub: "builders_sub", value: "67", href: "/methodology/pipeline" },
  { keyLabel: "artifacts_label", keySub: "artifacts_sub", value: "1706", href: "/workspace" },
  { keyLabel: "endpoints_label", keySub: "endpoints_sub", value: "86", href: "/benchmarks" },
  { keyLabel: "variants_label", keySub: "variants_sub", value: "11", href: "/methodology/representations" },
] as const;

export function HeadlineNumbers() {
  const { t } = useTranslation(["pages"]);
  return (
    <section className="mt-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {HEADLINE_DEFS.map((h) => (
          <Link
            key={h.keyLabel}
            to={h.href}
            className="rounded-lg border p-4 transition-all hover:scale-[1.02] hover:shadow-lg"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-panel)",
              boxShadow: "var(--color-shadow)",
            }}
          >
            <div
              className="text-[10.5px] uppercase tracking-widest font-medium"
              style={{ color: "var(--color-fg-faint)" }}
            >
              {t(`pages:overview.headlines.${h.keyLabel}`)}
            </div>
            <div
              className="mt-1 text-3xl font-semibold tracking-tight"
              style={{ color: "var(--color-accent)" }}
            >
              {h.value}
            </div>
            <div className="text-[11px]" style={{ color: "var(--color-fg-subtle)" }}>
              {t(`pages:overview.headlines.${h.keySub}`)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* =========================================================================
   3. Findings carousel — auto-rotating
   =======================================================================*/

