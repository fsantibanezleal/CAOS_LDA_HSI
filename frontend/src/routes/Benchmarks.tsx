import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  api,
  type SubsetCard,
  type SubsetCardsIndex,
  pickText
} from "../lib/api";

interface State {
  status: "loading" | "missing" | "ready" | "error";
  index: SubsetCardsIndex | null;
  cards: SubsetCard[];
  error: string | null;
}

export function Benchmarks() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith("en") ? "en" : "es";
  const [state, setState] = useState<State>({
    status: "loading",
    index: null,
    cards: [],
    error: null
  });

  useEffect(() => {
    void api
      .getSubsetCardsIndex()
      .then(async (idx) => {
        const cards = await Promise.all(idx.cards.map((c) => api.getSubsetCard(c.id)));
        setState({ status: "ready", index: idx, cards, error: null });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "load failure";
        if (message.includes("404")) {
          setState({ status: "missing", index: null, cards: [], error: null });
        } else {
          setState({ status: "error", index: null, cards: [], error: message });
        }
      });
  }, []);

  if (state.status === "loading") {
    return (
      <section className="benchmarks section">
        <p className="benchmarks-loading">{t("benchmarksLoading")}</p>
      </section>
    );
  }

  if (state.status === "missing") {
    return (
      <section className="benchmarks section">
        <div>
          <h2 className="section-title">{t("tabBenchmarks")}</h2>
          <p className="section-lead">{t("benchmarksLead")}</p>
        </div>
        <p className="benchmarks-callout">{t("benchmarksMissing")}</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className="benchmarks section">
        <p className="benchmarks-callout">
          {t("errorTitle")}: {state.error}
        </p>
      </section>
    );
  }

  const validationCount = (card: SubsetCard) => {
    const ready = card.validation.filter((v) => v.status === "ready").length;
    return `${ready}/${card.validation.length}`;
  };

  return (
    <section className="benchmarks section">
      <div>
        <h2 className="section-title">{t("tabBenchmarks")}</h2>
        <p className="section-lead">{t("benchmarksLead")}</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="benchmarks-table">
          <thead>
            <tr>
              <th>{t("benchmarksColumnSubset")}</th>
              <th>{t("benchmarksColumnFamily")}</th>
              <th>{t("benchmarksColumnStatus")}</th>
              <th>{t("benchmarksColumnDatasets")}</th>
              <th>{t("benchmarksColumnTopics")}</th>
              <th>{t("benchmarksColumnStability")}</th>
              <th>{t("benchmarksColumnValidation")}</th>
              <th>{t("benchmarksColumnLastValidated")}</th>
            </tr>
          </thead>
          <tbody>
            {state.cards.map((card) => (
              <tr key={card.id}>
                <td>
                  <div className="benchmarks-row-title">
                    {pickText(card.title, language)}
                  </div>
                  <div className="benchmarks-row-id">{card.id}</div>
                </td>
                <td>{card.family_id}</td>
                <td>
                  <span className={`benchmarks-status benchmarks-status-${card.status}`}>
                    {card.status}
                  </span>
                </td>
                <td>{card.evidence.length}</td>
                <td>{card.topics?.K ?? "—"}</td>
                <td>
                  {card.topics?.stability_score !== null &&
                  card.topics?.stability_score !== undefined
                    ? card.topics.stability_score.toFixed(3)
                    : "—"}
                </td>
                <td>{validationCount(card)}</td>
                <td>{card.last_validated ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
