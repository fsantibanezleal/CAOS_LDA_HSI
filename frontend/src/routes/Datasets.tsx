import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { ArrowRightIcon, StackIcon } from "../components/chrome/Icons";
import {
  api,
  type DatasetCatalog,
  type DataFamiliesPayload,
  pickText
} from "../lib/api";
import { useStore } from "../store/useStore";

interface State {
  families: DataFamiliesPayload | null;
  datasets: DatasetCatalog | null;
  error: string | null;
}

export function Datasets() {
  const { t, i18n } = useTranslation();
  const language = i18n.language.startsWith("en") ? "en" : "es";
  const selectedFamilyId = useStore((s) => s.selectedFamilyId);
  const setSelectedFamilyId = useStore((s) => s.setSelectedFamilyId);
  const [state, setState] = useState<State>({ families: null, datasets: null, error: null });

  useEffect(() => {
    void Promise.all([api.getDataFamilies(), api.getAppData().then((p) => p.datasets)])
      .then(([families, datasets]) => {
        setState({ families, datasets, error: null });
        if (families.families.length > 0 && useStore.getState().selectedFamilyId === null) {
          useStore.getState().setSelectedFamilyId(families.families[0].id);
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "load failure";
        setState({ families: null, datasets: null, error: message });
      });
  }, []);

  const visibleDatasets = useMemo(() => {
    if (!state.datasets) return [];
    if (!selectedFamilyId) return state.datasets.datasets;
    return state.datasets.datasets.filter(
      (entry) => entry.supervision.family_id === selectedFamilyId
    );
  }, [state.datasets, selectedFamilyId]);

  if (state.error) {
    return (
      <section className="datasets">
        <p className="benchmarks-callout">
          {t("errorTitle")}: {state.error}
        </p>
      </section>
    );
  }

  if (!state.families || !state.datasets) {
    return (
      <section className="datasets">
        <p className="benchmarks-loading">{t("loading")}</p>
      </section>
    );
  }

  return (
    <section className="datasets section">
      <div>
        <h2 className="section-title">{t("datasetsHeader")}</h2>
        <p className="section-lead">{t("datasetsLead")}</p>
      </div>

      <div className="datasets-family-row" role="tablist">
        <button
          type="button"
          className={selectedFamilyId === null ? "family-pill is-active" : "family-pill"}
          onClick={() => setSelectedFamilyId(null)}
        >
          <span className="family-pill-code">All</span>
          <span className="family-pill-name">{t("datasetsFamilyAll")}</span>
        </button>
        {state.families.families.map((family) => (
          <button
            key={family.id}
            type="button"
            className={
              family.id === selectedFamilyId ? "family-pill is-active" : "family-pill"
            }
            onClick={() => setSelectedFamilyId(family.id)}
          >
            <span className="family-pill-code">Family {family.code}</span>
            <span className="family-pill-name">{pickText(family.title, language)}</span>
          </button>
        ))}
      </div>

      <p className="datasets-count">
        {t("datasetsCardCount", { count: visibleDatasets.length })}
      </p>

      <ul className="dataset-grid">
        {visibleDatasets.map((entry) => (
          <li key={entry.id} className="dataset-card">
            <div className="dataset-card-head">
              <span className="dataset-card-icon">
                <StackIcon size={18} />
              </span>
              <div className="dataset-card-titles">
                <span className="dataset-card-title">{entry.name}</span>
                <span className="dataset-card-modality">{entry.modality}</span>
              </div>
            </div>

            <p className="dataset-card-summary">{pickText(entry.notes, language)}</p>

            <div className="dataset-card-meta">
              {typeof entry.bands === "number" && (
                <div className="dataset-card-meta-item">
                  <span className="dataset-card-meta-label">{t("datasetsBands")}</span>
                  <span className="dataset-card-meta-value">{entry.bands}</span>
                </div>
              )}
              {Array.isArray(entry.spatial_shape) && (
                <div className="dataset-card-meta-item">
                  <span className="dataset-card-meta-label">{t("datasetsShape")}</span>
                  <span className="dataset-card-meta-value">
                    {entry.spatial_shape.join(" × ")}
                  </span>
                </div>
              )}
              {typeof entry.file_size_mb === "number" && (
                <div className="dataset-card-meta-item">
                  <span className="dataset-card-meta-label">{t("datasetsSize")}</span>
                  <span className="dataset-card-meta-value">
                    {entry.file_size_mb.toFixed(1)} MB
                  </span>
                </div>
              )}
              <div className="dataset-card-meta-item">
                <span className="dataset-card-meta-label">{t("datasetsAccess")}</span>
                <span className="dataset-card-meta-value">{entry.acquisition.access}</span>
              </div>
            </div>

            <div className="dataset-card-foot">
              <span className="dataset-card-meta-label">
                {pickText(entry.local_status, language)}
              </span>
              <a
                className="dataset-card-link"
                href={entry.source_url}
                target="_blank"
                rel="noreferrer"
              >
                {t("datasetsOpenSource")}
                <ArrowRightIcon size={14} />
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
