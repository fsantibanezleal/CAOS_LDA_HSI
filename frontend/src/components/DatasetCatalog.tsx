import { useDeferredValue, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DatasetCatalog as DatasetCatalogType } from "../lib/api";
import { pickText } from "../lib/api";

interface DatasetCatalogProps {
  catalog: DatasetCatalogType;
  language: string;
}

export function DatasetCatalog({ catalog, language }: DatasetCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const normalized = deferredQuery.trim().toLowerCase();
    if (!normalized) {
      return catalog.datasets;
    }
    return catalog.datasets.filter((dataset) => {
      const haystack = [
        dataset.name,
        dataset.modality,
        dataset.domains.join(" "),
        dataset.source,
        pickText(dataset.local_status, language)
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [catalog.datasets, deferredQuery, language]);

  return (
    <section id="datasets" className="section-block">
      <div className="section-heading">
        <div>
          <p className="eyebrow">01</p>
          <h2>{t("datasetsTitle")}</h2>
        </div>
        <div className="section-note">
          <strong>{t("datasetsPolicy")}</strong>
          <p>{pickText(catalog.selection_policy, language)}</p>
        </div>
      </div>

      <div className="dataset-toolbar">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("datasetsSearch")}
        />
        <div className="dataset-count">{t("datasetsCount", { count: filtered.length })}</div>
      </div>

      <div className="dataset-grid">
        {filtered.map((dataset) => (
          <article key={dataset.id} className="card dataset-card">
            <div className="dataset-card-top">
              <div>
                <div className="pill-row">
                  <p className="chip">{dataset.modality}</p>
                  <p className="chip">{pickText(dataset.local_status, language)}</p>
                </div>
                <h3>{dataset.name}</h3>
              </div>
              <span className={`fit-badge fit-${dataset.fit_for_demo}`}>{dataset.fit_for_demo.split("-").join(" ")}</span>
            </div>

            <p className="muted-list">{dataset.domains.join(" - ")}</p>

            <div className="meta-grid">
              <div>
                <span>{t("datasetsBands")}</span>
                <strong>{dataset.bands ?? "--"}</strong>
              </div>
              <div>
                <span>{t("datasetsShape")}</span>
                <strong>{dataset.spatial_shape ? dataset.spatial_shape.join(" x ") : "--"}</strong>
              </div>
              <div>
                <span>{t("datasetsSize")}</span>
                <strong>{dataset.file_size_mb ? `${dataset.file_size_mb} MB` : t("externalValue")}</strong>
              </div>
            </div>

            <p>{pickText(dataset.notes, language)}</p>
            <p className="small-label">{t("datasetsStrategy")}</p>
            <p className="small-copy">{pickText(dataset.repository_strategy, language)}</p>
            <a href={dataset.source_url} target="_blank" rel="noreferrer">
              {t("datasetsSource")}: {dataset.source}
            </a>
          </article>
        ))}
      </div>

      <div className="card exclusion-card">
        <h3>{t("datasetsExcluded")}</h3>
        {catalog.exclusions.map((entry) => (
          <p key={entry.name}>
            <strong>{entry.name}</strong>: {pickText(entry.reason, language)}{" "}
            <a href={entry.source_url} target="_blank" rel="noreferrer">
              {t("sourceShort")}
            </a>
          </p>
        ))}
      </div>
    </section>
  );
}
