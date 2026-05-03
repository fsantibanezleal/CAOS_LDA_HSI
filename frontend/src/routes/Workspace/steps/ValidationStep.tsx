import { useEffect, useMemo, useState } from "react";

import {
  api,
  type HidsagPreprocessingSensitivityPayload,
  type SubsetCard,
  pickText
} from "../../../lib/api";
import { useStore } from "../../../store/useStore";
import { datasetMatches } from "../workspaceUtils";

interface Props {
  card: SubsetCard;
  language: "en" | "es";
}

const STATUS_CLASS: Record<string, string> = {
  ready: "ws-status-ok",
  passed: "ws-status-ok",
  prototype: "ws-status-stale",
  partial: "ws-status-stale",
  pending: "ws-status-pending",
  blocked: "ws-status-missing",
  failed: "ws-status-missing"
};

const HIDSAG_DATASETS = new Set([
  "hidsag-curated",
  "hidsag-mineralogy",
  "hidsag-geomet",
  "hidsag-region-documents",
  "hidsag-geometallurgy",
  "hidsag-mineral1",
  "hidsag-mineral2",
  "hidsag-geochem",
  "hidsag-porphyry"
]);

export function ValidationStep({ card, language }: Props) {
  const isEn = language === "en";
  const setStep = useStore((s) => s.setWorkspaceStep);
  const [sensitivity, setSensitivity] =
    useState<HidsagPreprocessingSensitivityPayload | null>(null);
  const [filter, setFilter] = useState<"all" | "ready" | "prototype" | "blocked">("all");

  useEffect(() => {
    if (
      card.evidence.some(
        (e) => HIDSAG_DATASETS.has(e.dataset_id) || e.dataset_id.startsWith("hidsag-")
      )
    ) {
      void api
        .getHidsagPreprocessingSensitivity()
        .then(setSensitivity)
        .catch(() => setSensitivity(null));
    }
  }, [card]);

  const blocks = useMemo(() => {
    if (filter === "all") return card.validation;
    return card.validation.filter((b) => b.status === filter);
  }, [card.validation, filter]);

  const stepLinks: Record<string, string> = {
    "corpus-integrity": "corpus",
    "topic-stability": "topics",
    "topic_stability": "topics",
    "spectral-library-alignment": "topics",
    "supervision-association": "inference",
    "supervised-downstream-value": "inference",
    "spatial-coherence": "comparison",
    "preprocessing-sensitivity": "validation",
    "document-definition-sensitivity": "corpus",
    "quantization-sensitivity": "corpus",
    "cross-scene-transfer": "comparison"
  };

  return (
    <div className="ws-validation-grid">
      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Validation block status" : "Estado por bloque de validación"}</h4>
          <p>
            {isEn
              ? "Click a block to jump to the relevant Workspace step preselected. Status pills follow the project's hard rule: a claim that has not survived its applicable blocks is presented as a hypothesis, never as a result."
              : "Click un bloque para saltar al step preseleccionado. Una afirmación que no ha pasado sus bloques aplicables se presenta como hipótesis, nunca como resultado."}
          </p>
        </header>
        <div className="ws-mini-controls">
          <span className="ws-mini-label">{isEn ? "Filter" : "Filtrar"}:</span>
          {(["all", "ready", "prototype", "blocked"] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? "ws-mini-button is-active" : "ws-mini-button"}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <ul className="ws-block-grid">
          {blocks.map((block) => {
            const cls = STATUS_CLASS[block.status] ?? "ws-status-pending";
            const link = stepLinks[block.block_id];
            return (
              <li key={block.block_id}>
                <button
                  type="button"
                  className="ws-block-card"
                  onClick={() => link && setStep(link as never)}
                  disabled={!link}
                  title={link ? `jump to ${link}` : undefined}
                >
                  <header>
                    <strong>{prettyBlockId(block.block_id)}</strong>
                    <span className={`ws-status-pill ${cls}`}>{block.status}</span>
                  </header>
                  {block.detail && <p>{pickText(block.detail, language)}</p>}
                  {block.metric_name && block.metric_value !== null && (
                    <footer>
                      <span className="ws-mono">{block.metric_name}</span>
                      <strong>{Number(block.metric_value).toFixed(3)}</strong>
                    </footer>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ws-panel">
        <header className="ws-panel-header">
          <h4>{isEn ? "Supported claims" : "Afirmaciones soportadas"}</h4>
        </header>
        {card.supported_claims.length === 0 ? (
          <p className="ws-panel-hint">—</p>
        ) : (
          <ul className="ws-claims-list">
            {card.supported_claims.map((c) => (
              <li key={c.id}>
                <strong>{pickText(c.title, language)}</strong>
                <p>{pickText(c.detail, language)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ws-panel ws-panel-blocked-claims">
        <header className="ws-panel-header">
          <h4>{isEn ? "Blocked claims (caveat layer)" : "Afirmaciones bloqueadas"}</h4>
        </header>
        {card.blocked_claims.length === 0 ? (
          <p className="ws-panel-hint">—</p>
        ) : (
          <ul className="ws-claims-list">
            {card.blocked_claims.map((c) => (
              <li key={c.id}>
                <strong>{pickText(c.title, language)}</strong>
                <p>{pickText(c.detail, language)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {sensitivity && (
        <section className="ws-panel">
          <header className="ws-panel-header">
            <h4>{isEn ? "HIDSAG preprocessing sensitivity" : "Sensibilidad de preprocesamiento HIDSAG"}</h4>
            <p>
              {isEn
                ? "Per-subset response of the supervised target to preprocessing policy and bad-band masking. A flat row across policies = robust; high variance = preprocessing dominates the result."
                : "Respuesta del target supervisado a la política de preprocesamiento y al enmascaramiento. Fila plana = robusto; alta varianza = el preprocesamiento domina."}
            </p>
          </header>
          <SensitivityHeatmap payload={sensitivity} card={card} isEn={isEn} />
        </section>
      )}
    </div>
  );
}

function prettyBlockId(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SensitivityHeatmap({
  payload,
  card,
  isEn
}: {
  payload: HidsagPreprocessingSensitivityPayload;
  card: SubsetCard;
  isEn: boolean;
}) {
  const datasetIds = card.evidence.map((e) => e.dataset_id);
  const subsets = (payload as unknown as Record<string, unknown>)["subsets"] as
    | Array<Record<string, unknown>>
    | undefined;
  if (!subsets) return <p className="ws-panel-hint">—</p>;
  const matching = subsets.filter((sub) => {
    const id = (sub["subset_id"] ?? sub["id"]) as string;
    return datasetIds.some((d) => datasetMatches(d, id) || d.endsWith(id));
  });
  const list = matching.length > 0 ? matching : subsets;
  return (
    <div className="ws-sensitivity">
      {list.map((sub, idx) => {
        const subId = (sub["subset_id"] ?? sub["id"]) as string;
        const policies = (sub["policies"] ?? sub["preprocessing_policies"]) as
          | Array<Record<string, unknown>>
          | undefined;
        if (!policies || policies.length === 0) {
          return (
            <div key={idx} className="ws-sensitivity-item">
              <strong>{subId}</strong>
              <p className="ws-panel-hint">{isEn ? "no policy data" : "sin datos de política"}</p>
            </div>
          );
        }
        const allMetricKeys = new Set<string>();
        for (const p of policies) {
          const metrics = (p["metrics"] ?? p["summary"]) as Record<string, number> | undefined;
          if (metrics) Object.keys(metrics).forEach((k) => allMetricKeys.add(k));
        }
        const metricNames = Array.from(allMetricKeys).slice(0, 8);
        const values: number[] = [];
        for (const p of policies) {
          const metrics = (p["metrics"] ?? p["summary"]) as Record<string, number> | undefined;
          for (const key of metricNames) {
            const v = metrics?.[key];
            if (typeof v === "number") values.push(v);
          }
        }
        const vMin = values.length ? Math.min(...values) : 0;
        const vMax = values.length ? Math.max(...values) : 1;
        const colorFor = (v: number) => {
          if (vMax === vMin) return "rgba(91,141,239,0.2)";
          const t = (v - vMin) / (vMax - vMin);
          return `rgba(91,141,239,${(0.1 + t * 0.7).toFixed(3)})`;
        };
        return (
          <div key={idx} className="ws-sensitivity-item">
            <strong>{subId}</strong>
            <div style={{ overflowX: "auto" }}>
              <table className="ws-table">
                <thead>
                  <tr>
                    <th>policy</th>
                    {metricNames.map((m) => (
                      <th key={m}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p, pi) => {
                    const policyId = (p["policy_id"] ?? p["id"] ?? p["name"]) as string;
                    const metrics = (p["metrics"] ?? p["summary"]) as
                      | Record<string, number>
                      | undefined;
                    return (
                      <tr key={pi}>
                        <td>
                          <code>{policyId}</code>
                        </td>
                        {metricNames.map((m) => {
                          const v = metrics?.[m];
                          return (
                            <td
                              key={m}
                              style={{ background: typeof v === "number" ? colorFor(v) : undefined }}
                            >
                              {typeof v === "number" ? v.toFixed(3) : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
