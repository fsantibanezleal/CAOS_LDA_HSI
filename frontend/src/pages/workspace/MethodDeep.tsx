import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { METHOD_CATALOG, findMethod, type MethodEntry } from "./methodCatalog";

export default function MethodDeep() {
  const { methodId = "" } = useParams();
  const method = useMemo(() => findMethod(methodId), [methodId]);
  const { t } = useTranslation(["pages", "common"]);

  if (!method) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p style={{ color: "var(--color-fg-subtle)" }}>
          {t("pages:workspace_methods.deep.not_found", { id: methodId })}
        </p>
        <Link
          to="/workspace/methods"
          className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          <ArrowLeft size={14} />
          {t("pages:workspace_methods.deep.back_to_index")}
        </Link>
      </div>
    );
  }

  const tBase = `pages:workspace_methods.catalog.${method.id}`;
  return (
    <div className="mx-auto max-w-screen-2xl px-6 py-8">
      <Link
        to="/workspace/methods"
        className="inline-flex items-center gap-1 text-[13px] font-medium mb-4"
        style={{ color: "var(--color-accent)" }}
      >
        <ArrowLeft size={14} />
        {t("pages:workspace_methods.deep.back_to_index")}
      </Link>

      <header className="mb-6">
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
            {t(`${tBase}.tag`)}
          </span>
        </div>
        <h1
          className="mt-2 text-2xl font-semibold tracking-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {t(`${tBase}.title`)}
        </h1>
        <p
          className="mt-2 max-w-3xl text-[14px] leading-relaxed"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t(`${tBase}.summary`)}
        </p>
      </header>

      <section className="mb-8">
        <h2
          className="mb-2 text-[13px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace_methods.deep.theory_heading")}
        </h2>
        <p
          className="text-[14px] leading-relaxed max-w-3xl"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t(`${tBase}.theory`)}
        </p>
      </section>

      <section className="mb-8">
        <h2
          className="mb-2 text-[13px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace_methods.deep.sweep_heading")}
        </h2>
        <SweepPanelPlaceholder method={method} />
      </section>

      <section className="mb-8">
        <h2
          className="mb-2 text-[13px] uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace_methods.deep.compare_heading")}
        </h2>
        <p
          className="text-[13px] leading-relaxed mb-3"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          {t("pages:workspace_methods.deep.compare_lead")}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {METHOD_CATALOG.filter((m) => m.id !== method.id).map((other) => (
            <Link
              key={other.id}
              to={`/workspace/methods/${other.id}`}
              className="block text-center rounded-md border p-2 transition-colors hover:opacity-100 opacity-80"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span
                className="font-mono text-[12px]"
                style={{ color: "var(--color-fg)" }}
              >
                {other.id}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function SweepPanelPlaceholder({ method }: { method: MethodEntry }) {
  const { t } = useTranslation(["pages"]);
  if (!method.hasSweepArtefacts) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {t("pages:workspace_methods.deep.no_sweep_yet")}
      </p>
    );
  }
  return (
    <p
      className="text-[13px] leading-relaxed"
      style={{ color: "var(--color-fg-subtle)" }}
    >
      {t("pages:workspace_methods.deep.sweep_pending")}
    </p>
  );
}
