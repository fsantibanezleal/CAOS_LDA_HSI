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

type AxisTab = "fit" | "f1" | "f2" | "f7" | "reliability" | "backbones";

const AXIS_TABS: Array<{ id: AxisTab; label: string; title: string }> = [
  { id: "fit", label: "Fit", title: "K, mean doc length, perplexity" },
  { id: "f1", label: "F-1", title: "Classification macro-F1 (routed soft + raw logistic)" },
  { id: "f2", label: "F-2", title: "Topic-word coherence (c_v, c_npmi)" },
  { id: "f7", label: "F-7", title: "Topic-label normalised mutual information" },
  { id: "reliability", label: "Reliability", title: "F-14 repetitiveness, F-18 seed-pair top-10 alignment" },
  { id: "backbones", label: "Backbones", title: "F-2 c_v under HDP / ProdLDA / ETM backbones" },
];

function SweepPanelPlaceholder({ method }: { method: MethodEntry }) {
  const { t } = useTranslation(["pages"]);
  const [report, setReport] = useState<VSweepRecipeReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<AxisTab>("fit");

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
    <div>
      <div
        role="tablist"
        aria-label="F-axis groups"
        className="flex flex-wrap gap-1 mb-3"
      >
        {AXIS_TABS.map((tabDef) => {
          const active = tab === tabDef.id;
          return (
            <button
              key={tabDef.id}
              role="tab"
              aria-selected={active}
              title={tabDef.title}
              onClick={() => setTab(tabDef.id)}
              className="text-[12.5px] font-medium px-2.5 py-1 rounded transition-colors"
              style={{
                backgroundColor: active ? "var(--color-accent)" : "var(--color-panel)",
                color: active ? "var(--color-bg)" : "var(--color-fg-subtle)",
                border: "1px solid var(--color-border)",
              }}
            >
              {tabDef.label}
            </button>
          );
        })}
      </div>
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
            {tab === "fit" && (
              <>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>K</th>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>mean doc</th>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>perp</th>
              </>
            )}
            {tab === "f1" && (
              <>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-1 routed</th>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-1 raw</th>
              </>
            )}
            {tab === "f2" && (
              <>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-2 c_v</th>
                <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-2 c_npmi</th>
              </>
            )}
            {tab === "f7" && (
              <th className="text-right px-3 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>F-7 NMI</th>
            )}
            {tab === "reliability" && (
              <>
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
              </>
            )}
            {tab === "backbones" && (
              <>
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
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {report.scenes.map((s) => {
            const cell = (val: string | number | null | undefined, digits = 3) => {
              if (val === null || val === undefined || val === "-") return "-";
              return typeof val === "number" ? val.toFixed(digits) : val;
            };
            return (
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
                {tab === "fit" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{s.topic_view?.K ?? "-"}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.topic_view?.mean_doc_length, 1)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.topic_view?.perplexity, 2)}</td>
                  </>
                )}
                {tab === "f1" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f1?.topic_routed_soft_mean)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f1?.raw_logistic_mean)}</td>
                  </>
                )}
                {tab === "f2" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f2?.c_v)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f2?.c_npmi)}</td>
                  </>
                )}
                {tab === "f7" && (
                  <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f7?.normalised_mi)}</td>
                )}
                {tab === "reliability" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f14?.mean_pairwise_jaccard)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.f18?.frac_above_0_7)}</td>
                  </>
                )}
                {tab === "backbones" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.hdp?.f2_c_v)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.prodlda?.f2_c_v)}</td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>{cell(s.etm?.f2_c_v)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
