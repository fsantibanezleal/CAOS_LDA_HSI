import { useMemo, useState } from "react";

import { type ExplorationSceneView, type SubsetCard, pickText } from "../../../lib/api";
import { useStore } from "../../../store/useStore";
import { topicColor } from "../SelectionBar";

interface Props {
  card: SubsetCard;
  scene: ExplorationSceneView | null;
  language: "en" | "es";
}

const CLASS_PALETTE = [
  "#5b8def", "#f0b86d", "#6dd4a0", "#ef6f6c", "#9b88ff", "#5fd0d6",
  "#ffb1c4", "#a3c47a", "#e09f55", "#7d8ce3", "#c878d4", "#5fb389",
  "#d18bff", "#ffa97a", "#82c0a0", "#bdc7d6"
];

function classColor(idx: number): string {
  return CLASS_PALETTE[idx % CLASS_PALETTE.length];
}

export function DataStep({ card, scene, language }: Props) {
  const isEn = language === "en";
  const selection = useStore((s) => s.selection);
  const toggleClass = useStore((s) => s.toggleClass);
  const clearClasses = useStore((s) => s.clearClasses);

  const [previewLayer, setPreviewLayer] = useState<"rgb" | "labels">("rgb");
  const [classSort, setClassSort] = useState<"count" | "name" | "topic">("count");

  if (!scene) {
    return (
      <DataStepEvidenceFallback card={card} language={language} />
    );
  }

  const classMeta = scene.class_summaries;
  const meanSpectra = scene.class_mean_spectra;
  const wavelengths = scene.wavelengths_nm;

  const sortedIndex = useMemo(() => {
    const order = classMeta.map((_, i) => i);
    if (classSort === "name") {
      order.sort((a, b) => (classMeta[a].name ?? "").localeCompare(classMeta[b].name ?? ""));
    } else if (classSort === "topic") {
      order.sort(
        (a, b) => (classMeta[a].dominant_topic ?? -1) - (classMeta[b].dominant_topic ?? -1)
      );
    } else {
      order.sort((a, b) => (classMeta[b].count ?? 0) - (classMeta[a].count ?? 0));
    }
    return order;
  }, [classMeta, classSort]);

  const activeIndices = sortedIndex.filter((i) => {
    const id = classMeta[i].label_id;
    return id !== null && selection.activeClassIds.includes(id);
  });
  const renderIndices =
    activeIndices.length > 0 ? activeIndices : sortedIndex;

  return (
    <div className="ws-data-grid">
      <section className="ws-panel ws-panel-scene">
        <header className="ws-panel-header">
          <h4>{isEn ? "Scene preview" : "Vista de escena"}</h4>
          <p>
            {scene.scene_name ?? scene.scene_id} · {pickText(card.title, language)} ·
            {scene.modality ?? ""} {scene.sensor ? `· ${scene.sensor}` : ""}
          </p>
        </header>
        <div className="ws-preview-switch">
          <button
            type="button"
            className={previewLayer === "rgb" ? "is-active" : ""}
            onClick={() => setPreviewLayer("rgb")}
            disabled={!scene.rgb_preview_path}
          >
            RGB
          </button>
          <button
            type="button"
            className={previewLayer === "labels" ? "is-active" : ""}
            onClick={() => setPreviewLayer("labels")}
            disabled={!scene.label_preview_path}
          >
            {isEn ? "Labels" : "Etiquetas"}
          </button>
        </div>
        <figure className="ws-preview-figure">
          {previewLayer === "rgb" && scene.rgb_preview_path && (
            <img src={scene.rgb_preview_path} alt="RGB false-colour" loading="lazy" />
          )}
          {previewLayer === "labels" && scene.label_preview_path && (
            <img src={scene.label_preview_path} alt="class labels" loading="lazy" />
          )}
        </figure>
        <footer className="ws-panel-footer ws-panel-footer-grid">
          <div>
            <span className="ws-mini-label">{isEn ? "Bands" : "Bandas"}</span>
            <span>{wavelengths.length}</span>
          </div>
          <div>
            <span className="ws-mini-label">{isEn ? "Classes" : "Clases"}</span>
            <span>{classMeta.length}</span>
          </div>
          <div>
            <span className="ws-mini-label">{isEn ? "Topics" : "Tópicos"}</span>
            <span>{scene.topic_count}</span>
          </div>
        </footer>
      </section>

      <section className="ws-panel ws-panel-classes">
        <header className="ws-panel-header">
          <h4>{isEn ? "Classes" : "Clases"}</h4>
          <p>
            {isEn
              ? "Click a chip to pin a class. Pinned classes drive the spectra panel and the topic loadings panel."
              : "Click un chip para fijar una clase. Las clases fijadas alimentan el panel espectral y el de carga de tópicos."}
          </p>
        </header>
        <div className="ws-class-controls">
          <span className="ws-mini-label">{isEn ? "Sort by" : "Ordenar por"}:</span>
          <button
            type="button"
            className={classSort === "count" ? "ws-mini-button is-active" : "ws-mini-button"}
            onClick={() => setClassSort("count")}
          >
            count
          </button>
          <button
            type="button"
            className={classSort === "name" ? "ws-mini-button is-active" : "ws-mini-button"}
            onClick={() => setClassSort("name")}
          >
            name
          </button>
          <button
            type="button"
            className={classSort === "topic" ? "ws-mini-button is-active" : "ws-mini-button"}
            onClick={() => setClassSort("topic")}
          >
            dom. topic
          </button>
          {selection.activeClassIds.length > 0 && (
            <button type="button" className="ws-mini-button is-warn" onClick={clearClasses}>
              clear pins
            </button>
          )}
        </div>
        <div className="ws-class-chip-grid">
          {sortedIndex.map((ci, posIdx) => {
            const cls = classMeta[ci];
            const cid = cls.label_id;
            const pinned = cid !== null && selection.activeClassIds.includes(cid);
            return (
              <button
                key={ci}
                type="button"
                className={pinned ? "ws-class-chip is-pinned" : "ws-class-chip"}
                onClick={() => cid !== null && toggleClass(cid)}
                title={`${cls.name ?? ""} · count ${cls.count ?? "?"} · dominant T${(cls.dominant_topic ?? 0) + 1}`}
              >
                <span className="ws-class-chip-swatch" style={{ background: classColor(posIdx) }} />
                <span className="ws-class-chip-name">{cls.name ?? `class ${cid}`}</span>
                <span className="ws-class-chip-meta">
                  {cls.count ?? "—"} · T{(cls.dominant_topic ?? 0) + 1}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ws-panel ws-panel-spectra">
        <header className="ws-panel-header">
          <h4>{isEn ? "Mean spectra" : "Espectros medios"}</h4>
          <p>
            {isEn
              ? "Each line is the mean reflectance of a class across the cube. Pinned classes are emphasised."
              : "Cada línea es la reflectancia media de una clase. Las clases fijadas se destacan."}
          </p>
        </header>
        <SpectrumChart
          spectra={meanSpectra}
          wavelengths={wavelengths}
          renderIndices={renderIndices}
          activeIndices={activeIndices}
          classMeta={classMeta}
          wavelengthRange={selection.wavelengthRange}
        />
      </section>

      <section className="ws-panel ws-panel-loadings">
        <header className="ws-panel-header">
          <h4>{isEn ? "Topic loadings of pinned classes" : "Carga de tópicos en clases fijadas"}</h4>
          <p>
            {isEn
              ? "θ_k per class. The topic with the largest loading is the dominant one."
              : "θ_k por clase. El tópico con mayor carga es el dominante."}
          </p>
        </header>
        {activeIndices.length === 0 ? (
          <p className="ws-panel-hint">
            {isEn
              ? "Pin one or more classes to see their topic mixture."
              : "Fija una o más clases para ver su mezcla de tópicos."}
          </p>
        ) : (
          <ul className="ws-class-mixture">
            {activeIndices.map((ci) => {
              const cls = classMeta[ci];
              const mixture = scene.class_topic_loadings[ci] ?? [];
              const dominant = cls.dominant_topic ?? 0;
              return (
                <li key={ci}>
                  <div className="ws-class-mixture-head">
                    <strong>{cls.name ?? `class ${cls.label_id}`}</strong>
                    <span className="ws-class-mixture-meta">
                      n={cls.count ?? "—"} · entropy {cls.topic_entropy?.toFixed(2) ?? "—"} · dominant T{dominant + 1}
                    </span>
                  </div>
                  <div className="ws-class-mixture-bar">
                    {mixture.map((value, ti) => (
                      <span
                        key={ti}
                        className="ws-class-mixture-segment"
                        style={{
                          width: `${Math.max(0, value * 100)}%`,
                          background: topicColor(ti)
                        }}
                        title={`T${ti + 1} · ${(value * 100).toFixed(1)}%`}
                      />
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function SpectrumChart({
  spectra,
  wavelengths,
  renderIndices,
  activeIndices,
  classMeta,
  wavelengthRange
}: {
  spectra: number[][];
  wavelengths: number[];
  renderIndices: number[];
  activeIndices: number[];
  classMeta: Array<{ label_id: number | null; name: string | null }>;
  wavelengthRange: [number, number] | null;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const width = 720;
  const height = 280;
  const padding = { left: 50, right: 16, top: 16, bottom: 36 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const allValues = renderIndices.flatMap((i) => spectra[i] ?? []);
  if (allValues.length === 0) {
    return <div className="ws-empty">no spectra</div>;
  }
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const xMin = wavelengths[0] ?? 0;
  const xMax = wavelengths[wavelengths.length - 1] ?? 1;

  const sx = (i: number) => {
    const wl = wavelengths[i] ?? i;
    if (xMax === xMin) return padding.left;
    return padding.left + ((wl - xMin) / (xMax - xMin)) * innerW;
  };
  const sy = (v: number) => {
    if (yMax === yMin) return padding.top + innerH / 2;
    return padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  };

  const onMouseMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    if (px < padding.left || px > width - padding.right) {
      setHoverIndex(null);
      setHoverPos(null);
      return;
    }
    const ratio = (px - padding.left) / innerW;
    const wl = xMin + ratio * (xMax - xMin);
    let bestIdx = 0;
    let bestDist = Infinity;
    wavelengths.forEach((w, i) => {
      const d = Math.abs(w - wl);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    setHoverIndex(bestIdx);
    setHoverPos({ x: sx(bestIdx), y: event.clientY - rect.top });
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="ws-svg ws-spectra-svg"
      onMouseMove={onMouseMove}
      onMouseLeave={() => {
        setHoverIndex(null);
        setHoverPos(null);
      }}
    >
      {wavelengthRange && (
        <>
          <rect
            x={padding.left}
            y={padding.top}
            width={Math.max(0, ((wavelengthRange[0] - xMin) / (xMax - xMin)) * innerW)}
            height={innerH}
            className="ws-range-mask"
          />
          <rect
            x={padding.left + ((wavelengthRange[1] - xMin) / (xMax - xMin)) * innerW}
            y={padding.top}
            width={Math.max(0, innerW - ((wavelengthRange[1] - xMin) / (xMax - xMin)) * innerW)}
            height={innerH}
            className="ws-range-mask"
          />
        </>
      )}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const v = yMin + (yMax - yMin) * t;
        const y = sy(v);
        return (
          <g key={i}>
            <line className="ws-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
            <text className="ws-axis-label" x={padding.left - 6} y={y + 3} textAnchor="end">
              {v.toFixed(2)}
            </text>
          </g>
        );
      })}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const x = padding.left + t * innerW;
        const wl = xMin + t * (xMax - xMin);
        return (
          <text key={i} className="ws-axis-label" x={x} y={height - padding.bottom + 14} textAnchor="middle">
            {Math.round(wl)} nm
          </text>
        );
      })}
      {renderIndices.map((idx) => {
        const profile = spectra[idx] ?? [];
        const isActive = activeIndices.includes(idx);
        const opacity = activeIndices.length === 0 ? 0.7 : isActive ? 1 : 0.12;
        const sw = isActive ? 1.8 : 1;
        const path = profile
          .map((v, i) => `${i === 0 ? "M" : "L"} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`)
          .join(" ");
        return (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke={classColor(idx)}
            strokeWidth={sw}
            opacity={opacity}
          />
        );
      })}
      {hoverIndex !== null && hoverPos && (
        <g pointerEvents="none">
          <line
            x1={sx(hoverIndex)}
            x2={sx(hoverIndex)}
            y1={padding.top}
            y2={height - padding.bottom}
            className="ws-hover-line"
          />
          <text x={sx(hoverIndex) + 6} y={padding.top + 12} className="ws-hover-text">
            {Math.round(wavelengths[hoverIndex])} nm
          </text>
          {renderIndices.slice(0, 8).map((idx) => {
            const v = spectra[idx]?.[hoverIndex];
            if (v === undefined) return null;
            return (
              <circle
                key={`hover-${idx}`}
                cx={sx(hoverIndex)}
                cy={sy(v)}
                r={3.5}
                fill={classColor(idx)}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

function DataStepEvidenceFallback({ card, language }: { card: SubsetCard; language: "en" | "es" }) {
  const isEn = language === "en";
  return (
    <div className="ws-evidence-grid">
      <div className="ws-empty">
        {isEn
          ? "This subset does not ship a per-class spectral exploration view yet (e.g. Family A library, HIDSAG cubes). Use the evidence cards below for now."
          : "Este subset aún no expone una vista espectral por clase (ej. Familia A o HIDSAG). Usa las tarjetas de evidencia."}
      </div>
      <ul className="ws-evidence-list">
        {card.evidence.map((item) => (
          <li key={item.dataset_id} className="ws-evidence-item">
            <header>
              <strong>{item.dataset_name}</strong>
              <span className="ws-mono">{item.dataset_id}</span>
            </header>
            <p>{pickText(item.summary, language)}</p>
            <dl>
              {typeof item.band_count === "number" && (
                <>
                  <dt>{isEn ? "Bands" : "Bandas"}</dt>
                  <dd>{item.band_count}</dd>
                </>
              )}
              {Array.isArray(item.spatial_shape) && (
                <>
                  <dt>{isEn ? "Shape" : "Forma"}</dt>
                  <dd>{item.spatial_shape.join(" × ")}</dd>
                </>
              )}
              {item.label_scope && (
                <>
                  <dt>{isEn ? "Labels" : "Etiquetas"}</dt>
                  <dd>{item.label_scope}</dd>
                </>
              )}
              {item.measurement_scope && (
                <>
                  <dt>{isEn ? "Measurements" : "Mediciones"}</dt>
                  <dd>{item.measurement_scope}</dd>
                </>
              )}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
