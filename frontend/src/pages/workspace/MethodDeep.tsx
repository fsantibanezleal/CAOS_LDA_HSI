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
  const [compareId, setCompareId] = useState<string>("");
  const compareMethod = useMemo(
    () => (compareId ? findMethod(compareId) : null),
    [compareId],
  );
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
        <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
          <h2
            className="text-[13px] uppercase tracking-widest font-semibold"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {t("pages:workspace_methods.deep.sweep_heading")}
          </h2>
          <label
            className="text-[12px] flex items-center gap-2"
            style={{ color: "var(--color-fg-subtle)" }}
          >
            Compare with
            <select
              value={compareId}
              onChange={(e) => setCompareId(e.target.value)}
              className="text-[12.5px] px-2 py-1 rounded font-mono"
              style={{
                backgroundColor: "var(--color-panel)",
                color: "var(--color-fg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <option value="">— none —</option>
              {METHOD_CATALOG.filter((m) => m.id !== method.id && m.hasSweepArtefacts).map(
                (m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <SweepPanelPlaceholder method={method} compareMethod={compareMethod} />
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

type AxisTab = "fit" | "f1" | "f2" | "f7" | "reliability" | "backbones" | "interp" | "modelsel";

// For each metric, "higher" = true if higher value is preferred. F-14 (jaccard
// repetitiveness) is the only "lower is better" axis surfaced in the panel.
const HIGHER_IS_BETTER: Record<string, boolean> = {
  K: true,
  mean_doc_length: true,
  perplexity: false,
  f1_routed: true,
  f1_raw: true,
  c_v: true,
  c_npmi: true,
  nmi: true,
  jaccard: false,
  f18: true,
  cf_l1: true,
  hdp_cv: true,
  prodlda_cv: true,
  etm_cv: true,
  f16: false,
};

function diffColor(a: number | null | undefined, b: number | null | undefined, metric: string): string {
  if (a === null || a === undefined || b === null || b === undefined) return "var(--color-fg)";
  const delta = a - b;
  if (Math.abs(delta) < 0.005) return "var(--color-fg-subtle)";
  const higher = HIGHER_IS_BETTER[metric] ?? true;
  const aBetter = higher ? delta > 0 : delta < 0;
  return aBetter ? "var(--color-success, #16a34a)" : "var(--color-danger, #dc2626)";
}

const AXIS_TABS: Array<{ id: AxisTab; label: string; title: string }> = [
  { id: "fit", label: "Fit", title: "K, mean doc length, perplexity" },
  { id: "f1", label: "F-1", title: "Classification macro-F1 (routed soft + raw logistic)" },
  { id: "f2", label: "F-2", title: "Topic-word coherence (c_v, c_npmi)" },
  { id: "f7", label: "F-7", title: "Topic-label normalised mutual information" },
  { id: "reliability", label: "Reliability", title: "F-14 repetitiveness, F-18 seed-pair top-10 alignment" },
  { id: "interp", label: "Interp", title: "F-13 SHAP top-feature, F-22 counterfactual L1 to flip argmax topic" },
  { id: "backbones", label: "Backbones", title: "F-2 c_v under HDP / ProdLDA / ETM backbones" },
  { id: "modelsel", label: "F-16", title: "HDP model-selection adequacy: effective topic count (top-level stick prevalence) vs #classes" },
];

function SweepPanelPlaceholder({
  method,
  compareMethod,
}: {
  method: MethodEntry;
  compareMethod?: MethodEntry | null | undefined;
}) {
  const { t } = useTranslation(["pages"]);
  const [report, setReport] = useState<VSweepRecipeReport | null>(null);
  const [compareReport, setCompareReport] = useState<VSweepRecipeReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<AxisTab>("fit");
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (loaded) return;
    setElapsed(0);
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [loaded, method.id]);

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

  useEffect(() => {
    let alive = true;
    if (!compareMethod || !compareMethod.hasSweepArtefacts) {
      setCompareReport(null);
      return () => {
        alive = false;
      };
    }
    vSweepMethodReport(compareMethod.id)
      .then((data) => {
        if (alive) setCompareReport(data);
      })
      .catch(() => {
        if (alive) setCompareReport(null);
      });
    return () => {
      alive = false;
    };
  }, [compareMethod]);

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
    const stillLoading = elapsed >= 15;
    return (
      <div
        className="text-[13px] leading-relaxed"
        style={{ color: "var(--color-fg-subtle)" }}
      >
        <p>
          Loading sweep results... <span className="font-mono">({elapsed}s)</span>
        </p>
        {stillLoading && (
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-fg-faint)" }}>
            Sweep payload is taking longer than usual. The backend may be cold-starting;
            give it another 15-20 seconds. If it never finishes, the API is unavailable.
          </p>
        )}
      </div>
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
            {tab === "interp" && (
              <>
                <th
                  className="text-left px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="F-13 SHAP top-feature for topic 0"
                >
                  F-13 top SHAP (topic 0)
                </th>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="F-22 counterfactual median L1 perturbation to flip argmax topic"
                >
                  F-22 L1 (median)
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
            {tab === "modelsel" && (
              <>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="HDP effective topic count: #topics holding ≥1% of corpus mass under the top-level stick-breaking prevalence (hdp_to_lda)"
                >
                  HDP K_eff
                </th>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="Perplexity-style effective number of topics N_eff = exp(H(π)) over the corpus topic-prevalence vector π"
                >
                  N_eff
                </th>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="Dominant topic share: prevalence mass of the single most-used topic (topic_prevalence_top5[0])"
                >
                  top share
                </th>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="Number of ground-truth classes for the scene"
                >
                  #classes
                </th>
                <th
                  className="text-right px-3 py-1.5 border"
                  style={{ borderColor: "var(--color-border)" }}
                  title="F-16 model-selection adequacy = |K_eff − #classes| (lower is better)"
                >
                  F-16 |Δ|
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {report.scenes.map((s) => {
            const cs = compareReport?.scenes.find((x) => x.scene_id === s.scene_id);
            const fmt = (val: string | number | null | undefined, digits = 3) => {
              if (val === null || val === undefined || val === "-") return "-";
              return typeof val === "number" ? val.toFixed(digits) : val;
            };
            const diffCell = (
              a: number | null | undefined,
              b: number | null | undefined,
              digits: number,
              metric: string,
            ) => {
              const aStr = fmt(a, digits);
              if (!compareMethod) return aStr;
              const bStr = fmt(b, digits);
              const color = diffColor(a, b, metric);
              return (
                <div>
                  <div>{aStr}</div>
                  <div className="text-[11px] mt-0.5" style={{ color }}>
                    {bStr}
                    {a !== null && a !== undefined && b !== null && b !== undefined && (
                      <span className="ml-1 opacity-70">
                        Δ{(a - b >= 0 ? "+" : "") + (a - b).toFixed(digits)}
                      </span>
                    )}
                  </div>
                </div>
              );
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
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {compareMethod
                        ? diffCell(s.topic_view?.K ?? null, cs?.topic_view?.K ?? null, 0, "K")
                        : (s.topic_view?.K ?? "-")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.topic_view?.mean_doc_length, cs?.topic_view?.mean_doc_length, 1, "mean_doc_length")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.topic_view?.perplexity, cs?.topic_view?.perplexity, 2, "perplexity")}
                    </td>
                  </>
                )}
                {tab === "f1" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f1?.topic_routed_soft_mean, cs?.f1?.topic_routed_soft_mean, 3, "f1_routed")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f1?.raw_logistic_mean, cs?.f1?.raw_logistic_mean, 3, "f1_raw")}
                    </td>
                  </>
                )}
                {tab === "f2" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f2?.c_v, cs?.f2?.c_v, 3, "c_v")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f2?.c_npmi, cs?.f2?.c_npmi, 3, "c_npmi")}
                    </td>
                  </>
                )}
                {tab === "f7" && (
                  <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                    {diffCell(s.f7?.normalised_mi, cs?.f7?.normalised_mi, 3, "nmi")}
                  </td>
                )}
                {tab === "reliability" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f14?.mean_pairwise_jaccard, cs?.f14?.mean_pairwise_jaccard, 3, "jaccard")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f18?.frac_above_0_7, cs?.f18?.frac_above_0_7, 3, "f18")}
                    </td>
                  </>
                )}
                {tab === "interp" && (
                  <>
                    <td className="px-3 py-1 border text-left text-[11.5px] font-mono" style={{ borderColor: "var(--color-border)" }}>
                      {(() => {
                        const t0 = s.f13?.top_features_per_topic?.find((tp) => tp.topic === 0);
                        const feats = t0?.features ?? t0?.top_features;
                        const first = feats?.[0];
                        if (!first) return "-";
                        const name = first.token ?? first.name ?? `idx ${first.vocab_index}`;
                        return `${name} (${first.mean_abs_shap.toFixed(4)})`;
                      })()}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.f22?.counterfactual_l1_median, cs?.f22?.counterfactual_l1_median, 2, "cf_l1")}
                    </td>
                  </>
                )}
                {tab === "backbones" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.hdp?.f2_c_v, cs?.hdp?.f2_c_v, 3, "hdp_cv")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.prodlda?.f2_c_v, cs?.prodlda?.f2_c_v, 3, "prodlda_cv")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.etm?.f2_c_v, cs?.etm?.f2_c_v, 3, "etm_cv")}
                    </td>
                  </>
                )}
                {tab === "modelsel" && (
                  <>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.hdp?.K_effective ?? null, cs?.hdp?.K_effective ?? null, 0, "hdp_keff")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.hdp?.N_eff_topics ?? null, cs?.hdp?.N_eff_topics ?? null, 2, "hdp_neff")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.hdp?.topic_prevalence_top5?.[0] ?? null, cs?.hdp?.topic_prevalence_top5?.[0] ?? null, 3, "hdp_topshare")}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {fmt(s.hdp?.K_ground_truth_classes ?? null, 0)}
                    </td>
                    <td className="px-3 py-1 border text-right" style={{ borderColor: "var(--color-border)" }}>
                      {diffCell(s.hdp?.f16_model_selection_adequacy ?? null, cs?.hdp?.f16_model_selection_adequacy ?? null, 0, "f16")}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {compareMethod && (
        <p
          className="mt-2 text-[11.5px]"
          style={{ color: "var(--color-fg-subtle)" }}
        >
          Larger value in each cell is <strong>{method.id}</strong>; smaller value
          is <strong>{compareMethod.id}</strong>. Δ colour: green if {method.id}
          {" "}is better on that metric, red if worse.
        </p>
      )}
    </div>
  );
}
