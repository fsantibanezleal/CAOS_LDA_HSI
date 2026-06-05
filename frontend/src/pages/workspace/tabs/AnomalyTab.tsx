/**
 * Anomaly tab (extracted from Workspace.tsx in c268 as part of
 * #441 P1 2.1).
 *
 * Renders Spearman ρ between anomaly indicators and misclassification
 * across (topic-based softmax, topic-based NLL, deep CAE-1D-8 RMSE,
 * deep β-VAE RMSE, deep β-VAE KL). Source: `/api/topic-anomaly/{scene}`
 * + `/api/deep-anomaly/{scene}`.
 *
 * AnomalyMetric stays as a private helper inside this module — it
 * is only used here.
 */
import { useTranslation } from "react-i18next";
import type { DeepAnomaly, TopicAnomaly } from "@/api/client";
import { TabError, TabLoading } from "../components/TabStates";

export function AnomalyTab({
  isLoading,
  error,
  topic,
  deep,
}: {
  isLoading: boolean;
  error: Error | null;
  topic: TopicAnomaly | null;
  deep: DeepAnomaly | null;
}) {
  const { t } = useTranslation(["pages"]);
  if (isLoading)
    return (
      <TabLoading
        message={t("pages:workspace.tabs.AnomalyTab.loading")}
      />
    );
  if (error) {
    return (
      <TabError
        message={t("pages:workspace.tabs.AnomalyTab.error")}
        detail={error.message}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-panel)",
          boxShadow: "var(--color-shadow)",
        }}
      >
        <h4
          className="text-base font-semibold mb-1"
          style={{ color: "var(--color-fg)" }}
        >
          {t("pages:workspace.tabs.AnomalyTab.title")}
        </h4>
        <p
          className="text-[12px] mb-3"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {t("pages:workspace.tabs.AnomalyTab.help", {
            k: topic?.topic_count ?? "—",
            docs: topic?.n_documents ?? "—",
          })}
        </p>

        <div className="grid sm:grid-cols-2 gap-5">
          {topic ? (
            <AnomalyMetric
              accent="rgba(40, 160, 80, 1)"
              title={t("pages:workspace.tabs.AnomalyTab.metric_softmax_title")}
              rho={
                topic.anomaly_to_misclassification_correlation.spearman_rho_softmax
              }
              p_value={
                topic.anomaly_to_misclassification_correlation.spearman_p_softmax
              }
              caption={t("pages:workspace.tabs.AnomalyTab.metric_softmax_caption")}
            />
          ) : null}
          {topic ? (
            <AnomalyMetric
              accent="rgba(40, 160, 80, 1)"
              title={t("pages:workspace.tabs.AnomalyTab.metric_nll_title")}
              rho={
                topic.anomaly_to_misclassification_correlation.spearman_rho_nll
              }
              p_value={
                topic.anomaly_to_misclassification_correlation.spearman_p_nll
              }
              caption={t("pages:workspace.tabs.AnomalyTab.metric_nll_caption")}
            />
          ) : null}
          {deep?.cae_1d_8 ? (
            <AnomalyMetric
              accent="rgba(56, 189, 248, 1)"
              title={t("pages:workspace.tabs.AnomalyTab.metric_cae_title")}
              rho={deep.cae_1d_8.spearman_rho_vs_misclass}
              caption={t("pages:workspace.tabs.AnomalyTab.metric_cae_caption", {
                indicator: deep.cae_1d_8.anomaly_indicator,
                p50: deep.cae_1d_8.rmse_overall.median.toFixed(3),
                p95: deep.cae_1d_8.rmse_overall.p95.toFixed(3),
              })}
            />
          ) : null}
          {deep?.beta_vae_8 ? (
            <AnomalyMetric
              accent="rgba(170, 60, 200, 1)"
              title={t("pages:workspace.tabs.AnomalyTab.metric_vae_rmse_title")}
              rho={deep.beta_vae_8.spearman_rho_rmse_vs_misclass}
              caption={t("pages:workspace.tabs.AnomalyTab.metric_vae_rmse_caption", {
                p50: deep.beta_vae_8.rmse_overall.median.toFixed(3),
                p95: deep.beta_vae_8.rmse_overall.p95.toFixed(3),
              })}
            />
          ) : null}
          {deep?.beta_vae_8 ? (
            <AnomalyMetric
              accent="rgba(170, 60, 200, 1)"
              title={t("pages:workspace.tabs.AnomalyTab.metric_vae_kl_title")}
              rho={deep.beta_vae_8.spearman_rho_kl_vs_misclass}
              caption={t("pages:workspace.tabs.AnomalyTab.metric_vae_kl_caption", {
                p50: deep.beta_vae_8.kl_overall.median.toFixed(3),
                p95: deep.beta_vae_8.kl_overall.p95.toFixed(3),
              })}
            />
          ) : null}
        </div>

        {topic?.anomaly_to_misclassification_correlation.comment ? (
          <p
            className="mt-4 text-[12px] italic"
            style={{ color: "var(--color-fg-faint)" }}
          >
            {topic.anomaly_to_misclassification_correlation.comment}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AnomalyMetric({
  accent,
  title,
  rho,
  p_value,
  caption,
}: {
  accent: string;
  title: string;
  rho: number;
  p_value?: number;
  caption?: string;
}) {
  const { t } = useTranslation(["pages"]);
  const abs = Math.abs(rho);
  const tone = abs >= 0.3 ? "strong" : abs >= 0.15 ? "moderate" : "weak";
  const significant = p_value !== undefined ? p_value < 0.05 : null;
  return (
    <div className="border-l-2 pl-3" style={{ borderColor: accent }}>
      <div
        className="text-[10.5px] uppercase tracking-widest font-semibold"
        style={{ color: accent }}
      >
        {title}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span
          className="text-[24px] font-mono leading-tight"
          style={{ color: "var(--color-fg)" }}
        >
          {rho >= 0 ? "+" : ""}
          {rho.toFixed(3)}
        </span>
        <span
          className="text-[10px] uppercase tracking-widest"
          style={{ color: "var(--color-fg-faint)" }}
        >
          ρ · {t(`pages:workspace.tabs.AnomalyTab.tone_${tone}`)}
        </span>
        {p_value !== undefined ? (
          <span
            className="ml-auto text-[10.5px] font-mono px-1.5 py-0.5 rounded"
            style={{
              color: significant
                ? "rgba(40,160,80,1)"
                : "var(--color-fg-faint)",
              backgroundColor: significant
                ? "rgba(40,160,80,0.12)"
                : "transparent",
              border: significant
                ? "1px solid rgba(40,160,80,0.4)"
                : "1px solid var(--color-border)",
            }}
          >
            p = {p_value < 0.0001 ? "<1e-4" : p_value.toFixed(4)}
          </span>
        ) : null}
      </div>
      {caption ? (
        <p
          className="text-[11px] mt-1"
          style={{ color: "var(--color-fg-faint)" }}
        >
          {caption}
        </p>
      ) : null}
    </div>
  );
}
