import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";

import { METHOD_CATALOG, findMethod, type MethodEntry } from "./methodCatalog";
import { vSweepMethodReport, type VSweepRecipeReport } from "@/api/v-sweep";
import { MethodTopicLabelHeatmap } from "./MethodTopicLabelHeatmap";

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

      {method.hasSweepArtefacts && (
        <section className="mb-8">
          <h2
            className="mb-2 text-[13px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--color-fg-faint)" }}
          >
            Topic-label heatmaps
          </h2>
          <MethodTopicLabelHeatmap recipe={method.id} />
        </section>
      )}

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
  const [report, setReport] = useState<VSweepRecipeReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!method.hasSweepArtefacts) {
      setLoaded(true);
      return () => {
        alive = false;
      };
    }
    vSweepMethodReport(method.id)
      .then((data) => {
        if (alive) {
          setReport(data);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(String(e));
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [method.id, method.hasSweepArtefacts]);

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
  if (!loaded) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        Loading sweep results...
      </p>
    );
  }
  if (err) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        Sweep API unavailable: {err}
      </p>
    );
  }
  if (!report) return null;

  const scenesWithF1 = report.scenes.filter((s) => s.f1);
  const scenesWithF2 = report.scenes.filter((s) => s.f2);
  const scenesWithFit = report.scenes.filter((s) => s.topic_view);

  if (
    scenesWithF1.length === 0 &&
    scenesWithF2.length === 0 &&
    scenesWithFit.length === 0
  ) {
    return (
      <p
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        {t("pages:workspace_methods.deep.sweep_pending")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-[12.5px] border-collapse"
        style={{ borderColor: "var(--color-border)" }}
      >
        <thead style={{ backgroundColor: "var(--color-panel)" }}>
          <tr>
            <th
              className="sticky left-0 z-10 text-left px-3 py-1.5 border"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-panel)",
              }}
            >
              Scene
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              K
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              mean doc
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              perp
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              F-1 routed
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              F-1 raw
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              F-2 c_v
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              F-2 c_npmi
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
            >
              F-7 NMI
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
              title="F-14 mean off-diagonal top-10 jaccard (lower = more diverse)"
            >
              F-14 jacc
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
              title="F-18 fraction of seed-pair topic alignments with cosine > 0.7"
            >
              F-18 0.7
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
              title="HDP backbone F-2 c_v (alternative model selection)"
            >
              HDP c_v
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
              title="ProdLDA backbone F-2 c_v (logistic-normal prior)"
            >
              ProdLDA c_v
            </th>
            <th
              className="text-right px-3 py-1.5 border"
              style={{ borderColor: "var(--color-border)" }}
              title="ETM backbone F-2 c_v (embedded topic model)"
            >
              ETM c_v
            </th>
          </tr>
        </thead>
        <tbody>
          {report.scenes.map((s) => (
            <tr key={s.scene_id}>
              <td
                className="sticky left-0 z-10 px-3 py-1 border font-mono"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg)",
                }}
              >
                {s.scene_id}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.topic_view?.K ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.topic_view?.mean_doc_length?.toFixed(1) ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.topic_view?.perplexity?.toFixed(2) ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f1?.topic_routed_soft_mean?.toFixed(3) ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f1?.raw_logistic_mean?.toFixed(3) ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f2?.c_v?.toFixed(3) ?? "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f2?.c_npmi !== null && s.f2?.c_npmi !== undefined
                  ? s.f2.c_npmi.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f7?.normalised_mi !== null && s.f7?.normalised_mi !== undefined
                  ? s.f7.normalised_mi.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f14?.mean_pairwise_jaccard !== null && s.f14?.mean_pairwise_jaccard !== undefined
                  ? s.f14.mean_pairwise_jaccard.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.f18?.frac_above_0_7 !== null && s.f18?.frac_above_0_7 !== undefined
                  ? s.f18.frac_above_0_7.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.hdp?.f2_c_v !== null && s.hdp?.f2_c_v !== undefined
                  ? s.hdp.f2_c_v.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.prodlda?.f2_c_v !== null && s.prodlda?.f2_c_v !== undefined
                  ? s.prodlda.f2_c_v.toFixed(3)
                  : "-"}
              </td>
              <td
                className="px-3 py-1 border text-right"
                style={{ borderColor: "var(--color-border)" }}
              >
                {s.etm?.f2_c_v !== null && s.etm?.f2_c_v !== undefined
                  ? s.etm.f2_c_v.toFixed(3)
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
