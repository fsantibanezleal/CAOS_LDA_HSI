import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { METHOD_CATALOG, type MethodEntry } from "./methodCatalog";
import { WinMatrix } from "./WinMatrix";

export default function MethodsIndex() {
  const { t } = useTranslation(["pages"]);
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8">
      <header className="mb-6">
        <h1
          className="text-2xl font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace_methods.index.title")}
        </h1>
        <p
          className="mt-2 text-[14px] leading-relaxed max-w-3xl"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t("pages:workspace_methods.index.lead")}
        </p>
      </header>

      <section
        className="mb-4 text-[13px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace_methods.index.wordifications_heading")}
      </section>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {METHOD_CATALOG.filter((m) => m.family === "wordification").map(
          (method) => (
            <MethodTile key={method.id} method={method} />
          ),
        )}
      </div>

      <section
        className="mt-8 mb-4 text-[13px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace_methods.index.neural_heading")}
      </section>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {METHOD_CATALOG.filter((m) => m.family === "neural").map((method) => (
          <MethodTile key={method.id} method={method} />
        ))}
      </div>

      <section
        className="mt-10 mb-4 text-[13px] uppercase tracking-widest font-semibold"
        style={{ color: "var(--color-fg-faint)" }}
      >
        {t("pages:workspace_methods.index.matrix_heading")}
      </section>
      <WinMatrix />
    </div>
  );
}

function MethodTile({ method }: { method: MethodEntry }) {
  const { t } = useTranslation(["pages"]);
  const titleKey = `pages:workspace_methods.catalog.${method.id}.title`;
  const tagKey = `pages:workspace_methods.catalog.${method.id}.tag`;
  return (
    <Link
      to={`/workspace/methods/${method.id}`}
      className="block rounded-lg border p-4 transition-colors hover:opacity-100 opacity-95"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-panel)",
      }}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="font-mono text-[12px] px-2 py-0.5 rounded"
          style={{
            backgroundColor: "var(--color-accent-soft)",
            color: "var(--color-accent)",
          }}
        >
          {method.id}
        </span>
        <span
          className="text-[12px] uppercase tracking-wide"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t(tagKey)}
        </span>
      </div>
      <h3
        className="mt-2 text-[15px] font-medium"
        style={{ color: "var(--color-fg)" }}
      >
        {t(titleKey)}
      </h3>
      <p
        className="mt-2 text-[12.5px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {t(`pages:workspace_methods.catalog.${method.id}.summary`)}
      </p>
    </Link>
  );
}
